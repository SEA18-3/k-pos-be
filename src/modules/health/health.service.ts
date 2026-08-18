import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { SyncProducerService } from '../sync/sync-producer.service';

@Injectable()
export class HealthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rabbit: SyncProducerService,
  ) {}

  async status() {
    let database = true;
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      database = false;
    }
    const rabbit = this.rabbit.isHealthy();
    const oldestProjection = database
      ? await this.prisma.backendOutbox.findFirst({
          where: {
            event_type: { startsWith: 'REPORTING_' },
            status: { in: ['PENDING', 'PROCESSING'] },
          },
          orderBy: { created_at: 'asc' },
          select: { created_at: true },
        })
      : null;
    const projectionLagSeconds = oldestProjection
      ? Math.max(0, Math.round((Date.now() - oldestProjection.created_at.getTime()) / 1000))
      : 0;
    return {
      status: database && rabbit ? 'healthy' : database ? 'degraded' : 'unhealthy',
      dependencies: {
        database: database ? 'up' : 'down',
        rabbitmq: rabbit ? 'up' : 'down',
        reporting: projectionLagSeconds < 30 ? 'fresh' : 'lagging',
      },
      projection_lag_seconds: projectionLagSeconds,
      timestamp: new Date().toISOString(),
    };
  }

  async metrics(): Promise<string> {
    const [receipts, outbox] = await Promise.all([
      this.prisma.syncReceipt.groupBy({ by: ['status'], _count: { _all: true } }),
      this.prisma.backendOutbox.groupBy({ by: ['status'], _count: { _all: true } }),
    ]);
    return [
      '# HELP kpos_sync_receipts Current receipt count by status',
      '# TYPE kpos_sync_receipts gauge',
      ...receipts.map((row) => `kpos_sync_receipts{status="${row.status}"} ${row._count._all}`),
      '# HELP kpos_backend_outbox Current backend outbox count by status',
      '# TYPE kpos_backend_outbox gauge',
      ...outbox.map((row) => `kpos_backend_outbox{status="${row.status}"} ${row._count._all}`),
    ].join('\n');
  }
}

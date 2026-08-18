import { Injectable, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { SyncStatus } from '../../../generated/prisma/client';
import { SyncBatchDto } from './dto/sync-batch.dto';

@Injectable()
export class SyncService {
  constructor(private readonly prisma: PrismaService) {}

  // eslint-disable-next-line @typescript-eslint/require-await
  async validateBatch(id_device: string, batch: SyncBatchDto) {
    // Option B: Broker-First. We only validate the batch structure in-memory.
    // Database queries for idempotency are moved to the consumer worker.

    // Check for duplicate offline_uuid within the same incoming batch
    const uuids = batch.transactions.map((t) => t.offline_uuid);
    const uniqueUuids = new Set(uuids);

    if (uuids.length !== uniqueUuids.size) {
      throw new ConflictException('Batch contains duplicate offline_uuid');
    }
  }

  async getStatusByOfflineUuids(offline_uuids: string[]) {
    const transactions = await this.prisma.transaction.findMany({
      where: { offline_uuid: { in: offline_uuids } },
      select: { offline_uuid: true, id_transaction: true, sync_status: true },
    });

    const failedQueues = await this.prisma.syncQueue.findMany({
      where: {
        OR: [{ offline_uuid: { in: offline_uuids } }, { id_transaction: { in: offline_uuids } }],
      },
      select: { offline_uuid: true, id_transaction: true, status: true, last_error: true },
    });

    const results = offline_uuids.map((uuid) => {
      const tx = transactions.find((t) => t.offline_uuid === uuid);
      if (tx) {
        return {
          offline_uuid: uuid,
          status: tx.sync_status === SyncStatus.SYNC_CONFLICT ? 'CONFLICT' : 'SYNCED',
          transaction_id: tx.id_transaction,
          error: null,
        };
      }
      const fail = failedQueues.find((f) => f.offline_uuid === uuid || f.id_transaction === uuid);
      if (fail) {
        return {
          offline_uuid: uuid,
          status: 'FAILED',
          transaction_id: null,
          error: fail.last_error,
        };
      }
      return {
        offline_uuid: uuid,
        status: 'UNKNOWN',
        transaction_id: null,
        error: null,
      };
    });

    return { data: results };
  }
}

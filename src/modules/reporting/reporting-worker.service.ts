import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

type ReportingPayload = {
  transaction_id: string;
  occurred_at: string;
  gross_delta: number;
  net_delta: number;
  count_delta: number;
  items: Array<{
    id_product: string;
    product_name: string;
    quantity_delta: number;
    gross_delta: number;
    net_delta: number;
  }>;
};

const BATCH_SIZE = positiveIntegerEnvironment('REPORTING_BATCH_SIZE', 100);
// Rabbit settlement uses up to eight connections by default. Keeping reporting
// at four leaves 20 connections in the default pool for HTTP and control reads.
const CONCURRENCY = positiveIntegerEnvironment('REPORTING_CONCURRENCY', 4);
const TICK_INTERVAL_MS = 250;
const ABANDONED_AFTER_MS = 5 * 60 * 1_000;

@Injectable()
export class ReportingWorkerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ReportingWorkerService.name);
  private timer?: NodeJS.Timeout;
  private recoveryTimer?: NodeJS.Timeout;
  private running = false;
  private closing = false;
  private readonly inFlight = new Set<Promise<void>>();

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit(): void {
    this.schedule(() => this.recoverAbandoned());
    this.timer = setInterval(() => this.schedule(() => this.tick()), TICK_INTERVAL_MS);
    this.recoveryTimer = setInterval(() => this.schedule(() => this.recoverAbandoned()), 60_000);
    this.timer.unref();
    this.recoveryTimer.unref();
  }

  async onModuleDestroy(): Promise<void> {
    this.closing = true;
    if (this.timer) clearInterval(this.timer);
    if (this.recoveryTimer) clearInterval(this.recoveryTimer);
    await Promise.allSettled([...this.inFlight]);
  }

  async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const events = await this.prisma.backendOutbox.findMany({
        where: {
          status: 'PENDING',
          available_at: { lte: new Date() },
          event_type: { startsWith: 'REPORTING_' },
        },
        orderBy: { created_at: 'asc' },
        take: BATCH_SIZE,
      });
      await mapWithConcurrency(
        events.map((event) => event.id_event),
        CONCURRENCY,
        (eventId) => this.apply(eventId),
      );
    } finally {
      this.running = false;
    }
  }

  private async apply(eventId: string): Promise<void> {
    try {
      await this.prisma.$transaction(async (tx) => {
        const claimed = await tx.backendOutbox.updateMany({
          where: { id_event: eventId, status: 'PENDING' },
          data: {
            status: 'PROCESSING',
            processing_started_at: new Date(),
            attempts: { increment: 1 },
          },
        });
        if (claimed.count !== 1) return;
        const event = await tx.backendOutbox.findUniqueOrThrow({ where: { id_event: eventId } });
        if (
          await tx.reportingAppliedTransaction.findUnique({ where: { id_event: event.id_event } })
        ) {
          await tx.backendOutbox.update({
            where: { id_event: event.id_event },
            data: {
              status: 'PROCESSED',
              processed_at: new Date(),
              processing_started_at: null,
            },
          });
          return;
        }
        const merchant = await tx.merchant.findUniqueOrThrow({
          where: { id_merchant: event.id_merchant },
        });
        const payload = event.payload as unknown as ReportingPayload;
        const salesDate = zonedDate(payload.occurred_at, merchant.timezone);

        await tx.merchantDailySales.upsert({
          where: {
            id_merchant_sales_date: { id_merchant: event.id_merchant, sales_date: salesDate },
          },
          create: {
            id_merchant: event.id_merchant,
            sales_date: salesDate,
            gross_sales: payload.gross_delta,
            net_sales: payload.net_delta,
            transaction_count: payload.count_delta,
          },
          update: {
            gross_sales: { increment: payload.gross_delta },
            net_sales: { increment: payload.net_delta },
            transaction_count: { increment: payload.count_delta },
          },
        });
        for (const item of payload.items) {
          await tx.merchantProductDailySales.upsert({
            where: {
              id_merchant_id_product_sales_date: {
                id_merchant: event.id_merchant,
                id_product: item.id_product,
                sales_date: salesDate,
              },
            },
            create: {
              id_merchant: event.id_merchant,
              id_product: item.id_product,
              product_name: item.product_name,
              sales_date: salesDate,
              quantity: item.quantity_delta,
              gross_sales: item.gross_delta,
              net_sales: item.net_delta,
            },
            update: {
              product_name: item.product_name,
              quantity: { increment: item.quantity_delta },
              gross_sales: { increment: item.gross_delta },
              net_sales: { increment: item.net_delta },
            },
          });
        }
        await tx.reportingAppliedTransaction.create({
          data: {
            idempotency_key: event.idempotency_key,
            id_event: event.id_event,
            id_transaction: event.id_transaction,
            id_merchant: event.id_merchant,
          },
        });
        await tx.backendOutbox.update({
          where: { id_event: event.id_event },
          data: {
            status: 'PROCESSED',
            processed_at: new Date(),
            processing_started_at: null,
            last_error: null,
          },
        });
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Projection failed';
      this.logger.error(`Reporting projection ${eventId} failed: ${message}`);
      await this.prisma.backendOutbox.updateMany({
        where: { id_event: eventId, status: { in: ['PENDING', 'PROCESSING'] } },
        data: {
          status: 'PENDING',
          processing_started_at: null,
          available_at: new Date(Date.now() + 5_000),
          last_error: message.slice(0, 500),
        },
      });
    }
  }

  private async recoverAbandoned(): Promise<void> {
    const recovered = await this.prisma.backendOutbox.updateMany({
      where: {
        status: 'PROCESSING',
        event_type: { startsWith: 'REPORTING_' },
        OR: [
          { processing_started_at: null },
          { processing_started_at: { lt: new Date(Date.now() - ABANDONED_AFTER_MS) } },
        ],
      },
      data: { status: 'PENDING', processing_started_at: null, available_at: new Date() },
    });
    if (recovered.count > 0) {
      this.logger.warn(`Recovered ${recovered.count} abandoned reporting event(s)`);
    }
  }

  private schedule(operation: () => Promise<void>): void {
    if (this.closing) return;
    const job = operation().finally(() => this.inFlight.delete(job));
    this.inFlight.add(job);
  }
}

function zonedDate(iso: string, timezone: string): Date {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(iso));
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return new Date(`${values.year}-${values.month}-${values.day}T00:00:00.000Z`);
}

async function mapWithConcurrency<T>(
  values: T[],
  concurrency: number,
  mapper: (value: T) => Promise<void>,
): Promise<void> {
  let cursor = 0;
  await Promise.all(
    Array.from({ length: Math.min(concurrency, values.length) }, async () => {
      while (cursor < values.length) {
        const index = cursor;
        cursor += 1;
        await mapper(values[index]);
      }
    }),
  );
}

function positiveIntegerEnvironment(name: string, fallback: number): number {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
  return value;
}

import { Controller, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { Ctx, EventPattern, Payload, RmqContext } from '@nestjs/microservices';
import { SyncItemDto, SyncTransactionDto } from './dto/sync-batch.dto';
import { PrismaService } from '../../prisma/prisma.service';
import { SyncStatus, TransactionStatus, PaymentStatus } from '../../../generated/prisma/client';
import { SyncProducerService } from './sync-producer.service';
import * as amqp from 'amqp-connection-manager';

/** RabbitMQ channel interface (channel-api). */
interface RmqChannel {
  ack(message: unknown): void;
  nack(message: unknown, allUpTo?: boolean, requeue?: boolean): void;
}

/** Shape returned by SELECT FOR UPDATE on Inventory. */
interface InventoryData {
  current_stock: number;
  is_active: boolean;
}

/** Max retry attempts before message is permanently failed. */
const MAX_RETRIES = 3;

@Controller()
export class SyncConsumerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SyncConsumerService.name);
  private amqpConnection: amqp.AmqpConnectionManager;
  private channelWrapper: amqp.ChannelWrapper;

  constructor(
    private readonly prisma: PrismaService,
    private readonly syncProducer: SyncProducerService,
  ) {}

  /* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument, @typescript-eslint/require-await */
  async onModuleInit() {
    const url = process.env.RABBITMQ_URL || 'amqp://localhost:5672';
    this.amqpConnection = amqp.connect([url]);
    this.channelWrapper = this.amqpConnection.createChannel({
      json: true,
      setup: async (channel: any) => {
        await channel.assertQueue('sync.dlq', { durable: true });

        // Manual consumption of sync.dlq to bypass NestJS single-queue limitation
        await channel.consume('sync.dlq', async (msg: any) => {
          if (!msg) return;
          try {
            const content = JSON.parse(msg.content.toString());
            // NestJS envelope formats data as { pattern, data } or fallback directly
            const transactions = content.data || content;
            await this.handleDlqMessage(transactions);
            channel.ack(msg);
          } catch (err: unknown) {
            const error = err instanceof Error ? err.message : String(err);
            this.logger.error(`Error in manual DLQ consumer: ${error}`);
            channel.nack(msg, false, false); // Nack without requeue
          }
        });
      },
    });
  }
  /* eslint-enable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument, @typescript-eslint/require-await */

  async onModuleDestroy() {
    try {
      await this.channelWrapper.close();
      await this.amqpConnection.close();
    } catch {
      // ignore
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Main consumer — sync.transactions
  // ──────────────────────────────────────────────────────────────────────────
  @EventPattern('sync_transaction_batch')
  async handleSyncTransactionBatch(
    @Payload() transactions: (SyncTransactionDto & { id_device: string })[],
    @Ctx() context: RmqContext,
  ) {
    const channel = context.getChannelRef() as RmqChannel;
    const originalMsg = context.getMessage() as unknown;

    const startTime = performance.now();
    this.logger.log(`Received batch of ${transactions.length} transactions for processing.`);

    // Process each transaction individually for per-item DLQ isolation
    for (const data of transactions) {
      try {
        // Idempotency check: skip if already exists
        const existing = await this.prisma.transaction.findUnique({
          where: {
            id_device_offline_uuid: {
              id_device: data.id_device,
              offline_uuid: data.offline_uuid,
            },
          },
        });

        if (existing) {
          this.logger.log(`Transaction ${data.offline_uuid} already exists. Skipping.`);
          continue;
        }

        await this.processTransaction(data);
        this.logger.log(`Processed transaction ${data.offline_uuid} successfully.`);
      } catch (err: unknown) {
        const error = err instanceof Error ? err : new Error(String(err));
        this.logger.error(`Error processing transaction ${data.offline_uuid}: ${error.message}`);
        await this.handleFailure(data, error);
      }
    }

    const duration = (performance.now() - startTime).toFixed(2);
    this.logger.log(`Batch processing completed in ${duration}ms.`);
    channel.ack(originalMsg);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // DLQ Message Processor
  // ──────────────────────────────────────────────────────────────────────────
  async handleDlqMessage(
    transactions: (SyncTransactionDto & { id_device: string; _retryAttempt?: number })[],
  ) {
    this.logger.warn(`DLQ received ${transactions.length} permanently failed transaction(s).`);

    for (const data of transactions) {
      const attempt = (data._retryAttempt ?? 0) + 1;

      if (attempt <= MAX_RETRIES) {
        this.logger.warn(
          `Transaction ${data.offline_uuid} attempt ${attempt}/${MAX_RETRIES} — routing to retry queue.`,
        );
        await this.syncProducer.publishToRetry(
          [{ ...data, _retryAttempt: attempt } as SyncTransactionDto & { id_device: string }],
          attempt,
        );
      } else {
        this.logger.error(
          `Transaction ${data.offline_uuid} permanently failed after ${MAX_RETRIES} retries.`,
        );
        try {
          const existingEntry = await this.prisma.syncQueue.findFirst({
            where: { id_device: data.id_device, id_transaction: data.offline_uuid },
          });
          if (existingEntry) {
            await this.prisma.syncQueue.update({
              where: { id: existingEntry.id },
              data: {
                status: SyncStatus.SYNC_FAILED,
                last_error: `Exceeded ${MAX_RETRIES} retry attempts`,
                updated_at: new Date(),
              },
            });
          } else {
            await this.prisma.syncQueue.create({
              data: {
                id_device: data.id_device,
                id_transaction: data.offline_uuid,
                operation: 'SYNC_BATCH_PERMANENTLY_FAILED',
                payload: JSON.stringify(data),
                last_error: `Exceeded ${MAX_RETRIES} retry attempts`,
                status: SyncStatus.SYNC_FAILED,
              },
            });
          }
        } catch (dbErr: unknown) {
          const e = dbErr instanceof Error ? dbErr.message : String(dbErr);
          this.logger.error(`Failed to persist terminal failure for ${data.offline_uuid}: ${e}`);
        }
      }
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Private helpers
  // ──────────────────────────────────────────────────────────────────────────

  private async processTransaction(
    data: SyncTransactionDto & { id_device: string },
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      let hasConflict = false;

      // 1. Arithmetic validation
      let calculatedSubtotal = 0;
      for (const item of data.items) {
        if (Number(item.quantity) * Number(item.unit_price) !== Number(item.subtotal)) {
          throw new Error(
            `Arithmetic validation failed for item ${item.id_product}: ` +
              `${item.quantity} * ${item.unit_price} != ${item.subtotal}`,
          );
        }
        calculatedSubtotal += Number(item.subtotal);
      }
      if (
        calculatedSubtotal !== Number(data.subtotal) ||
        calculatedSubtotal !== Number(data.total)
      ) {
        throw new Error(
          `Arithmetic validation failed: calculated ${calculatedSubtotal} != tx total ${data.total}`,
        );
      }

      // 2. Stock check via SELECT FOR UPDATE
      for (const item of data.items) {
        const inventoryData = await tx.$queryRaw<InventoryData[]>`
          SELECT i.current_stock, p.is_active
          FROM "Inventory" i
          JOIN "Product" p ON p.id_product = i.id_product
          WHERE i.id_product = ${item.id_product}
          FOR UPDATE
        `;

        if (!inventoryData || inventoryData.length === 0) {
          hasConflict = true;
          break;
        }

        const inv = inventoryData[0];
        if (!inv.is_active || inv.current_stock < item.quantity) {
          hasConflict = true;
          break;
        }
      }

      const finalStatus = hasConflict ? TransactionStatus.PENDING : TransactionStatus.CONFIRMED;
      const finalSyncStatus = hasConflict ? SyncStatus.SYNC_CONFLICT : SyncStatus.SYNCED;

      // 3. Verify device exists
      const device = await tx.device.findUnique({
        where: { id_device: data.id_device },
        include: { merchant: true },
      });

      if (!device) {
        throw new Error(`Device ${data.id_device} not found.`);
      }

      // 4. Create Transaction header
      const newTx = await tx.transaction.create({
        data: {
          id_merchant: device.id_merchant,
          id_user: device.id_user,
          id_device: data.id_device,
          offline_uuid: data.offline_uuid,
          payload_hash: (data as Partial<{ payload_hash: string }>).payload_hash ?? null,
          subtotal: data.subtotal,
          total: data.total,
          created_at_local: new Date(data.created_at_local),
          notes: data.notes,
          status: finalStatus,
          sync_status: finalSyncStatus,
          synced_at: new Date(),
          confirmed_at: hasConflict ? null : new Date(),
        },
      });

      // 5. Create Detail rows (with snapshot fields)
      await tx.detailTransaction.createMany({
        data: data.items.map((item: SyncItemDto) => ({
          id_transaction: newTx.id_transaction,
          id_product: item.id_product,
          quantity: item.quantity,
          unit_price: item.unit_price,
          subtotal: item.subtotal,
          product_name: item.product_name,
          sku_snapshot: item.sku_snapshot,
          catalog_version: item.catalog_version ? new Date(item.catalog_version) : new Date(),
        })),
      });

      // 6. Create Payment (ADR-001: trust-first — always VERIFIED)
      await tx.payment.create({
        data: {
          id_transaction: newTx.id_transaction,
          id_merchant: device.id_merchant,
          amount: data.payment.amount,
          method: data.payment.method,
          cash_received: data.payment.cash_received,
          change_amount: data.payment.change_amount,
          qris_code: data.payment.qris_code,
          transfer_ref: data.payment.transfer_ref,
          status: PaymentStatus.VERIFIED,
          verified_at: new Date(),
        },
      });

      // 7. Decrement stock & write history (only for non-conflict)
      if (!hasConflict) {
        for (const item of data.items) {
          await tx.inventory.update({
            where: { id_product: item.id_product },
            data: { current_stock: { decrement: item.quantity } },
          });

          await tx.stockHistory.create({
            data: {
              id_product: item.id_product,
              id_merchant: device.id_merchant,
              id_transaction: newTx.id_transaction,
              movement_type: 'SALE',
              quantity: -item.quantity,
              notes: `Sold via offline sync (device: ${data.id_device})`,
            },
          });
        }
      }
    });
  }

  /** On per-item failure: record to SyncQueue pseudo-DLQ for traceability. */
  private async handleFailure(
    data: SyncTransactionDto & { id_device: string },
    error: Error,
  ): Promise<void> {
    try {
      await this.prisma.syncQueue.create({
        data: {
          id_device: data.id_device,
          id_transaction: data.offline_uuid,
          operation: 'SYNC_BATCH_REJECTED',
          payload: JSON.stringify(data),
          last_error: error.message,
          status: SyncStatus.SYNC_FAILED,
        },
      });
      this.logger.warn(`Transaction ${data.offline_uuid} written to SyncQueue (DLQ).`);
    } catch (dlqErr: unknown) {
      const e = dlqErr instanceof Error ? dlqErr.message : String(dlqErr);
      this.logger.error(`Failed to write to SyncQueue: ${e}`);
    }
  }
}

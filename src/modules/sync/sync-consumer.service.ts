import { Controller, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { Ctx, EventPattern, Payload, RmqContext } from '@nestjs/microservices';
import { SyncItemDto, SyncTransactionDto } from './dto/sync-batch.dto';
import { PrismaService } from '../../prisma/prisma.service';
import {
  SyncStatus,
  TransactionStatus,
  PaymentStatus,
  Prisma,
} from '../../../generated/prisma/client';
import { SyncProducerService } from './sync-producer.service';
import { SyncConflictException } from '../../common/exceptions/sync-conflict.exception';
import { adjustInventoryAndHistory } from '../../common/utils/inventory.util';
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

        await channel.consume('sync.dlq', async (msg: any) => {
          if (!msg) return;
          try {
            const rawContent = msg.content.toString();
            this.logger.debug(`Raw DLQ message: ${rawContent.substring(0, 500)}`);
            const content = JSON.parse(rawContent);
            const transactions = content.data || content;
            await this.handleDlqMessage(transactions);
            channel.ack(msg);
          } catch (err: unknown) {
            const error = err instanceof Error ? err.message : String(err);
            this.logger.error(`Error in manual DLQ consumer: ${error}`);
            channel.nack(msg, false, false);
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

  @EventPattern('sync_transaction_batch')
  async handleSyncTransactionBatch(
    @Payload() transactions: (SyncTransactionDto & { id_device: string })[],
    @Ctx() context: RmqContext,
  ) {
    const channel = context.getChannelRef() as RmqChannel;
    const originalMsg = context.getMessage() as unknown;

    const startTime = performance.now();
    this.logger.log(`Received batch of ${transactions.length} transactions for processing.`);

    for (const data of transactions) {
      try {
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

  async handleDlqMessage(
    transactions: (SyncTransactionDto & { id_device: string; _retryAttempt?: number })[],
  ) {
    if (!Array.isArray(transactions)) {
      this.logger.warn(`DLQ received non-array payload. Ignoring.`);
      return;
    }

    const validTransactions = transactions.filter(
      (t) => t && typeof t === 'object' && t.offline_uuid && t.id_device,
    );
    if (validTransactions.length === 0) {
      this.logger.warn(`DLQ payload contains no valid transactions. Ignoring.`);
      return;
    }

    this.logger.warn(`DLQ received ${validTransactions.length} permanently failed transaction(s).`);

    for (const data of validTransactions) {
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
        await this.recordTerminalFailure(data);
      }
    }
  }

  private async recordTerminalFailure(data: SyncTransactionDto & { id_device: string }) {
    try {
      const existingEntry = await this.prisma.syncQueue.findFirst({
        where: { id_device: data.id_device, offline_uuid: data.offline_uuid },
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
            id_transaction: null,
            offline_uuid: data.offline_uuid,
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

  /* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment */

  private async processTransaction(
    data: SyncTransactionDto & { id_device: string },
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      this.validateArithmetic(data);

      const hasConflict = await this.checkStockAvailability(tx, data.items);

      const finalStatus = hasConflict ? TransactionStatus.PENDING : TransactionStatus.CONFIRMED;
      const finalSyncStatus = hasConflict ? SyncStatus.SYNC_CONFLICT : SyncStatus.SYNCED;

      const device = await tx.device.findUnique({
        where: { id_device: data.id_device },
        include: { merchant: true },
      });

      if (!device) {
        throw new SyncConflictException(
          'SYNC_CONSTRAINT_VIOLATION',
          `Device ${data.id_device} not found.`,
        );
      }

      const newTx = await this.createTransactionHeader(
        tx,
        data,
        device,
        finalStatus,
        finalSyncStatus,
        hasConflict,
      );

      await this.createTransactionDetails(tx, newTx.id_transaction, data.items);

      await this.createPayment(tx, newTx.id_transaction, device.id_merchant, data.payment);

      if (!hasConflict) {
        await this.deductInventory(tx, data, newTx.id_transaction, device.id_merchant);
      }
    });
  }

  private validateArithmetic(data: SyncTransactionDto) {
    let calculatedSubtotal = 0;
    for (const item of data.items) {
      if (Number(item.quantity) * Number(item.unit_price) !== Number(item.subtotal)) {
        throw new SyncConflictException(
          'SYNC_ARITHMETIC_ERROR',
          `Arithmetic validation failed for item ${item.id_product}: ${item.quantity} * ${item.unit_price} != ${item.subtotal}`,
        );
      }
      calculatedSubtotal += Number(item.subtotal);
    }
    if (calculatedSubtotal !== Number(data.subtotal) || calculatedSubtotal !== Number(data.total)) {
      throw new SyncConflictException(
        'SYNC_ARITHMETIC_ERROR',
        `Arithmetic validation failed: calculated ${calculatedSubtotal} != tx total ${data.total}`,
      );
    }
  }

  private async checkStockAvailability(
    tx: Prisma.TransactionClient,
    items: SyncItemDto[],
  ): Promise<boolean> {
    for (const item of items) {
      const inventoryData = await tx.$queryRaw<InventoryData[]>`
        SELECT i.current_stock, p.is_active
        FROM "Inventory" i
        JOIN "Product" p ON p.id_product = i.id_product
        WHERE i.id_product = ${item.id_product}
        FOR UPDATE
      `;

      if (!inventoryData || inventoryData.length === 0) return true; // Conflict
      const inv = inventoryData[0];
      if (!inv.is_active || inv.current_stock < item.quantity) return true; // Conflict
    }
    return false;
  }

  private async createTransactionHeader(
    tx: Prisma.TransactionClient,
    data: SyncTransactionDto & { id_device: string },
    device: any,
    status: TransactionStatus,
    syncStatus: SyncStatus,
    hasConflict: boolean,
  ) {
    return await tx.transaction.create({
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
        status: status,
        sync_status: syncStatus,
        synced_at: new Date(),
        confirmed_at: hasConflict ? null : new Date(),
      },
    });
  }

  private async createTransactionDetails(
    tx: Prisma.TransactionClient,
    txId: string,
    items: SyncItemDto[],
  ) {
    await tx.detailTransaction.createMany({
      data: items.map((item) => ({
        id_transaction: txId,
        id_product: item.id_product,
        quantity: item.quantity,
        unit_price: item.unit_price,
        subtotal: item.subtotal,
        product_name: item.product_name,
        sku_snapshot: item.sku_snapshot,
        catalog_version: item.catalog_version ? new Date(item.catalog_version) : new Date(),
      })),
    });
  }

  private async createPayment(
    tx: Prisma.TransactionClient,
    txId: string,
    merchantId: string,
    payment: any,
  ) {
    await tx.payment.create({
      data: {
        id_transaction: txId,
        id_merchant: merchantId,
        amount: payment.amount,
        method: payment.method,
        cash_received: payment.cash_received,
        change_amount: payment.change_amount,
        qris_code: payment.qris_code,
        transfer_ref: payment.transfer_ref,
        status: PaymentStatus.VERIFIED,
        verified_at: new Date(),
      },
    });
  }

  private async deductInventory(
    tx: Prisma.TransactionClient,
    data: SyncTransactionDto & { id_device: string },
    txId: string,
    merchantId: string,
  ) {
    for (const item of data.items) {
      await adjustInventoryAndHistory(tx, {
        id_product: item.id_product,
        id_merchant: merchantId,
        id_user: 'system_sync',
        id_transaction: txId,
        quantity_change: -item.quantity,
        movement_type: 'SALE',
        notes: `Sold via offline sync (device: ${data.id_device})`,
      });
    }
  }

  /** On per-item failure: record to SyncQueue pseudo-DLQ for traceability. */
  private async handleFailure(
    data: SyncTransactionDto & { id_device: string },
    error: Error,
  ): Promise<void> {
    try {
      let errorPayload: string;

      if (error instanceof SyncConflictException) {
        const response = error.getResponse();
        errorPayload = JSON.stringify(response);
      } else {
        const cleanMessage =
          error.message
            .split('\n')
            .filter((line) => line.trim().length > 0)
            .pop() || error.message;

        let fallbackCode = 'SYNC_UNKNOWN_ERROR';
        if (cleanMessage.includes('Foreign key constraint violated')) {
          fallbackCode = 'SYNC_CONSTRAINT_VIOLATION';
        }

        errorPayload = JSON.stringify({
          status: 'error',
          code: fallbackCode,
          message: cleanMessage,
        });
      }

      await this.prisma.syncQueue.create({
        data: {
          id_device: data.id_device,
          id_transaction: null,
          offline_uuid: data.offline_uuid,
          operation: 'SYNC_BATCH_REJECTED',
          payload: JSON.stringify(data),
          last_error: errorPayload,
          status: SyncStatus.SYNC_FAILED,
        },
      });
      this.logger.warn(`Transaction ${data.offline_uuid} written to SyncQueue (SYNC_FAILED).`);
    } catch (dlqErr: unknown) {
      const e = dlqErr instanceof Error ? dlqErr.message : String(dlqErr);
      this.logger.error(`Failed to write to SyncQueue: ${e}`);
    }
  }
}

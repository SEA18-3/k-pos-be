import { Injectable, OnModuleInit } from '@nestjs/common';
import { Prisma, SyncReceiptStatus } from '../../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { SyncTransactionDto } from './dto/sync-batch.dto';
import {
  PermanentSyncError,
  RetryableSyncError,
  SyncMessageProcessor,
  SyncProducerService,
} from './sync-producer.service';

type LockedInventory = {
  id_product: string;
  id_merchant: string;
  current_stock: number;
};

@Injectable()
export class SyncConsumerService implements OnModuleInit, SyncMessageProcessor {
  constructor(
    private readonly prisma: PrismaService,
    private readonly producer: SyncProducerService,
  ) {}

  onModuleInit(): void {
    this.producer.registerProcessor(this);
  }

  async process(receiptId: string): Promise<void> {
    try {
      await this.prisma.$transaction(
        async (tx) => {
          const receipt = await tx.syncReceipt.findUnique({ where: { id_receipt: receiptId } });
          if (!receipt)
            throw new PermanentSyncError('RECEIPT_NOT_FOUND', 'Sync receipt does not exist');
          if (isTerminal(receipt.status)) return;

          await tx.syncReceipt.update({
            where: { id_receipt: receiptId },
            data: {
              status: 'PROCESSING',
              processing_at: new Date(),
              process_attempts: { increment: 1 },
            },
          });

          const payload = receipt.payload as unknown as SyncTransactionDto;
          const productIds = [...new Set(payload.items.map((item) => item.id_product))];
          const inventories = await tx.$queryRaw<LockedInventory[]>(Prisma.sql`
          SELECT i.id_product, i.id_merchant, i.current_stock
          FROM "Inventory" i
          WHERE i.id_product IN (${Prisma.join(productIds)})
          FOR UPDATE
        `);
          const inventoryByProduct = new Map(
            inventories.map((inventory) => [inventory.id_product, inventory]),
          );
          const required = aggregateQuantities(payload);

          for (const productId of productIds) {
            const inventory = inventoryByProduct.get(productId);
            if (!inventory || inventory.id_merchant !== receipt.id_merchant) {
              throw new PermanentSyncError(
                'PRODUCT_TENANT_MISMATCH',
                'Product no longer belongs to this merchant',
              );
            }
          }

          const hasShortage = [...required].some(
            ([productId, quantity]) =>
              (inventoryByProduct.get(productId)?.current_stock ?? -1) < quantity,
          );

          const transaction = await tx.transaction.create({
            data: {
              id_merchant: receipt.id_merchant,
              id_user: receipt.id_operator,
              id_device: receipt.id_device,
              offline_uuid: receipt.offline_uuid,
              payload_hash: receipt.payload_hash,
              status: hasShortage ? 'PENDING' : 'CONFIRMED',
              sync_status: hasShortage ? 'SYNC_CONFLICT' : 'SYNCED',
              created_at_local: new Date(payload.created_at_local),
              confirmed_at: hasShortage ? null : new Date(),
              synced_at: new Date(),
              subtotal: payload.subtotal,
              total: payload.total,
              notes: payload.notes,
            },
          });

          await tx.detailTransaction.createMany({
            data: payload.items.map((item) => ({
              id_transaction: transaction.id_transaction,
              id_product: item.id_product,
              product_name: item.product_name,
              product_sku: item.product_sku,
              catalog_version: item.catalog_version,
              quantity: item.quantity,
              unit_price: item.unit_price,
              subtotal: item.subtotal,
            })),
          });
          await tx.payment.create({
            data: {
              id_transaction: transaction.id_transaction,
              id_merchant: receipt.id_merchant,
              amount: payload.payment.amount,
              method: payload.payment.method,
              status: 'VERIFIED',
              cash_received: payload.payment.cash_received,
              change_amount: payload.payment.change_amount,
              qris_code: payload.payment.qris_code,
              transfer_ref: payload.payment.transfer_ref,
              verified_at: new Date(),
              verified_by: receipt.id_operator,
              verification_note: 'Verified by Operator before local confirmation',
            },
          });

          if (!hasShortage) {
            for (const [productId, quantity] of required) {
              await tx.inventory.update({
                where: { id_product: productId },
                data: { current_stock: { decrement: quantity } },
              });
              await tx.stockHistory.create({
                data: {
                  idempotency_key: `sale:${transaction.id_transaction}:${productId}`,
                  id_product: productId,
                  id_merchant: receipt.id_merchant,
                  id_user: receipt.id_operator,
                  id_transaction: transaction.id_transaction,
                  movement_type: 'SALE',
                  quantity: -quantity,
                  notes: `Offline settlement from device ${receipt.id_device}`,
                },
              });
            }
            await tx.backendOutbox.create({
              data: {
                idempotency_key: `reporting:sale:${transaction.id_transaction}`,
                id_merchant: receipt.id_merchant,
                id_transaction: transaction.id_transaction,
                event_type: 'REPORTING_SALE',
                payload: reportingPayload(payload, transaction.id_transaction),
              },
            });
          }

          await tx.syncReceipt.update({
            where: { id_receipt: receiptId },
            data: {
              id_transaction: transaction.id_transaction,
              status: hasShortage ? 'CONFLICT' : 'SYNCED',
              terminal_at: new Date(),
              last_error_code: hasShortage ? 'INSUFFICIENT_STOCK' : null,
              last_error_message: hasShortage ? 'Owner action is required' : null,
            },
          });
          await tx.device.update({
            where: { id_device: receipt.id_device },
            data: { last_sync_at: new Date() },
          });
        },
        { timeout: Number(process.env.SYNC_TRANSACTION_TIMEOUT_MS ?? 10_000) },
      );
    } catch (error: unknown) {
      if (error instanceof PermanentSyncError || error instanceof RetryableSyncError) throw error;
      throw new RetryableSyncError(
        'DATABASE_SETTLEMENT_FAILED',
        error instanceof Error ? error.message : 'Settlement failed',
      );
    }
  }

  async markFailed(
    receiptId: string,
    code: string,
    message: string,
    retryable: boolean,
  ): Promise<void> {
    await this.prisma.syncReceipt.updateMany({
      where: { id_receipt: receiptId, status: { in: ['QUEUED', 'PROCESSING'] } },
      data: {
        status: 'FAILED',
        terminal_at: new Date(),
        last_error_code: code,
        last_error_message: message.slice(0, 500),
        retryable,
      },
    });
  }
}

function isTerminal(status: SyncReceiptStatus): boolean {
  return status === 'SYNCED' || status === 'CONFLICT' || status === 'FAILED';
}

function aggregateQuantities(payload: SyncTransactionDto): Map<string, number> {
  const quantities = new Map<string, number>();
  for (const item of payload.items) {
    quantities.set(item.id_product, (quantities.get(item.id_product) ?? 0) + item.quantity);
  }
  return quantities;
}

function reportingPayload(
  payload: SyncTransactionDto,
  transactionId: string,
): Prisma.InputJsonObject {
  return {
    transaction_id: transactionId,
    occurred_at: payload.created_at_local,
    gross_delta: payload.total,
    net_delta: payload.total,
    count_delta: 1,
    items: payload.items.map((item) => ({
      id_product: item.id_product,
      product_name: item.product_name,
      quantity_delta: item.quantity,
      gross_delta: item.subtotal,
      net_delta: item.subtotal,
    })),
  };
}

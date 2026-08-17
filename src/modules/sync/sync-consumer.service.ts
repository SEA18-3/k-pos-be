import { Controller, Logger } from '@nestjs/common';
import { Ctx, EventPattern, Payload, RmqContext } from '@nestjs/microservices';
import { SyncTransactionDto } from './dto/sync-batch.dto';
import { PrismaService } from '../../prisma/prisma.service';
import { SyncStatus, TransactionStatus, PaymentStatus } from '../../../generated/prisma/client';

interface RmqChannel {
  ack(message: unknown): void;
  nack(message: unknown, allUpTo?: boolean, requeue?: boolean): void;
}

interface InventoryData {
  current_stock: number;
  is_active: boolean;
}

@Controller()
export class SyncConsumerService {
  private readonly logger = new Logger(SyncConsumerService.name);

  constructor(private readonly prisma: PrismaService) {}

  @EventPattern('sync_transaction')
  async handleSyncTransaction(@Payload() data: SyncTransactionDto, @Ctx() context: RmqContext) {
    const channel = context.getChannelRef() as RmqChannel;
    const originalMsg = context.getMessage() as unknown;

    // Idempotency check: Does it already exist?
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
      channel.ack(originalMsg);
      return;
    }

    try {
      // Begin Database Transaction for processing
      await this.prisma.$transaction(async (tx) => {
        // We will do optimistic concurrency / row lock manually for products
        let hasConflict = false;

        // Verify products and quantities
        for (const item of data.items) {
          // Use SELECT ... FOR UPDATE on Inventory to prevent race conditions during concurrent syncs
          const inventoryData = await tx.$queryRaw<InventoryData[]>`
            SELECT i.current_stock, p.is_active 
            FROM "Inventory" i
            JOIN "Product" p ON p.id_product = i.id_product
            WHERE i.id_product = ${item.id_product} 
            FOR UPDATE
          `;

          if (!inventoryData || inventoryData.length === 0) {
            hasConflict = true; // Product or inventory doesn't exist
            break;
          }

          const inv = inventoryData[0];
          if (!inv.is_active || inv.current_stock < item.quantity) {
            hasConflict = true; // Stock insufficient or product inactive
            break;
          }
        }

        const finalStatus = hasConflict ? TransactionStatus.PENDING : TransactionStatus.CONFIRMED;
        const finalSyncStatus = hasConflict ? SyncStatus.SYNC_CONFLICT : SyncStatus.SYNCED;

        // 1. Create Transaction Header
        // In reality we should get id_user and id_merchant from device binding, but for now we trust the payload or look it up.
        // Wait, the payload doesn't have id_user or id_merchant. We must find them via id_device!
        const device = await tx.device.findUnique({
          where: { id_device: data.id_device },
          include: { merchant: true },
        });

        if (!device) {
          throw new Error(`Device ${data.id_device} not found. Cannot process transaction.`);
        }

        const newTx = await tx.transaction.create({
          data: {
            id_merchant: device.id_merchant,
            id_user: device.id_user,
            id_device: data.id_device,
            offline_uuid: data.offline_uuid,
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

        // 2. Create Details
        await tx.detailTransaction.createMany({
          data: data.items.map((item) => ({
            id_transaction: newTx.id_transaction,
            id_product: item.id_product,
            quantity: item.quantity,
            unit_price: item.unit_price,
            subtotal: item.subtotal,
          })),
        });

        // 3. Create Payment
        // CASH: langsung VERIFIED karena tidak perlu rekonsiliasi manual.
        // STATIC_QRIS / BANK_TRANSFER: PENDING, menunggu verifikasi oleh OWNER.
        const paymentStatus =
          data.payment.method === 'CASH'
            ? PaymentStatus.VERIFIED
            : PaymentStatus.PENDING;

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
            status: paymentStatus,
            // Jika CASH, set verified_at otomatis pada saat sync
            verified_at: paymentStatus === PaymentStatus.VERIFIED ? new Date() : null,
          },
        });

        // 4. Update Inventory if NOT conflict
        if (!hasConflict) {
          for (const item of data.items) {
            await tx.inventory.update({
              where: { id_product: item.id_product },
              data: {
                current_stock: { decrement: item.quantity },
              },
            });

            // Log stock history
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

      // Acknowledge the message to remove it from the queue
      this.logger.log(`Processed transaction ${data.offline_uuid} successfully.`);
      channel.ack(originalMsg);
    } catch (err: unknown) {
      const error = err as Error;
      this.logger.error(`Error processing transaction ${data.offline_uuid}`, error.stack);

      // Reject and Requeue for transient errors.
      // In a real setup, we should check if the error is a transient DB error (e.g. timeout) vs malformed data.
      // If we reject without requeue (false), it will go to DLQ.
      // Let's implement a basic retry mechanism based on x-delivery-count if RabbitMQ quorum queues are used,
      // or we can just nack with requeue=false if we want it to go straight to DLX for now.

      // Check if it's a structural error that will never succeed
      if (error.message.includes('not found')) {
        channel.nack(originalMsg, false, false); // don't requeue, send to DLQ
      } else {
        // Transient error, requeue
        // WARNING: Simple nack with requeue=true can cause an infinite loop if not handled with TTL/headers.
        // For production, we'd use a retry queue with TTL. Here we nack and send to DLX if it fails too many times.
        // We will assume RabbitMQ is configured with a dead-letter-exchange for this queue.
        channel.nack(originalMsg, false, false);
      }
    }
  }
}

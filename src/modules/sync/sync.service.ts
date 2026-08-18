import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import { Prisma } from '../../../generated/prisma/client';
import type { JwtPayload } from '../../common/decorators/current-user.decorator';
import { PrismaService } from '../../prisma/prisma.service';
import { SyncBatchDto, SyncTransactionDto } from './dto/sync-batch.dto';
import { SyncProducerService } from './sync-producer.service';

@Injectable()
export class SyncService implements OnModuleInit, OnModuleDestroy {
  private dispatcher?: NodeJS.Timeout;

  constructor(
    private readonly prisma: PrismaService,
    private readonly producer: SyncProducerService,
  ) {}

  onModuleInit(): void {
    this.dispatcher = setInterval(() => void this.dispatchPending(), 2_000);
    this.dispatcher.unref();
  }

  onModuleDestroy(): void {
    if (this.dispatcher) clearInterval(this.dispatcher);
  }

  async accept(user: JwtPayload, deviceId: string | undefined, batch: SyncBatchDto) {
    const device = await this.requireOperatorDevice(user, deviceId);
    const prepared = prepareBatch(batch.transactions);
    const productIds = [
      ...new Set(
        batch.transactions.flatMap((transaction) =>
          transaction.items.map((item) => item.id_product),
        ),
      ),
    ];
    const products = await this.prisma.product.findMany({
      where: { id_product: { in: productIds }, id_merchant: user.id_merchant },
      select: { id_product: true },
    });
    if (products.length !== productIds.length) {
      throw new BadRequestException({
        code: 'PRODUCT_TENANT_MISMATCH',
        message: 'One or more products do not belong to this merchant',
      });
    }

    const receipts = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.syncReceipt.findMany({
        where: {
          id_device: device.id_device,
          offline_uuid: { in: prepared.map((item) => item.payload.offline_uuid) },
        },
      });
      const byUuid = new Map(existing.map((receipt) => [receipt.offline_uuid, receipt]));
      for (const item of prepared) {
        const receipt = byUuid.get(item.payload.offline_uuid);
        if (receipt && receipt.payload_hash !== item.hash) {
          throw new ConflictException({
            code: 'IDEMPOTENCY_PAYLOAD_MISMATCH',
            message: 'Offline UUID was reused with a different payload',
            details: { offline_uuid: item.payload.offline_uuid },
          });
        }
      }

      await tx.syncReceipt.createMany({
        data: prepared.map((item) => ({
          id_merchant: user.id_merchant,
          id_device: device.id_device,
          id_operator: user.sub,
          offline_uuid: item.payload.offline_uuid,
          payload_hash: item.hash,
          payload: item.payload as unknown as Prisma.InputJsonObject,
        })),
        skipDuplicates: true,
      });
      const accepted = await tx.syncReceipt.findMany({
        where: {
          id_device: device.id_device,
          offline_uuid: { in: prepared.map((item) => item.payload.offline_uuid) },
        },
      });
      const acceptedByUuid = new Map(accepted.map((receipt) => [receipt.offline_uuid, receipt]));
      for (const item of prepared) {
        const receipt = acceptedByUuid.get(item.payload.offline_uuid);
        if (!receipt || receipt.payload_hash !== item.hash) {
          throw new ConflictException({
            code: 'IDEMPOTENCY_PAYLOAD_MISMATCH',
            message: 'Offline UUID was reused with a different payload',
            details: { offline_uuid: item.payload.offline_uuid },
          });
        }
      }
      return prepared.map((item) => acceptedByUuid.get(item.payload.offline_uuid)!);
    });

    let publishFailed = false;
    for (const receipt of receipts) {
      if (receipt.status === 'QUEUED' && !receipt.published_at) {
        try {
          await this.publish(receipt.id_receipt);
        } catch {
          publishFailed = true;
        }
      }
    }
    if (publishFailed) {
      throw new ServiceUnavailableException({
        code: 'SYNC_BROKER_UNAVAILABLE',
        message: 'Sales are stored durably but RabbitMQ is unavailable; retry the same batch',
      });
    }

    return { accepted: batch.transactions.length, queued_at: new Date().toISOString() };
  }

  async getReceipts(user: JwtPayload, offlineUuids: string[]) {
    if (offlineUuids.length === 0 || offlineUuids.length > 100) {
      throw new BadRequestException({
        code: 'INVALID_RECEIPT_QUERY',
        message: 'Provide between 1 and 100 offline_uuid values',
      });
    }
    return {
      items: await this.prisma.syncReceipt.findMany({
        where: {
          id_merchant: user.id_merchant,
          offline_uuid: { in: offlineUuids },
          ...(user.role === 'OPERATOR' ? { id_device: user.id_device } : {}),
        },
        select: {
          id_receipt: true,
          offline_uuid: true,
          status: true,
          id_transaction: true,
          retryable: true,
          last_error_code: true,
          last_error_message: true,
          created_at: true,
          updated_at: true,
          terminal_at: true,
        },
        orderBy: { created_at: 'asc' },
      }),
    };
  }

  async getFailures(user: JwtPayload) {
    return {
      items: await this.prisma.syncReceipt.findMany({
        where: {
          id_merchant: user.id_merchant,
          status: { in: ['CONFLICT', 'FAILED'] },
        },
        select: {
          id_receipt: true,
          offline_uuid: true,
          status: true,
          id_transaction: true,
          retryable: true,
          last_error_code: true,
          last_error_message: true,
          created_at: true,
          updated_at: true,
          terminal_at: true,
        },
        orderBy: [{ updated_at: 'desc' }, { id_receipt: 'desc' }],
        take: 100,
      }),
    };
  }

  async retry(user: JwtPayload, receiptId: string) {
    const receipt = await this.prisma.syncReceipt.findFirst({
      where: { id_receipt: receiptId, id_merchant: user.id_merchant },
    });
    if (!receipt)
      throw new NotFoundException({ code: 'RECEIPT_NOT_FOUND', message: 'Sync receipt not found' });
    if (receipt.status !== 'FAILED' || !receipt.retryable || receipt.id_transaction) {
      throw new ConflictException({
        code: 'SYNC_RECEIPT_NOT_RETRYABLE',
        message: 'Receipt cannot be retried',
      });
    }
    await this.prisma.syncReceipt.update({
      where: { id_receipt: receiptId },
      data: {
        status: 'QUEUED',
        terminal_at: null,
        published_at: null,
        next_publish_at: new Date(),
        retry_step: 0,
        last_error_code: null,
        last_error_message: null,
      },
    });
    await this.publish(receiptId);
    return { id_receipt: receiptId, status: 'QUEUED' };
  }

  private async requireOperatorDevice(user: JwtPayload, headerDeviceId?: string) {
    if (!headerDeviceId || !user.id_device || headerDeviceId !== user.id_device) {
      throw new ForbiddenException({
        code: 'DEVICE_SESSION_MISMATCH',
        message: 'X-Device-ID must match the authenticated Operator session',
      });
    }
    const device = await this.prisma.device.findFirst({
      where: {
        id_device: headerDeviceId,
        id_merchant: user.id_merchant,
        is_active: true,
        status: 'PAIRED',
      },
    });
    if (!device)
      throw new ForbiddenException({ code: 'DEVICE_REVOKED', message: 'Device is not active' });
    return device;
  }

  private async publish(receiptId: string): Promise<void> {
    try {
      await this.producer.publishReceipt(receiptId);
      await this.prisma.syncReceipt.updateMany({
        where: { id_receipt: receiptId, published_at: null },
        data: { published_at: new Date(), publish_attempts: { increment: 1 } },
      });
    } catch (error) {
      await this.prisma.syncReceipt.updateMany({
        where: { id_receipt: receiptId, published_at: null },
        data: { publish_attempts: { increment: 1 }, next_publish_at: new Date(Date.now() + 2_000) },
      });
      throw error;
    }
  }

  private async dispatchPending(): Promise<void> {
    if (!this.producer.isHealthy()) return;
    const receipts = await this.prisma.syncReceipt.findMany({
      where: { status: 'QUEUED', published_at: null, next_publish_at: { lte: new Date() } },
      select: { id_receipt: true },
      orderBy: { created_at: 'asc' },
      take: 50,
    });
    for (const receipt of receipts) {
      try {
        await this.publish(receipt.id_receipt);
      } catch {
        return;
      }
    }
  }
}

export function prepareBatch(transactions: SyncTransactionDto[]) {
  const seen = new Set<string>();
  return transactions.map((payload) => {
    if (seen.has(payload.offline_uuid)) {
      throw new BadRequestException({
        code: 'DUPLICATE_BATCH_ID',
        message: 'offline_uuid must be unique inside a batch',
      });
    }
    seen.add(payload.offline_uuid);
    validateArithmetic(payload);
    const canonical = stableStringify(payload);
    return { payload, hash: createHash('sha256').update(canonical).digest('hex') };
  });
}

function validateArithmetic(transaction: SyncTransactionDto): void {
  for (const item of transaction.items) {
    if (item.quantity * item.unit_price !== item.subtotal) {
      throw new BadRequestException({
        code: 'INVALID_TRANSACTION_ARITHMETIC',
        message: 'Item subtotal is invalid',
        details: { id_product: item.id_product },
      });
    }
  }
  const subtotal = transaction.items.reduce((sum, item) => sum + item.subtotal, 0);
  if (
    subtotal !== transaction.subtotal ||
    transaction.total !== transaction.subtotal ||
    transaction.payment.amount !== transaction.total
  ) {
    throw new BadRequestException({
      code: 'INVALID_TRANSACTION_ARITHMETIC',
      message: 'Transaction totals are inconsistent',
    });
  }
  if (transaction.payment.method === 'CASH') {
    const received = transaction.payment.cash_received ?? -1;
    const change = transaction.payment.change_amount ?? -1;
    if (received < transaction.total || received - transaction.total !== change) {
      throw new BadRequestException({
        code: 'INVALID_CASH_ARITHMETIC',
        message: 'Cash received/change is inconsistent',
      });
    }
  }
}

export function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, child]) => child !== undefined)
      .sort(([left], [right]) => left.localeCompare(right));
    return `{${entries.map(([key, child]) => `${JSON.stringify(key)}:${stableStringify(child)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { Prisma } from '../../../generated/prisma/client';
import type { JwtPayload } from '../../common/decorators/current-user.decorator';
import { PrismaService } from '../../prisma/prisma.service';
import { CorrectTransactionDto } from './dto/correct-transaction.dto';
import { QueryTransactionsDto } from './dto/query-transactions.dto';
import { ResolveConflictDto } from './dto/resolve-conflict.dto';
import { VoidTransactionDto } from './dto/void-transaction.dto';

@Injectable()
export class TransactionsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(user: JwtPayload, query: QueryTransactionsDto) {
    const limit = Math.min(query.limit ?? 25, 100);
    const transactions = await this.prisma.transaction.findMany({
      where: {
        id_merchant: user.id_merchant,
        ...(user.role === 'OPERATOR' ? { id_user: user.sub } : {}),
        ...(query.status ? { status: query.status } : {}),
        ...(query.sync_status ? { sync_status: query.sync_status } : {}),
        ...(query.id_device ? { id_device: query.id_device } : {}),
        ...(query.start_date || query.end_date
          ? {
              created_at: {
                ...(query.start_date ? { gte: new Date(query.start_date) } : {}),
                ...(query.end_date ? { lte: new Date(query.end_date) } : {}),
              },
            }
          : {}),
      },
      include: { payment: true, corrections_as_old: { orderBy: { created_at: 'desc' }, take: 1 } },
      take: limit + 1,
      ...(query.cursor ? { cursor: { id_transaction: query.cursor }, skip: 1 } : {}),
      orderBy: [{ created_at: 'desc' }, { id_transaction: 'desc' }],
    });
    const hasMore = transactions.length > limit;
    if (hasMore) transactions.pop();
    return {
      items: transactions.map(withEffectiveStatus),
      meta: { next_cursor: hasMore ? (transactions.at(-1)?.id_transaction ?? null) : null, limit },
    };
  }

  async findOne(user: JwtPayload, id: string) {
    const transaction = await this.prisma.transaction.findFirst({
      where: {
        id_transaction: id,
        id_merchant: user.id_merchant,
        ...(user.role === 'OPERATOR' ? { id_user: user.sub } : {}),
      },
      include: {
        details: true,
        payment: { include: { reconciliations: { orderBy: { created_at: 'desc' } } } },
        corrections_as_old: { include: { new_transaction: true }, orderBy: { created_at: 'desc' } },
        corrections_as_new: true,
        sync_receipt: true,
      },
    });
    if (!transaction)
      throw new NotFoundException({
        code: 'TRANSACTION_NOT_FOUND',
        message: 'Transaction not found',
      });
    return withEffectiveStatus(transaction);
  }

  async voidTransaction(user: JwtPayload, id: string, dto: VoidTransactionDto) {
    const original = await this.requireOwnerTransaction(user, id);
    if (original.corrections_as_old.length > 0) {
      throw new ConflictException({
        code: 'TRANSACTION_ALREADY_CORRECTED',
        message: 'Transaction already has an effective correction',
      });
    }

    return this.prisma.$transaction(async (tx) => {
      const correction = await tx.transactionCorrection.create({
        data: {
          id_old_transaction: original.id_transaction,
          corrected_by: user.sub,
          type: 'VOID',
          reason: dto.void_reason,
          inventory_returned: dto.inventory_returned ?? false,
        },
      });
      if (dto.inventory_returned && original.status === 'CONFIRMED') {
        for (const detail of original.details) {
          await tx.inventory.update({
            where: { id_product: detail.id_product },
            data: { current_stock: { increment: detail.quantity } },
          });
          await tx.stockHistory.create({
            data: {
              idempotency_key: `void-return:${correction.id_correction}:${detail.id_product}`,
              id_product: detail.id_product,
              id_merchant: original.id_merchant,
              id_user: user.sub,
              id_transaction: original.id_transaction,
              id_correction: correction.id_correction,
              movement_type: 'RETURN',
              quantity: detail.quantity,
              notes: dto.void_reason,
            },
          });
        }
      }
      if (original.status === 'CONFIRMED') {
        await tx.backendOutbox.create({
          data: {
            idempotency_key: `reporting:void:${correction.id_correction}`,
            id_merchant: original.id_merchant,
            id_transaction: original.id_transaction,
            event_type: 'REPORTING_VOID',
            payload: reportingDelta(original, -1),
          },
        });
      }
      if (original.sync_status === 'SYNC_CONFLICT') {
        await tx.transaction.update({
          where: { id_transaction: id },
          data: { sync_status: 'SYNCED' },
        });
        await tx.syncReceipt.updateMany({
          where: { id_transaction: id, status: 'CONFLICT' },
          data: {
            status: 'SYNCED',
            last_error_code: null,
            last_error_message: null,
            terminal_at: new Date(),
          },
        });
      }
      await tx.auditEvent.create({
        data: {
          id_merchant: user.id_merchant,
          id_actor: user.sub,
          action: 'TRANSACTION_VOIDED',
          entity_type: 'TRANSACTION',
          entity_id: id,
          metadata: {
            correction_id: correction.id_correction,
            inventory_returned: dto.inventory_returned ?? false,
          },
        },
      });
      return { ...correction, effective_status: 'VOIDED' };
    });
  }

  async resolveConflict(user: JwtPayload, id: string, dto: ResolveConflictDto) {
    const original = await this.requireOwnerTransaction(user, id);
    if (original.sync_status !== 'SYNC_CONFLICT' || original.status !== 'PENDING') {
      throw new BadRequestException({
        code: 'INVALID_STATE_TRANSITION',
        message: 'Transaction is not an unresolved stock conflict',
      });
    }
    if (dto.action === 'VOID') {
      return this.voidTransaction(user, id, {
        void_reason: dto.notes ?? 'Stock conflict voided by Owner',
        inventory_returned: false,
      });
    }

    return this.prisma.$transaction(async (tx) => {
      for (const detail of original.details) {
        const inventory = await tx.inventory.findUniqueOrThrow({
          where: { id_product: detail.id_product },
        });
        const shortage = Math.max(0, detail.quantity - inventory.current_stock);
        await tx.inventory.update({
          where: { id_product: detail.id_product },
          data: { current_stock: { decrement: detail.quantity } },
        });
        await tx.stockHistory.create({
          data: {
            idempotency_key: `conflict-confirm:${id}:${detail.id_product}`,
            id_product: detail.id_product,
            id_merchant: original.id_merchant,
            id_user: user.sub,
            id_transaction: id,
            movement_type: 'SALE',
            quantity: -detail.quantity,
            notes: dto.notes ?? 'Forced settlement by Owner',
          },
        });
        if (shortage > 0) {
          await tx.stockDiscrepancy.create({
            data: {
              id_merchant: original.id_merchant,
              id_product: detail.id_product,
              id_device: original.id_device,
              id_transaction: id,
              shortage,
              resolution: dto.notes,
              resolved_at: new Date(),
            },
          });
        }
      }
      const settled = await tx.transaction.update({
        where: { id_transaction: id },
        data: { status: 'CONFIRMED', sync_status: 'SYNCED', confirmed_at: new Date() },
        include: { details: true },
      });
      await tx.syncReceipt.updateMany({
        where: { id_transaction: id, status: 'CONFLICT' },
        data: {
          status: 'SYNCED',
          last_error_code: null,
          last_error_message: null,
          terminal_at: new Date(),
        },
      });
      await tx.backendOutbox.create({
        data: {
          idempotency_key: `reporting:sale:${id}`,
          id_merchant: original.id_merchant,
          id_transaction: id,
          event_type: 'REPORTING_SALE',
          payload: reportingDelta(settled, 1),
        },
      });
      await tx.auditEvent.create({
        data: {
          id_merchant: user.id_merchant,
          id_actor: user.sub,
          action: 'SYNC_CONFLICT_CONFIRMED',
          entity_type: 'TRANSACTION',
          entity_id: id,
          metadata: { notes: dto.notes ?? null },
        },
      });
      return {
        id_transaction: id,
        status: 'CONFIRMED',
        sync_status: 'SYNCED',
        effective_status: 'CONFIRMED',
      };
    });
  }

  async correctTransaction(user: JwtPayload, id: string, dto: CorrectTransactionDto) {
    const original = await this.requireOwnerTransaction(user, id);
    if (original.status !== 'CONFIRMED' || original.corrections_as_old.length > 0) {
      throw new ConflictException({
        code: 'TRANSACTION_NOT_CORRECTABLE',
        message: 'Only an uncorrected confirmed transaction can be corrected',
      });
    }
    const subtotal = dto.items.reduce((sum, item) => sum + item.subtotal, 0);
    if (
      dto.items.length === 0 ||
      dto.items.some((item) => item.quantity * item.unit_price !== item.subtotal) ||
      subtotal !== dto.subtotal ||
      dto.total !== dto.subtotal
    ) {
      throw new BadRequestException({
        code: 'INVALID_TRANSACTION_ARITHMETIC',
        message: 'Correction totals are inconsistent',
      });
    }
    const products = await this.prisma.product.findMany({
      where: {
        id_merchant: user.id_merchant,
        id_product: { in: [...new Set(dto.items.map((item) => item.id_product))] },
      },
    });
    if (products.length !== new Set(dto.items.map((item) => item.id_product)).size) {
      throw new BadRequestException({
        code: 'PRODUCT_TENANT_MISMATCH',
        message: 'Correction contains an invalid product',
      });
    }
    const productMap = new Map(products.map((product) => [product.id_product, product]));

    return this.prisma.$transaction(async (tx) => {
      const newUuid = randomUUID();
      const newTransaction = await tx.transaction.create({
        data: {
          id_merchant: original.id_merchant,
          id_user: original.id_user,
          id_device: original.id_device,
          offline_uuid: newUuid,
          payload_hash: createHash('sha256').update(`correction:${id}:${newUuid}`).digest('hex'),
          status: 'CONFIRMED',
          sync_status: 'SYNCED',
          created_at_local: new Date(),
          confirmed_at: new Date(),
          synced_at: new Date(),
          subtotal: dto.subtotal,
          total: dto.total,
          notes: dto.notes,
        },
      });
      await tx.detailTransaction.createMany({
        data: dto.items.map((item) => {
          const product = productMap.get(item.id_product)!;
          return {
            id_transaction: newTransaction.id_transaction,
            id_product: item.id_product,
            product_name: product.name,
            product_sku: product.sku,
            catalog_version: product.catalog_version,
            quantity: item.quantity,
            unit_price: item.unit_price,
            subtotal: item.subtotal,
          };
        }),
      });
      const correction = await tx.transactionCorrection.create({
        data: {
          id_old_transaction: id,
          id_new_transaction: newTransaction.id_transaction,
          corrected_by: user.sub,
          type: 'CORRECTION',
          reason: dto.reason,
        },
      });
      for (const detail of original.details) {
        await tx.inventory.update({
          where: { id_product: detail.id_product },
          data: { current_stock: { increment: detail.quantity } },
        });
        await tx.stockHistory.create({
          data: {
            idempotency_key: `correction-revert:${correction.id_correction}:${detail.id_product}`,
            id_product: detail.id_product,
            id_merchant: original.id_merchant,
            id_user: user.sub,
            id_transaction: id,
            id_correction: correction.id_correction,
            movement_type: 'CORRECTION',
            quantity: detail.quantity,
            notes: dto.reason,
          },
        });
      }
      for (const item of dto.items) {
        await tx.inventory.update({
          where: { id_product: item.id_product },
          data: { current_stock: { decrement: item.quantity } },
        });
        await tx.stockHistory.create({
          data: {
            idempotency_key: `correction-apply:${correction.id_correction}:${item.id_product}`,
            id_product: item.id_product,
            id_merchant: original.id_merchant,
            id_user: user.sub,
            id_transaction: newTransaction.id_transaction,
            id_correction: correction.id_correction,
            movement_type: 'CORRECTION',
            quantity: -item.quantity,
            notes: dto.reason,
          },
        });
      }
      if (original.payment) {
        await tx.payment.create({
          data: {
            id_transaction: newTransaction.id_transaction,
            id_merchant: original.id_merchant,
            amount: dto.total,
            method: original.payment.method,
            status: original.payment.status,
            cash_received: original.payment.cash_received,
            change_amount:
              original.payment.method === 'CASH' && original.payment.cash_received
                ? original.payment.cash_received - dto.total
                : null,
            qris_code: original.payment.qris_code,
            transfer_ref: original.payment.transfer_ref,
            verified_at: original.payment.verified_at,
            verified_by: original.payment.verified_by,
            verification_note: `Copied by correction ${correction.id_correction}`,
          },
        });
      }
      await tx.backendOutbox.createMany({
        data: [
          {
            idempotency_key: `reporting:correction-void:${correction.id_correction}`,
            id_merchant: original.id_merchant,
            id_transaction: id,
            event_type: 'REPORTING_VOID',
            payload: reportingDelta(original, -1),
          },
          {
            idempotency_key: `reporting:correction-sale:${correction.id_correction}`,
            id_merchant: original.id_merchant,
            id_transaction: newTransaction.id_transaction,
            event_type: 'REPORTING_SALE',
            payload: correctionReportingPayload(dto, productMap, newTransaction.id_transaction),
          },
        ],
      });
      await tx.auditEvent.create({
        data: {
          id_merchant: user.id_merchant,
          id_actor: user.sub,
          action: 'TRANSACTION_CORRECTED',
          entity_type: 'TRANSACTION',
          entity_id: id,
          metadata: {
            correction_id: correction.id_correction,
            replacement_id: newTransaction.id_transaction,
          },
        },
      });
      return { ...correction, effective_status: 'CORRECTED' };
    });
  }

  private async requireOwnerTransaction(user: JwtPayload, id: string) {
    const transaction = await this.prisma.transaction.findFirst({
      where: { id_transaction: id, id_merchant: user.id_merchant },
      include: { details: true, payment: true, corrections_as_old: true },
    });
    if (!transaction)
      throw new NotFoundException({
        code: 'TRANSACTION_NOT_FOUND',
        message: 'Transaction not found',
      });
    return transaction;
  }
}

function withEffectiveStatus<
  T extends { status: string; corrections_as_old: Array<{ type: string }> },
>(transaction: T) {
  const correction = transaction.corrections_as_old[0];
  return {
    ...transaction,
    effective_status:
      correction?.type === 'VOID'
        ? 'VOIDED'
        : correction?.type === 'CORRECTION'
          ? 'CORRECTED'
          : transaction.status,
  };
}

type ReportingSource = {
  id_transaction: string;
  created_at_local: Date;
  total: number;
  details: Array<{ id_product: string; product_name: string; quantity: number; subtotal: number }>;
};

function reportingDelta(transaction: ReportingSource, factor: 1 | -1): Prisma.InputJsonObject {
  return {
    transaction_id: transaction.id_transaction,
    occurred_at: transaction.created_at_local.toISOString(),
    gross_delta: factor * transaction.total,
    net_delta: factor * transaction.total,
    count_delta: factor,
    items: transaction.details.map((item) => ({
      id_product: item.id_product,
      product_name: item.product_name,
      quantity_delta: factor * item.quantity,
      gross_delta: factor * item.subtotal,
      net_delta: factor * item.subtotal,
    })),
  };
}

function correctionReportingPayload(
  dto: CorrectTransactionDto,
  products: Map<string, { name: string }>,
  transactionId: string,
): Prisma.InputJsonObject {
  return {
    transaction_id: transactionId,
    occurred_at: new Date().toISOString(),
    gross_delta: dto.total,
    net_delta: dto.total,
    count_delta: 1,
    items: dto.items.map((item) => ({
      id_product: item.id_product,
      product_name: products.get(item.id_product)!.name,
      quantity_delta: item.quantity,
      gross_delta: item.subtotal,
      net_delta: item.subtotal,
    })),
  };
}

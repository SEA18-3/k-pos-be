import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, PaymentStatus, ReconciliationStatus } from '../../../generated/prisma/client';
import type { JwtPayload } from '../../common/decorators/current-user.decorator';
import { PrismaService } from '../../prisma/prisma.service';
import {
  OpenPaymentReconciliationDto,
  ResolvePaymentReconciliationDto,
} from './dto/reconciliation.dto';
import { paymentResolution } from './payment-policy';

@Injectable()
export class PaymentsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(user: JwtPayload, status?: string) {
    const normalized =
      status && Object.values(PaymentStatus).includes(status as PaymentStatus)
        ? (status as PaymentStatus)
        : undefined;
    return {
      items: await this.prisma.payment.findMany({
        where: { id_merchant: user.id_merchant, ...(normalized ? { status: normalized } : {}) },
        include: {
          transaction: { select: { total: true, created_at_local: true, id_user: true } },
          reconciliations: { orderBy: { created_at: 'desc' }, take: 1 },
        },
        orderBy: { created_at: 'desc' },
        take: 100,
      }),
    };
  }

  async listReconciliations(user: JwtPayload, status?: string) {
    const normalized =
      status && Object.values(ReconciliationStatus).includes(status as ReconciliationStatus)
        ? (status as ReconciliationStatus)
        : undefined;
    return {
      items: await this.prisma.paymentReconciliation.findMany({
        where: { id_merchant: user.id_merchant, ...(normalized ? { status: normalized } : {}) },
        include: {
          payment: { include: { transaction: true } },
          correction: true,
          opener: { select: { full_name: true } },
          resolver: { select: { full_name: true } },
        },
        orderBy: { created_at: 'desc' },
        take: 100,
      }),
    };
  }

  async open(user: JwtPayload, paymentId: string, dto: OpenPaymentReconciliationDto) {
    const payment = await this.prisma.payment.findFirst({
      where: { id_payment: paymentId, id_merchant: user.id_merchant },
    });
    if (!payment)
      throw new NotFoundException({ code: 'PAYMENT_NOT_FOUND', message: 'Payment not found' });
    if (payment.status !== 'VERIFIED') {
      throw new ConflictException({
        code: 'PAYMENT_NOT_VERIFIED',
        message: 'Only a verified payment can open a reconciliation case',
      });
    }
    const open = await this.prisma.paymentReconciliation.findFirst({
      where: { id_payment: paymentId, status: 'OPEN' },
    });
    if (open)
      throw new ConflictException({
        code: 'RECONCILIATION_ALREADY_OPEN',
        message: 'This payment already has an open reconciliation',
      });

    return this.prisma.$transaction(async (tx) => {
      const reconciliation = await tx.paymentReconciliation.create({
        data: {
          id_merchant: user.id_merchant,
          id_payment: paymentId,
          opened_by: user.sub,
          reason: dto.reason,
          evidence_note: dto.evidence_note,
        },
      });
      await tx.auditEvent.create({
        data: {
          id_merchant: user.id_merchant,
          id_actor: user.sub,
          action: 'PAYMENT_RECONCILIATION_OPENED',
          entity_type: 'PAYMENT',
          entity_id: paymentId,
          metadata: { reconciliation_id: reconciliation.id_reconciliation },
        },
      });
      return reconciliation;
    });
  }

  async resolve(user: JwtPayload, reconciliationId: string, dto: ResolvePaymentReconciliationDto) {
    return this.prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<Array<{ id_reconciliation: string }>>(Prisma.sql`
        SELECT "id_reconciliation"
        FROM "PaymentReconciliation"
        WHERE "id_reconciliation" = ${reconciliationId}
          AND "id_merchant" = ${user.id_merchant}
        FOR UPDATE
      `);
      if (locked.length !== 1) {
        throw new NotFoundException({
          code: 'RECONCILIATION_NOT_FOUND',
          message: 'Reconciliation not found',
        });
      }
      const reconciliation = await tx.paymentReconciliation.findUniqueOrThrow({
        where: { id_reconciliation: reconciliationId },
        include: {
          payment: {
            include: { transaction: { include: { details: true, corrections_as_old: true } } },
          },
        },
      });
      if (reconciliation.status !== 'OPEN') {
        throw new ConflictException({
          code: 'RECONCILIATION_ALREADY_RESOLVED',
          message: 'Reconciliation is already resolved',
        });
      }

      const resolution = paymentResolution(reconciliation.payment.status, dto.action);
      if (dto.action === 'VALID') {
        const resolved = await tx.paymentReconciliation.update({
          where: { id_reconciliation: reconciliationId },
          data: {
            status: resolution.reconciliationStatus,
            resolved_by: user.sub,
            resolution_note: dto.resolution_note,
            resolved_at: new Date(),
          },
        });
        await tx.auditEvent.create({
          data: {
            id_merchant: user.id_merchant,
            id_actor: user.sub,
            action: 'PAYMENT_RECONCILIATION_VALID',
            entity_type: 'PAYMENT',
            entity_id: reconciliation.id_payment,
            metadata: { reconciliation_id: reconciliationId },
          },
        });
        return resolved;
      }

      const transaction = reconciliation.payment.transaction;
      if (transaction.corrections_as_old.length > 0) {
        throw new ConflictException({
          code: 'TRANSACTION_ALREADY_CORRECTED',
          message: 'Transaction already has an effective correction',
        });
      }
      const correction = await tx.transactionCorrection.create({
        data: {
          id_old_transaction: transaction.id_transaction,
          corrected_by: user.sub,
          type: 'VOID',
          reason: dto.resolution_note,
          inventory_returned: dto.inventory_returned ?? false,
        },
      });
      await tx.payment.update({
        where: { id_payment: reconciliation.id_payment },
        data: { status: resolution.paymentStatus },
      });
      const resolved = await tx.paymentReconciliation.update({
        where: { id_reconciliation: reconciliationId },
        data: {
          status: resolution.reconciliationStatus,
          resolved_by: user.sub,
          resolution_note: dto.resolution_note,
          resolved_at: new Date(),
          id_correction: correction.id_correction,
        },
      });

      if (dto.inventory_returned && transaction.status === 'CONFIRMED') {
        for (const detail of transaction.details) {
          await tx.inventory.update({
            where: { id_product: detail.id_product },
            data: { current_stock: { increment: detail.quantity } },
          });
          await tx.stockHistory.create({
            data: {
              idempotency_key: `payment-invalid-return:${correction.id_correction}:${detail.id_product}`,
              id_product: detail.id_product,
              id_merchant: user.id_merchant,
              id_user: user.sub,
              id_transaction: transaction.id_transaction,
              id_correction: correction.id_correction,
              movement_type: 'RETURN',
              quantity: detail.quantity,
              notes: dto.resolution_note,
            },
          });
        }
      }
      if (transaction.status === 'CONFIRMED') {
        await tx.backendOutbox.create({
          data: {
            idempotency_key: `reporting:payment-invalid:${correction.id_correction}`,
            id_merchant: user.id_merchant,
            id_transaction: transaction.id_transaction,
            event_type: 'REPORTING_VOID',
            payload: negativeReportingPayload(transaction),
          },
        });
      }
      await tx.auditEvent.create({
        data: {
          id_merchant: user.id_merchant,
          id_actor: user.sub,
          action: 'PAYMENT_RECONCILIATION_INVALID',
          entity_type: 'PAYMENT',
          entity_id: reconciliation.id_payment,
          metadata: {
            reconciliation_id: reconciliationId,
            correction_id: correction.id_correction,
          },
        },
      });
      return resolved;
    });
  }
}

function negativeReportingPayload(transaction: {
  id_transaction: string;
  created_at_local: Date;
  total: number;
  details: Array<{ id_product: string; product_name: string; quantity: number; subtotal: number }>;
}): Prisma.InputJsonObject {
  return {
    transaction_id: transaction.id_transaction,
    occurred_at: transaction.created_at_local.toISOString(),
    gross_delta: -transaction.total,
    net_delta: -transaction.total,
    count_delta: -1,
    items: transaction.details.map((item) => ({
      id_product: item.id_product,
      product_name: item.product_name,
      quantity_delta: -item.quantity,
      gross_delta: -item.subtotal,
      net_delta: -item.subtotal,
    })),
  };
}

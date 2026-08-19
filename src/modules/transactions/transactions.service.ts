import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { QueryTransactionsDto } from './dto/query-transactions.dto';
import { VoidTransactionDto } from './dto/void-transaction.dto';
import { ResolveConflictDto } from './dto/resolve-conflict.dto';
import { CorrectTransactionDto } from './dto/correct-transaction.dto';
import {
  Prisma,
  SyncStatus,
  TransactionStatus,
  Transaction,
} from '../../../generated/prisma/client';
import type { JwtPayload } from '../../common/decorators/current-user.decorator';
import { adjustInventoryAndHistory } from '../../common/utils/inventory.util';

@Injectable()
export class TransactionsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(user: JwtPayload, query: QueryTransactionsDto) {
    const { status, sync_status, id_device, start_date, end_date, cursor, limit = 10 } = query;

    const where: Prisma.TransactionWhereInput = {
      id_merchant: user.id_merchant,
    };

    if (status) where.status = status;
    if (sync_status) where.sync_status = sync_status;
    if (id_device) where.id_device = id_device;
    if (start_date && end_date) {
      where.created_at = { gte: new Date(start_date), lte: new Date(end_date) };
    } else if (start_date) {
      where.created_at = { gte: new Date(start_date) };
    } else if (end_date) {
      where.created_at = { lte: new Date(end_date) };
    }

    const transactions = await this.prisma.transaction.findMany({
      where,
      take: limit + 1,
      cursor: cursor ? { id_transaction: cursor } : undefined,
      orderBy: { created_at: 'desc' },
      include: { details: true, payment: true },
    });

    let next_cursor: string | null = null;
    if (transactions.length > limit) {
      const nextItem = transactions.pop();
      next_cursor = nextItem?.id_transaction || null;
    }

    return {
      data: transactions,
      meta: { next_cursor, limit },
    };
  }

  async findOne(user: JwtPayload, id: string) {
    const transaction = await this.prisma.transaction.findFirst({
      where: { OR: [{ id_transaction: id }, { offline_uuid: id }] },
      include: { details: true, payment: true },
    });

    if (!transaction || transaction.id_merchant !== user.id_merchant) {
      throw new NotFoundException(`Transaction with ID ${id} not found`);
    }

    return transaction;
  }

  async voidTransaction(user: JwtPayload, id: string, dto: VoidTransactionDto) {
    const transaction = await this.findOne(user, id);

    if (transaction.status === 'VOIDED') {
      throw new BadRequestException('Transaction is already voided');
    }

    if (transaction.status !== 'PENDING') {
      throw new BadRequestException(
        'Only PENDING transactions can be voided. Confirmed transactions must go through correction workflow.',
      );
    }

    const updatedTransaction = await this.prisma.transaction.update({
      where: { id_transaction: transaction.id_transaction },
      data: {
        status: 'VOIDED',
        voided_at: new Date(),
        voided_by: user.sub,
        void_reason: dto.void_reason,
      },
    });

    return {
      message: 'Transaction successfully voided',
      data: updatedTransaction,
    };
  }

  async resolveConflict(user: JwtPayload, id: string, dto: ResolveConflictDto) {
    const transaction = await this.findOne(user, id);

    if (transaction.sync_status !== SyncStatus.SYNC_CONFLICT) {
      throw new BadRequestException(`Transaction is not in SYNC_CONFLICT state.`);
    }

    if (dto.action === 'CONFIRM') {
      return await this.prisma.$transaction(async (tx) => {
        await this.forceResolveInventory(tx, transaction, user.sub, dto.notes);

        const resolved = await this.markAsConfirmed(tx, transaction.id_transaction);

        return { message: 'Conflict resolved: transaction CONFIRMED', data: resolved };
      });
    } else {
      // VOID
      const resolved = await this.prisma.transaction.update({
        where: { id_transaction: transaction.id_transaction },
        data: {
          status: TransactionStatus.VOIDED,
          sync_status: SyncStatus.SYNCED,
          voided_at: new Date(),
          voided_by: user.sub,
          void_reason: `Conflict resolved by OWNER (voided). ${dto.notes ?? ''}`.trim(),
        },
      });

      return { message: 'Conflict resolved: transaction VOIDED', data: resolved };
    }
  }

  async correctTransaction(user: JwtPayload, id: string, dto: CorrectTransactionDto) {
    const originalTx = await this.findOne(user, id);

    if (originalTx.status !== TransactionStatus.CONFIRMED) {
      throw new BadRequestException(`Only CONFIRMED transactions can be corrected.`);
    }

    return await this.prisma.$transaction(async (tx) => {
      await this.revertOldStock(tx, originalTx, user.sub, dto.reason);

      const newTx = await this.createNewTransaction(tx, originalTx, dto);

      await this.createDetailsAndDeductStock(tx, newTx, dto, user.sub);

      await this.clonePayment(tx, originalTx, newTx.id_transaction, dto.total);

      await this.markOldAsVoidedAndBridge(
        tx,
        originalTx.id_transaction,
        newTx.id_transaction,
        user.sub,
        dto.reason,
      );

      return {
        message: 'Transaction successfully corrected',
        data: {
          id_old_transaction: originalTx.id_transaction,
          id_new_transaction: newTx.id_transaction,
          corrected_by: user.sub,
          reason: dto.reason,
        },
      };
    });
  }

  /* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */
  async getTransactionHistory(user: JwtPayload, id: string) {
    const initialTx = await this.findOne(user, id);
    let rootId = initialTx.id_transaction;

    while (true) {
      const prev = await this.prisma.transactionCorrection.findFirst({
        where: { id_new_transaction: rootId },
        select: { id_old_transaction: true },
      });
      if (!prev) break;
      rootId = prev.id_old_transaction;
    }

    const history = [];
    let currentId: string | null = rootId;

    while (currentId) {
      const tx = await this.prisma.transaction.findUnique({
        where: { id_transaction: currentId },
        include: { details: true, payment: true },
      });

      if (!tx) break;

      const nextCorrection: any = await this.prisma.transactionCorrection.findFirst({
        where: { id_old_transaction: currentId },
      });

      history.push({
        transaction: tx,
        correction_metadata: nextCorrection
          ? {
              reason: nextCorrection.reason,
              corrected_at: nextCorrection.created_at,
              corrected_by: nextCorrection.corrected_by,
            }
          : null,
      });

      currentId = nextCorrection ? nextCorrection.id_new_transaction : null;
    }

    return history;
  }

  /* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment */

  private async forceResolveInventory(
    tx: Prisma.TransactionClient,
    transaction: any,
    userId: string,
    notes?: string,
  ) {
    for (const detail of transaction.details) {
      await adjustInventoryAndHistory(tx, {
        id_product: detail.id_product,
        id_merchant: transaction.id_merchant,
        id_user: userId,
        id_transaction: transaction.id_transaction,
        quantity_change: -detail.quantity, // Deduct
        movement_type: 'SALE',
        notes: `Forced resolve by OWNER (conflict resolution). ${notes ?? ''}`.trim(),
      });
    }
  }

  private async markAsConfirmed(tx: Prisma.TransactionClient, transactionId: string) {
    return await tx.transaction.update({
      where: { id_transaction: transactionId },
      data: {
        status: TransactionStatus.CONFIRMED,
        sync_status: SyncStatus.SYNCED,
        confirmed_at: new Date(),
      },
    });
  }

  private async revertOldStock(
    tx: Prisma.TransactionClient,
    originalTx: any,
    userId: string,
    reason: string,
  ) {
    for (const oldDetail of originalTx.details) {
      await adjustInventoryAndHistory(tx, {
        id_product: oldDetail.id_product,
        id_merchant: originalTx.id_merchant,
        id_user: userId,
        id_transaction: originalTx.id_transaction,
        quantity_change: oldDetail.quantity, // Increment back
        movement_type: 'CORRECTION',
        notes: `Stock reverted for transaction correction. Reason: ${reason}`,
      });
    }
  }

  private async createNewTransaction(
    tx: Prisma.TransactionClient,
    originalTx: Transaction,
    dto: CorrectTransactionDto,
  ) {
    return await tx.transaction.create({
      data: {
        id_merchant: originalTx.id_merchant,
        id_user: originalTx.id_user,
        id_device: originalTx.id_device,
        subtotal: dto.subtotal,
        total: dto.total,
        notes: dto.notes ?? originalTx.notes,
        status: TransactionStatus.CONFIRMED,
        sync_status: SyncStatus.SYNCED,
        confirmed_at: new Date(),
        created_at_local: originalTx.created_at_local,
      },
    });
  }

  private async createDetailsAndDeductStock(
    tx: Prisma.TransactionClient,
    newTx: Transaction,
    dto: CorrectTransactionDto,
    userId: string,
  ) {
    await tx.detailTransaction.createMany({
      data: dto.items.map((item) => ({
        id_transaction: newTx.id_transaction,
        id_product: item.id_product,
        quantity: item.quantity,
        unit_price: item.unit_price,
        subtotal: item.subtotal,

        product_name: (item as any).product_name ?? 'Correction',
        sku_snapshot: 'NONE',
        catalog_version: new Date(),
      })),
    });

    for (const item of dto.items) {
      await adjustInventoryAndHistory(tx, {
        id_product: item.id_product,
        id_merchant: newTx.id_merchant,
        id_user: userId,
        id_transaction: newTx.id_transaction,
        quantity_change: -item.quantity, // Deduct new stock
        movement_type: 'CORRECTION',
        notes: `New stock deduction after correction. Reason: ${dto.reason}`,
      });
    }
  }

  private async clonePayment(
    tx: Prisma.TransactionClient,
    originalTx: any,
    newTransactionId: string,
    newTotal: number,
  ) {
    if (originalTx.payment) {
      await tx.payment.create({
        data: {
          id_transaction: newTransactionId,
          id_merchant: originalTx.id_merchant,
          amount: newTotal,
          method: originalTx.payment.method,
          status: originalTx.payment.status,
          cash_received: originalTx.payment.cash_received,
          change_amount: originalTx.payment.change_amount,
          qris_code: originalTx.payment.qris_code,
          transfer_ref: originalTx.payment.transfer_ref,
          verified_at: originalTx.payment.verified_at,
          verified_by: originalTx.payment.verified_by,
        },
      });
    }
  }

  private async markOldAsVoidedAndBridge(
    tx: Prisma.TransactionClient,
    oldId: string,
    newId: string,
    userId: string,
    reason: string,
  ) {
    await tx.transaction.update({
      where: { id_transaction: oldId },
      data: {
        status: TransactionStatus.VOIDED,
        voided_at: new Date(),
        voided_by: userId,
        void_reason: `Corrected. Reason: ${reason}. New transaction: ${newId}`,
      },
    });

    await tx.transactionCorrection.create({
      data: {
        id_old_transaction: oldId,
        id_new_transaction: newId,
        corrected_by: userId,
        reason: reason,
      },
    });
  }
}

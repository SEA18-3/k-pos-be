import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { QueryTransactionsDto } from './dto/query-transactions.dto';
import { VoidTransactionDto } from './dto/void-transaction.dto';
import { ResolveConflictDto } from './dto/resolve-conflict.dto';
import { CorrectTransactionDto } from './dto/correct-transaction.dto';
import { Prisma, SyncStatus, TransactionStatus } from '../../../generated/prisma/client';
import type { JwtPayload } from '../../common/decorators/current-user.decorator';

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
      where.created_at = {
        gte: new Date(start_date),
        lte: new Date(end_date),
      };
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
      meta: {
        next_cursor,
        limit,
      },
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
    // 1. Ambil transaksi beserta detail dan payment-nya
    const transaction = await this.prisma.transaction.findFirst({
      where: { OR: [{ id_transaction: id }, { offline_uuid: id }] },
      include: { details: true, payment: true },
    });

    if (!transaction || transaction.id_merchant !== user.id_merchant) {
      throw new NotFoundException(`Transaction with ID ${id} not found`);
    }

    // 2. Hanya transaksi berstatus SYNC_CONFLICT yang boleh di-resolve
    if (transaction.sync_status !== SyncStatus.SYNC_CONFLICT) {
      throw new BadRequestException(
        `Transaction is not in SYNC_CONFLICT state. Current sync_status: ${transaction.sync_status}`,
      );
    }

    if (dto.action === 'CONFIRM') {
      // 3a. CONFIRM: Konfirmasi paksa — potong stok meski hasilnya negatif
      //     (barang secara fisik sudah diberikan ke pelanggan)
      return await this.prisma.$transaction(async (tx) => {
        for (const detail of transaction.details) {
          // Potong stok, biarkan menjadi negatif sebagai sinyal ketidaksesuaian
          await tx.inventory.update({
            where: { id_product: detail.id_product },
            data: { current_stock: { decrement: detail.quantity } },
          });

          // Catat pergerakan stok untuk audit trail
          await tx.stockHistory.create({
            data: {
              id_product: detail.id_product,
              id_merchant: transaction.id_merchant,
              id_user: user.sub,
              id_transaction: transaction.id_transaction,
              movement_type: 'SALE',
              quantity: -detail.quantity,
              notes: `Forced resolve by OWNER (conflict resolution). ${dto.notes ?? ''}`.trim(),
            },
          });
        }

        const resolved = await tx.transaction.update({
          where: { id_transaction: transaction.id_transaction },
          data: {
            status: TransactionStatus.CONFIRMED,
            sync_status: SyncStatus.SYNCED,
            confirmed_at: new Date(),
          },
        });

        // Update catatan rekonsiliasi pada payment
        if (transaction.payment) {
          await tx.payment.update({
            where: { id_payment: transaction.payment.id_payment },
            data: {},
          });
        }

        return {
          message: 'Conflict resolved: transaction CONFIRMED',
          data: resolved,
        };
      });
    } else {
      // 3b. VOID: Batalkan transaksi konflik tanpa memengaruhi stok
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

      return {
        message: 'Conflict resolved: transaction VOIDED',
        data: resolved,
      };
    }
  }

  async correctTransaction(user: JwtPayload, id: string, dto: CorrectTransactionDto) {
    // 1. Ambil transaksi asli beserta semua relasinya
    const originalTx = await this.prisma.transaction.findFirst({
      where: { OR: [{ id_transaction: id }, { offline_uuid: id }] },
      include: { details: true, payment: true },
    });

    if (!originalTx) {
      throw new NotFoundException(`Transaction with ID ${id} not found in DB`);
    }
    if (originalTx.id_merchant !== user.id_merchant) {
      throw new NotFoundException(
        `Merchant mismatch: ${originalTx.id_merchant} vs ${user.id_merchant}`,
      );
    }

    // 2. Hanya transaksi CONFIRMED yang bisa dikoreksi
    if (originalTx.status !== TransactionStatus.CONFIRMED) {
      throw new BadRequestException(
        `Only CONFIRMED transactions can be corrected. Current status: ${originalTx.status}`,
      );
    }

    // 3. Jalankan semua operasi dalam satu Prisma $transaction (atomik)
    const result = await this.prisma.$transaction(async (tx) => {
      // 3a. REVERT stok lama — kembalikan stok ke kondisi sebelum transaksi ini
      for (const oldDetail of originalTx.details) {
        await tx.inventory.update({
          where: { id_product: oldDetail.id_product },
          data: { current_stock: { increment: oldDetail.quantity } },
        });

        await tx.stockHistory.create({
          data: {
            id_product: oldDetail.id_product,
            id_merchant: originalTx.id_merchant,
            id_user: user.sub,
            id_transaction: originalTx.id_transaction,
            movement_type: 'CORRECTION',
            quantity: oldDetail.quantity, // Positif = stok dikembalikan
            notes: `Stock reverted for transaction correction. Reason: ${dto.reason}`,
          },
        });
      }

      // 3b. Buat transaksi BARU sebagai pengganti
      const newTx = await tx.transaction.create({
        data: {
          id_merchant: originalTx.id_merchant,
          id_user: originalTx.id_user,
          id_device: originalTx.id_device,
          offline_uuid: randomUUID(),
          subtotal: dto.subtotal,
          total: dto.total,
          notes: dto.notes ?? originalTx.notes,
          status: TransactionStatus.CONFIRMED,
          sync_status: SyncStatus.SYNCED,
          confirmed_at: new Date(),
          created_at_local: originalTx.created_at_local,
        },
      });

      // 3c. Buat detail item baru
      await tx.detailTransaction.createMany({
        data: dto.items.map((item) => ({
          id_transaction: newTx.id_transaction,
          id_product: item.id_product,
          quantity: item.quantity,
          unit_price: item.unit_price,
          subtotal: item.subtotal,
          // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment
          product_name: (item as any).product_name ?? 'Correction',
          sku_snapshot: 'NONE',
          catalog_version: new Date(),
        })),
      });

      // 3d. Potong stok baru & catat history
      for (const item of dto.items) {
        await tx.inventory.update({
          where: { id_product: item.id_product },
          data: { current_stock: { decrement: item.quantity } },
        });

        await tx.stockHistory.create({
          data: {
            id_product: item.id_product,
            id_merchant: originalTx.id_merchant,
            id_user: user.sub,
            id_transaction: newTx.id_transaction,
            movement_type: 'CORRECTION',
            quantity: -item.quantity, // Negatif = stok dipotong
            notes: `New stock deduction after correction. Reason: ${dto.reason}`,
          },
        });
      }

      // 3e. Salin (clone) payment dari transaksi lama ke transaksi baru,
      //     update amount jika total berubah
      if (originalTx.payment) {
        await tx.payment.create({
          data: {
            id_transaction: newTx.id_transaction,
            id_merchant: originalTx.id_merchant,
            amount: dto.total,
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

      // 3f. Tandai transaksi LAMA sebagai VOIDED (immutable — tidak dihapus)
      await tx.transaction.update({
        where: { id_transaction: originalTx.id_transaction },
        data: {
          status: TransactionStatus.VOIDED,
          voided_at: new Date(),
          voided_by: user.sub,
          void_reason: `Corrected. Reason: ${dto.reason}. New transaction: ${newTx.id_transaction}`,
        },
      });

      // 3g. Buat jembatan Immutable Bridge: TransactionCorrection
      const correction = await tx.transactionCorrection.create({
        data: {
          id_old_transaction: originalTx.id_transaction,
          id_new_transaction: newTx.id_transaction,
          corrected_by: user.sub,
          reason: dto.reason,
        },
      });

      return {
        message: 'Transaction successfully corrected',
        data: {
          id_correction: correction.id_correction,
          id_old_transaction: correction.id_old_transaction,
          id_new_transaction: correction.id_new_transaction,
          corrected_by: correction.corrected_by,
          reason: correction.reason,
          created_at: correction.created_at,
        },
      };
    });

    return result;
  }
}

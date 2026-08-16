import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { QueryTransactionsDto } from './dto/query-transactions.dto';
import { VoidTransactionDto } from './dto/void-transaction.dto';
import { Prisma } from '../../../generated/prisma/client';
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
      include: {
        payment: true,
      },
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
    const transaction = await this.prisma.transaction.findUnique({
      where: { id_transaction: id },
      include: {
        details: true,
        payment: true,
      },
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
      where: { id_transaction: id },
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
}

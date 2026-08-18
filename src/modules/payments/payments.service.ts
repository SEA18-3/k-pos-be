import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type { JwtPayload } from '../../common/decorators/current-user.decorator';

export type PaymentStatusFilter = 'VERIFIED' | 'FAILED';

@Injectable()
export class PaymentsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * GET /payments — List payments with optional status filter (merchant-scoped).
   */
  async findAll(user: JwtPayload, status?: PaymentStatusFilter) {
    return this.prisma.payment.findMany({
      where: {
        id_merchant: user.id_merchant,
        ...(status ? { status: status } : {}),
      },
      include: {
        transaction: {
          select: {
            id_transaction: true,
            offline_uuid: true,
            status: true,
            sync_status: true,
            created_at_local: true,
          },
        },
        reconciliations: {
          select: {
            id_reconciliation: true,
            status: true,
            reason: true,
            created_at: true,
          },
        },
      },
      orderBy: { created_at: 'desc' },
    });
  }

  /**
   * GET /payments/:id — Get single payment (merchant-scoped).
   */
  async findOne(user: JwtPayload, id: string) {
    const payment = await this.prisma.payment.findUnique({
      where: { id_payment: id },
      include: {
        transaction: true,
        reconciliations: {
          include: {
            openedByUser: { select: { full_name: true } },
            resolvedByUser: { select: { full_name: true } },
          },
        },
      },
    });

    if (!payment) {
      throw new NotFoundException('Payment not found');
    }

    if (payment.id_merchant !== user.id_merchant) {
      throw new ForbiddenException('Access denied');
    }

    return payment;
  }
}

import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateReconciliationDto } from './dto/create-reconciliation.dto';
import { ResolveReconciliationDto } from './dto/resolve-reconciliation.dto';
import { JwtPayload } from '../../common/decorators/current-user.decorator';

@Injectable()
export class ReconciliationsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(user: JwtPayload, createDto: CreateReconciliationDto) {
    const transaction = await this.prisma.transaction.findUnique({
      where: { id_transaction: createDto.id_transaction },
      include: { payment: true },
    });

    if (!transaction) {
      throw new NotFoundException('Transaction not found');
    }

    if (transaction.id_merchant !== user.id_merchant) {
      throw new BadRequestException('Transaction does not belong to your merchant');
    }

    if (!transaction.payment) {
      throw new BadRequestException('Transaction has no payment to reconcile');
    }

    const existing = await this.prisma.reconciliation.findFirst({
      where: { id_payment: transaction.payment.id_payment },
    });

    if (existing) {
      throw new BadRequestException('Transaction payment is already under reconciliation');
    }

    return this.prisma.reconciliation.create({
      data: {
        id_payment: transaction.payment.id_payment,
        opened_by: user.sub,
        reason: createDto.reason,
        evidence_note: createDto.evidence,
      },
    });
  }

  async findAll(user: JwtPayload) {
    return this.prisma.reconciliation.findMany({
      where: { payment: { id_merchant: user.id_merchant } },
      include: {
        payment: {
          include: { transaction: true },
        },
        openedByUser: {
          select: { full_name: true },
        },
        resolvedByUser: {
          select: { full_name: true },
        },
      },
      orderBy: { created_at: 'desc' },
    });
  }

  async resolve(id: string, user: JwtPayload, resolveDto: ResolveReconciliationDto) {
    const reconciliation = await this.prisma.reconciliation.findUnique({
      where: { id_reconciliation: id },
      include: { payment: true },
    });

    if (!reconciliation) {
      throw new NotFoundException('Reconciliation record not found');
    }

    if (reconciliation.payment.id_merchant !== user.id_merchant) {
      throw new BadRequestException('Not authorized to resolve this record');
    }

    if (reconciliation.status !== 'OPEN') {
      throw new BadRequestException('Reconciliation is already resolved');
    }

    return this.prisma.reconciliation.update({
      where: { id_reconciliation: id },
      data: {
        resolution_note: resolveDto.resolution,
        status: resolveDto.status ?? 'RESOLVED_VALID',
        resolved_by: user.sub,
        resolved_at: new Date(),
      },
    });
  }
}

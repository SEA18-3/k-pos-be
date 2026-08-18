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
    });

    if (!transaction) {
      throw new NotFoundException('Transaction not found');
    }

    if (transaction.id_merchant !== user.id_merchant) {
      throw new BadRequestException('Transaction does not belong to your merchant');
    }

    const existing = await this.prisma.reconciliation.findUnique({
      where: { id_transaction: createDto.id_transaction },
    });

    if (existing) {
      throw new BadRequestException('Transaction is already under reconciliation');
    }

    return this.prisma.reconciliation.create({
      data: {
        id_transaction: createDto.id_transaction,
        id_merchant: user.id_merchant,
        reason: createDto.reason,
        evidence: createDto.evidence,
      },
    });
  }

  async findAll(user: JwtPayload) {
    return this.prisma.reconciliation.findMany({
      where: { id_merchant: user.id_merchant },
      include: {
        transaction: {
          include: { payment: true },
        },
        handledBy: {
          select: { full_name: true },
        },
      },
      orderBy: { created_at: 'desc' },
    });
  }

  async resolve(id: string, user: JwtPayload, resolveDto: ResolveReconciliationDto) {
    const reconciliation = await this.prisma.reconciliation.findUnique({
      where: { id_reconciliation: id },
    });

    if (!reconciliation) {
      throw new NotFoundException('Reconciliation record not found');
    }

    if (reconciliation.id_merchant !== user.id_merchant) {
      throw new BadRequestException('Not authorized to resolve this record');
    }

    if (reconciliation.resolution) {
      throw new BadRequestException('Reconciliation is already resolved');
    }

    return this.prisma.reconciliation.update({
      where: { id_reconciliation: id },
      data: {
        resolution: resolveDto.resolution,
        handled_by: user.sub,
        resolved_at: new Date(),
        // We could also append notes to reason or evidence if needed
      },
    });
  }
}

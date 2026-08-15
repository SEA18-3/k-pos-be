import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class MerchantsService {
  constructor(private readonly prisma: PrismaService) { }

  async getMyMerchant(id_merchant: string) {
    const merchant = await this.prisma.merchant.findUnique({
      where: { id_merchant },
      select: {
        id_merchant: true,
        name: true,
        address: true,
        phone: true,
        email: true,
        is_active: true,
        onboarded_at: true,
        created_at: true,
        updated_at: true,
      },
    });

    if (!merchant) {
      throw new NotFoundException('Merchant not found');
    }

    return { merchant };
  }
}

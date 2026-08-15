import { Test, TestingModule } from '@nestjs/testing';
import { MerchantsService } from './merchants.service';
import { PrismaService } from '../../prisma/prisma.service';
import { NotFoundException } from '@nestjs/common';

describe('MerchantsService', () => {
  let service: MerchantsService;
  let prisma: PrismaService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MerchantsService,
        {
          provide: PrismaService,
          useValue: {
            merchant: {
              findUnique: jest.fn(),
            },
          },
        },
      ],
    }).compile();

    service = module.get<MerchantsService>(MerchantsService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getMyMerchant', () => {
    it('should throw NotFoundException if merchant not found', async () => {
      (prisma.merchant.findUnique as jest.Mock).mockResolvedValue(null);
      await expect(service.getMyMerchant('invalid-id')).rejects.toThrow(NotFoundException);
    });

    it('should return merchant profile successfully', async () => {
      const mockMerchant = {
        id_merchant: 'm1',
        name: 'Toko Budi',
        is_active: true,
      };

      (prisma.merchant.findUnique as jest.Mock).mockResolvedValue(mockMerchant);

      const result = await service.getMyMerchant('m1');
      expect(result).toEqual({ merchant: mockMerchant });
      expect(prisma.merchant.findUnique).toHaveBeenCalledWith({
        where: { id_merchant: 'm1' },
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
    });
  });
});

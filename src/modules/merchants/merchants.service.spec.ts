import { Test, TestingModule } from '@nestjs/testing';
import { MerchantsService } from './merchants.service';
import { PrismaService } from '../../prisma/prisma.service';
import { NotFoundException } from '@nestjs/common';

describe('MerchantsService', () => {
  let service: MerchantsService;

  const mockPrisma = {
    merchant: {
      findUnique: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [MerchantsService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();

    service = module.get<MerchantsService>(MerchantsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getMyMerchant', () => {
    it('should return merchant', async () => {
      mockPrisma.merchant.findUnique.mockResolvedValue({ id_merchant: 'm1' });
      const res = await service.getMyMerchant('m1');
      expect(res).toEqual({ merchant: { id_merchant: 'm1' } });
    });

    it('should throw if not found', async () => {
      mockPrisma.merchant.findUnique.mockResolvedValue(null);
      await expect(service.getMyMerchant('m1')).rejects.toThrow(NotFoundException);
    });
  });
});

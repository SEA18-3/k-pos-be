import { Test, TestingModule } from '@nestjs/testing';
import { PaymentsService } from './payments.service';
import { PrismaService } from '../../prisma/prisma.service';
import { NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { JwtPayload } from '../../common/decorators/current-user.decorator';

const mockUser: JwtPayload = {
  sub: 'user-1',
  email: 'owner@test.com',
  role: 'OWNER',
  id_merchant: 'merchant-1',
};

const mockPayment = {
  id_payment: 'pay-1',
  id_merchant: 'merchant-1',
  id_transaction: 'trx-1',
  amount: 100000,
  method: 'CASH',
  status: 'VERIFIED',
  created_at: new Date(),
};

describe('PaymentsService', () => {
  let service: PaymentsService;
  let prisma: PrismaService;

  const mockPrisma = {
    payment: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
    },
    reconciliation: {
      findFirst: jest.fn(),
      create: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [PaymentsService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();

    service = module.get<PaymentsService>(PaymentsService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('findAll', () => {
    it('should return payments for the merchant', async () => {
      (prisma.payment.findMany as jest.Mock).mockResolvedValue([mockPayment]);
      const result = await service.findAll(mockUser);
      expect(prisma.payment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id_merchant: 'merchant-1' } }),
      );
      expect(result).toHaveLength(1);
    });

    it('should pass status filter when provided', async () => {
      (prisma.payment.findMany as jest.Mock).mockResolvedValue([]);
      await service.findAll(mockUser, 'FAILED');
      expect(prisma.payment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id_merchant: 'merchant-1', status: 'FAILED' } }),
      );
    });
  });

  describe('findOne', () => {
    it('should return payment by id', async () => {
      (prisma.payment.findUnique as jest.Mock).mockResolvedValue(mockPayment);
      const result = await service.findOne(mockUser, 'pay-1');
      expect(result).toEqual(mockPayment);
    });

    it('should throw NotFoundException if not found', async () => {
      (prisma.payment.findUnique as jest.Mock).mockResolvedValue(null);
      await expect(service.findOne(mockUser, 'bad-id')).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException if different merchant', async () => {
      (prisma.payment.findUnique as jest.Mock).mockResolvedValue({
        ...mockPayment,
        id_merchant: 'other-merchant',
      });
      await expect(service.findOne(mockUser, 'pay-1')).rejects.toThrow(ForbiddenException);
    });
  });

  describe('reconcile', () => {
    it('should create reconciliation case', async () => {
      (prisma.payment.findUnique as jest.Mock).mockResolvedValue(mockPayment);
      (prisma.reconciliation.findFirst as jest.Mock).mockResolvedValue(null);
      (prisma.reconciliation.create as jest.Mock).mockResolvedValue({
        id_reconciliation: 'rec-1',
        id_payment: 'pay-1',
        status: 'OPEN',
      });

      const result = await service.reconcile(mockUser, 'pay-1', {
        id_transaction: 'trx-1',
        reason: 'Payment mismatch',
        evidence: 'evidence.png',
      });

      expect(result.id_reconciliation).toBe('rec-1');
    });

    it('should throw NotFoundException for unknown payment', async () => {
      (prisma.payment.findUnique as jest.Mock).mockResolvedValue(null);
      await expect(
        service.reconcile(mockUser, 'bad-id', {
          id_transaction: 'trx-1',
          reason: 'test',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException if already has open case', async () => {
      (prisma.payment.findUnique as jest.Mock).mockResolvedValue(mockPayment);
      (prisma.reconciliation.findFirst as jest.Mock).mockResolvedValue({
        id_reconciliation: 'existing',
      });
      await expect(
        service.reconcile(mockUser, 'pay-1', {
          id_transaction: 'trx-1',
          reason: 'test',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });
});

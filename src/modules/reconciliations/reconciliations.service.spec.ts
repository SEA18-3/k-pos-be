import { Test, TestingModule } from '@nestjs/testing';
import { ReconciliationsService } from './reconciliations.service';
import { PrismaService } from '../../prisma/prisma.service';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { Role } from '../../common/enums/role.enum';

describe('ReconciliationsService', () => {
  let service: ReconciliationsService;
  let prisma: PrismaService;

  const mockUser = {
    sub: 'user-1',
    email: 'test@merchant.com',
    role: Role.OWNER,
    id_merchant: 'merchant-1',
  };

  const mockPrismaService = {
    transaction: {
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    payment: {
      update: jest.fn(),
      findUnique: jest.fn(),
    },
    reconciliation: {
      findFirst: jest.fn(),
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    $transaction: jest.fn((callback) => callback(mockPrismaService)),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ReconciliationsService, { provide: PrismaService, useValue: mockPrismaService }],
    }).compile();

    service = module.get<ReconciliationsService>(ReconciliationsService);
    prisma = module.get<PrismaService>(PrismaService);
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('should throw NotFoundException if transaction not found', async () => {
      mockPrismaService.transaction.findFirst.mockResolvedValue(null);
      await expect(service.create(mockUser, { id_transaction: '123' })).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw BadRequestException if merchant does not match', async () => {
      mockPrismaService.transaction.findFirst.mockResolvedValue({ id_merchant: 'other' });
      await expect(service.create(mockUser, { id_transaction: '123' })).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw BadRequestException if transaction has no payment', async () => {
      mockPrismaService.transaction.findFirst.mockResolvedValue({
        id_merchant: 'merchant-1',
        payment: null,
      });
      await expect(service.create(mockUser, { id_transaction: '123' })).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw BadRequestException if reconciliation already exists', async () => {
      mockPrismaService.transaction.findFirst.mockResolvedValue({
        id_merchant: 'merchant-1',
        payment: { id_payment: 'pay-1' },
      });
      mockPrismaService.reconciliation.findFirst.mockResolvedValue({ id_reconciliation: 'rec-1' });

      await expect(service.create(mockUser, { id_transaction: '123' })).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should successfully create reconciliation', async () => {
      mockPrismaService.transaction.findFirst.mockResolvedValue({
        id_merchant: 'merchant-1',
        payment: { id_payment: 'pay-1' },
      });
      mockPrismaService.reconciliation.findFirst.mockResolvedValue(null);
      mockPrismaService.reconciliation.create.mockResolvedValue({ id_reconciliation: 'rec-1' });

      const result = await service.create(mockUser, {
        id_transaction: '123',
        reason: 'test',
      });
      expect(result).toEqual({ id_reconciliation: 'rec-1' });
    });
  });

  describe('findAll', () => {
    it('should return all reconciliations for merchant', async () => {
      mockPrismaService.reconciliation.findMany.mockResolvedValue([{ id: 1 }]);
      const result = await service.findAll(mockUser);
      expect(result).toEqual([{ id: 1 }]);
    });
  });

  describe('resolve', () => {
    it('should throw NotFoundException if reconciliation not found', async () => {
      mockPrismaService.reconciliation.findUnique.mockResolvedValue(null);
      await expect(
        service.resolve('rec-1', mockUser, { status: 'RESOLVED_VALID' } as any),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException if merchant does not match', async () => {
      mockPrismaService.reconciliation.findUnique.mockResolvedValue({
        payment: { id_merchant: 'other' },
      });
      await expect(
        service.resolve('rec-1', mockUser, { status: 'RESOLVED_VALID' } as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if already resolved', async () => {
      mockPrismaService.reconciliation.findUnique.mockResolvedValue({
        status: 'RESOLVED_VALID',
        payment: { id_merchant: 'merchant-1' },
      });
      await expect(
        service.resolve('rec-1', mockUser, { status: 'RESOLVED_VALID' } as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('should resolve as VALID', async () => {
      mockPrismaService.reconciliation.findUnique.mockResolvedValue({
        status: 'OPEN',
        payment: { id_merchant: 'merchant-1' },
      });
      mockPrismaService.reconciliation.update.mockResolvedValue({ id: 'rec-1' });

      const result = await service.resolve('rec-1', mockUser, { status: 'RESOLVED_VALID' } as any);
      expect(result).toEqual({ id: 'rec-1' });
    });

    it('should resolve as INVALID and update transaction/payment', async () => {
      mockPrismaService.reconciliation.findUnique.mockResolvedValue({
        id_reconciliation: 'rec-1',
        id_payment: 'pay-1',
        status: 'OPEN',
        payment: {
          id_merchant: 'merchant-1',
          transaction: { id_transaction: 'tx-1', status: 'CONFIRMED' },
        },
      });
      mockPrismaService.reconciliation.update.mockResolvedValue({ id: 'rec-1' });

      await service.resolve('rec-1', mockUser, { status: 'RESOLVED_INVALID' } as any);
      expect(mockPrismaService.payment.update).toHaveBeenCalled();
    });
  });

  describe('getPaymentReconciliations', () => {
    it('should throw NotFoundException if payment not found', async () => {
      mockPrismaService.payment.findUnique.mockResolvedValue(null);
      await expect(service.getPaymentReconciliations(mockUser, 'pay-1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should return payment reconciliations', async () => {
      mockPrismaService.payment.findUnique.mockResolvedValue({
        id_transaction: 'tx-1',
        transaction: { id_merchant: 'merchant-1' },
      });
      mockPrismaService.reconciliation.findMany.mockResolvedValue([{ id: 1 }]);

      const result = await service.getPaymentReconciliations(mockUser, 'pay-1');
      expect(result.payment_id).toEqual('pay-1');
    });
  });
});

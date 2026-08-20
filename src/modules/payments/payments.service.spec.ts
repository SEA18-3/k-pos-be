import { Test, TestingModule } from '@nestjs/testing';
import { PaymentsService } from './payments.service';
import { PrismaService } from '../../prisma/prisma.service';
import { NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';

describe('PaymentsService', () => {
  let service: PaymentsService;

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

  const user = { id_merchant: 'm1', sub: 'u1' } as any;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [PaymentsService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();

    service = module.get<PaymentsService>(PaymentsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('findAll', () => {
    it('should return payments', async () => {
      mockPrisma.payment.findMany.mockResolvedValueOnce([{ id_payment: 'p1' }]);
      const res = await service.findAll(user, 'VERIFIED');
      expect(res).toEqual([{ id_payment: 'p1' }]);
    });
  });

  describe('findOne', () => {
    it('should throw if not found', async () => {
      mockPrisma.payment.findUnique.mockResolvedValueOnce(null);
      await expect(service.findOne(user, 'p1')).rejects.toThrow(NotFoundException);
    });

    it('should throw if different merchant', async () => {
      mockPrisma.payment.findUnique.mockResolvedValueOnce({ id_merchant: 'm2' });
      await expect(service.findOne(user, 'p1')).rejects.toThrow(ForbiddenException);
    });

    it('should return payment', async () => {
      mockPrisma.payment.findUnique.mockResolvedValueOnce({ id_merchant: 'm1', id_payment: 'p1' });
      const res = await service.findOne(user, 'p1');
      expect(res.id_payment).toBe('p1');
    });
  });

  describe('reconcile', () => {
    it('should throw if payment not found', async () => {
      mockPrisma.payment.findUnique.mockResolvedValueOnce(null);
      await expect(service.reconcile(user, 'p1', {} as any)).rejects.toThrow(NotFoundException);
    });

    it('should throw if different merchant', async () => {
      mockPrisma.payment.findUnique.mockResolvedValueOnce({ id_merchant: 'm2' });
      await expect(service.reconcile(user, 'p1', {} as any)).rejects.toThrow(ForbiddenException);
    });

    it('should throw if existing open reconciliation', async () => {
      mockPrisma.payment.findUnique.mockResolvedValueOnce({ id_merchant: 'm1' });
      mockPrisma.reconciliation.findFirst.mockResolvedValueOnce({ id_reconciliation: 'r1' });
      await expect(service.reconcile(user, 'p1', {} as any)).rejects.toThrow(BadRequestException);
    });

    it('should create reconciliation', async () => {
      mockPrisma.payment.findUnique.mockResolvedValueOnce({ id_merchant: 'm1' });
      mockPrisma.reconciliation.findFirst.mockResolvedValueOnce(null);
      mockPrisma.reconciliation.create.mockResolvedValueOnce({ id_reconciliation: 'r1' });

      const res = await service.reconcile(user, 'p1', { reason: 'r', evidence: 'e' } as any);
      expect(res.id_reconciliation).toBe('r1');
    });
  });
});

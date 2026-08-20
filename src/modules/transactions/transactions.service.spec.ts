import { Test, TestingModule } from '@nestjs/testing';
import { TransactionsService } from './transactions.service';
import { PrismaService } from '../../prisma/prisma.service';
import { NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { TransactionStatus, SyncStatus } from '../../../generated/prisma/client';
import type { JwtPayload } from '../../common/decorators/current-user.decorator';
import { CorrectTransactionDto } from './dto/correct-transaction.dto';

describe('TransactionsService', () => {
  let service: TransactionsService;
  let prisma: PrismaService;

  const mockUser: JwtPayload = {
    sub: 'user-id-1',
    id_merchant: 'merchant-id-1',
    role: 'OPERATOR',
    email: 'test@example.com',
  };

  const mockTransaction = {
    id_transaction: 'trx-1',
    id_merchant: 'merchant-id-1',
    id_user: 'user-id-1',
    id_device: 'device-1',
    status: TransactionStatus.PENDING,
    sync_status: SyncStatus.UNSYNCED,
    created_at: new Date(),
    details: [],
    payment: null,
  };

  const mockPrisma = {
    transaction: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      create: jest.fn(),
    },
    transactionCorrection: {
      findFirst: jest.fn(),
      create: jest.fn(),
    },
    payment: {
      create: jest.fn(),
    },
    detailTransaction: {
      createMany: jest.fn(),
    },
    inventory: {
      update: jest.fn(),
    },
    stockHistory: {
      create: jest.fn(),
    },
    inventoryMovement: {
      create: jest.fn(),
    },
    product: {
      update: jest.fn(),
    },
    $transaction: jest.fn((cb) => cb(mockPrisma)),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [TransactionsService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();

    service = module.get<TransactionsService>(TransactionsService);
    prisma = module.get<PrismaService>(PrismaService);
    jest.clearAllMocks();
  });

  describe('findAll', () => {
    it('should return transactions and next_cursor', async () => {
      mockPrisma.transaction.findMany.mockResolvedValue([
        { id_transaction: 'trx-1' },
        { id_transaction: 'trx-2' },
      ]);
      const result = await service.findAll(mockUser, { limit: 1 });
      expect(result.data).toHaveLength(1);
      expect(result.meta.next_cursor).toBe('trx-2');
    });

    it('should cover status, sync_status, id_device branches', async () => {
      mockPrisma.transaction.findMany.mockResolvedValue([]);
      await service.findAll(mockUser, {
        status: TransactionStatus.PENDING,
        sync_status: SyncStatus.UNSYNCED,
        id_device: 'dev-1',
      });
      expect(mockPrisma.transaction.findMany).toHaveBeenCalled();
    });

    it('should cover start_date and end_date branch', async () => {
      mockPrisma.transaction.findMany.mockResolvedValue([]);
      await service.findAll(mockUser, { start_date: '2023-01-01', end_date: '2023-12-31' });
      expect(mockPrisma.transaction.findMany).toHaveBeenCalled();
    });

    it('should cover start_date only branch', async () => {
      mockPrisma.transaction.findMany.mockResolvedValue([]);
      await service.findAll(mockUser, { start_date: '2023-01-01' });
      expect(mockPrisma.transaction.findMany).toHaveBeenCalled();
    });

    it('should cover end_date only branch', async () => {
      mockPrisma.transaction.findMany.mockResolvedValue([]);
      await service.findAll(mockUser, { end_date: '2023-12-31' });
      expect(mockPrisma.transaction.findMany).toHaveBeenCalled();
    });
  });

  describe('findOne', () => {
    it('should return transaction', async () => {
      mockPrisma.transaction.findFirst.mockResolvedValue(mockTransaction);
      const res = await service.findOne(mockUser, 'trx-1');
      expect(res.id_transaction).toBe('trx-1');
    });
    it('should throw if not found', async () => {
      mockPrisma.transaction.findFirst.mockResolvedValue(null);
      await expect(service.findOne(mockUser, 'trx-1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('voidTransaction', () => {
    it('should reject if not pending or conflict', async () => {
      mockPrisma.transaction.findUnique.mockResolvedValue({
        status: 'CONFIRMED',
        id_merchant: 'merchant-id-1',
      });
      await expect(service.voidTransaction(mockUser, 't1', {} as any)).rejects.toThrow();
    });

    it('should void if pending', async () => {
      jest.spyOn(service, 'findOne').mockResolvedValue({
        status: TransactionStatus.PENDING,
        details: [],
        id_merchant: 'merchant-id-1',
      } as any);
      mockPrisma.transaction.update.mockResolvedValue({});
      await service.voidTransaction(mockUser, 't1', { reason: 'test' });
      expect(mockPrisma.transaction.update).toHaveBeenCalled();
    });

    it('should void if conflict', async () => {
      jest.spyOn(service, 'findOne').mockResolvedValue({
        status: TransactionStatus.CONFLICT,
        details: [],
        id_merchant: 'merchant-id-1',
      } as any);
      await expect(service.voidTransaction(mockUser, 't1', { reason: 'test' })).rejects.toThrow();
    });
  });

  describe('resolveConflict', () => {
    it('should reject if not conflict', async () => {
      mockPrisma.transaction.findUnique.mockResolvedValue({
        status: 'PENDING',
        id_merchant: 'merchant-id-1',
      });
      await expect(service.resolveConflict(mockUser, 't1', {} as any)).rejects.toThrow();
    });

    it('should resolve conflict with CONFIRM', async () => {
      jest.spyOn(service, 'findOne').mockResolvedValue({
        status: TransactionStatus.CONFLICT,
        sync_status: 'SYNC_CONFLICT',
        sync_queue_id: 'q1',
        details: [],
        id_merchant: 'merchant-id-1',
      } as any);
      mockPrisma.syncQueue = {
        findUnique: jest.fn().mockResolvedValue({ status: 'FAILED' }),
        update: jest.fn(),
      } as any;
      mockPrisma.transaction.update.mockResolvedValue({});
      await service.resolveConflict(mockUser, 't1', { action: 'CONFIRM' });
      expect(mockPrisma.transaction.update).toHaveBeenCalled();
    });

    it('should resolve conflict with DISCARD', async () => {
      jest.spyOn(service, 'findOne').mockResolvedValue({
        status: TransactionStatus.CONFLICT,
        sync_status: 'SYNC_CONFLICT',
        sync_queue_id: 'q1',
        details: [],
        id_merchant: 'merchant-id-1',
      } as any);
      mockPrisma.syncQueue = {
        findUnique: jest.fn().mockResolvedValue({ status: 'FAILED' }),
        update: jest.fn(),
      } as any;
      mockPrisma.transaction.update.mockResolvedValue({});
      await service.resolveConflict(mockUser, 't1', { action: 'DISCARD' });
      expect(mockPrisma.transaction.update).toHaveBeenCalled();
    });

    it('should throw if already synced', async () => {
      jest
        .spyOn(service, 'findOne')
        .mockResolvedValue({ ...mockTransaction, sync_status: 'SYNCED' } as any);
      await expect(
        service.resolveConflict(mockUser, 'trx-1', { action: 'CONFIRM' } as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('should resolve with CONFIRM', async () => {
      jest.spyOn(service, 'findOne').mockResolvedValue({
        ...mockTransaction,
        sync_status: 'SYNC_CONFLICT',
        details: [],
      } as any);
      mockPrisma.transaction.update.mockResolvedValue({
        ...mockTransaction,
        sync_status: 'SYNCED',
      });
      const res = await service.resolveConflict(mockUser, 'trx-1', { action: 'CONFIRM' } as any);
      expect(res.data.sync_status).toBe('SYNCED');
    });
  });

  describe('correctTransaction', () => {
    it('should throw if not CONFIRMED', async () => {
      jest.spyOn(service, 'findOne').mockResolvedValue(mockTransaction as any);
      await expect(service.correctTransaction(mockUser, 'trx-1', {} as any)).rejects.toThrow(
        BadRequestException,
      );
    });
    it('should correct transaction', async () => {
      jest
        .spyOn(service, 'findOne')
        .mockResolvedValue({ ...mockTransaction, status: 'CONFIRMED', details: [] } as any);
      mockPrisma.transactionCorrection.findFirst.mockResolvedValue(null);
      mockPrisma.transaction.create.mockResolvedValue({ id_transaction: 'new-trx' });
      mockPrisma.transactionCorrection.create.mockResolvedValue({ id_correction: 'corr-1' });
      mockPrisma.transaction.update.mockResolvedValue({ status: 'VOIDED' });
      const dto: CorrectTransactionDto = {
        reason: 'test',
        items: [
          { id_product: 'p1', quantity: 1, unit_price: 10, subtotal: 10, product_name: 'test' },
        ],
        subtotal: 10,
        total: 10,
      };
      const res = await service.correctTransaction(mockUser, 'trx-1', dto);
      expect(res.data.id_correction).toBe('corr-1');
    });
  });

  describe('getTransactionHistory', () => {
    it('should return history', async () => {
      jest.spyOn(service, 'findOne').mockResolvedValue(mockTransaction as any);
      mockPrisma.transactionCorrection.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null);
      mockPrisma.transaction.findUnique.mockResolvedValue(mockTransaction);
      const res = await service.getTransactionHistory(mockUser, 'trx-1');
      expect(res.length).toBe(1);
    });
  });
});

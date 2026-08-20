import { Test, TestingModule } from '@nestjs/testing';
import { SyncService } from './sync.service';
import { PrismaService } from '../../prisma/prisma.service';
import { ConflictException } from '@nestjs/common';

describe('SyncService', () => {
  let service: SyncService;

  const mockPrisma = {
    transaction: {
      findMany: jest.fn(),
    },
    syncQueue: {
      findMany: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [SyncService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();

    service = module.get<SyncService>(SyncService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('validateBatch', () => {
    it('should pass if no existing mismatch', async () => {
      mockPrisma.transaction.findMany.mockResolvedValue([]);
      await expect(
        service.validateBatch('d1', {
          transactions: [{ offline_uuid: 'o1', items: [], payment: {} }],
        } as any),
      ).resolves.not.toThrow();
    });

    it('should throw on payload mismatch', async () => {
      mockPrisma.transaction.findMany.mockResolvedValue([
        { offline_uuid: 'o1', payload_hash: 'wrong_hash' },
      ]);
      await expect(
        service.validateBatch('d1', {
          transactions: [{ offline_uuid: 'o1', items: [], payment: {} }],
        } as any),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('getStatusByOfflineUuids', () => {
    it('should return correct statuses', async () => {
      mockPrisma.transaction.findMany.mockResolvedValue([
        { offline_uuid: 'o1', sync_status: 'SYNCED', id_transaction: 't1' },
      ]);
      mockPrisma.syncQueue.findMany.mockResolvedValue([
        { offline_uuid: 'o2', status: 'FAILED', last_error: 'err' },
      ]);

      const res = await service.getStatusByOfflineUuids(['o1', 'o2', 'o3']);

      expect(res.data).toEqual([
        { offline_uuid: 'o1', status: 'SYNCED', transaction_id: 't1', error: null },
        { offline_uuid: 'o2', status: 'FAILED', transaction_id: null, error: 'err' },
        { offline_uuid: 'o3', status: 'UNKNOWN', transaction_id: null, error: null },
      ]);
    });
  });

  describe('getFailedSyncQueues', () => {
    it('should return failed queues', async () => {
      mockPrisma.syncQueue.findMany.mockResolvedValue([{ id: 'q1' }]);
      const res = await service.getFailedSyncQueues({ id_merchant: 'm1' } as any);
      expect(res).toEqual([{ id: 'q1' }]);
    });
  });
});

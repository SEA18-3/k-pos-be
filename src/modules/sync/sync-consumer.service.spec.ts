import { Test, TestingModule } from '@nestjs/testing';
import { SyncConsumerService } from './sync-consumer.service';
import { SyncProducerService } from './sync-producer.service';
import { PrismaService } from '../../prisma/prisma.service';

jest.mock('amqp-connection-manager', () => ({
  connect: jest.fn().mockReturnValue({
    createChannel: jest.fn().mockReturnValue({
      assertQueue: jest.fn(),
      consume: jest.fn(),
      close: jest.fn(),
    }),
    close: jest.fn(),
  }),
}));

describe('SyncConsumerService', () => {
  let service: SyncConsumerService;
  let prisma: PrismaService;
  let syncProducer: SyncProducerService;

  const mockPrisma = {
    $transaction: jest.fn(async (cb) => {
      return await cb(mockPrisma);
    }),
    $queryRaw: jest.fn().mockResolvedValue([{ current_stock: 10, is_active: true }]),
    syncEvent: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    transaction: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn().mockResolvedValue({ id_transaction: 't1' }),
      update: jest.fn(),
    },
    payment: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    detailTransaction: {
      findMany: jest.fn(),
      createMany: jest.fn(),
    },
    product: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    inventory: {
      findUnique: jest.fn(),
      update: jest.fn(),
      findFirst: jest.fn().mockResolvedValue({ id_inventory: 'inv1' }),
    },
    inventoryMovement: {
      create: jest.fn(),
    },
    device: {
      findUnique: jest.fn(),
    },
    syncQueue: {
      create: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SyncConsumerService,
        { provide: PrismaService, useValue: mockPrisma },
        {
          provide: SyncProducerService,
          useValue: { updateEventStatus: jest.fn(), publishToRetry: jest.fn() },
        },
      ],
    }).compile();

    service = module.get<SyncConsumerService>(SyncConsumerService);
    prisma = module.get<PrismaService>(PrismaService);
    syncProducer = module.get<SyncProducerService>(SyncProducerService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('onModuleInit and onModuleDestroy', () => {
    it('should initialize and destroy without error', async () => {
      await expect(service.onModuleInit()).resolves.toBeUndefined();
      await expect(service.onModuleDestroy()).resolves.toBeUndefined();
    });
  });

  describe('handleSyncTransactionBatch', () => {
    it('should process message successfully (No Conflict)', async () => {
      mockPrisma.device.findUnique.mockResolvedValue({ id_merchant: 'm1', id_user: 'u1' });
      mockPrisma.transaction.findUnique.mockResolvedValue(null);
      mockPrisma.$queryRaw.mockResolvedValue([{ current_stock: 10, is_active: true }]);

      const tx = {
        id_device: 'd1',
        offline_uuid: 'uuid-1',
        subtotal: 100,
        total: 100,
        created_at_local: new Date(),
        items: [{ id_product: 'p1', quantity: 1, unit_price: 100, subtotal: 100 }],
        payment: { amount: 100, method: 'CASH', status: 'COMPLETED' },
      };

      const ack = jest.fn();
      await service.handleSyncTransactionBatch([tx as any], {
        getChannelRef: () => ({ ack }),
        getMessage: () => ({}),
      } as any);
      expect(ack).toHaveBeenCalled();
    });

    it('should process message successfully (Conflict: Out of Stock)', async () => {
      mockPrisma.device.findUnique.mockResolvedValue({ id_merchant: 'm1', id_user: 'u1' });
      mockPrisma.transaction.findUnique.mockResolvedValue(null);
      mockPrisma.$queryRaw.mockResolvedValue([{ current_stock: 0, is_active: true }]); // Conflict

      const tx = {
        id_device: 'd1',
        offline_uuid: 'uuid-2',
        subtotal: 100,
        total: 100,
        created_at_local: new Date(),
        items: [{ id_product: 'p1', quantity: 1, unit_price: 100, subtotal: 100 }],
        payment: { amount: 100, method: 'CASH', status: 'COMPLETED' },
      };

      const ack = jest.fn();
      await service.handleSyncTransactionBatch([tx as any], {
        getChannelRef: () => ({ ack }),
        getMessage: () => ({}),
      } as any);
      expect(ack).toHaveBeenCalled();
    });

    it('should fail Arithmetic validation', async () => {
      const tx = {
        id_device: 'd1',
        offline_uuid: 'uuid-3',
        subtotal: 50, // Mismatch
        total: 50,
        created_at_local: new Date(),
        items: [{ id_product: 'p1', quantity: 1, unit_price: 100, subtotal: 100 }],
        payment: { amount: 100, method: 'CASH', status: 'COMPLETED' },
      };

      const ack = jest.fn();
      await service.handleSyncTransactionBatch([tx as any], {
        getChannelRef: () => ({ ack }),
        getMessage: () => ({}),
      } as any);
      expect(ack).toHaveBeenCalled(); // batch still acks
    });

    it('should handle device not found (Constraint Violation)', async () => {
      mockPrisma.device.findUnique.mockResolvedValue(null);

      const tx = {
        id_device: 'd1',
        offline_uuid: 'uuid-4',
        subtotal: 100,
        total: 100,
        created_at_local: new Date(),
        items: [{ id_product: 'p1', quantity: 1, unit_price: 100, subtotal: 100 }],
        payment: { amount: 100, method: 'CASH', status: 'COMPLETED' },
      };
      const ack = jest.fn();
      await service.handleSyncTransactionBatch([tx as any], {
        getChannelRef: () => ({ ack }),
        getMessage: () => ({}),
      } as any);
      expect(ack).toHaveBeenCalled(); // batch still acks
    });
  });

  describe('handleDlqMessage', () => {
    it('should handle retry (attempt 1)', async () => {
      await service.handleDlqMessage([
        { id_device: 'd1', offline_uuid: 'uuid-dlq', items: [], _retryAttempt: 0 },
      ] as any);
      expect(syncProducer.publishToRetry).toHaveBeenCalledWith(
        [{ id_device: 'd1', offline_uuid: 'uuid-dlq', items: [], _retryAttempt: 1 }],
        1,
      );
    });

    it('should handle terminal failure (attempt > MAX_RETRIES) - New Queue', async () => {
      mockPrisma.syncQueue.findFirst.mockResolvedValue(null);
      await service.handleDlqMessage([
        { id_device: 'd1', offline_uuid: 'uuid-dlq', items: [], _retryAttempt: 3 },
      ] as any);
      expect(mockPrisma.syncQueue.create).toHaveBeenCalled();
    });

    it('should handle terminal failure (attempt > MAX_RETRIES) - Existing Queue', async () => {
      mockPrisma.syncQueue.findFirst.mockResolvedValue({ id: 'queue-1' });
      await service.handleDlqMessage([
        { id_device: 'd1', offline_uuid: 'uuid-dlq', items: [], _retryAttempt: 3 },
      ] as any);
      expect(mockPrisma.syncQueue.update).toHaveBeenCalled();
    });
  });
});

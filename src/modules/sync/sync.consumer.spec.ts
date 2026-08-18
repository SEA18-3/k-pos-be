/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { Test, TestingModule } from '@nestjs/testing';
import { SyncConsumerService } from './sync-consumer.service';
import { PrismaService } from '../../prisma/prisma.service';
import { SyncProducerService } from './sync-producer.service';
import { SyncTransactionDto } from './dto/sync-batch.dto';
import { RmqContext } from '@nestjs/microservices';
import { PaymentMethod } from '../../../generated/prisma/client';
import { Logger } from '@nestjs/common';

describe('SyncConsumerService', () => {
  let service: SyncConsumerService;
  let prismaService: PrismaService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SyncConsumerService,
        {
          provide: PrismaService,
          useValue: {
            transaction: {
              findUnique: jest.fn(),
            },
            $transaction: jest.fn(),
            syncQueue: {
              create: jest.fn(),
              upsert: jest.fn(),
              findFirst: jest.fn(),
              update: jest.fn(),
            },
          },
        },
        {
          provide: SyncProducerService,
          useValue: {
            publishToRetry: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<SyncConsumerService>(SyncConsumerService);
    prismaService = module.get<PrismaService>(PrismaService);

    // Silence logger during tests
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => jest.clearAllMocks());

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('handleSyncTransactionBatch', () => {
    const mockTransactionPayload: any = {
      offline_uuid: 'uuid-123',
      id_device: 'dev-1',
      created_at_local: '2023-01-01T10:00:00Z',
      subtotal: 100,
      total: 100,
      items: [
        {
          id_product: 'prod-1',
          quantity: 1,
          unit_price: 100,
          subtotal: 100,
          product_name: 'Test Product',
          sku_snapshot: 'SKU-001',
          catalog_version: '2023-01-01T00:00:00Z',
        },
      ],
      payment: {
        method: PaymentMethod.CASH,
        amount: 100,
      },
    };

    const mockChannel = {
      ack: jest.fn(),
      nack: jest.fn(),
    };

    const mockContext = {
      getChannelRef: () => mockChannel,
      getMessage: () => ({ content: Buffer.from('mock') }),
    } as unknown as RmqContext;

    beforeEach(() => {
      jest.clearAllMocks();
    });

    it('should acknowledge and skip if transaction already exists (Idempotency)', async () => {
      (prismaService.transaction.findUnique as jest.Mock).mockResolvedValue({
        id_transaction: 'trx-1',
      });

      await service.handleSyncTransactionBatch([mockTransactionPayload], mockContext);

      expect(prismaService.transaction.findUnique).toHaveBeenCalledWith({
        where: {
          id_device_offline_uuid: {
            id_device: mockTransactionPayload.id_device,
            offline_uuid: mockTransactionPayload.offline_uuid,
          },
        },
      });
      expect(prismaService.$transaction).not.toHaveBeenCalled();
      expect(mockChannel.ack).toHaveBeenCalled();
    });

    it('should process new transaction within a DB transaction and acknowledge', async () => {
      (prismaService.transaction.findUnique as jest.Mock).mockResolvedValue(null);
      (prismaService.$transaction as jest.Mock).mockResolvedValue(undefined);

      await service.handleSyncTransactionBatch([mockTransactionPayload], mockContext);

      expect(prismaService.$transaction).toHaveBeenCalled();
      expect(mockChannel.ack).toHaveBeenCalled();
    });

    it('should write to SyncQueue on processing failure', async () => {
      (prismaService.transaction.findUnique as jest.Mock).mockResolvedValue(null);
      (prismaService.$transaction as jest.Mock).mockRejectedValue(new Error('DB error'));
      (prismaService.syncQueue.create as jest.Mock).mockResolvedValue({});

      await service.handleSyncTransactionBatch([mockTransactionPayload], mockContext);

      expect(prismaService.syncQueue.create).toHaveBeenCalled();
      expect(mockChannel.ack).toHaveBeenCalled();
    });
  });

  describe('handleDlq', () => {
    const mockDlqPayload: any = {
      offline_uuid: 'uuid-dlq-1',
      id_device: 'dev-1',
      created_at_local: '2023-01-01T10:00:00Z',
      subtotal: 100,
      total: 100,
      items: [],
      payment: { method: PaymentMethod.CASH, amount: 100 },
      _retryAttempt: 3,
    };

    it('should mark transaction as terminal FAILED after max retries', async () => {
      (prismaService.syncQueue.findFirst as jest.Mock).mockResolvedValue(null);
      (prismaService.syncQueue.create as jest.Mock).mockResolvedValue({});

      await service.handleDlqMessage([mockDlqPayload]);

      expect(prismaService.syncQueue.create).toHaveBeenCalled();
    });
  });
});

import { Test, TestingModule } from '@nestjs/testing';
import { SyncConsumerService } from './sync-consumer.service';
import { PrismaService } from '../../prisma/prisma.service';
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
          },
        },
      ],
    }).compile();

    service = module.get<SyncConsumerService>(SyncConsumerService);
    prismaService = module.get<PrismaService>(PrismaService);

    // Silence logger during tests
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('handleSyncTransaction', () => {
    const mockTransactionPayload: SyncTransactionDto = {
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

      await service.handleSyncTransaction(mockTransactionPayload, mockContext);

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

      await service.handleSyncTransaction(mockTransactionPayload, mockContext);

      expect(prismaService.$transaction).toHaveBeenCalled();
      expect(mockChannel.ack).toHaveBeenCalled();
    });
  });
});

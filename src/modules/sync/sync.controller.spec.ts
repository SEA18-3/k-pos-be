import { Test, TestingModule } from '@nestjs/testing';
import { SyncController } from './sync.controller';
import { SyncProducerService } from './sync-producer.service';
import { SyncBatchDto } from './dto/sync-batch.dto';
import { PaymentMethod } from '../../../generated/prisma/client';

describe('SyncController', () => {
  let controller: SyncController;
  let producerService: SyncProducerService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [SyncController],
      providers: [
        {
          provide: SyncProducerService,
          useValue: {
            publishBatch: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<SyncController>(SyncController);
    producerService = module.get<SyncProducerService>(SyncProducerService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('syncTransactions', () => {
    it('should publish batch and return success message', async () => {
      const mockBatch: SyncBatchDto = {
        transactions: [
          {
            offline_uuid: 'uuid-1',
            id_device: 'device-1',
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
          },
        ],
      };

      const result = await controller.syncTransactions(mockBatch);

      expect(producerService.publishBatch).toHaveBeenCalledWith(mockBatch.transactions);
      expect(result.message).toBe('Batch diterima dan sedang diproses');
      expect(result.data.accepted).toBe(1);
      expect(result.data.queued_at).toBeDefined();
    });
  });
});

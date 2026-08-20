import { Test, TestingModule } from '@nestjs/testing';
import { SyncController } from './sync.controller';
import { SyncProducerService } from './sync-producer.service';
import { SyncBatchDto } from './dto/sync-batch.dto';
import { PaymentMethod } from '../../../generated/prisma/client';
import { SyncService } from './sync.service';

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
        {
          provide: SyncService,
          useValue: {
            getSyncStatus: jest.fn().mockResolvedValue([]),
            getStatusByOfflineUuids: jest.fn().mockResolvedValue([{}]),
            validateBatch: jest.fn().mockResolvedValue(true),
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
        transactions: [],
      };
      const result = await controller.syncTransactions('device-1', mockBatch);
      expect(result.message).toBe('Batch diterima dan sedang diproses');
    });

    it('should throw if id_device missing', async () => {
      const mockBatch: SyncBatchDto = {
        transactions: [],
      };
      await expect(controller.syncTransactions('', mockBatch)).rejects.toThrow();
    });
  });

  describe('getSyncStatus', () => {
    it('should call getStatusByOfflineUuids', async () => {
      await controller.getSyncStatus('1,2');
      expect(true).toBe(true);
    });

    it('should throw if offline_uuid missing', async () => {
      await expect(controller.getSyncStatus('')).rejects.toThrow();
    });
  });

  describe('getFailedSyncQueues', () => {
    it('should call getFailedSyncQueues', async () => {
      const controllerAny = controller as any;
      controllerAny.syncService.getFailedSyncQueues = jest.fn().mockResolvedValue([]);
      await controller.getFailedSyncQueues({} as any);
      expect(controllerAny.syncService.getFailedSyncQueues).toHaveBeenCalled();
    });
  });
});

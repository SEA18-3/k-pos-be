import { Test, TestingModule } from '@nestjs/testing';
import { SyncProducerService } from './sync-producer.service';
import * as amqp from 'amqp-connection-manager';

jest.mock('amqp-connection-manager');

describe('SyncProducerService', () => {
  let service: SyncProducerService;

  const mockChannelWrapper = {
    waitForConnect: jest.fn().mockResolvedValue(true),
    sendToQueue: jest.fn().mockResolvedValue(true),
    close: jest.fn().mockResolvedValue(true),
  };

  let setupFn: any;
  const mockConnection = {
    createChannel: jest.fn().mockImplementation((config) => {
      setupFn = config.setup;
      return mockChannelWrapper;
    }),
    close: jest.fn().mockResolvedValue(true),
    on: jest.fn((event, callback) => {
      if (event === 'connect') callback();
      if (event === 'disconnect') callback({ err: new Error('disconnect test') });
    }),
  };

  beforeEach(async () => {
    (amqp.connect as jest.Mock).mockReturnValue(mockConnection);

    const module: TestingModule = await Test.createTestingModule({
      providers: [SyncProducerService],
    }).compile();

    service = module.get<SyncProducerService>(SyncProducerService);
  });

  afterEach(async () => {
    await service.onModuleDestroy();
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should run setup channel correctly', async () => {
    await service.onModuleInit();
    const mockChannel = {
      assertExchange: jest.fn().mockResolvedValue(true),
      assertQueue: jest.fn().mockResolvedValue(true),
      bindQueue: jest.fn().mockResolvedValue(true),
    };
    if (setupFn) {
      await setupFn(mockChannel);
      expect(mockChannel.assertExchange).toHaveBeenCalled();
      expect(mockChannel.assertQueue).toHaveBeenCalled();
      expect(mockChannel.bindQueue).toHaveBeenCalled();
    }
  });

  describe('publishBatch', () => {
    it('should publish successfully', async () => {
      await service.onModuleInit();
      const txs: any[] = [{ id_transaction: 't1' }];
      await service.publishBatch(txs);
      expect(mockChannelWrapper.sendToQueue).toHaveBeenCalledWith(
        'sync.transactions',
        expect.anything(),
        expect.anything(),
      );
    });

    it('should throw on failure', async () => {
      await service.onModuleInit();
      mockChannelWrapper.sendToQueue.mockRejectedValueOnce(new Error('broker error'));
      await expect(service.publishBatch([])).rejects.toThrow();
    });
  });

  describe('publishToRetry', () => {
    it('should publish to retry queue 1', async () => {
      await service.onModuleInit();
      await service.publishToRetry([], 1);
      expect(mockChannelWrapper.sendToQueue).toHaveBeenCalledWith(
        'sync.retry.5s',
        expect.anything(),
        expect.anything(),
      );
    });

    it('should publish to retry queue 2', async () => {
      await service.onModuleInit();
      await service.publishToRetry([], 2);
      expect(mockChannelWrapper.sendToQueue).toHaveBeenCalledWith(
        'sync.retry.30s',
        expect.anything(),
        expect.anything(),
      );
    });

    it('should publish to retry queue 3', async () => {
      await service.onModuleInit();
      await service.publishToRetry([], 3);
      expect(mockChannelWrapper.sendToQueue).toHaveBeenCalledWith(
        'sync.retry.120s',
        expect.anything(),
        expect.anything(),
      );
    });

    it('should fallback to queue 3', async () => {
      await service.onModuleInit();
      await service.publishToRetry([], 4);
      expect(mockChannelWrapper.sendToQueue).toHaveBeenCalledWith(
        'sync.retry.120s',
        expect.anything(),
        expect.anything(),
      );
    });

    it('should handle error silently', async () => {
      await service.onModuleInit();
      mockChannelWrapper.sendToQueue.mockRejectedValueOnce(new Error('error'));
      await expect(service.publishToRetry([], 1)).resolves.not.toThrow();
    });
  });
});

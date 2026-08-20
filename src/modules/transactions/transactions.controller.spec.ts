import { Test, TestingModule } from '@nestjs/testing';
import { TransactionsController } from './transactions.controller';
import { TransactionsService } from './transactions.service';

describe('TransactionsController', () => {
  let controller: TransactionsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [TransactionsController],
      providers: [
        {
          provide: TransactionsService,
          useValue: {
            findAll: jest.fn().mockResolvedValue([]),
            findOne: jest.fn().mockResolvedValue({}),
            getTransactionHistory: jest.fn().mockResolvedValue([]),
            voidTransaction: jest.fn().mockResolvedValue({}),
            correctTransaction: jest.fn().mockResolvedValue({}),
            resolveConflict: jest.fn().mockResolvedValue({}),
          },
        },
      ],
    }).compile();

    controller = module.get<TransactionsController>(TransactionsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should call findAll', async () => {
    const res = await controller.findAll({} as any, {});
    expect(res).toBeDefined();
  });

  it('should call findOne', async () => {
    const res = await controller.findOne('t1', {} as any);
    expect(res).toBeDefined();
  });

  it('should call getTransactionHistory', async () => {
    const res = await controller.getTransactionHistory({} as any, 't1');
    expect(res).toBeDefined();
  });

  it('should call void', async () => {
    const res = await controller.voidTransaction('t1', {} as any, {} as any);
    expect(res).toBeDefined();
  });

  it('should call correct', async () => {
    const res = await controller.correctTransaction('t1', {} as any, {} as any);
    expect(res).toBeDefined();
  });

  it('should call resolveConflict', async () => {
    const res = await controller.resolveConflict('t1', {} as any, {} as any);
    expect(res).toBeDefined();
  });
});

import { Test, TestingModule } from '@nestjs/testing';
import { ReconciliationsController } from './reconciliations.controller';
import { ReconciliationsService } from './reconciliations.service';

describe('ReconciliationsController', () => {
  let controller: ReconciliationsController;

  const mockReconciliationsService = {
    create: jest.fn().mockResolvedValue({ id_reconciliation: 'r1' }),
    findAll: jest.fn().mockResolvedValue([{ id_reconciliation: 'r1' }]),
    resolve: jest.fn().mockResolvedValue({ id_reconciliation: 'r1' }),
    getPaymentReconciliations: jest.fn().mockResolvedValue([{ id_reconciliation: 'r1' }]),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ReconciliationsController],
      providers: [{ provide: ReconciliationsService, useValue: mockReconciliationsService }],
    }).compile();

    controller = module.get<ReconciliationsController>(ReconciliationsController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('create', () => {
    it('should call create on service', async () => {
      const dto = { id_payment: 'p1', reason: 'test', evidence_note: 'test' };
      const res = await controller.create({} as any, dto);
      expect(res).toEqual({ id_reconciliation: 'r1' });
      expect(mockReconciliationsService.create).toHaveBeenCalledWith({}, dto);
    });
  });

  describe('findAll', () => {
    it('should call findAll on service', async () => {
      const res = await controller.findAll({} as any);
      expect(res).toEqual([{ id_reconciliation: 'r1' }]);
      expect(mockReconciliationsService.findAll).toHaveBeenCalledWith({});
    });
  });

  describe('resolve', () => {
    it('should call resolve on service', async () => {
      const dto = { status: 'RESOLVED_VALID' as any };
      const res = await controller.resolve('r1', {} as any, dto);
      expect(res).toEqual({ id_reconciliation: 'r1' });
      expect(mockReconciliationsService.resolve).toHaveBeenCalledWith('r1', {}, dto);
    });
  });

  describe('getPaymentReconciliations', () => {
    it('should call getPaymentReconciliations on service', async () => {
      const res = await controller.getPaymentReconciliations('p1', {} as any);
      expect(res).toEqual([{ id_reconciliation: 'r1' }]);
      expect(mockReconciliationsService.getPaymentReconciliations).toHaveBeenCalledWith({}, 'p1');
    });
  });
});

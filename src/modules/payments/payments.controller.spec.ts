import { Test, TestingModule } from '@nestjs/testing';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';

describe('PaymentsController', () => {
  let controller: PaymentsController;

  const mockPaymentsService = {
    findAll: jest.fn().mockResolvedValue([{ id_payment: 'p1' }]),
    findOne: jest.fn().mockResolvedValue({ id_payment: 'p1' }),
    reconcile: jest.fn().mockResolvedValue({ id_reconciliation: 'r1' }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PaymentsController],
      providers: [{ provide: PaymentsService, useValue: mockPaymentsService }],
    }).compile();

    controller = module.get<PaymentsController>(PaymentsController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('findAll', () => {
    it('should call findAll on service', async () => {
      const res = await controller.findAll({} as any, 'VERIFIED');
      expect(res).toEqual([{ id_payment: 'p1' }]);
      expect(mockPaymentsService.findAll).toHaveBeenCalledWith({}, 'VERIFIED');
    });
  });

  describe('findOne', () => {
    it('should call findOne on service', async () => {
      const res = await controller.findOne({} as any, 'p1');
      expect(res).toEqual({ id_payment: 'p1' });
      expect(mockPaymentsService.findOne).toHaveBeenCalledWith({}, 'p1');
    });
  });

  describe('reconcile', () => {
    it('should call reconcile on service', async () => {
      const dto = { reason: 'r', evidence: 'e' };
      const res = await controller.reconcile({} as any, 'p1', dto);
      expect(res).toEqual({ id_reconciliation: 'r1' });
      expect(mockPaymentsService.reconcile).toHaveBeenCalledWith({}, 'p1', dto);
    });
  });
});

import { Test, TestingModule } from '@nestjs/testing';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { JwtPayload } from '../../common/decorators/current-user.decorator';

const mockUser: JwtPayload = {
  sub: 'user-1',
  email: 'owner@test.com',
  role: 'OWNER',
  id_merchant: 'merchant-1',
};

describe('PaymentsController', () => {
  let controller: PaymentsController;
  let service: PaymentsService;

  const mockService = {
    findAll: jest.fn(),
    findOne: jest.fn(),
    reconcile: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PaymentsController],
      providers: [{ provide: PaymentsService, useValue: mockService }],
    }).compile();

    controller = module.get<PaymentsController>(PaymentsController);
    service = module.get<PaymentsService>(PaymentsService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('findAll', () => {
    it('should call service.findAll and return results', async () => {
      const mockPayments = [{ id_payment: 'pay-1' }];
      (service.findAll as jest.Mock).mockResolvedValue(mockPayments);
      const result = await controller.findAll(mockUser, undefined);
      expect(service.findAll).toHaveBeenCalledWith(mockUser, undefined);
      expect(result).toEqual(mockPayments);
    });

    it('should pass status filter to service', async () => {
      (service.findAll as jest.Mock).mockResolvedValue([]);
      await controller.findAll(mockUser, 'FAILED');
      expect(service.findAll).toHaveBeenCalledWith(mockUser, 'FAILED');
    });
  });

  describe('findOne', () => {
    it('should call service.findOne', async () => {
      const mockPayment = { id_payment: 'pay-1' };
      (service.findOne as jest.Mock).mockResolvedValue(mockPayment);
      const result = await controller.findOne(mockUser, 'pay-1');
      expect(service.findOne).toHaveBeenCalledWith(mockUser, 'pay-1');
      expect(result).toEqual(mockPayment);
    });
  });

  describe('reconcile', () => {
    it('should call service.reconcile and return case', async () => {
      const mockCase = { id_reconciliation: 'rec-1', status: 'OPEN' };
      (service.reconcile as jest.Mock).mockResolvedValue(mockCase);
      const result = await controller.reconcile(mockUser, 'pay-1', {
        id_transaction: 'trx-1',
        reason: 'mismatch',
      });
      expect(service.reconcile).toHaveBeenCalledWith(mockUser, 'pay-1', {
        id_transaction: 'trx-1',
        reason: 'mismatch',
      });
      expect(result).toEqual(mockCase);
    });
  });
});

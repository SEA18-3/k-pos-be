import { Test, TestingModule } from '@nestjs/testing';
import { MerchantsController } from './merchants.controller';
import { MerchantsService } from './merchants.service';

describe('MerchantsController', () => {
  let controller: MerchantsController;

  const mockMerchantsService = {
    getMyMerchant: jest.fn().mockResolvedValue({ merchant: { id_merchant: 'm1' } }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [MerchantsController],
      providers: [{ provide: MerchantsService, useValue: mockMerchantsService }],
    }).compile();

    controller = module.get<MerchantsController>(MerchantsController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getMyMerchant', () => {
    it('should call getMyMerchant on service', async () => {
      const res = await controller.getMyMerchant({ user: { id_merchant: 'm1' } } as any);
      expect(res).toEqual({ merchant: { id_merchant: 'm1' } });
      expect(mockMerchantsService.getMyMerchant).toHaveBeenCalledWith('m1');
    });
  });
});

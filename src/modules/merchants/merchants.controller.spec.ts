import { Test, TestingModule } from '@nestjs/testing';
import { MerchantsController } from './merchants.controller';
import { MerchantsService } from './merchants.service';
import type { JwtPayload } from '../../common/decorators/current-user.decorator';

describe('MerchantsController', () => {
  let controller: MerchantsController;
  let service: MerchantsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [MerchantsController],
      providers: [
        {
          provide: MerchantsService,
          useValue: {
            getMyMerchant: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<MerchantsController>(MerchantsController);
    service = module.get<MerchantsService>(MerchantsService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getMyMerchant', () => {
    it('should call getMyMerchant from service', async () => {
      const user = { sub: 'u1', id_merchant: 'm1' } as unknown as JwtPayload;
      const mockResult = { merchant: { id_merchant: 'm1', name: 'Toko Budi' } };

      (service.getMyMerchant as jest.Mock).mockResolvedValue(mockResult);

      const result = await controller.getMyMerchant({ user });
      expect(service.getMyMerchant).toHaveBeenCalledWith('m1');
      expect(result).toEqual(mockResult);
    });
  });
});

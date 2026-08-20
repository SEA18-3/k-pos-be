import { Test, TestingModule } from '@nestjs/testing';
import { ProductsController } from './products.controller';
import { ProductsService } from './products.service';

describe('ProductsController', () => {
  let controller: ProductsController;
  let service: ProductsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ProductsController],
      providers: [
        {
          provide: ProductsService,
          useValue: {
            create: jest.fn().mockResolvedValue({ id: 'p1' }),
            findAll: jest.fn().mockResolvedValue([{ id: 'p1' }]),
            update: jest.fn().mockResolvedValue({ id: 'p1' }),
            remove: jest.fn().mockResolvedValue({ id: 'p1' }),
            adjustStock: jest.fn().mockResolvedValue({ id: 'p1' }),
            findOne: jest.fn().mockResolvedValue({ id: 'p1' }),
            importProducts: jest.fn().mockResolvedValue({ imported: 1 }),
            getStats: jest.fn().mockResolvedValue({ total: 1 }),
          },
        },
      ],
    }).compile();

    controller = module.get<ProductsController>(ProductsController);
    service = module.get<ProductsService>(ProductsService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should call create', async () => {
    const res = await controller.create({} as any, {} as any, undefined);
    expect(res).toBeDefined();
  });

  it('should call findAll', async () => {
    const res = await controller.findAll({} as any, {});
    expect(res).toBeDefined();
  });

  it('should call update', async () => {
    const res = await controller.update('p1', {} as any, {}, undefined);
    expect(res).toBeDefined();
  });

  it('should call remove', async () => {
    const res = await controller.remove('p1', {} as any);
    expect(res).toBeDefined();
  });

  it('should call adjustStock', async () => {
    const res = await controller.adjustStock('p1', {} as any, {} as any);
    expect(res).toBeDefined();
  });
});

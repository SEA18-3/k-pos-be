import { Test, TestingModule } from '@nestjs/testing';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import type { JwtPayload } from '../../common/decorators/current-user.decorator';
import { Role } from '../../common/enums/role.enum';

describe('UsersController', () => {
  let controller: UsersController;
  let service: UsersService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [
        {
          provide: UsersService,
          useValue: {
            create: jest.fn(),
            findAll: jest.fn(),
            updateStatus: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<UsersController>(UsersController);
    service = module.get<UsersService>(UsersService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('create', () => {
    it('should call create from service', async () => {
      const user = { sub: 'u1', id_merchant: 'm1' } as unknown as JwtPayload;
      const dto = { full_name: 'Test', email: 'test@toko.com', password: 'p', role: Role.OPERATOR };
      const mockResult = { id_user: 'u2' };

      (service.create as jest.Mock).mockResolvedValue(mockResult);

      const result = await controller.create({ user }, dto);
      expect(service.create).toHaveBeenCalledWith('m1', dto);
      expect(result).toEqual(mockResult);
    });
  });
});

import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

describe('AuthController', () => {
  let controller: AuthController;

  const mockAuthService = {
    register: jest.fn(),
    login: jest.fn(),
    getProfile: jest.fn(),
    refresh: jest.fn(),
    logout: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        {
          provide: AuthService,
          useValue: mockAuthService,
        },
      ],
    }).compile();

    controller = module.get<AuthController>(AuthController);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('refresh', () => {
    it('should pass the x-refresh-token header to the service', async () => {
      mockAuthService.refresh.mockResolvedValue({ access_token: 'new_token' });

      const result = await controller.refresh('some_refresh_token');

      expect(mockAuthService.refresh).toHaveBeenCalledWith('some_refresh_token');
      expect(result).toEqual({ access_token: 'new_token' });
    });

    it('should throw UnauthorizedException when header is missing', async () => {
      await expect(controller.refresh(undefined)).rejects.toThrow(UnauthorizedException);
      expect(mockAuthService.refresh).not.toHaveBeenCalled();
    });
  });

  describe('logout', () => {
    it('should pass the x-refresh-token header to the service', async () => {
      mockAuthService.logout.mockResolvedValue({ success: true });

      const result = await controller.logout('some_refresh_token');

      expect(mockAuthService.logout).toHaveBeenCalledWith('some_refresh_token');
      expect(result).toEqual({ success: true });
    });

    it('should throw UnauthorizedException when header is missing', async () => {
      await expect(controller.logout(undefined)).rejects.toThrow(UnauthorizedException);
      expect(mockAuthService.logout).not.toHaveBeenCalled();
    });
  });
});

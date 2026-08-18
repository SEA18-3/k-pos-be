/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unused-vars, @typescript-eslint/no-unsafe-argument */
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
    it('should refresh token via cookie', async () => {
      mockAuthService.refresh.mockResolvedValue({
        refresh_token: 'new_token',
        access_token: 'acc',
      });

      const req: any = { cookies: { refreshToken: 'some_refresh_token' } };
      const res: any = { cookie: jest.fn(), send: jest.fn() };

      const result = await controller.refresh(req, res);

      expect(mockAuthService.refresh).toHaveBeenCalledWith('some_refresh_token');
      expect(res.cookie).toHaveBeenCalled();
    });

    it('should throw UnauthorizedException when cookie is missing', async () => {
      const req: any = { cookies: {} };
      const res: any = { cookie: jest.fn() };
      await expect(controller.refresh(req, res)).rejects.toThrow(UnauthorizedException);
      expect(mockAuthService.refresh).not.toHaveBeenCalled();
    });
  });

  describe('logout', () => {
    it('should pass the refresh token to the service and clear cookie', async () => {
      mockAuthService.logout.mockResolvedValue({ success: true });

      const req: any = { cookies: { refreshToken: 'some_refresh_token' } };
      const res: any = { clearCookie: jest.fn(), send: jest.fn() };

      const result = await controller.logout(req, res);

      expect(mockAuthService.logout).toHaveBeenCalledWith('some_refresh_token');
      expect(res.clearCookie).toHaveBeenCalled();
    });

    it('should not throw if cookie is missing but just clear it', async () => {
      const req: any = { cookies: {} };
      const res: any = { clearCookie: jest.fn(), send: jest.fn() };
      await controller.logout(req, res);
      expect(mockAuthService.logout).not.toHaveBeenCalled();
      expect(res.clearCookie).toHaveBeenCalled();
    });
  });
});

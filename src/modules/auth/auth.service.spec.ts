import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { PrismaService } from '../../prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import { UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { Role } from '../../common/enums/role.enum';

// Mock bcrypt
jest.mock('bcrypt', () => ({
  hash: jest.fn().mockResolvedValue('hashed_password'),
  compare: jest.fn(),
}));

describe('AuthService', () => {
  let service: AuthService;
  let prisma: PrismaService;
  let jwtService: JwtService;

  const mockPrismaService = {
    $transaction: jest.fn(),
    user: {
      findUnique: jest.fn(),
      create: jest.fn(),
      findUniqueOrThrow: jest.fn(),
    },
    refreshToken: {
      create: jest.fn(),
      findUnique: jest.fn(),
      deleteMany: jest.fn(),
      delete: jest.fn(),
    },
  };

  const mockJwtService = {
    sign: jest.fn().mockReturnValue('mock_jwt_token'),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: JwtService, useValue: mockJwtService },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    prisma = module.get<PrismaService>(PrismaService);
    jwtService = module.get<JwtService>(JwtService);

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('register', () => {
    it('should throw ConflictException if email exists', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({ id_user: '1' });
      await expect(
        service.register({
          full_name: 'Test',
          email: 'test@toko.com',
          password: 'p',
          merchant_name: 'Toko Test',
        }),
      ).rejects.toThrow('Email already registered');
    });

    it('should successfully register user and merchant', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);
      (prisma.$transaction as jest.Mock).mockImplementation(
        (cb: (tx: unknown) => Promise<unknown>) => {
          const tx = {
            merchant: { create: jest.fn().mockResolvedValue({ id_merchant: 'm1' }) },
            user: { create: jest.fn().mockResolvedValue({ id_user: 'u1' }) },
          };
          return cb(tx);
        },
      );

      const result = await service.register({
        full_name: 'Test',
        email: 'test@toko.com',
        password: 'p',
        merchant_name: 'Toko Test',
      });

      expect(prisma.$transaction).toHaveBeenCalled();
      expect(result).toHaveProperty('user');
    });
  });

  describe('login', () => {
    it('should return tokens and user if valid', async () => {
      const mockUser = {
        id_user: '1',
        email: 'test@test.com',
        password: 'hashed_password',
        is_active: true,
        role: Role.OPERATOR,
        full_name: 'Test',
      };

      (prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      const result = await service.login({ email: 'test@test.com', password: 'password' });

      expect(result).toHaveProperty('access_token');
      expect(result).toHaveProperty('refresh_token');
      expect(result.user.email).toBe('test@test.com');
      expect(prisma.refreshToken.create).toHaveBeenCalled();
    });

    it('should throw UnauthorizedException if user not found', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(service.login({ email: 'x@test.com', password: 'p' })).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  describe('refresh', () => {
    it('should return new access token if refresh token is valid', async () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 1);

      (prisma.refreshToken.findUnique as jest.Mock).mockResolvedValue({
        token: 'valid_token',
        expires_at: futureDate,
        user: { id_user: '1', is_active: true },
      });

      const result = await service.refresh('valid_token');
      expect(result).toHaveProperty('access_token');
      expect(jwtService.sign).toHaveBeenCalled();
    });

    it('should throw UnauthorizedException if refresh token is expired', async () => {
      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - 1);

      (prisma.refreshToken.findUnique as jest.Mock).mockResolvedValue({
        token: 'expired_token',
        expires_at: pastDate,
        user: { id_user: '1', is_active: true },
      });

      await expect(service.refresh('expired_token')).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('logout', () => {
    it('should delete refresh token', async () => {
      await service.logout('some_token');
      expect(prisma.refreshToken.deleteMany).toHaveBeenCalledWith({
        where: { token: 'some_token' },
      });
    });
  });
});

import { Test, TestingModule } from '@nestjs/testing';
import { UsersService } from './users.service';
import { PrismaService } from '../../prisma/prisma.service';
import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Role } from '../../common/enums/role.enum';

jest.mock('bcrypt', () => ({
  hash: jest.fn().mockResolvedValue('hashed_password'),
}));

describe('UsersService', () => {
  let service: UsersService;
  let prisma: PrismaService;

  const mockPrisma = {
    user: {
      findUnique: jest.fn(),
      create: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [UsersService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();

    service = module.get<UsersService>(UsersService);
    prisma = module.get<PrismaService>(PrismaService);
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('should throw ConflictException if email exists', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ id_user: 'existing' });
      await expect(
        service.create('merchant-1', {
          email: 'test@a.com',
          password: 'p',
          full_name: 'A',
          role: Role.OPERATOR,
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('should successfully create user', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      mockPrisma.user.create.mockResolvedValue({ id_user: 'new-user' });

      const result = await service.create('merchant-1', {
        email: 'test@a.com',
        password: 'pass',
        full_name: 'Test User',
        role: Role.OPERATOR,
      });

      expect(result).toEqual({ id_user: 'new-user' });
      expect(mockPrisma.user.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ password: 'hashed_password', id_merchant: 'merchant-1' }),
        }),
      );
    });
  });

  describe('findAll', () => {
    it('should return users matching query', async () => {
      mockPrisma.user.findMany.mockResolvedValue([{ id_user: 'user-1' }]);
      const result = await service.findAll('merchant-1', { role: Role.OPERATOR, is_active: true });
      expect(result).toEqual({ items: [{ id_user: 'user-1' }] });
      expect(mockPrisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id_merchant: 'merchant-1', role: Role.OPERATOR, is_active: true },
        }),
      );
    });
  });

  describe('updateStatus', () => {
    it('should throw NotFoundException if user not found', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      await expect(service.updateStatus('u1', 'm1', { is_active: false })).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw ForbiddenException if merchant mismatch', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ id_merchant: 'other' });
      await expect(service.updateStatus('u1', 'm1', { is_active: false })).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should successfully update status', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ id_merchant: 'm1' });
      mockPrisma.user.update.mockResolvedValue({ id_user: 'u1' });

      const result = await service.updateStatus('u1', 'm1', { is_active: false });
      expect(result).toEqual({ id_user: 'u1' });
      expect(mockPrisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id_user: 'u1' },
          data: { is_active: false },
        }),
      );
    });
  });
});

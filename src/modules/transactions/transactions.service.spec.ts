/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */

import { Test, TestingModule } from '@nestjs/testing';
import { TransactionsService } from './transactions.service';
import { PrismaService } from '../../prisma/prisma.service';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { TransactionStatus } from '../../../generated/prisma/client';
import type { JwtPayload } from '../../common/decorators/current-user.decorator';

describe('TransactionsService', () => {
  let service: TransactionsService;
  let prisma: PrismaService;

  const mockUser: JwtPayload = {
    sub: 'user-id-1',
    id_merchant: 'merchant-id-1',
    role: 'OPERATOR',
    email: 'test@example.com',
  };

  const mockTransaction = {
    id_transaction: 'trx-1',
    id_merchant: 'merchant-id-1',
    id_user: 'user-id-1',
    id_device: 'device-1',
    status: TransactionStatus.PENDING,
    created_at: new Date(),
    details: [],
    payment: null,
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TransactionsService,
        {
          provide: PrismaService,
          useValue: {
            transaction: {
              findMany: jest.fn(),
              findUnique: jest.fn(),
              update: jest.fn(),
            },
          },
        },
      ],
    }).compile();

    service = module.get<TransactionsService>(TransactionsService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('findAll', () => {
    it('should return transactions with pagination meta', async () => {
      jest.spyOn(prisma.transaction, 'findMany').mockResolvedValue([mockTransaction as any]);

      const result = await service.findAll(mockUser, { limit: 10 });
      expect(prisma.transaction.findMany).toHaveBeenCalledWith({
        where: { id_merchant: mockUser.id_merchant },
        take: 11,
        cursor: undefined,
        orderBy: { created_at: 'desc' },
        include: { payment: true },
      });
      expect(result.data).toHaveLength(1);
      expect(result.meta.next_cursor).toBeNull();
    });
  });

  describe('findOne', () => {
    it('should return a transaction if found and belongs to merchant', async () => {
      jest.spyOn(prisma.transaction, 'findUnique').mockResolvedValue(mockTransaction as any);

      const result = await service.findOne(mockUser, 'trx-1');
      expect(result).toEqual(mockTransaction);
    });

    it('should throw NotFoundException if transaction not found', async () => {
      jest.spyOn(prisma.transaction, 'findUnique').mockResolvedValue(null);

      await expect(service.findOne(mockUser, 'trx-1')).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException if transaction belongs to different merchant', async () => {
      jest.spyOn(prisma.transaction, 'findUnique').mockResolvedValue({
        ...mockTransaction,
        id_merchant: 'different-merchant',
      } as any);

      await expect(service.findOne(mockUser, 'trx-1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('voidTransaction', () => {
    const voidDto = { void_reason: 'Customer left' };

    it('should successfully void a PENDING transaction', async () => {
      jest.spyOn(service, 'findOne').mockResolvedValue(mockTransaction as any);
      jest.spyOn(prisma.transaction, 'update').mockResolvedValue({
        ...mockTransaction,
        status: TransactionStatus.VOIDED,
      } as any);

      const result = await service.voidTransaction(mockUser, 'trx-1', voidDto);
      expect(result.data.status).toBe(TransactionStatus.VOIDED);
      expect(prisma.transaction.update).toHaveBeenCalledWith({
        where: { id_transaction: 'trx-1' },
        data: expect.objectContaining({
          status: TransactionStatus.VOIDED,
          void_reason: voidDto.void_reason,
          voided_by: mockUser.sub,
        }),
      });
    });

    it('should throw BadRequestException if transaction is already VOIDED', async () => {
      jest.spyOn(service, 'findOne').mockResolvedValue({
        ...mockTransaction,
        status: TransactionStatus.VOIDED,
      } as any);

      await expect(service.voidTransaction(mockUser, 'trx-1', voidDto)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw BadRequestException if transaction is CONFIRMED', async () => {
      jest.spyOn(service, 'findOne').mockResolvedValue({
        ...mockTransaction,
        status: TransactionStatus.CONFIRMED,
      } as any);

      await expect(service.voidTransaction(mockUser, 'trx-1', voidDto)).rejects.toThrow(
        BadRequestException,
      );
    });
  });
});

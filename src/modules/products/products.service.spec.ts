import { Test, TestingModule } from '@nestjs/testing';
import { ProductsService } from './products.service';
import { PrismaService } from '../../prisma/prisma.service';
import { SupabaseStorageService } from '../../storage/supabase-storage.service';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import type { JwtPayload } from '../../common/decorators/current-user.decorator';
import { Role } from '../../common/enums/role.enum';

describe('ProductsService', () => {
  let service: ProductsService;
  let prisma: PrismaService;

  const mockUser: JwtPayload = {
    sub: 'u1',
    email: 'test@test.com',
    role: Role.OWNER,
    id_merchant: 'm1',
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProductsService,
        {
          provide: PrismaService,
          useValue: {
            $transaction: jest.fn(),
            product: {
              findFirst: jest.fn(),
              findMany: jest.fn(),
              count: jest.fn(),
              update: jest.fn(),
            },
          },
        },
        {
          provide: SupabaseStorageService,
          useValue: {
            uploadProductImage: jest.fn(),
            deleteProductImage: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<ProductsService>(ProductsService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('adjustStock', () => {
    it('should throw NotFoundException if product not found', async () => {
      (prisma.product.findFirst as jest.Mock).mockResolvedValue(null);
      await expect(service.adjustStock(mockUser, 'p1', { quantity: 10 })).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw BadRequestException if stock goes below zero', async () => {
      (prisma.product.findFirst as jest.Mock).mockResolvedValue({
        id_product: 'p1',
        id_merchant: 'm1',
        inventory: { current_stock: 5, id_inventory: 'inv1' },
      });
      await expect(service.adjustStock(mockUser, 'p1', { quantity: -10 })).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should successfully adjust stock and return history', async () => {
      (prisma.product.findFirst as jest.Mock).mockResolvedValue({
        id_product: 'p1',
        id_merchant: 'm1',
        inventory: { current_stock: 5, id_inventory: 'inv1' },
      });

      (prisma.$transaction as jest.Mock).mockImplementation((cb: (tx: any) => Promise<any>) => {
        const tx = {
          inventory: {
            update: jest.fn().mockResolvedValue({ current_stock: 15 }),
            findUnique: jest.fn().mockResolvedValue({ current_stock: 15 }),
          },
          stockHistory: {
            create: jest.fn().mockResolvedValue({ id_stock: 'stk1' }),
            findFirst: jest.fn().mockResolvedValue({ id_stock: 'stk1' }),
          },
        };
        return cb(tx);
      });

      const result = await service.adjustStock(mockUser, 'p1', { quantity: 10 });
      expect(result.previous_stock).toBe(5);
      expect(result.current_stock).toBe(15);
      expect(result.stock_history).toBeDefined();
    });
  });
});

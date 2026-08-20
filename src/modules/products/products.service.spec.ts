import { Test, TestingModule } from '@nestjs/testing';
import { ProductsService } from './products.service';
import { PrismaService } from '../../prisma/prisma.service';
import { SupabaseStorageService } from '../../storage/supabase-storage.service';
import { NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { adjustInventoryAndHistory } from '../../common/utils/inventory.util';

jest.mock('../../common/utils/inventory.util');

describe('ProductsService', () => {
  let service: ProductsService;

  const mockPrisma = {
    $transaction: jest.fn(),
    product: {
      create: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    inventory: {
      findUnique: jest.fn(),
    },
    stockHistory: {
      findFirst: jest.fn(),
    },
  };

  const mockStorage = {
    uploadProductImage: jest.fn(),
    deleteProductImage: jest.fn(),
  };

  const user = { id_merchant: 'm1', sub: 'u1' } as any;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProductsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: SupabaseStorageService, useValue: mockStorage },
      ],
    }).compile();

    service = module.get<ProductsService>(ProductsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('should create product without image', async () => {
      const dto = { name: 'test', price: 100, sku: 'SKU1' };
      const product = { id_product: 'p1' };
      mockPrisma.$transaction.mockImplementation(async (cb) => {
        mockPrisma.product.create.mockResolvedValueOnce(product);
        return cb(mockPrisma);
      });

      const res = await service.create(user, dto);
      expect(res).toEqual(product);
    });

    it('should handle P2002 conflict on create', async () => {
      mockPrisma.$transaction.mockImplementation(async () => {
        throw { code: 'P2002' };
      });
      await expect(service.create(user, { name: 'test', price: 100 } as any)).rejects.toThrow(
        ConflictException,
      );
    });

    it('should rethrow unknown errors', async () => {
      mockPrisma.$transaction.mockImplementation(async () => {
        throw new Error('unknown');
      });
      await expect(service.create(user, { name: 'test', price: 100 } as any)).rejects.toThrow(
        'unknown',
      );
    });

    it('should create product with image', async () => {
      const product = { id_product: 'p1' };
      mockPrisma.$transaction.mockImplementation(async (cb) => {
        mockPrisma.product.create.mockResolvedValueOnce(product);
        return cb(mockPrisma);
      });
      mockStorage.uploadProductImage.mockResolvedValueOnce({ imageUrl: 'url' });
      mockPrisma.product.update.mockResolvedValueOnce({ ...product, image_url: 'url' });

      const res = await service.create(user, { name: 'test', price: 100 }, {
        buffer: Buffer.from(''),
      } as any);
      expect(res.image_url).toBe('url');
    });
  });

  describe('findAll', () => {
    it('should return items and meta', async () => {
      const items = [{ id_product: 'p1' }, { id_product: 'p2' }];
      mockPrisma.product.findMany.mockResolvedValueOnce(items);

      const res = await service.findAll(user, { limit: 1, search: 'test', is_active: true });
      expect(res.items.length).toBe(1);
      expect(res.meta.next_cursor).toBe('p2');
    });

    it('should handle cursor and no next_cursor', async () => {
      const items = [{ id_product: 'p1' }];
      mockPrisma.product.findMany.mockResolvedValueOnce(items);

      const res = await service.findAll(user, { limit: 2, cursor: 'c1' });
      expect(res.items.length).toBe(1);
      expect(res.meta.next_cursor).toBeNull();
    });
  });

  describe('update', () => {
    it('should throw if product not found', async () => {
      mockPrisma.product.findFirst.mockResolvedValueOnce(null);
      await expect(service.update(user, 'p1', {})).rejects.toThrow(NotFoundException);
    });

    it('should throw if price negative', async () => {
      mockPrisma.product.findFirst.mockResolvedValueOnce({ id_product: 'p1' });
      await expect(service.update(user, 'p1', { price: -10 })).rejects.toThrow(BadRequestException);
    });

    it('should update without image', async () => {
      mockPrisma.product.findFirst.mockResolvedValueOnce({ id_product: 'p1' });
      mockPrisma.product.update.mockResolvedValueOnce({ id_product: 'p1', price: 100 });
      const res = await service.update(user, 'p1', { price: 100 });
      expect(res.price).toBe(100);
    });

    it('should update with image and delete old image', async () => {
      mockPrisma.product.findFirst.mockResolvedValueOnce({ id_product: 'p1', image_url: 'old' });
      mockStorage.uploadProductImage.mockResolvedValueOnce({ imageUrl: 'new' });
      mockPrisma.product.update.mockResolvedValueOnce({ id_product: 'p1', image_url: 'new' });

      await service.update(user, 'p1', {}, { buffer: Buffer.from('') } as any);
      expect(mockStorage.deleteProductImage).toHaveBeenCalledWith('old');
    });

    it('should handle P2002 conflict on update', async () => {
      mockPrisma.product.findFirst.mockResolvedValueOnce({ id_product: 'p1' });
      mockPrisma.product.update.mockRejectedValueOnce({ code: 'P2002' });
      await expect(service.update(user, 'p1', {})).rejects.toThrow(ConflictException);
    });

    it('should rethrow unknown errors on update', async () => {
      mockPrisma.product.findFirst.mockResolvedValueOnce({ id_product: 'p1' });
      mockPrisma.product.update.mockRejectedValueOnce(new Error('unknown'));
      await expect(service.update(user, 'p1', {})).rejects.toThrow('unknown');
    });
  });

  describe('remove', () => {
    it('should throw if product not found', async () => {
      mockPrisma.product.findFirst.mockResolvedValueOnce(null);
      await expect(service.remove(user, 'p1')).rejects.toThrow(NotFoundException);
    });

    it('should soft delete product', async () => {
      mockPrisma.product.findFirst.mockResolvedValueOnce({ id_product: 'p1' });
      mockPrisma.product.update.mockResolvedValueOnce({ id_product: 'p1', is_active: false });

      const res = await service.remove(user, 'p1');
      expect(res.is_active).toBe(false);
    });
  });

  describe('adjustStock', () => {
    it('should throw if product not found', async () => {
      mockPrisma.product.findFirst.mockResolvedValueOnce(null);
      await expect(service.adjustStock(user, 'p1', { quantity: 10 } as any)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw if new stock negative', async () => {
      mockPrisma.product.findFirst.mockResolvedValueOnce({ inventory: { current_stock: 5 } });
      await expect(service.adjustStock(user, 'p1', { quantity: -10 } as any)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should adjust stock correctly', async () => {
      mockPrisma.product.findFirst.mockResolvedValueOnce({
        id_product: 'p1',
        inventory: { current_stock: 5, id_inventory: 'i1' },
      });

      mockPrisma.$transaction.mockImplementation(async (cb) => {
        mockPrisma.inventory.findUnique.mockResolvedValueOnce({ current_stock: 15 });
        mockPrisma.stockHistory.findFirst.mockResolvedValueOnce({ id_stock_history: 'h1' });
        return cb(mockPrisma);
      });

      const res = await service.adjustStock(user, 'p1', { quantity: 10 });
      expect(res.previous_stock).toBe(5);
      expect(res.current_stock).toBe(15);
      expect(adjustInventoryAndHistory).toHaveBeenCalled();
    });
  });
});

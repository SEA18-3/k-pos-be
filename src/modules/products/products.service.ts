/* eslint-disable @typescript-eslint/no-unsafe-member-access */

import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { CreateProductDto, UpdateProductDto } from './dto/create-product.dto';
import { QueryProductsDto } from './dto/query-products.dto';
import { AdjustStockDto } from './dto/adjust-stock.dto';
import { PrismaService } from '../../prisma/prisma.service';
import { SupabaseStorageService } from '../../storage/supabase-storage.service';
import { MulterFile } from '../../common/types/multer-file';
import type { JwtPayload } from '../../common/decorators/current-user.decorator';

@Injectable()
export class ProductsService {
  constructor(
    private prisma: PrismaService,
    private readonly storage: SupabaseStorageService,
  ) {}

  async create(user: JwtPayload, dto: CreateProductDto, file?: MulterFile) {
    const generatedSku = dto.sku ?? `SKU-${Date.now()}`;

    // Create product and inventory atomically
    let product;
    try {
      product = await this.prisma.$transaction(async (tx) => {
        const newProduct = await tx.product.create({
          data: {
            id_merchant: user.id_merchant,
            name: dto.name,
            sku: generatedSku,
            price: dto.price,
            is_active: dto.is_active ?? true,
            inventory: {
              create: {
                id_merchant: user.id_merchant,
                current_stock: 0,
                reserved: 0,
              },
            },
          },
          include: {
            inventory: true,
          },
        });
        return newProduct;
      });
    } catch (error: any) {
      if (error.code === 'P2002') {
        throw new ConflictException(`Product with SKU '${generatedSku}' already exists.`);
      }
      throw error;
    }

    if (file) {
      const { imageUrl } = await this.storage.uploadProductImage(
        user.id_merchant,
        product.id_product,
        file,
      );

      return this.prisma.product.update({
        where: { id_product: product.id_product },
        data: { image_url: imageUrl },
        include: { inventory: true },
      });
    }

    return product;
  }

  async findAll(user: JwtPayload, query: QueryProductsDto) {
    const { search, cursor, limit = 50, is_active } = query;

    const where = {
      id_merchant: user.id_merchant,
      ...(is_active !== undefined ? { is_active } : {}),
      ...(search?.trim()
        ? {
            OR: [
              { name: { contains: search.trim(), mode: 'insensitive' as const } },
              { sku: { contains: search.trim(), mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };

    const items = await this.prisma.product.findMany({
      where,
      take: limit + 1, // Ambil 1 lebih banyak untuk mengecek apakah ada halaman selanjutnya (next_cursor)
      ...(cursor ? { cursor: { id_product: cursor }, skip: 1 } : {}),
      include: {
        inventory: true,
      },
      orderBy: {
        created_at: 'desc', // Tetap bisa desc, asalkan field unik (id_product) juga ada di orderBy jika butuh, tapi default createdAt biasanya cukup aman jika unik atau id_product ditambahkan
      },
    });

    let next_cursor: string | null = null;
    if (items.length > limit) {
      const nextItem = items.pop(); // Hapus item ekstra
      next_cursor = nextItem!.id_product;
    }

    return {
      items,
      meta: {
        next_cursor,
        limit,
      },
    };
  }

  async update(user: JwtPayload, productId: string, dto: UpdateProductDto, file?: MulterFile) {
    const product = await this.prisma.product.findFirst({
      where: {
        id_product: productId,
        id_merchant: user.id_merchant,
      },
    });

    if (!product) {
      throw new NotFoundException('Product not found or does not belong to your store.');
    }

    if (dto.price !== undefined && dto.price < 0) {
      throw new BadRequestException('Price must not be negative.');
    }

    let imageUrl: string | undefined;

    if (file) {
      const result = await this.storage.uploadProductImage(
        product.id_merchant,
        product.id_product,
        file,
      );
      imageUrl = result.imageUrl;

      if (product.image_url && product.image_url !== imageUrl) {
        await this.storage.deleteProductImage(product.image_url);
      }
    }

    try {
      const updatedProduct = await this.prisma.product.update({
        where: { id_product: productId },
        data: {
          ...(dto.name !== undefined && { name: dto.name }),
          ...(dto.sku !== undefined && { sku: dto.sku }),
          ...(dto.price !== undefined && { price: dto.price }),
          ...(dto.is_active !== undefined && { is_active: dto.is_active }),
          ...(imageUrl !== undefined && { image_url: imageUrl }),
        },
      });
      return updatedProduct;
    } catch (error: any) {
      if (error.code === 'P2002') {
        throw new ConflictException(`Product with SKU '${dto.sku}' already exists.`);
      }
      throw error;
    }
  }

  async remove(user: JwtPayload, productId: string) {
    const product = await this.prisma.product.findFirst({
      where: {
        id_product: productId,
        id_merchant: user.id_merchant,
      },
    });

    if (!product) {
      throw new NotFoundException('Product not found or does not belong to your store.');
    }

    return this.prisma.product.update({
      where: { id_product: productId },
      data: { is_active: false },
    });
  }

  async adjustStock(user: JwtPayload, productId: string, dto: AdjustStockDto) {
    const product = await this.prisma.product.findFirst({
      where: {
        id_product: productId,
        id_merchant: user.id_merchant,
      },
      include: {
        inventory: true,
      },
    });

    if (!product || !product.inventory) {
      throw new NotFoundException('Product or inventory not found.');
    }

    const inv = product.inventory;
    const previousStock = inv.current_stock;
    const newStock = previousStock + dto.quantity;

    if (newStock < 0) {
      throw new BadRequestException(
        `Insufficient stock. Current stock is ${previousStock}, cannot subtract ${Math.abs(dto.quantity)}`,
      );
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const updatedInventory = await tx.inventory.update({
        where: { id_inventory: inv.id_inventory },
        data: {
          current_stock: newStock,
        },
      });

      const stockHistory = await tx.stockHistory.create({
        data: {
          id_product: product.id_product,
          id_merchant: user.id_merchant,
          id_user: user.sub,
          movement_type: 'ADJUSTMENT',
          quantity: dto.quantity,
          notes: dto.notes,
        },
      });

      return { updatedInventory, stockHistory };
    });

    return {
      id_product: product.id_product,
      previous_stock: previousStock,
      current_stock: result.updatedInventory.current_stock,
      stock_history: result.stockHistory,
    };
  }
}

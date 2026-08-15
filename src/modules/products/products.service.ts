import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { CreateProductDto, UpdateProductDto } from './dto/create-product.dto';
import { PrismaService } from '../../prisma/prisma.service';
import { SupabaseStorageService } from '../../storage/supabase-storage.service';
import { MulterFile } from 'src/common/types/multer-file';
import type { JwtPayload } from 'src/common/decorators/current-user.decorator';

@Injectable()
export class ProductsService {
  constructor(
    private prisma: PrismaService,
    private readonly storage: SupabaseStorageService,
  ) {}

  async create(user: JwtPayload, dto: CreateProductDto, file?: MulterFile) {
    const generatedSku = dto.sku ?? `SKU-${Date.now()}`;
    const product = await this.prisma.product.create({
      data: {
        id_merchant: user.id_merchant,
        name: dto.name,
        sku: generatedSku,
        price: dto.price,
      },
    });

    if (file) {
      const { imageUrl } = await this.storage.uploadProductImage(
        user.id_merchant,
        product.id_product,
        file,
      );

      return this.prisma.product.update({
        where: { id_product: product.id_product },
        data: { image_url: imageUrl },
      });
    }

    return product;
  }

  findAll(search?: string) {
    return this.prisma.product.findMany({
      where: {
        ...(search?.trim()
          ? {
              OR: [{ name: { contains: search.trim(), mode: 'insensitive' } }],
            }
          : {}),
      },
    });
  }

  async update(productId: string, dto: UpdateProductDto, file?: MulterFile) {
    const product = await this.prisma.product.findFirst({
      where: { id_product: productId },
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

    const updatedProduct = await this.prisma.product.update({
      where: { id_product: productId },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.sku !== undefined && { sku: dto.sku }),
        ...(dto.price !== undefined && { price: dto.price }),
        ...(imageUrl !== undefined && { image_url: imageUrl }),
      },
    });

    return updatedProduct;
  }

  async remove(productId: string) {
    const product = await this.prisma.product.findUnique({
      where: { id_product: productId },
    });

    if (product?.image_url) {
      await this.storage.deleteProductImage(product.image_url);
    }

    return this.prisma.product.update({
      where: { id_product: productId },
      data: { is_active: false },
    });
  }
}

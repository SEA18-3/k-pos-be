import {
  Controller,
  Query,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiConsumes, ApiOperation, ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { ProductsService } from './products.service';
import { CreateProductDto, UpdateProductDto } from './dto/create-product.dto';
import { QueryProductsDto } from './dto/query-products.dto';
import { AdjustStockDto } from './dto/adjust-stock.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/enums/role.enum';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { MulterFile } from '../../common/types/multer-file';
import type { JwtPayload } from '../../common/decorators/current-user.decorator';

@ApiTags('Products')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Roles(Role.ENTRY)
  @Post()
  @ApiOperation({ summary: 'Menambahkan produk baru (ENTRY)' })
  @UseInterceptors(
    FileInterceptor('image', {
      limits: { fileSize: 5 * 1024 * 1024 },
      fileFilter: (req, file, cb) => {
        if (['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)) {
          cb(null, true);
        } else {
          cb(
            new BadRequestException(
              'Invalid file type. Accepted types: image/jpeg, image/png, image/webp',
            ),
            false,
          );
        }
      },
    }),
  )
  @ApiConsumes('multipart/form-data')
  create(
    @CurrentUser() user: JwtPayload,
    @Body() createProductDto: CreateProductDto,
    @UploadedFile() file: MulterFile,
  ) {
    return this.productsService.create(user, createProductDto, file);
  }

  @Roles(Role.OWNER, Role.ENTRY, Role.OPERATOR)
  @Get()
  @ApiOperation({ summary: 'Mendapatkan daftar produk beserta stok terkini (Semua Role)' })
  findAll(@CurrentUser() user: JwtPayload, @Query() query: QueryProductsDto) {
    return this.productsService.findAll(user, query);
  }

  @Roles(Role.ENTRY)
  @Patch(':id')
  @ApiOperation({ summary: 'Update detail produk (ENTRY)' })
  @UseInterceptors(
    FileInterceptor('image', {
      limits: { fileSize: 5 * 1024 * 1024 },
      fileFilter: (req, file, cb) => {
        if (['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)) {
          cb(null, true);
        } else {
          cb(
            new BadRequestException(
              'Invalid file type. Accepted types: image/jpeg, image/png, image/webp',
            ),
            false,
          );
        }
      },
    }),
  )
  @ApiConsumes('multipart/form-data')
  update(
    @CurrentUser() user: JwtPayload,
    @Param('id') productId: string,
    @Body() updateProductDto: UpdateProductDto,
    @UploadedFile() file?: MulterFile,
  ) {
    return this.productsService.update(user, productId, updateProductDto, file);
  }

  @Roles(Role.ENTRY)
  @Delete(':id')
  @ApiOperation({ summary: 'Soft delete produk (ENTRY)' })
  remove(@CurrentUser() user: JwtPayload, @Param('id') productId: string) {
    return this.productsService.remove(user, productId);
  }

  @Roles(Role.ENTRY)
  @Post(':id/archive')
  archive(@CurrentUser() user: JwtPayload, @Param('id') productId: string) {
    return this.productsService.archive(user, productId);
  }

  @Roles(Role.ENTRY)
  @Post(':id/restore')
  restore(@CurrentUser() user: JwtPayload, @Param('id') productId: string) {
    return this.productsService.restore(user, productId);
  }

  @Roles(Role.ENTRY)
  @Post(':id/stock')
  @ApiOperation({ summary: 'Penyesuaian stok manual / Opname (ENTRY)' })
  adjustStock(
    @CurrentUser() user: JwtPayload,
    @Param('id') productId: string,
    @Body() adjustStockDto: AdjustStockDto,
  ) {
    return this.productsService.adjustStock(user, productId, adjustStockDto);
  }

  @Roles(Role.ENTRY)
  @Post(':id/stock-adjustments')
  adjustStockCanonical(
    @CurrentUser() user: JwtPayload,
    @Param('id') productId: string,
    @Body() dto: AdjustStockDto,
  ) {
    return this.productsService.adjustStock(user, productId, dto);
  }

  @Roles(Role.OWNER, Role.ENTRY)
  @Get(':id/stock-history')
  stockHistory(@CurrentUser() user: JwtPayload, @Param('id') productId: string) {
    return this.productsService.stockHistory(user, productId);
  }
}

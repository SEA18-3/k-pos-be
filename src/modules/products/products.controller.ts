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
import { ApiConsumes } from '@nestjs/swagger';
import { ProductsService } from './products.service';
import { CreateProductDto, UpdateProductDto } from './dto/create-product.dto';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import type { MulterFile } from 'src/common/types/multer-file';
import type { JwtPayload } from 'src/common/decorators/current-user.decorator';

@Controller('products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @UseGuards(JwtAuthGuard)
  @Post()
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

  @UseGuards(JwtAuthGuard)
  @Get()
  findAll(@CurrentUser() user: JwtPayload, @Query('search') search?: string) {
    return this.productsService.findAll(user, search);
  }

  @Patch(':id')
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

  @Delete(':id')
  remove(@CurrentUser() user: JwtPayload, @Param('id') productId: string) {
    return this.productsService.remove(user, productId);
  }
}

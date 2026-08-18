import { IsString, IsNotEmpty, IsOptional, IsInt, IsBoolean, Min } from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';

export class CreateProductDto {
  @ApiProperty({ description: 'Nama produk', example: 'Mie Goreng' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiPropertyOptional({ description: 'SKU produk', example: 'MG-001' })
  @IsString()
  @IsOptional()
  sku?: string;

  @ApiProperty({ description: 'Harga produk', example: 15000 })
  @IsInt()
  @Min(0)
  @Type(() => Number)
  price: number;

  @ApiPropertyOptional({ description: 'Status aktif', type: Boolean, example: true })
  @IsBoolean()
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => {
    if (value === 'true') return true;
    if (value === 'false') return false;
    return value;
  })
  is_active?: boolean;

  @ApiPropertyOptional({
    type: 'string',
    format: 'binary',
    description: 'Gambar produk (opsional, maks 5MB)',
  })
  @IsOptional()
  image?: any;
}

export class UpdateProductDto extends PartialType(CreateProductDto) {}

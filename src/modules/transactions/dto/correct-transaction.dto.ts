import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsNotEmpty,
  IsInt,
  IsOptional,
  IsPositive,
  IsString,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class CorrectItemDto {
  @ApiProperty({ example: 'clxxxxx', description: 'ID produk' })
  @IsString()
  @IsNotEmpty()
  id_product: string;

  @ApiProperty({ example: 2, description: 'Jumlah unit produk' })
  @IsInt()
  @IsPositive()
  quantity: number;

  @ApiProperty({ example: 15000, description: 'Harga per unit (dalam rupiah)' })
  @IsInt()
  @IsPositive()
  unit_price: number;

  @ApiProperty({ example: 30000, description: 'Subtotal baris ini (quantity * unit_price)' })
  @IsInt()
  @IsPositive()
  subtotal: number;
}

export class CorrectTransactionDto {
  @ApiProperty({
    description: 'Alasan koreksi yang wajib diisi untuk audit trail',
    example: 'Kasir salah input kuantitas produk A',
    minLength: 10,
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(10, { message: 'reason must be at least 10 characters for audit trail' })
  reason: string;

  @ApiProperty({
    type: [CorrectItemDto],
    description: 'Daftar item yang benar (akan menggantikan item lama)',
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CorrectItemDto)
  items: CorrectItemDto[];

  @ApiProperty({ example: 45000, description: 'Subtotal transaksi koreksi' })
  @IsInt()
  @IsPositive()
  subtotal: number;

  @ApiProperty({ example: 45000, description: 'Total transaksi koreksi' })
  @IsInt()
  @IsPositive()
  total: number;

  @ApiPropertyOptional({ example: 'Transfer BCA', description: 'Catatan tambahan koreksi' })
  @IsOptional()
  @IsString()
  notes?: string;
}

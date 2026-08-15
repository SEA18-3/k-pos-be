import { IsNotEmpty, IsNumber, IsOptional, IsString } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class AdjustStockDto {
  @ApiProperty({
    description: 'Quantity to adjust (positive for addition, negative for reduction)',
    example: 50,
  })
  @IsNotEmpty()
  @IsNumber()
  @Type(() => Number)
  quantity: number;

  @ApiPropertyOptional({
    description: 'Notes for the stock adjustment',
    example: 'Barang masuk dari supplier',
  })
  @IsOptional()
  @IsString()
  notes?: string;
}

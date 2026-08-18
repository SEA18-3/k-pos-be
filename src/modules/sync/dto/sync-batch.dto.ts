import { Type } from 'class-transformer';
import {
  IsArray,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsISO8601,
  IsOptional,
  IsString,
  Matches,
  Min,
  ValidateNested,
  ArrayMaxSize,
  ArrayMinSize,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PaymentMethod } from '../../../../generated/prisma/client';

export class SyncPaymentDto {
  @ApiProperty({ enum: PaymentMethod, example: PaymentMethod.CASH })
  @IsEnum(PaymentMethod)
  method: PaymentMethod;

  @ApiProperty({ example: 30000, description: 'Total amount to be paid' })
  @IsInt()
  @Min(0)
  amount: number;

  @ApiPropertyOptional({ example: 50000, description: 'Amount of cash received from customer' })
  @IsOptional()
  @IsInt()
  @Min(0)
  cash_received?: number;

  @ApiPropertyOptional({ example: 20000, description: 'Change amount given to customer' })
  @IsOptional()
  @IsInt()
  @Min(0)
  change_amount?: number;

  @ApiPropertyOptional({ example: 'QRIS-12345', description: 'QRIS reference code if applicable' })
  @IsOptional()
  @IsString()
  qris_code?: string;

  @ApiPropertyOptional({
    example: 'TRX-BANK-001',
    description: 'Bank transfer reference if applicable',
  })
  @IsOptional()
  @IsString()
  transfer_ref?: string;
}

export class SyncItemDto {
  @ApiProperty({ example: 'clprdxxx...', description: 'CUID of the product' })
  @IsString()
  @IsNotEmpty()
  id_product: string;

  @ApiProperty({ example: 'Kopi Susu Aren' })
  @IsString()
  @IsNotEmpty()
  product_name: string;

  @ApiProperty({ example: 'KSA-01' })
  @IsString()
  @IsNotEmpty()
  product_sku: string;

  @ApiProperty({ example: 7 })
  @IsInt()
  @Min(1)
  catalog_version: number;

  @ApiProperty({ example: 2, description: 'Quantity purchased' })
  @IsInt()
  @Min(1)
  quantity: number;

  @ApiProperty({ example: 15000, description: 'Price per unit at the time of transaction' })
  @IsInt()
  @Min(0)
  unit_price: number;

  @ApiProperty({ example: 30000, description: 'Subtotal for this item (quantity * unit_price)' })
  @IsInt()
  @Min(0)
  subtotal: number;
}

export class SyncTransactionDto {
  @ApiProperty({
    example: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
    description: 'Locally generated UUID v4 or v7 for idempotency',
  })
  @Matches(/^[0-9a-f]{8}-[0-9a-f]{4}-[47][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i)
  @IsNotEmpty()
  offline_uuid: string;

  @ApiProperty({
    example: '2026-08-16T10:00:00.000Z',
    description: 'ISO-8601 timestamp of when the transaction occurred locally',
  })
  @IsISO8601()
  created_at_local: string;

  @ApiProperty({ example: 30000, description: 'Subtotal of all items' })
  @IsInt()
  @Min(0)
  subtotal: number;

  @ApiProperty({
    example: 30000,
    description: 'Total after discounts/taxes (currently same as subtotal)',
  })
  @IsInt()
  @Min(0)
  total: number;

  @ApiPropertyOptional({ example: 'Customer in a rush', description: 'Optional transaction notes' })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiProperty({ type: [SyncItemDto], description: 'List of items purchased' })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => SyncItemDto)
  items: SyncItemDto[];

  @ApiProperty({ type: SyncPaymentDto, description: 'Payment details for this transaction' })
  @IsNotEmpty()
  @ValidateNested()
  @Type(() => SyncPaymentDto)
  payment: SyncPaymentDto;
}

export class SyncBatchDto {
  @ApiProperty({
    type: [SyncTransactionDto],
    description: 'Batch of offline transactions to synchronize (max 100)',
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => SyncTransactionDto)
  transactions: SyncTransactionDto[];
}

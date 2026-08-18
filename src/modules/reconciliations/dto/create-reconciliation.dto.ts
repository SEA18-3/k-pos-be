import { IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateReconciliationDto {
  @ApiProperty({ description: 'ID of the problematic transaction' })
  @IsString()
  @IsNotEmpty()
  id_transaction: string;

  @ApiProperty({ description: 'Reason for creating the reconciliation' })
  @IsString()
  @IsNotEmpty()
  reason: string;

  @ApiProperty({ description: 'Evidence link or text', required: false })
  @IsString()
  @IsOptional()
  evidence?: string;
}

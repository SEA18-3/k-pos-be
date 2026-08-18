import { IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateReconciliationDto {
  @ApiProperty({ description: 'ID of the payment to reconcile' })
  @IsString()
  @IsNotEmpty()
  id_payment: string;

  @ApiProperty({ description: 'Reason for creating the reconciliation' })
  @IsString()
  @IsNotEmpty()
  reason: string;

  @ApiProperty({ description: 'Evidence note or text', required: false })
  @IsString()
  @IsOptional()
  evidence_note?: string;
}

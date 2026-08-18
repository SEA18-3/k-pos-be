import { IsBoolean, IsIn, IsOptional, IsString, MinLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class OpenPaymentReconciliationDto {
  @ApiProperty({ minLength: 5 })
  @IsString()
  @MinLength(5)
  reason: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  evidence_note?: string;
}

export class ResolvePaymentReconciliationDto {
  @ApiProperty({ enum: ['VALID', 'INVALID'] })
  @IsIn(['VALID', 'INVALID'])
  action: 'VALID' | 'INVALID';

  @ApiProperty({ minLength: 5 })
  @IsString()
  @MinLength(5)
  resolution_note: string;

  @ApiPropertyOptional({ description: 'Only relevant for INVALID resolution' })
  @IsOptional()
  @IsBoolean()
  inventory_returned?: boolean;
}

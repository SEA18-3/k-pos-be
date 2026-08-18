import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ResolveReconciliationDto {
  @ApiProperty({ description: 'Resolution status: VALID or INVALID' })
  @IsEnum(['VALID', 'INVALID'])
  @IsNotEmpty()
  resolution: 'VALID' | 'INVALID';

  @ApiProperty({ description: 'Optional notes on how it was resolved', required: false })
  @IsString()
  @IsOptional()
  notes?: string;
}

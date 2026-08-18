import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ResolveReconciliationDto {
  @ApiProperty({ description: 'Resolution note / explanation' })
  @IsString()
  @IsNotEmpty()
  resolution: string;

  @ApiPropertyOptional({ enum: ['RESOLVED_VALID', 'RESOLVED_INVALID'], default: 'RESOLVED_VALID' })
  @IsEnum(['RESOLVED_VALID', 'RESOLVED_INVALID'])
  @IsOptional()
  status?: 'RESOLVED_VALID' | 'RESOLVED_INVALID';
}

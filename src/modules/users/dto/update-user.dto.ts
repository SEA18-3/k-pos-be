import { IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateUserDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  full_name?: string;

  @ApiPropertyOptional({ enum: ['ENTRY', 'OPERATOR'] })
  @IsOptional()
  @IsIn(['ENTRY', 'OPERATOR'])
  role?: 'ENTRY' | 'OPERATOR';
}

export class ChangePasswordDto {
  @ApiPropertyOptional({ minLength: 8 })
  @IsString()
  @MinLength(8)
  new_password: string;
}

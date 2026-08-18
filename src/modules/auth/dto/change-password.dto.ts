import { IsString, IsNotEmpty, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ChangePasswordDto {
  @ApiProperty({ description: 'Password saat ini', example: 'OldPass123' })
  @IsString()
  @IsNotEmpty()
  current_password: string;

  @ApiProperty({ description: 'Password baru (min 8 karakter)', example: 'NewPass456' })
  @IsString()
  @IsNotEmpty()
  @MinLength(8)
  new_password: string;
}

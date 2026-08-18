import { IsEmail, IsNotEmpty, IsOptional, IsString, MinLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class RegisterDto {
  @ApiProperty({ example: 'Budi Santoso' })
  @IsString()
  @IsNotEmpty()
  full_name: string;

  @ApiProperty({ example: 'budi@example.com' })
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @ApiProperty({ example: 'password123', minLength: 8 })
  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters' })
  password: string;

  @ApiProperty({ example: 'Toko Kopi Budi', description: 'Nama toko/merchant' })
  @IsString()
  @IsNotEmpty()
  merchant_name: string;

  @ApiPropertyOptional({ example: 'Asia/Jakarta', default: 'Asia/Jakarta' })
  @IsOptional()
  @IsString()
  timezone?: string;
}

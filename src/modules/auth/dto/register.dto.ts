import {
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Role } from '../../../common/enums/role.enum';

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

  @ApiPropertyOptional({
    enum: ['KASIR', 'MERCHANT'],
    default: 'KASIR',
    description: 'Role hanya bisa KASIR atau MERCHANT. ADMIN dibuat via seeder.',
  })
  @IsOptional()
  @IsEnum(['KASIR', 'MERCHANT'], {
    message: 'Role must be KASIR or MERCHANT',
  })
  role?: Role;
}

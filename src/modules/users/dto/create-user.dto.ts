import { IsEmail, IsIn, IsNotEmpty, IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateUserDto {
  @ApiProperty({ example: 'Andi Kasir' })
  @IsString()
  @IsNotEmpty()
  full_name: string;

  @ApiProperty({ example: 'andi@toko.com' })
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @ApiProperty({ example: 'password123', minLength: 8 })
  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters' })
  password: string;

  @ApiProperty({
    enum: ['OPERATOR', 'ENTRY'],
    example: 'OPERATOR',
    description:
      'Role yang diizinkan: OPERATOR (kasir) atau ENTRY (staf input). OWNER tidak bisa dibuat via endpoint ini.',
  })
  @IsIn(['OPERATOR', 'ENTRY'], {
    message: 'Role must be OPERATOR or ENTRY',
  })
  role: 'ENTRY' | 'OPERATOR';
}

import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateDeviceDto {
  @ApiProperty({ example: 'Tablet Kasir Utama' })
  @IsNotEmpty()
  @IsString()
  @MaxLength(100)
  name: string;
}

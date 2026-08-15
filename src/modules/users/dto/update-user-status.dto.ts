import { IsBoolean, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateUserStatusDto {
  @ApiProperty({
    example: false,
    description: 'true = aktifkan akun, false = nonaktifkan akun',
  })
  @IsBoolean()
  @IsNotEmpty()
  is_active: boolean;
}

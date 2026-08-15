import { IsNotEmpty, IsString, Length } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class PairDeviceDto {
  @ApiProperty({ example: '123456' })
  @IsNotEmpty()
  @IsString()
  @Length(6, 6)
  pairing_code: string;

  @ApiProperty({ example: 'SIMULASI-IPAD-1234' })
  @IsNotEmpty()
  @IsString()
  hardware_id: string;
}

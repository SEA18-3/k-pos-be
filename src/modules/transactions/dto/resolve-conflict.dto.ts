import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsNotEmpty, IsOptional, IsString, MinLength } from 'class-validator';

export class ResolveConflictDto {
  @ApiProperty({
    enum: ['CONFIRM', 'VOID'],
    description:
      'CONFIRM = Paksa konfirmasi transaksi (stok akan dipotong meski negatif). VOID = Batalkan transaksi yang konflik.',
    example: 'CONFIRM',
  })
  @IsIn(['CONFIRM', 'VOID'], { message: 'action must be CONFIRM or VOID' })
  @IsNotEmpty()
  action: 'CONFIRM' | 'VOID';

  @ApiPropertyOptional({
    description: 'Catatan rekonsiliasi untuk audit trail',
    example: 'Barang sudah diberikan ke pelanggan, stok disetujui meski negatif',
    minLength: 5,
  })
  @IsOptional()
  @IsString()
  @MinLength(5)
  notes?: string;
}

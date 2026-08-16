import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MinLength } from 'class-validator';

export class VoidTransactionDto {
  @ApiProperty({
    description: 'Reason for voiding the transaction',
    example: 'Customer left their wallet',
    minLength: 5,
  })
  @IsNotEmpty()
  @IsString()
  @MinLength(5)
  void_reason: string;
}

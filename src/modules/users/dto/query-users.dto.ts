import { IsBoolean, IsEnum, IsOptional } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { Role } from '../../../common/enums/role.enum';

export class QueryUsersDto {
  @ApiPropertyOptional({
    enum: ['OPERATOR', 'ENTRY', 'OWNER'],
    description: 'Filter berdasarkan role pengguna',
  })
  @IsOptional()
  @IsEnum(['OPERATOR', 'ENTRY', 'OWNER'], {
    message: 'Role filter must be OPERATOR, ENTRY, or OWNER',
  })
  role?: Role;

  @ApiPropertyOptional({
    example: true,
    description: 'Filter berdasarkan status aktif. true = aktif, false = nonaktif',
  })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === 'true') return true;
    if (value === 'false') return false;
    return value;
  })
  @IsBoolean()
  is_active?: boolean;
}

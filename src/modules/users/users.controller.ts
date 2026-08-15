import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserStatusDto } from './dto/update-user-status.dto';
import { QueryUsersDto } from './dto/query-users.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/enums/role.enum';
import type { JwtPayload } from '../../common/decorators/current-user.decorator';

@ApiTags('Users')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.OWNER)
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post()
  @ApiOperation({ summary: 'Buat akun OPERATOR atau ENTRY baru (OWNER)' })
  @ApiResponse({ status: 201, description: 'User berhasil dibuat' })
  @ApiResponse({ status: 409, description: 'Email sudah terdaftar' })
  create(@Request() req: { user: JwtPayload }, @Body() createUserDto: CreateUserDto) {
    const id_merchant = req.user.id_merchant;
    return this.usersService.create(id_merchant, createUserDto);
  }

  @Get()
  @ApiOperation({ summary: 'Lihat daftar semua user di merchant (OWNER)' })
  @ApiResponse({ status: 200, description: 'Daftar user berhasil diambil' })
  findAll(@Request() req: { user: JwtPayload }, @Query() query: QueryUsersDto) {
    const id_merchant = req.user.id_merchant;
    return this.usersService.findAll(id_merchant, query);
  }

  @Patch(':id_user/status')
  @ApiOperation({ summary: 'Aktifkan atau nonaktifkan akun user (OWNER)' })
  @ApiResponse({ status: 200, description: 'Status user berhasil diubah' })
  @ApiResponse({ status: 403, description: 'User bukan milik merchant ini' })
  @ApiResponse({ status: 404, description: 'User tidak ditemukan' })
  updateStatus(
    @Request() req: { user: JwtPayload },
    @Param('id_user') id_user: string,
    @Body() updateUserStatusDto: UpdateUserStatusDto,
  ) {
    const id_merchant = req.user.id_merchant;
    return this.usersService.updateStatus(id_user, id_merchant, updateUserStatusDto);
  }
}

import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Delete,
  Request,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { DevicesService } from './devices.service';
import { CreateDeviceDto } from './dto/create-device.dto';
import { PairDeviceDto } from './dto/pair-device.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/enums/role.enum';
import type { JwtPayload } from '../../common/decorators/current-user.decorator';

@ApiTags('Devices')
@ApiBearerAuth()
@Controller('devices')
export class DevicesController {
  constructor(private readonly devicesService: DevicesService) {}

  @Post()
  @ApiOperation({ summary: 'Mendaftarkan device baru (Owner)' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.OWNER)
  create(@Request() req: { user: JwtPayload }, @Body() createDeviceDto: CreateDeviceDto) {
    const id_merchant = req.user.id_merchant;
    const id_user = req.user.sub;
    return this.devicesService.create(id_merchant, id_user, createDeviceDto);
  }

  @Post('pair')
  @ApiOperation({ summary: 'Melakukan pairing menggunakan 6-digit kode (Public)' })
  @HttpCode(HttpStatus.OK)
  pairDevice(@Body() pairDeviceDto: PairDeviceDto) {
    return this.devicesService.pairDevice(pairDeviceDto);
  }

  @Get()
  @ApiOperation({ summary: 'Mendapatkan daftar semua kasir (Owner)' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.OWNER)
  findAll(@Request() req: { user: JwtPayload }) {
    const id_merchant = req.user.id_merchant;
    return this.devicesService.findAll(id_merchant);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Mencabut akses / menghapus device (Owner)' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.OWNER)
  remove(@Request() req: { user: JwtPayload }, @Param('id') id: string) {
    const id_merchant = req.user.id_merchant;
    return this.devicesService.remove(id, id_merchant);
  }
}

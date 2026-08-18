import { Controller, Post, Get, Param, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { ReconciliationsService } from './reconciliations.service';
import { CreateReconciliationDto } from './dto/create-reconciliation.dto';
import { ResolveReconciliationDto } from './dto/resolve-reconciliation.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/enums/role.enum';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { JwtPayload } from '../../common/decorators/current-user.decorator';

@ApiTags('Reconciliations')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('reconciliations')
export class ReconciliationsController {
  constructor(private readonly reconciliationsService: ReconciliationsService) {}

  @Post()
  @Roles(Role.OWNER, Role.OPERATOR)
  @ApiOperation({ summary: 'Laporkan masalah transaksi (membuat rekonsiliasi baru)' })
  @ApiResponse({ status: 201, description: 'Record rekonsiliasi berhasil dibuat.' })
  create(@CurrentUser() user: JwtPayload, @Body() createDto: CreateReconciliationDto) {
    return this.reconciliationsService.create(user, createDto);
  }

  @Get()
  @Roles(Role.OWNER)
  @ApiOperation({ summary: 'Ambil semua record rekonsiliasi milik merchant' })
  findAll(@CurrentUser() user: JwtPayload) {
    return this.reconciliationsService.findAll(user);
  }

  @Post(':id/resolve')
  @Roles(Role.OWNER)
  @ApiOperation({ summary: 'Selesaikan status kasus rekonsiliasi (VALID/INVALID)' })
  resolve(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
    @Body() resolveDto: ResolveReconciliationDto,
  ) {
    return this.reconciliationsService.resolve(id, user, resolveDto);
  }
}

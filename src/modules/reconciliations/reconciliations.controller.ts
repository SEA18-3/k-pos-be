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
  @ApiOperation({
    summary: 'Buka kasus rekonsiliasi',
    description:
      'Membuka kasus rekonsiliasi baru dengan status OPEN untuk suatu payment. ' +
      'Bisa dipanggil oleh Owner atau Operator.',
  })
  @ApiResponse({ status: 201, description: 'Kasus rekonsiliasi berhasil dibuat.' })
  @ApiResponse({
    status: 400,
    description: 'Bad Request (misal: payment tidak ditemukan, atau sudah di-rekonsiliasi).',
  })
  @ApiResponse({
    status: 403,
    description: 'Hanya OWNER atau OPERATOR yang bisa membuka rekonsiliasi.',
  })
  create(@CurrentUser() user: JwtPayload, @Body() createDto: CreateReconciliationDto) {
    return this.reconciliationsService.create(user, createDto);
  }

  @Get()
  @Roles(Role.OWNER)
  @ApiOperation({
    summary: 'Ambil semua kasus rekonsiliasi milik merchant',
    description:
      'Mengembalikan semua record rekonsiliasi merchant yang sedang login, diurutkan dari yang terbaru.',
  })
  @ApiResponse({ status: 200, description: 'Daftar kasus rekonsiliasi berhasil diambil.' })
  @ApiResponse({ status: 403, description: 'Hanya OWNER yang bisa melihat daftar rekonsiliasi.' })
  findAll(@CurrentUser() user: JwtPayload) {
    return this.reconciliationsService.findAll(user);
  }

  @Post(':id/resolve')
  @Roles(Role.OWNER)
  @ApiOperation({
    summary: 'Selesaikan kasus rekonsiliasi (VALID atau INVALID)',
    description:
      'Owner menyelesaikan kasus rekonsiliasi yang sedang OPEN. ' +
      'Jika status = **RESOLVED_VALID**: kasus ditutup, transaksi & payment tetap CONFIRMED/VERIFIED. ' +
      'Jika status = **RESOLVED_INVALID**: secara atomik (1) payment diubah ke FAILED, ' +
      '(2) transaksi di-VOID untuk dikeluarkan dari laporan omzet. ' +
      'Stok barang **tidak** dikembalikan karena barang sudah diserahkan ke pelanggan.',
  })
  @ApiResponse({ status: 201, description: 'Kasus rekonsiliasi berhasil diselesaikan.' })
  @ApiResponse({
    status: 400,
    description: 'Kasus rekonsiliasi tidak ditemukan atau sudah diselesaikan sebelumnya.',
  })
  @ApiResponse({ status: 403, description: 'Hanya OWNER yang bisa menyelesaikan rekonsiliasi.' })
  resolve(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
    @Body() resolveDto: ResolveReconciliationDto,
  ) {
    return this.reconciliationsService.resolve(id, user, resolveDto);
  }
}

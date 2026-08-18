import { Controller, Get, Query, Request, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { MerchantsService } from './merchants.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import type { JwtPayload } from '../../common/decorators/current-user.decorator';

@ApiTags('Merchants')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('merchants')
export class MerchantsController {
  constructor(private readonly merchantsService: MerchantsService) {}

  @Get('me')
  @ApiOperation({ summary: 'Ambil profil merchant user yang sedang login (semua role)' })
  @ApiResponse({ status: 200, description: 'Profil merchant berhasil diambil' })
  @ApiResponse({ status: 401, description: 'Token tidak valid atau tidak ada' })
  @ApiResponse({ status: 404, description: 'Merchant tidak ditemukan' })
  getMyMerchant(@Request() req: { user: JwtPayload }) {
    const id_merchant = req.user.id_merchant;
    return this.merchantsService.getMyMerchant(id_merchant);
  }

  @Get('dashboard')
  @ApiOperation({
    summary: 'Ambil statistik dashboard merchant (hanya OWNER)',
    description: 'Default 30 hari terakhir, maksimal 90 hari. Format tanggal: YYYY-MM-DD',
  })
  @ApiQuery({ name: 'from', required: false, description: 'Tanggal mulai (YYYY-MM-DD)', example: '2026-07-01' })
  @ApiQuery({ name: 'to', required: false, description: 'Tanggal akhir (YYYY-MM-DD)', example: '2026-08-01' })
  @ApiResponse({ status: 200, description: 'Statistik dashboard berhasil diambil' })
  @ApiResponse({ status: 401, description: 'Token tidak valid' })
  getDashboardStats(
    @Request() req: { user: JwtPayload },
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const id_merchant = req.user.id_merchant;
    return this.merchantsService.getDashboardStats(id_merchant, from, to);
  }
}

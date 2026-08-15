import { Controller, Get, Request, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { MerchantsService } from './merchants.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import type { JwtPayload } from '../../common/decorators/current-user.decorator';

@ApiTags('Merchants')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('merchants')
export class MerchantsController {
  constructor(private readonly merchantsService: MerchantsService) { }

  @Get('me')
  @ApiOperation({ summary: 'Ambil profil merchant user yang sedang login (semua role)' })
  @ApiResponse({ status: 200, description: 'Profil merchant berhasil diambil' })
  @ApiResponse({ status: 401, description: 'Token tidak valid atau tidak ada' })
  @ApiResponse({ status: 404, description: 'Merchant tidak ditemukan' })
  getMyMerchant(@Request() req: { user: JwtPayload }) {
    const id_merchant = req.user.id_merchant;
    return this.merchantsService.getMyMerchant(id_merchant);
  }
}

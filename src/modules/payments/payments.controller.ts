import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
  ApiParam,
} from '@nestjs/swagger';
import { PaymentsService } from './payments.service';
import type { PaymentStatusFilter } from './payments.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { JwtPayload } from '../../common/decorators/current-user.decorator';

@ApiTags('Payments')
@Controller('payments')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Get()
  @Roles('OWNER')
  @ApiOperation({
    summary: 'Daftar pembayaran merchant (filter status opsional)',
    description:
      'Mengembalikan semua pembayaran untuk merchant yang terautentikasi. Memerlukan role Owner.',
  })
  @ApiQuery({
    name: 'status',
    required: false,
    enum: ['VERIFIED', 'FAILED'],
    description: 'Filter berdasarkan status pembayaran',
  })
  @ApiResponse({ status: 200, description: 'Daftar pembayaran berhasil dikembalikan' })
  @ApiResponse({ status: 401, description: 'Tidak terotorisasi' })
  @ApiResponse({ status: 403, description: 'Dilarang — Memerlukan role Owner' })
  async findAll(@CurrentUser() user: JwtPayload, @Query('status') status?: PaymentStatusFilter) {
    return this.paymentsService.findAll(user, status);
  }

  @Get(':id')
  @Roles('OWNER')
  @ApiOperation({ summary: 'Ambil data pembayaran tunggal berdasarkan ID' })
  @ApiParam({ name: 'id', description: 'ID Pembayaran' })
  @ApiResponse({ status: 200, description: 'Pembayaran berhasil dikembalikan' })
  @ApiResponse({ status: 404, description: 'Pembayaran tidak ditemukan' })
  async findOne(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.paymentsService.findOne(user, id);
  }
}

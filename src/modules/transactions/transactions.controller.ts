import { Controller, Get, Patch, Post, Param, Body, UseGuards, Query } from '@nestjs/common';
import { TransactionsService } from './transactions.service';
import { QueryTransactionsDto } from './dto/query-transactions.dto';
import { VoidTransactionDto } from './dto/void-transaction.dto';
import { ResolveConflictDto } from './dto/resolve-conflict.dto';
import { CorrectTransactionDto } from './dto/correct-transaction.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/enums/role.enum';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { JwtPayload } from '../../common/decorators/current-user.decorator';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

@ApiTags('Transactions')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('transactions')
export class TransactionsController {
  constructor(private readonly transactionsService: TransactionsService) {}

  @Get()
  @Roles(Role.OWNER, Role.OPERATOR)
  @ApiOperation({ summary: 'Dapatkan semua transaksi dengan filter dan paginasi' })
  @ApiResponse({ status: 200, description: 'Mengembalikan daftar transaksi.' })
  findAll(@CurrentUser() user: JwtPayload, @Query() query: QueryTransactionsDto) {
    return this.transactionsService.findAll(user, query);
  }

  @Get(':id')
  @Roles(Role.OWNER, Role.OPERATOR)
  @ApiOperation({ summary: 'Dapatkan transaksi berdasarkan ID' })
  @ApiResponse({ status: 200, description: 'Mengembalikan data transaksi.' })
  @ApiResponse({ status: 404, description: 'Transaksi tidak ditemukan.' })
  findOne(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.transactionsService.findOne(user, id);
  }

  @Patch(':id/void')
  @Roles(Role.OWNER, Role.OPERATOR)
  @ApiOperation({ summary: 'Void / batalkan transaksi PENDING' })
  @ApiResponse({ status: 200, description: 'Transaksi berhasil dibatalkan (void).' })
  @ApiResponse({ status: 400, description: 'Status transaksi tidak valid.' })
  @ApiResponse({ status: 404, description: 'Transaksi tidak ditemukan.' })
  voidTransaction(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() voidTransactionDto: VoidTransactionDto,
  ) {
    return this.transactionsService.voidTransaction(user, id, voidTransactionDto);
  }

  @Post(':id/resolve')
  @Roles(Role.OWNER)
  @ApiOperation({
    summary: 'Selesaikan transaksi SYNC_CONFLICT secara manual (Khusus OWNER)',
    description:
      'Gunakan action CONFIRM untuk memaksa konfirmasi transaksi (stok dipotong meski negatif). Gunakan VOID untuk membatalkan transaksi konflik.',
  })
  @ApiResponse({ status: 200, description: 'Konflik berhasil diselesaikan.' })
  @ApiResponse({ status: 400, description: 'Transaksi tidak dalam status SYNC_CONFLICT.' })
  @ApiResponse({ status: 404, description: 'Transaksi tidak ditemukan.' })
  resolveConflict(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() resolveConflictDto: ResolveConflictDto,
  ) {
    return this.transactionsService.resolveConflict(user, id, resolveConflictDto);
  }

  @Post(':id/correct')
  @Roles(Role.OWNER)
  @ApiOperation({
    summary: 'Koreksi transaksi CONFIRMED menggunakan pola Immutable Bridge (Khusus OWNER)',
    description:
      'Buat versi baru dari transaksi yang sudah CONFIRMED. Transaksi lama akan di-VOID (tidak dihapus). Stok lama direverted, stok baru dipotong. Catatan koreksi disimpan di TransactionCorrection.',
  })
  @ApiResponse({
    status: 200,
    description: 'Transaksi berhasil dikoreksi. Mengembalikan data record TransactionCorrection.',
  })
  @ApiResponse({
    status: 400,
    description: 'Hanya transaksi berstatus CONFIRMED yang dapat dikoreksi.',
  })
  @ApiResponse({ status: 404, description: 'Transaksi tidak ditemukan.' })
  correctTransaction(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() correctTransactionDto: CorrectTransactionDto,
  ) {
    return this.transactionsService.correctTransaction(user, id, correctTransactionDto);
  }
}

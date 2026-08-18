import {
  Controller,
  Post,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
  Get,
  Query,
  Headers,
  BadRequestException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiBody,
  ApiHeader,
  ApiQuery,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { SyncBatchDto, SyncTransactionDto } from './dto/sync-batch.dto';
import { SyncProducerService } from './sync-producer.service';
import { SyncService } from './sync.service';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';

@ApiTags('sync')
@Controller('sync')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class SyncController {
  constructor(
    private readonly syncProducerService: SyncProducerService,
    private readonly syncService: SyncService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  @Roles('OWNER', 'OPERATOR', 'ENTRY')
  @ApiOperation({
    summary: 'Kirim batch transaksi offline untuk sinkronisasi',
    description: `Endpoint inti untuk arsitektur Offline-First. 
Menerima batch transaksi dari perangkat Kasir dan mem-publish-nya ke RabbitMQ secara asinkron (latency < 50ms).
**Catatan Penting:** 
- Endpoint ini selalu mengembalikan 200 OK jika payload valid, namun tidak menjamin transaksi sukses disimpan ke database.
- Gagal Teknis (DLQ) tidak akan masuk database.
- Konflik Bisnis (SYNC_CONFLICT) akan masuk database dan dapat dicek via \`GET /transactions\`.`,
  })
  @ApiBody({ type: SyncBatchDto })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Batch diterima dan dimasukkan ke dalam antrean RabbitMQ',
    schema: {
      example: {
        message: 'Batch diterima dan sedang diproses',
        data: {
          accepted: 1,
          queued_at: '2026-08-16T10:05:00.000Z',
        },
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Kesalahan Validasi (misal: UUID tidak valid, field wajib tidak diisi)',
  })
  @ApiResponse({ status: 401, description: 'Tidak Terotorisasi - Token JWT tidak valid atau kedaluwarsa' })
  @ApiResponse({ status: 403, description: 'Dilarang - Role user bukan OPERATOR' })
  @ApiHeader({
    name: 'X-Device-ID',
    description: 'ID Perangkat Fisik (UUID)',
    required: true,
  })
  async syncTransactions(@Headers('X-Device-ID') id_device: string, @Body() batch: SyncBatchDto) {
    if (!id_device) {
      throw new BadRequestException('X-Device-ID header is required');
    }

    // Validate idempotency (all-or-nothing)
    await this.syncService.validateBatch(id_device, batch);

    // 1. Publish to RabbitMQ (attach id_device implicitly or map it)
    const transactionsToPublish: (SyncTransactionDto & { id_device: string })[] =
      batch.transactions.map((t: SyncTransactionDto) => ({
        ...t,
        id_device,
      }));
    await this.syncProducerService.publishBatch(transactionsToPublish);

    // 2. Return HTTP 200 immediately
    return {
      message: 'Batch diterima dan sedang diproses',
      data: {
        accepted: batch.transactions.length,
        queued_at: new Date().toISOString(),
      },
    };
  }

  @Get('status')
  @Roles('OWNER', 'OPERATOR', 'ENTRY')
  @ApiOperation({ summary: 'Cek status sinkronisasi berdasarkan offline_uuid' })
  @ApiQuery({ name: 'offline_uuid', required: true, description: 'Daftar UUID dipisahkan koma' })
  async getSyncStatus(@Query('offline_uuid') offline_uuid: string) {
    if (!offline_uuid) throw new BadRequestException('offline_uuid is required');
    return this.syncService.getStatusByOfflineUuids(offline_uuid.split(','));
  }
}

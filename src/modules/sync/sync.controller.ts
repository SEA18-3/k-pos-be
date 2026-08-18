import { Controller, Post, Body, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiBody } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { SyncBatchDto } from './dto/sync-batch.dto';
import { SyncProducerService } from './sync-producer.service';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';

@ApiTags('sync')
@Controller('sync')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class SyncController {
  constructor(private readonly syncProducerService: SyncProducerService) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  @Roles('OWNER', 'OPERATOR', 'ENTRY')
  @ApiOperation({
    summary: 'Submit a batch of offline transactions for synchronization',
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
    description: 'Batch received and queued for processing in RabbitMQ',
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
    description: 'Validation Error (e.g., malformed UUID, missing fields)',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized - Invalid or expired JWT token' })
  @ApiResponse({ status: 403, description: 'Forbidden - User role is not OPERATOR' })
  async syncTransactions(@Body() batch: SyncBatchDto) {
    // 1. Publish to RabbitMQ
    await this.syncProducerService.publishBatch(batch.transactions);

    // 2. Return HTTP 200 immediately
    return {
      message: 'Batch diterima dan sedang diproses',
      data: {
        accepted: batch.transactions.length,
        queued_at: new Date().toISOString(),
      },
    };
  }
}

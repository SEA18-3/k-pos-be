import { Injectable, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { SyncStatus } from '../../../generated/prisma/client';
import * as crypto from 'crypto';
import { SyncBatchDto } from './dto/sync-batch.dto';

@Injectable()
export class SyncService {
  constructor(private readonly prisma: PrismaService) {}

  async validateBatch(id_device: string, batch: SyncBatchDto) {
    const offline_uuids = batch.transactions.map((t) => t.offline_uuid);
    const existingTxs = await this.prisma.transaction.findMany({
      where: { id_device, offline_uuid: { in: offline_uuids } },
      select: { offline_uuid: true, payload_hash: true },
    });

    for (const tx of batch.transactions) {
      const payloadString = JSON.stringify({ items: tx.items, payment: tx.payment });
      const hash = crypto.createHash('sha256').update(payloadString).digest('hex');
      (tx as typeof tx & { payload_hash?: string }).payload_hash = hash;

      const existing = existingTxs.find((e) => e.offline_uuid === tx.offline_uuid);
      if (existing && existing.payload_hash !== hash) {
        throw new ConflictException(
          `IDEMPOTENCY_PAYLOAD_MISMATCH: Transaction ${tx.offline_uuid} has a different payload`,
        );
      }
    }
  }

  async getStatusByOfflineUuids(offline_uuids: string[]) {
    const transactions = await this.prisma.transaction.findMany({
      where: { offline_uuid: { in: offline_uuids } },
      select: { offline_uuid: true, id_transaction: true, sync_status: true },
    });

    const failedQueues = await this.prisma.syncQueue.findMany({
      where: { id_transaction: { in: offline_uuids } },
      select: { id_transaction: true, status: true, last_error: true },
    });

    const results = offline_uuids.map((uuid) => {
      const tx = transactions.find((t) => t.offline_uuid === uuid);
      if (tx) {
        return {
          offline_uuid: uuid,
          status: tx.sync_status === SyncStatus.SYNC_CONFLICT ? 'CONFLICT' : 'SYNCED',
          transaction_id: tx.id_transaction,
          error: null,
        };
      }
      const fail = failedQueues.find((f) => f.id_transaction === uuid);
      if (fail) {
        return {
          offline_uuid: uuid,
          status: 'FAILED',
          transaction_id: null,
          error: fail.last_error,
        };
      }
      return {
        offline_uuid: uuid,
        status: 'UNKNOWN',
        transaction_id: null,
        error: null,
      };
    });

    return { data: results };
  }
}

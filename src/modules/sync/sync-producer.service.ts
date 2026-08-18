import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
  ServiceUnavailableException,
} from '@nestjs/common';
import { SyncTransactionDto } from './dto/sync-batch.dto';
import * as amqp from 'amqp-connection-manager';

const PUBLISH_CONFIRM_TIMEOUT_MS = 5000;

// TTL retry queue delays in milliseconds
const RETRY_DELAY_1 = 5_000; // 5s  → back to main queue
const RETRY_DELAY_2 = 30_000; // 30s → back to main queue
const RETRY_DELAY_3 = 120_000; // 120s → back to main queue

interface SetupChannel {
  assertExchange(
    exchange: string,
    type: string,
    options?: Record<string, unknown>,
  ): Promise<unknown>;
  assertQueue(queue: string, options?: Record<string, unknown>): Promise<unknown>;
  bindQueue(queue: string, source: string, pattern: string): Promise<unknown>;
}

@Injectable()
export class SyncProducerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SyncProducerService.name);
  private amqpConnection: amqp.AmqpConnectionManager;
  private channelWrapper: amqp.ChannelWrapper;

  async onModuleInit() {
    const url = process.env.RABBITMQ_URL || 'amqp://localhost:5672';
    this.amqpConnection = amqp.connect([url]);

    this.amqpConnection.on('connect', () => this.logger.log('RabbitMQ connected.'));
    this.amqpConnection.on('disconnect', ({ err }: { err: Error }) =>
      this.logger.warn(`RabbitMQ disconnected: ${err.message}`),
    );

    this.channelWrapper = this.amqpConnection.createChannel({
      json: true,
      setup: async (channel: SetupChannel) => {
        // ── DLX & DLQ ──────────────────────────────────────────────────────────
        await channel.assertExchange('dlx_exchange', 'direct', { durable: true });
        await channel.assertQueue('sync.dlq', { durable: true });
        await channel.bindQueue('sync.dlq', 'dlx_exchange', 'sync.dlq.routingKey');

        // ── TTL Retry Queues ───────────────────────────────────────────────────
        // Each dead-lettered message re-routes to main queue after its TTL expires.
        await channel.assertQueue('sync.retry.5s', {
          durable: true,
          arguments: {
            'x-message-ttl': RETRY_DELAY_1,
            'x-dead-letter-exchange': '', // default exchange
            'x-dead-letter-routing-key': 'sync.transactions',
          },
        });
        await channel.assertQueue('sync.retry.30s', {
          durable: true,
          arguments: {
            'x-message-ttl': RETRY_DELAY_2,
            'x-dead-letter-exchange': '',
            'x-dead-letter-routing-key': 'sync.transactions',
          },
        });
        await channel.assertQueue('sync.retry.120s', {
          durable: true,
          arguments: {
            'x-message-ttl': RETRY_DELAY_3,
            'x-dead-letter-exchange': '',
            'x-dead-letter-routing-key': 'sync.transactions',
          },
        });

        // ── Main Queue ─────────────────────────────────────────────────────────
        await channel.assertQueue('sync.transactions', {
          durable: true,
          arguments: {
            'x-dead-letter-exchange': 'dlx_exchange',
            'x-dead-letter-routing-key': 'sync.dlq.routingKey',
          },
        });
      },
    });

    await this.channelWrapper.waitForConnect();
    this.logger.log('RabbitMQ topology (DLX / DLQ / TTL retry queues) asserted.');
  }

  async onModuleDestroy() {
    try {
      await this.channelWrapper.close();
      await this.amqpConnection.close();
    } catch {
      // ignore on shutdown
    }
  }

  async publishBatch(transactions: (SyncTransactionDto & { id_device: string })[]) {
    const payload = JSON.stringify({
      pattern: 'sync_transaction_batch',
      data: transactions,
    });

    try {
      await this.publishWithConfirm('sync.transactions', payload);
      this.logger.log(`Queued batch of ${transactions.length} transactions (publisher confirm ✓)`);
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      this.logger.error(`Failed to publish batch to RabbitMQ: ${error}`);
      throw new ServiceUnavailableException(
        'Message broker is currently unavailable. Retry later.',
      );
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Private helpers
  // ──────────────────────────────────────────────────────────────────────────

  private publishWithConfirm(queue: string, payload: string): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Publisher confirm timed out after ${PUBLISH_CONFIRM_TIMEOUT_MS}ms`));
      }, PUBLISH_CONFIRM_TIMEOUT_MS);

      this.channelWrapper
        .sendToQueue(queue, Buffer.from(payload), {
          persistent: true,
          contentType: 'application/json',
        })
        .then(() => {
          clearTimeout(timer);
          resolve();
        })
        .catch((err: unknown) => {
          clearTimeout(timer);
          reject(err instanceof Error ? err : new Error(String(err)));
        });
    });
  }

  /**
   * Route a failed message to the appropriate TTL retry queue.
   * Called by the DLQ consumer / consumer error handler.
   */
  async publishToRetry(
    transactions: (SyncTransactionDto & { id_device: string })[],
    attempt: number,
  ): Promise<void> {
    const queue =
      attempt === 1 ? 'sync.retry.5s' : attempt === 2 ? 'sync.retry.30s' : 'sync.retry.120s';

    const payload = JSON.stringify({
      pattern: 'sync_transaction_batch',
      data: transactions,
    });
    try {
      await this.publishWithConfirm(queue, payload);
      this.logger.log(`Routed batch to ${queue} (attempt ${attempt})`);
    } catch (err) {
      this.logger.error(`Failed to route to retry queue ${queue}: ${err}`);
    }
  }
}

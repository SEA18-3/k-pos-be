import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import * as amqp from 'amqp-connection-manager';
import type { ChannelWrapper } from 'amqp-connection-manager';
import type { ConfirmChannel, ConsumeMessage } from 'amqplib';

const EXCHANGE = 'kpos.sync';
const MAIN_QUEUE = 'sync.transactions';
const DLQ = 'sync.dlq';
const RETRY_DELAYS = [5_000, 30_000, 120_000] as const;

export type SyncMessageProcessor = {
  process(receiptId: string): Promise<void>;
  markFailed(receiptId: string, code: string, message: string, retryable: boolean): Promise<void>;
};

export class RetryableSyncError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export class PermanentSyncError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

@Injectable()
export class SyncProducerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SyncProducerService.name);
  private connection?: amqp.AmqpConnectionManager;
  private channel?: ChannelWrapper;
  private processor?: SyncMessageProcessor;
  private connected = false;

  onModuleInit(): void {
    this.connection = amqp.connect([process.env.RABBITMQ_URL ?? 'amqp://localhost:5672'], {
      reconnectTimeInSeconds: 2,
    });
    this.connection.on('connect', () => {
      this.connected = true;
      this.logger.log('RabbitMQ connected');
    });
    this.connection.on('disconnect', ({ err }: { err?: Error }) => {
      this.connected = false;
      this.logger.warn(`RabbitMQ disconnected${err ? `: ${err.message}` : ''}`);
    });

    this.channel = this.connection.createChannel({
      json: false,
      setup: async (channel: ConfirmChannel) => {
        await channel.assertExchange(EXCHANGE, 'direct', { durable: true });
        await channel.assertQueue(MAIN_QUEUE, { durable: true });
        await channel.bindQueue(MAIN_QUEUE, EXCHANGE, 'sync.process');
        await channel.assertQueue(DLQ, { durable: true });

        for (let index = 0; index < RETRY_DELAYS.length; index += 1) {
          const queue = retryQueue(index);
          await channel.assertQueue(queue, {
            durable: true,
            arguments: {
              'x-message-ttl': RETRY_DELAYS[index],
              'x-dead-letter-exchange': EXCHANGE,
              'x-dead-letter-routing-key': 'sync.process',
            },
          });
        }

        await channel.prefetch(Number(process.env.RABBITMQ_PREFETCH ?? 10));
        await channel.consume(MAIN_QUEUE, (message) => {
          if (message) void this.consume(channel, message);
        });
      },
    });
  }

  registerProcessor(processor: SyncMessageProcessor): void {
    this.processor = processor;
  }

  isHealthy(): boolean {
    return this.connected;
  }

  async publishReceipt(receiptId: string, attempt = 0): Promise<void> {
    if (!this.connected || !this.channel) throw new Error('RabbitMQ is unavailable');
    await this.channel.publish(
      EXCHANGE,
      'sync.process',
      Buffer.from(JSON.stringify({ receipt_id: receiptId, attempt })),
      { persistent: true, contentType: 'application/json', messageId: receiptId },
    );
  }

  private async consume(channel: ConfirmChannel, message: ConsumeMessage): Promise<void> {
    let receiptId = 'unknown';
    let attempt = 0;
    try {
      const body = JSON.parse(message.content.toString()) as {
        receipt_id?: string;
        attempt?: number;
      };
      if (!body.receipt_id || !this.processor)
        throw new PermanentSyncError('MALFORMED_QUEUE_MESSAGE', 'Queue message has no receipt ID');
      receiptId = body.receipt_id;
      attempt = body.attempt ?? 0;
      await this.processor.process(receiptId);
      channel.ack(message);
    } catch (error: unknown) {
      const normalized = normalizeSyncError(error);
      try {
        if (normalized.retryable && attempt < RETRY_DELAYS.length && this.channel) {
          await this.channel.sendToQueue(
            retryQueue(attempt),
            Buffer.from(JSON.stringify({ receipt_id: receiptId, attempt: attempt + 1 })),
            { persistent: true, contentType: 'application/json', messageId: receiptId },
          );
          channel.ack(message);
          return;
        }

        if (this.processor && receiptId !== 'unknown') {
          await this.processor.markFailed(
            receiptId,
            normalized.code,
            normalized.message,
            normalized.retryable,
          );
        }
        if (this.channel) {
          await this.channel.sendToQueue(DLQ, message.content, {
            persistent: true,
            contentType: 'application/json',
            headers: { 'x-kpos-error-code': normalized.code, 'x-kpos-error': normalized.message },
          });
        }
        channel.ack(message);
      } catch (deliveryError: unknown) {
        this.logger.error('Failed to route failed sync message', deliveryError);
        channel.nack(message, false, true);
      }
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.channel?.close();
    await this.connection?.close();
  }
}

function retryQueue(index: number): string {
  return `sync.retry.${index + 1}`;
}

function normalizeSyncError(error: unknown): { code: string; message: string; retryable: boolean } {
  if (error instanceof PermanentSyncError)
    return { code: error.code, message: error.message, retryable: false };
  if (error instanceof RetryableSyncError)
    return { code: error.code, message: error.message, retryable: true };
  const message = error instanceof Error ? error.message : 'Unknown sync error';
  return { code: 'SYNC_PROCESSING_ERROR', message, retryable: true };
}

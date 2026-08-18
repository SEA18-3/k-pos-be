import {
  Injectable,
  Inject,
  InternalServerErrorException,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { SyncTransactionDto } from './dto/sync-batch.dto';
import { lastValueFrom } from 'rxjs';
import * as amqp from 'amqp-connection-manager';

interface SetupChannel {
  assertExchange(exchange: string, type: string, options?: any): Promise<any>;
  assertQueue(queue: string, options?: any): Promise<any>;
  bindQueue(queue: string, source: string, pattern: string): Promise<any>;
}

@Injectable()
export class SyncProducerService implements OnModuleInit {
  private readonly logger = new Logger(SyncProducerService.name);
  private amqpConnection: amqp.AmqpConnectionManager;

  constructor(@Inject('SYNC_RABBITMQ_SERVICE') private client: ClientProxy) {}

  async onModuleInit() {
    this.amqpConnection = amqp.connect([process.env.RABBITMQ_URL || 'amqp://localhost:5672']);
    const channelWrapper = this.amqpConnection.createChannel({
      json: true,

      setup: async (channel: SetupChannel) => {
        // 1. Assert DLX and DLQ
        await channel.assertExchange('dlx_exchange', 'direct', { durable: true });
        await channel.assertQueue('sync.dlq', { durable: true });
        await channel.bindQueue('sync.dlq', 'dlx_exchange', 'sync.dlq.routingKey');

        // 2. Assert Main Queue with DLX configuration
        await channel.assertQueue('sync.transactions', {
          durable: true,
          arguments: {
            'x-dead-letter-exchange': 'dlx_exchange',
            'x-dead-letter-routing-key': 'sync.dlq.routingKey',
          },
        });
      },
    });

    await channelWrapper.waitForConnect();
    this.logger.log('RabbitMQ Topology (DLX/DLQ) successfully asserted.');
  }

  async publishBatch(transactions: (SyncTransactionDto & { id_device: string })[]) {
    try {
      // Mengirim seluruh array transaksi sebagai satu pesan batch ke RabbitMQ
      // Hal ini mengurangi network serialization overhead NestJS yang secara drastis menurunkan waktu respons.
      await lastValueFrom(this.client.emit('sync_transaction_batch', transactions));
      this.logger.log(`Successfully queued ${transactions.length} transactions`);
    } catch (error) {
      this.logger.error('Failed to publish transactions to RabbitMQ', error);
      throw new InternalServerErrorException(
        'Message broker is currently unavailable. Please try again later.',
      );
    }
  }
}

import { Module } from '@nestjs/common';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { SyncController } from './sync.controller';
import { SyncProducerService } from './sync-producer.service';
import { SyncConsumerService } from './sync-consumer.service';
import { SyncService } from './sync.service';
import { PrismaModule } from '../../prisma/prisma.module';

@Module({
  imports: [
    PrismaModule,
    ClientsModule.registerAsync([
      {
        name: 'SYNC_RABBITMQ_SERVICE',
        useFactory: () => ({
          transport: Transport.RMQ,
          options: {
            urls: [process.env.RABBITMQ_URL || 'amqp://localhost:5672'],
            queue: 'sync.transactions',
            prefetchCount: 10,
            queueOptions: {
              durable: true,
              arguments: {
                'x-dead-letter-exchange': 'dlx_exchange',
                'x-dead-letter-routing-key': 'sync.dlq.routingKey',
              },
            },
          },
        }),
      },
    ]),
  ],
  controllers: [SyncController, SyncConsumerService],
  providers: [SyncProducerService, SyncService],
})
export class SyncModule {}

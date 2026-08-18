import { Module } from '@nestjs/common';
import { SyncController } from './sync.controller';
import { SyncProducerService } from './sync-producer.service';
import { SyncConsumerService } from './sync-consumer.service';
import { SyncService } from './sync.service';
import { PrismaModule } from '../../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [SyncController, SyncConsumerService],
  providers: [SyncProducerService, SyncService],
})
export class SyncModule {}

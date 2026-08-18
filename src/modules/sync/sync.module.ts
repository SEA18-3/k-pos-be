import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { SyncConsumerService } from './sync-consumer.service';
import { SyncController } from './sync.controller';
import { SyncProducerService } from './sync-producer.service';
import { SyncService } from './sync.service';

@Module({
  imports: [PrismaModule],
  controllers: [SyncController],
  providers: [SyncProducerService, SyncConsumerService, SyncService],
  exports: [SyncProducerService, SyncService],
})
export class SyncModule {}

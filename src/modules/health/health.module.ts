import { Module } from '@nestjs/common';
import { HealthService } from './health.service';
import { HealthController } from './health.controller';
import { PrismaModule } from '../../prisma/prisma.module';
import { SyncModule } from '../sync/sync.module';

@Module({
  imports: [PrismaModule, SyncModule],
  controllers: [HealthController],
  providers: [HealthService],
})
export class HealthModule {}

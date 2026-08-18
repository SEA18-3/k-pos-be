import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { ReportingController } from './reporting.controller';
import { ReportingService } from './reporting.service';
import { ReportingWorkerService } from './reporting-worker.service';

@Module({
  imports: [PrismaModule],
  controllers: [ReportingController],
  providers: [ReportingService, ReportingWorkerService],
  exports: [ReportingService, ReportingWorkerService],
})
export class ReportingModule {}

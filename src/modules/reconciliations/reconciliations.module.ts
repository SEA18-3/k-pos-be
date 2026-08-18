import { Module } from '@nestjs/common';
import { ReconciliationsService } from './reconciliations.service';
import { ReconciliationsController } from './reconciliations.controller';
import { PrismaModule } from '../../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [ReconciliationsController],
  providers: [ReconciliationsService],
})
export class ReconciliationsModule {}

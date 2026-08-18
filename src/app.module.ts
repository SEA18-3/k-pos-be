import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { MerchantsModule } from './modules/merchants/merchants.module';
import { DevicesModule } from './modules/devices/devices.module';
import { ProductsModule } from './modules/products/products.module';
import { TransactionsModule } from './modules/transactions/transactions.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { SyncModule } from './modules/sync/sync.module';
import { HealthModule } from './modules/health/health.module';
import { StorageModule } from './storage/storage.module';
import { ReportingModule } from './modules/reporting/reporting.module';

@Module({
  imports: [
    // Harus ada di paling atas agar env sudah tersedia sebelum module lain init
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuthModule,
    UsersModule,
    MerchantsModule,
    DevicesModule,
    ProductsModule,
    TransactionsModule,
    PaymentsModule,
    SyncModule,
    HealthModule,
    StorageModule,
    ReportingModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}

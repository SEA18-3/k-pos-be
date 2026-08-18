import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { PrismaService } from './prisma/prisma.service';
import * as bcrypt from 'bcrypt';

async function bootstrap() {
  console.log('Menyiapkan data seed untuk Load Test di Docker DB...');
  const app = await NestFactory.createApplicationContext(AppModule);
  const prisma = app.get(PrismaService);

  // 1. Buat Merchant
  const merchant = await prisma.merchant.upsert({
    where: { id_merchant: 'M-LOAD' },
    update: {},
    create: {
      id_merchant: 'M-LOAD',
      name: 'Merchant Load Test',
    },
  });

  // 2. Buat User Operator (Kasir)
  const hashedPassword = await bcrypt.hash('password123', 10);
  const user = await prisma.user.upsert({
    where: { email: 'kasir@load.com' },
    update: { password: hashedPassword },
    create: {
      email: 'kasir@load.com',
      password: hashedPassword,
      full_name: 'Kasir Load Test',
      role: 'OPERATOR',
      id_merchant: merchant.id_merchant,
    },
  });

  // 3. Buat Device DEV-LOAD-TEST
  await prisma.device.upsert({
    where: { id_device: 'DEV-LOAD-TEST' },
    update: {},
    create: {
      id_device: 'DEV-LOAD-TEST',
      name: 'Device Load Test',
      status: 'PAIRED',
      id_merchant: merchant.id_merchant,
      id_user: user.id_user,
    },
  });

  // 4. Buat Product dummy-product-id
  const product = await prisma.product.upsert({
    where: { id_merchant_sku: { id_merchant: merchant.id_merchant, sku: 'SKU-LOAD-1' } },
    update: {},
    create: {
      id_product: 'dummy-product-id',
      id_merchant: merchant.id_merchant,
      name: 'Produk Load Test',
      sku: 'SKU-LOAD-1',
      price: 10000,
      is_active: true,
    },
  });

  // 5. Beri stok ke produk tersebut
  await prisma.inventory.upsert({
    where: { id_product: product.id_product },
    update: { current_stock: 999999 },
    create: {
      id_product: product.id_product,
      id_merchant: merchant.id_merchant,
      current_stock: 999999,
    },
  });

  console.log('✅ Berhasil seed data Load Test ke Docker DB!');
  console.log('✅ id_device: DEV-LOAD-TEST');
  console.log('✅ id_product: dummy-product-id');

  await app.close();
}

bootstrap().catch(console.error);

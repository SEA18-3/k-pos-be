import { PrismaClient, UserRole } from '../generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as bcrypt from 'bcrypt';
import { createHash } from 'node:crypto';
import { Pool } from 'pg';
import 'dotenv/config';

const connectionString = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
if (!connectionString) throw new Error('DATABASE_URL or DIRECT_URL is required');
const pool = new Pool({
  connectionString,
  ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
});
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

const products = [
  ['KSA-01', 'Kopi Susu Aren', 22000],
  ['CS-01', 'Choco Sea Salt', 24000],
  ['MC-01', 'Matcha Cloud', 25000],
  ['YS-01', 'Yuzu Sparkling', 23000],
  ['AC-01', 'Aren Croffle', 26000],
  ['CL-01', 'Caramel Latte', 25000],
  ['IA-01', 'Iced Americano', 18000],
  ['NAM-01', 'Nasi Ayam Matah', 32000],
] as const;

async function main() {
  const merchant = await prisma.merchant.upsert({
    where: { id_merchant: 'KEDAI-NUSA' },
    update: { name: 'Kedai Nusa', timezone: 'Asia/Jakarta', is_active: true },
    create: { id_merchant: 'KEDAI-NUSA', name: 'Kedai Nusa', timezone: 'Asia/Jakarta' },
  });

  const credentials = [
    ['KPOS-OWNER', 'Nadia Owner', 'owner@kedai-nusa.test', 'owner123', UserRole.OWNER],
    ['KPOS-ENTRY', 'Dimas Entry', 'entry@kedai-nusa.test', 'entry123', UserRole.ENTRY],
    [
      'KPOS-OPERATOR',
      'Rani Operator',
      'operator@kedai-nusa.test',
      'operator123',
      UserRole.OPERATOR,
    ],
  ] as const;
  for (const [id_user, full_name, email, rawPassword, role] of credentials) {
    const password = await bcrypt.hash(rawPassword, 12);
    await prisma.user.upsert({
      where: { email },
      update: { full_name, password, role, is_active: true },
      create: { id_user, id_merchant: merchant.id_merchant, full_name, email, password, role },
    });
  }

  await prisma.device.upsert({
    where: { id_device: 'KPOS-DEMO-DEVICE' },
    update: { name: 'Counter Demo', status: 'PAIRED', is_active: true },
    create: {
      id_device: 'KPOS-DEMO-DEVICE',
      id_merchant: merchant.id_merchant,
      name: 'Counter Demo',
      status: 'PAIRED',
      device_id_hash: createHash('sha256').update('KPOS-DEMO-HARDWARE').digest('hex'),
    },
  });

  for (const [sku, name, price] of products) {
    await prisma.product.upsert({
      where: { id_merchant_sku: { id_merchant: merchant.id_merchant, sku } },
      update: { name, price, is_active: true, archived_at: null },
      create: {
        id_merchant: merchant.id_merchant,
        sku,
        name,
        price,
        inventory: { create: { id_merchant: merchant.id_merchant, current_stock: 100 } },
      },
    });
  }

  console.log('K-POS demo seed ready');
  console.log('OWNER    owner@kedai-nusa.test / owner123');
  console.log('ENTRY    entry@kedai-nusa.test / entry123');
  console.log('OPERATOR operator@kedai-nusa.test / operator123 / KPOS-DEMO-DEVICE');
}

main()
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  })
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });

import { PrismaClient, UserRole } from '../generated/prisma/client';
import * as bcrypt from 'bcrypt';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import 'dotenv/config';

const connectionString = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
const pool = new Pool({
  connectionString,
  ssl: { rejectUnauthorized: false },
});
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log('Seeding database...');

  // 1. Create a Merchant
  const merchant = await prisma.merchant.upsert({
    where: { id_merchant: 'M-1' },
    update: {},
    create: {
      id_merchant: 'M-1',
      name: 'K-POS Branch 1',
      address: 'Jalan Kenangan No. 1',
      phone: '081234567890',
    },
  });

  console.log('Created Merchant:', merchant.name);

  // 2. Create Users
  const passwordHash = await bcrypt.hash('password123', 10);

  await prisma.user.upsert({
    where: { email: 'admin@kpos.com' },
    update: {},
    create: {
      email: 'admin@kpos.com',
      full_name: 'Super Admin',
      password: passwordHash,
      role: UserRole.ADMIN,
    },
  });

  await prisma.user.upsert({
    where: { email: 'owner@kpos.com' },
    update: {},
    create: {
      email: 'owner@kpos.com',
      full_name: 'Merchant Owner',
      password: passwordHash,
      role: UserRole.OWNER,
      id_merchant: merchant.id_merchant,
    },
  });

  await prisma.user.upsert({
    where: { email: 'kasir@kpos.com' },
    update: {},
    create: {
      email: 'kasir@kpos.com',
      full_name: 'Kasir Satu',
      password: passwordHash,
      role: UserRole.OPERATOR,
      id_merchant: merchant.id_merchant,
    },
  });

  console.log('Created Users: Admin, Owner, Kasir');

  // 3. Create Products and Inventory
  const productA = await prisma.product.upsert({
    where: { id_merchant_sku: { id_merchant: merchant.id_merchant, sku: 'SKU-001' } },
    update: {},
    create: {
      id_merchant: merchant.id_merchant,
      name: 'Indomie Goreng',
      sku: 'SKU-001',
      price: 3500,
      inventory: {
        create: {
          id_merchant: merchant.id_merchant,
          current_stock: 100,
        },
      },
    },
  });

  const productB = await prisma.product.upsert({
    where: { id_merchant_sku: { id_merchant: merchant.id_merchant, sku: 'SKU-002' } },
    update: {},
    create: {
      id_merchant: merchant.id_merchant,
      name: 'Es Teh Manis',
      sku: 'SKU-002',
      price: 5000,
      inventory: {
        create: {
          id_merchant: merchant.id_merchant,
          current_stock: 50,
        },
      },
    },
  });

  console.log('Created Products:', productA.name, productB.name);
  console.log('Database seeding completed!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      await prisma.$disconnect();
    } finally {
      await pool.end();
    }
  });

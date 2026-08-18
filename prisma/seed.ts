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
      role: UserRole.OWNER,
    },
  });

  const owner = await prisma.user.upsert({
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

  const kasir = await prisma.user.upsert({
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

  // 4. Create Dummy Transactions for testing Tahap 5
  const device = await prisma.device.upsert({
    where: { id_device: 'DEV-1' },
    update: {},
    create: {
      id_device: 'DEV-1',
      id_merchant: merchant.id_merchant,
      id_user: kasir.id_user,
      name: 'Tablet Kasir Depan',
    }
  });

  await prisma.transaction.upsert({
    where: { id_transaction: 'TRX-PENDING-1' },
    update: {},
    create: {
      id_transaction: 'TRX-PENDING-1',
      id_merchant: merchant.id_merchant,
      id_user: kasir.id_user,
      id_device: device.id_device,
      offline_uuid: 'offline-uuid-pending-1',
      status: 'PENDING',
      sync_status: 'PENDING_SYNC',
      subtotal: 3500,
      total: 3500,
      details: {
        create: {
          id_detail: 'DET-1',
          id_product: productA.id_product,
          quantity: 1,
          unit_price: 3500,
          subtotal: 3500,
        }
      }
    }
  });

  const trxConfirmed = await prisma.transaction.upsert({
    where: { id_transaction: 'TRX-CONFIRMED-1' },
    update: {},
    create: {
      id_transaction: 'TRX-CONFIRMED-1',
      id_merchant: merchant.id_merchant,
      id_user: kasir.id_user,
      id_device: device.id_device,
      offline_uuid: 'offline-uuid-confirmed-1',
      status: 'CONFIRMED',
      sync_status: 'SYNCED',
      subtotal: 8500,
      total: 8500,
      details: {
        create: [
          {
            id_detail: 'DET-2',
            id_product: productA.id_product,
            quantity: 1,
            unit_price: 3500,
            subtotal: 3500,
          },
          {
            id_detail: 'DET-3',
            id_product: productB.id_product,
            quantity: 1,
            unit_price: 5000,
            subtotal: 5000,
          }
        ]
      }
    }
  });

  // 5. Create Payment for Confirmed Transaction
  const payment = await prisma.payment.upsert({
    where: { id_transaction: trxConfirmed.id_transaction },
    update: {},
    create: {
      id_transaction: trxConfirmed.id_transaction,
      id_merchant: merchant.id_merchant,
      amount: 8500,
      method: 'STATIC_QRIS',
      status: 'VERIFIED',
      qris_code: 'DUMMY-QRIS-CODE',
      verified_at: new Date(),
    }
  });

  // 6. Create Reconciliation exception record for testing
  await prisma.reconciliation.upsert({
    where: { id_transaction: trxConfirmed.id_transaction },
    update: {},
    create: {
      id_transaction: trxConfirmed.id_transaction,
      id_merchant: merchant.id_merchant,
      reason: 'QRIS payment mismatch, customer transfer failed to settle',
      evidence: 'https://supabase.co/storage/v1/object/public/k-pos-images/receipt.png',
      handled_by: owner.id_user,
      resolution: 'Invalid payment, correction voided',
      resolved_at: new Date(),
    }
  });

  // 7. Create a dummy Transaction Correction (Immutable Bridge)
  const trxOld = await prisma.transaction.upsert({
    where: { id_transaction: 'TRX-OLD-1' },
    update: {},
    create: {
      id_transaction: 'TRX-OLD-1',
      id_merchant: merchant.id_merchant,
      id_user: kasir.id_user,
      id_device: device.id_device,
      status: 'VOIDED',
      sync_status: 'SYNCED',
      subtotal: 5000,
      total: 5000,
      voided_at: new Date(),
      voided_by: owner.id_user,
      void_reason: 'Corrected. Reason: Customer double-billed. New transaction: TRX-NEW-1',
    }
  });

  const trxNew = await prisma.transaction.upsert({
    where: { id_transaction: 'TRX-NEW-1' },
    update: {},
    create: {
      id_transaction: 'TRX-NEW-1',
      id_merchant: merchant.id_merchant,
      id_user: kasir.id_user,
      id_device: device.id_device,
      status: 'CONFIRMED',
      sync_status: 'SYNCED',
      subtotal: 3500,
      total: 3500,
    }
  });

  await prisma.transactionCorrection.upsert({
    where: { id_new_transaction: trxNew.id_transaction },
    update: {},
    create: {
      id_old_transaction: trxOld.id_transaction,
      id_new_transaction: trxNew.id_transaction,
      corrected_by: owner.id_user,
      reason: 'Customer double-billed for tea, adjusted to indomie only',
    }
  });

  console.log('Created Dummy Transactions, Payments, Reconciliations, and Corrections');
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

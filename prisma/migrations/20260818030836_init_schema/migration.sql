-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('OWNER', 'OPERATOR', 'ENTRY');

-- CreateEnum
CREATE TYPE "TransactionStatus" AS ENUM ('PENDING', 'CONFIRMED', 'VOIDED', 'FAILED');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'STATIC_QRIS', 'BANK_TRANSFER');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('VERIFIED', 'FAILED');

-- CreateEnum
CREATE TYPE "SyncStatus" AS ENUM ('PENDING_SYNC', 'SYNCING', 'SYNCED', 'SYNC_FAILED', 'SYNC_CONFLICT');

-- CreateEnum
CREATE TYPE "DeviceStatus" AS ENUM ('UNPAIRED', 'PAIRED', 'REVOKED');

-- CreateEnum
CREATE TYPE "StockMovementType" AS ENUM ('SALE', 'ADJUSTMENT', 'RETURN', 'CORRECTION');

-- CreateTable
CREATE TABLE "User" (
    "id_user" TEXT NOT NULL,
    "full_name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "role" "UserRole" NOT NULL,
    "id_merchant" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id_user")
);

-- CreateTable
CREATE TABLE "Merchant" (
    "id_merchant" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "onboarded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Merchant_pkey" PRIMARY KEY ("id_merchant")
);

-- CreateTable
CREATE TABLE "Device" (
    "id_device" TEXT NOT NULL,
    "id_merchant" TEXT NOT NULL,
    "id_user" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "device_id_hash" TEXT,
    "pairing_code" TEXT,
    "status" "DeviceStatus" NOT NULL DEFAULT 'UNPAIRED',
    "last_online_at" TIMESTAMP(3),
    "last_sync_at" TIMESTAMP(3),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Device_pkey" PRIMARY KEY ("id_device")
);

-- CreateTable
CREATE TABLE "DeviceSyncLog" (
    "id" TEXT NOT NULL,
    "id_device" TEXT NOT NULL,
    "sync_timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "SyncStatus" NOT NULL,
    "failed_count" INTEGER NOT NULL DEFAULT 0,
    "error_message" TEXT,
    "synced_records" INTEGER NOT NULL DEFAULT 0,
    "details" TEXT,

    CONSTRAINT "DeviceSyncLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Product" (
    "id_product" TEXT NOT NULL,
    "id_merchant" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "price" DECIMAL(12,2) NOT NULL,
    "image_url" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id_product")
);

-- CreateTable
CREATE TABLE "Inventory" (
    "id_inventory" TEXT NOT NULL,
    "id_product" TEXT NOT NULL,
    "id_merchant" TEXT NOT NULL,
    "current_stock" INTEGER NOT NULL DEFAULT 0,
    "reserved" INTEGER NOT NULL DEFAULT 0,
    "last_updated" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Inventory_pkey" PRIMARY KEY ("id_inventory")
);

-- CreateTable
CREATE TABLE "StockHistory" (
    "id_stock" TEXT NOT NULL,
    "id_product" TEXT NOT NULL,
    "id_merchant" TEXT,
    "id_user" TEXT,
    "movement_type" "StockMovementType" NOT NULL,
    "quantity" INTEGER NOT NULL,
    "id_transaction" TEXT,
    "id_correction" TEXT,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockHistory_pkey" PRIMARY KEY ("id_stock")
);

-- CreateTable
CREATE TABLE "Transaction" (
    "id_transaction" TEXT NOT NULL,
    "id_merchant" TEXT NOT NULL,
    "id_user" TEXT NOT NULL,
    "id_device" TEXT NOT NULL,
    "status" "TransactionStatus" NOT NULL DEFAULT 'PENDING',
    "sync_status" "SyncStatus" NOT NULL DEFAULT 'PENDING_SYNC',
    "created_at_local" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmed_at" TIMESTAMP(3),
    "synced_at" TIMESTAMP(3),
    "total" DECIMAL(12,2) NOT NULL,
    "subtotal" DECIMAL(12,2) NOT NULL,
    "offline_uuid" TEXT,
    "notes" TEXT,
    "voided_at" TIMESTAMP(3),
    "voided_by" TEXT,
    "void_reason" TEXT,

    CONSTRAINT "Transaction_pkey" PRIMARY KEY ("id_transaction")
);

-- CreateTable
CREATE TABLE "DetailTransaction" (
    "id_detail" TEXT NOT NULL,
    "id_transaction" TEXT NOT NULL,
    "id_product" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unit_price" DECIMAL(12,2) NOT NULL,
    "subtotal" DECIMAL(12,2) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DetailTransaction_pkey" PRIMARY KEY ("id_detail")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id_payment" TEXT NOT NULL,
    "id_transaction" TEXT NOT NULL,
    "id_merchant" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'VERIFIED',
    "cash_received" DECIMAL(12,2),
    "change_amount" DECIMAL(12,2),
    "qris_code" TEXT,
    "transfer_ref" TEXT,
    "verified_at" TIMESTAMP(3),
    "verified_by" TEXT,
    "verification_note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id_payment")
);

-- CreateTable
CREATE TABLE "TransactionCorrection" (
    "id_correction" TEXT NOT NULL,
    "id_old_transaction" TEXT NOT NULL,
    "id_new_transaction" TEXT NOT NULL,
    "corrected_by" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TransactionCorrection_pkey" PRIMARY KEY ("id_correction")
);

-- CreateTable
CREATE TABLE "SyncQueue" (
    "id" TEXT NOT NULL,
    "id_device" TEXT NOT NULL,
    "id_transaction" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "payload" TEXT NOT NULL,
    "retry_count" INTEGER NOT NULL DEFAULT 0,
    "max_retries" INTEGER NOT NULL DEFAULT 3,
    "last_error" TEXT,
    "status" "SyncStatus" NOT NULL DEFAULT 'PENDING_SYNC',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SyncQueue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RefreshToken" (
    "id" TEXT NOT NULL,
    "id_user" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RefreshToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Reconciliation" (
    "id_reconciliation" TEXT NOT NULL,
    "id_transaction" TEXT NOT NULL,
    "id_merchant" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "evidence" TEXT,
    "handled_by" TEXT,
    "resolution" TEXT,
    "resolved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Reconciliation_pkey" PRIMARY KEY ("id_reconciliation")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_email_idx" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_role_idx" ON "User"("role");

-- CreateIndex
CREATE INDEX "Merchant_is_active_idx" ON "Merchant"("is_active");

-- CreateIndex
CREATE UNIQUE INDEX "Device_pairing_code_key" ON "Device"("pairing_code");

-- CreateIndex
CREATE INDEX "Device_id_merchant_idx" ON "Device"("id_merchant");

-- CreateIndex
CREATE INDEX "Device_id_user_idx" ON "Device"("id_user");

-- CreateIndex
CREATE UNIQUE INDEX "Device_id_merchant_device_id_hash_key" ON "Device"("id_merchant", "device_id_hash");

-- CreateIndex
CREATE INDEX "DeviceSyncLog_id_device_idx" ON "DeviceSyncLog"("id_device");

-- CreateIndex
CREATE INDEX "DeviceSyncLog_sync_timestamp_idx" ON "DeviceSyncLog"("sync_timestamp");

-- CreateIndex
CREATE INDEX "DeviceSyncLog_status_idx" ON "DeviceSyncLog"("status");

-- CreateIndex
CREATE INDEX "Product_id_merchant_idx" ON "Product"("id_merchant");

-- CreateIndex
CREATE UNIQUE INDEX "Product_id_merchant_sku_key" ON "Product"("id_merchant", "sku");

-- CreateIndex
CREATE UNIQUE INDEX "Inventory_id_product_key" ON "Inventory"("id_product");

-- CreateIndex
CREATE INDEX "Inventory_id_merchant_idx" ON "Inventory"("id_merchant");

-- CreateIndex
CREATE INDEX "StockHistory_id_product_idx" ON "StockHistory"("id_product");

-- CreateIndex
CREATE INDEX "StockHistory_id_merchant_idx" ON "StockHistory"("id_merchant");

-- CreateIndex
CREATE INDEX "StockHistory_date_idx" ON "StockHistory"("date");

-- CreateIndex
CREATE INDEX "StockHistory_movement_type_idx" ON "StockHistory"("movement_type");

-- CreateIndex
CREATE UNIQUE INDEX "Transaction_offline_uuid_key" ON "Transaction"("offline_uuid");

-- CreateIndex
CREATE INDEX "Transaction_id_merchant_idx" ON "Transaction"("id_merchant");

-- CreateIndex
CREATE INDEX "Transaction_id_user_idx" ON "Transaction"("id_user");

-- CreateIndex
CREATE INDEX "Transaction_id_device_idx" ON "Transaction"("id_device");

-- CreateIndex
CREATE INDEX "Transaction_status_idx" ON "Transaction"("status");

-- CreateIndex
CREATE INDEX "Transaction_sync_status_idx" ON "Transaction"("sync_status");

-- CreateIndex
CREATE INDEX "Transaction_created_at_idx" ON "Transaction"("created_at");

-- CreateIndex
CREATE INDEX "Transaction_confirmed_at_idx" ON "Transaction"("confirmed_at");

-- CreateIndex
CREATE INDEX "Transaction_synced_at_idx" ON "Transaction"("synced_at");

-- CreateIndex
CREATE UNIQUE INDEX "Transaction_id_device_offline_uuid_key" ON "Transaction"("id_device", "offline_uuid");

-- CreateIndex
CREATE INDEX "DetailTransaction_id_transaction_idx" ON "DetailTransaction"("id_transaction");

-- CreateIndex
CREATE INDEX "DetailTransaction_id_product_idx" ON "DetailTransaction"("id_product");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_id_transaction_key" ON "Payment"("id_transaction");

-- CreateIndex
CREATE INDEX "Payment_id_transaction_idx" ON "Payment"("id_transaction");

-- CreateIndex
CREATE INDEX "Payment_id_merchant_idx" ON "Payment"("id_merchant");

-- CreateIndex
CREATE INDEX "Payment_method_idx" ON "Payment"("method");

-- CreateIndex
CREATE INDEX "Payment_status_idx" ON "Payment"("status");

-- CreateIndex
CREATE INDEX "Payment_created_at_idx" ON "Payment"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "TransactionCorrection_id_new_transaction_key" ON "TransactionCorrection"("id_new_transaction");

-- CreateIndex
CREATE INDEX "TransactionCorrection_id_old_transaction_idx" ON "TransactionCorrection"("id_old_transaction");

-- CreateIndex
CREATE INDEX "TransactionCorrection_corrected_by_idx" ON "TransactionCorrection"("corrected_by");

-- CreateIndex
CREATE INDEX "TransactionCorrection_created_at_idx" ON "TransactionCorrection"("created_at");

-- CreateIndex
CREATE INDEX "SyncQueue_id_device_idx" ON "SyncQueue"("id_device");

-- CreateIndex
CREATE INDEX "SyncQueue_id_transaction_idx" ON "SyncQueue"("id_transaction");

-- CreateIndex
CREATE INDEX "SyncQueue_status_idx" ON "SyncQueue"("status");

-- CreateIndex
CREATE INDEX "SyncQueue_created_at_idx" ON "SyncQueue"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "RefreshToken_token_key" ON "RefreshToken"("token");

-- CreateIndex
CREATE INDEX "RefreshToken_id_user_idx" ON "RefreshToken"("id_user");

-- CreateIndex
CREATE INDEX "RefreshToken_token_idx" ON "RefreshToken"("token");

-- CreateIndex
CREATE UNIQUE INDEX "Reconciliation_id_transaction_key" ON "Reconciliation"("id_transaction");

-- CreateIndex
CREATE INDEX "Reconciliation_id_merchant_idx" ON "Reconciliation"("id_merchant");

-- CreateIndex
CREATE INDEX "Reconciliation_id_transaction_idx" ON "Reconciliation"("id_transaction");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_id_merchant_fkey" FOREIGN KEY ("id_merchant") REFERENCES "Merchant"("id_merchant") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Device" ADD CONSTRAINT "Device_id_merchant_fkey" FOREIGN KEY ("id_merchant") REFERENCES "Merchant"("id_merchant") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Device" ADD CONSTRAINT "Device_id_user_fkey" FOREIGN KEY ("id_user") REFERENCES "User"("id_user") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeviceSyncLog" ADD CONSTRAINT "DeviceSyncLog_id_device_fkey" FOREIGN KEY ("id_device") REFERENCES "Device"("id_device") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_id_merchant_fkey" FOREIGN KEY ("id_merchant") REFERENCES "Merchant"("id_merchant") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Inventory" ADD CONSTRAINT "Inventory_id_product_fkey" FOREIGN KEY ("id_product") REFERENCES "Product"("id_product") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Inventory" ADD CONSTRAINT "Inventory_id_merchant_fkey" FOREIGN KEY ("id_merchant") REFERENCES "Merchant"("id_merchant") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockHistory" ADD CONSTRAINT "StockHistory_id_product_fkey" FOREIGN KEY ("id_product") REFERENCES "Product"("id_product") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockHistory" ADD CONSTRAINT "StockHistory_id_merchant_fkey" FOREIGN KEY ("id_merchant") REFERENCES "Merchant"("id_merchant") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockHistory" ADD CONSTRAINT "StockHistory_id_user_fkey" FOREIGN KEY ("id_user") REFERENCES "User"("id_user") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockHistory" ADD CONSTRAINT "StockHistory_id_transaction_fkey" FOREIGN KEY ("id_transaction") REFERENCES "Transaction"("id_transaction") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockHistory" ADD CONSTRAINT "StockHistory_id_correction_fkey" FOREIGN KEY ("id_correction") REFERENCES "TransactionCorrection"("id_correction") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_voided_by_fkey" FOREIGN KEY ("voided_by") REFERENCES "User"("id_user") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_id_merchant_fkey" FOREIGN KEY ("id_merchant") REFERENCES "Merchant"("id_merchant") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_id_user_fkey" FOREIGN KEY ("id_user") REFERENCES "User"("id_user") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_id_device_fkey" FOREIGN KEY ("id_device") REFERENCES "Device"("id_device") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DetailTransaction" ADD CONSTRAINT "DetailTransaction_id_transaction_fkey" FOREIGN KEY ("id_transaction") REFERENCES "Transaction"("id_transaction") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DetailTransaction" ADD CONSTRAINT "DetailTransaction_id_product_fkey" FOREIGN KEY ("id_product") REFERENCES "Product"("id_product") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_verified_by_fkey" FOREIGN KEY ("verified_by") REFERENCES "User"("id_user") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_id_transaction_fkey" FOREIGN KEY ("id_transaction") REFERENCES "Transaction"("id_transaction") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_id_merchant_fkey" FOREIGN KEY ("id_merchant") REFERENCES "Merchant"("id_merchant") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransactionCorrection" ADD CONSTRAINT "TransactionCorrection_id_old_transaction_fkey" FOREIGN KEY ("id_old_transaction") REFERENCES "Transaction"("id_transaction") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransactionCorrection" ADD CONSTRAINT "TransactionCorrection_id_new_transaction_fkey" FOREIGN KEY ("id_new_transaction") REFERENCES "Transaction"("id_transaction") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransactionCorrection" ADD CONSTRAINT "TransactionCorrection_corrected_by_fkey" FOREIGN KEY ("corrected_by") REFERENCES "User"("id_user") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SyncQueue" ADD CONSTRAINT "SyncQueue_id_device_fkey" FOREIGN KEY ("id_device") REFERENCES "Device"("id_device") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SyncQueue" ADD CONSTRAINT "SyncQueue_id_transaction_fkey" FOREIGN KEY ("id_transaction") REFERENCES "Transaction"("id_transaction") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefreshToken" ADD CONSTRAINT "RefreshToken_id_user_fkey" FOREIGN KEY ("id_user") REFERENCES "User"("id_user") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reconciliation" ADD CONSTRAINT "Reconciliation_id_transaction_fkey" FOREIGN KEY ("id_transaction") REFERENCES "Transaction"("id_transaction") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reconciliation" ADD CONSTRAINT "Reconciliation_id_merchant_fkey" FOREIGN KEY ("id_merchant") REFERENCES "Merchant"("id_merchant") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reconciliation" ADD CONSTRAINT "Reconciliation_handled_by_fkey" FOREIGN KEY ("handled_by") REFERENCES "User"("id_user") ON DELETE RESTRICT ON UPDATE CASCADE;

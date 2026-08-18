-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('OWNER', 'ENTRY', 'OPERATOR');

-- CreateEnum
CREATE TYPE "TransactionStatus" AS ENUM ('PENDING', 'CONFIRMED');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'STATIC_QRIS', 'BANK_TRANSFER');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('VERIFIED', 'FAILED');

-- CreateEnum
CREATE TYPE "ReconciliationStatus" AS ENUM ('OPEN', 'RESOLVED_VALID', 'RESOLVED_INVALID');

-- CreateEnum
CREATE TYPE "SyncStatus" AS ENUM ('PENDING_SYNC', 'SYNCING', 'SYNCED', 'SYNC_FAILED', 'SYNC_CONFLICT');

-- CreateEnum
CREATE TYPE "SyncReceiptStatus" AS ENUM ('QUEUED', 'PROCESSING', 'SYNCED', 'CONFLICT', 'FAILED');

-- CreateEnum
CREATE TYPE "DeviceStatus" AS ENUM ('UNPAIRED', 'PAIRED', 'REVOKED');

-- CreateEnum
CREATE TYPE "StockMovementType" AS ENUM ('SALE', 'ADJUSTMENT', 'RETURN', 'CORRECTION');

-- CreateEnum
CREATE TYPE "CorrectionType" AS ENUM ('VOID', 'CORRECTION');

-- CreateEnum
CREATE TYPE "OutboxStatus" AS ENUM ('PENDING', 'PROCESSING', 'PROCESSED', 'FAILED');

-- CreateTable
CREATE TABLE "Merchant" (
    "id_merchant" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Jakarta',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "onboarded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Merchant_pkey" PRIMARY KEY ("id_merchant")
);

-- CreateTable
CREATE TABLE "User" (
    "id_user" TEXT NOT NULL,
    "id_merchant" TEXT NOT NULL,
    "full_name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "role" "UserRole" NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id_user")
);

-- CreateTable
CREATE TABLE "AuthSession" (
    "id_session" TEXT NOT NULL,
    "id_user" TEXT NOT NULL,
    "id_device" TEXT,
    "family_id" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "revoked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AuthSession_pkey" PRIMARY KEY ("id_session")
);

-- CreateTable
CREATE TABLE "AuthRefreshToken" (
    "id_token" TEXT NOT NULL,
    "id_session" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "used_at" TIMESTAMP(3),
    "revoked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuthRefreshToken_pkey" PRIMARY KEY ("id_token")
);

-- CreateTable
CREATE TABLE "Device" (
    "id_device" TEXT NOT NULL,
    "id_merchant" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "device_id_hash" TEXT,
    "pairing_code" TEXT,
    "pairing_expires_at" TIMESTAMP(3),
    "pairing_attempts" INTEGER NOT NULL DEFAULT 0,
    "status" "DeviceStatus" NOT NULL DEFAULT 'UNPAIRED',
    "last_online_at" TIMESTAMP(3),
    "last_sync_at" TIMESTAMP(3),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Device_pkey" PRIMARY KEY ("id_device")
);

-- CreateTable
CREATE TABLE "Product" (
    "id_product" TEXT NOT NULL,
    "id_merchant" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "price" INTEGER NOT NULL,
    "image_url" TEXT,
    "catalog_version" INTEGER NOT NULL DEFAULT 1,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "archived_at" TIMESTAMP(3),
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
    "last_updated" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Inventory_pkey" PRIMARY KEY ("id_inventory")
);

-- CreateTable
CREATE TABLE "Transaction" (
    "id_transaction" TEXT NOT NULL,
    "id_merchant" TEXT NOT NULL,
    "id_user" TEXT NOT NULL,
    "id_device" TEXT NOT NULL,
    "offline_uuid" TEXT NOT NULL,
    "payload_hash" TEXT NOT NULL,
    "status" "TransactionStatus" NOT NULL DEFAULT 'PENDING',
    "sync_status" "SyncStatus" NOT NULL DEFAULT 'PENDING_SYNC',
    "created_at_local" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmed_at" TIMESTAMP(3),
    "synced_at" TIMESTAMP(3),
    "total" INTEGER NOT NULL,
    "subtotal" INTEGER NOT NULL,
    "notes" TEXT,

    CONSTRAINT "Transaction_pkey" PRIMARY KEY ("id_transaction")
);

-- CreateTable
CREATE TABLE "DetailTransaction" (
    "id_detail" TEXT NOT NULL,
    "id_transaction" TEXT NOT NULL,
    "id_product" TEXT NOT NULL,
    "product_name" TEXT NOT NULL,
    "product_sku" TEXT NOT NULL,
    "catalog_version" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unit_price" INTEGER NOT NULL,
    "subtotal" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DetailTransaction_pkey" PRIMARY KEY ("id_detail")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id_payment" TEXT NOT NULL,
    "id_transaction" TEXT NOT NULL,
    "id_merchant" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "status" "PaymentStatus" NOT NULL,
    "cash_received" INTEGER,
    "change_amount" INTEGER,
    "qris_code" TEXT,
    "transfer_ref" TEXT,
    "verified_at" TIMESTAMP(3),
    "verified_by" TEXT,
    "verification_note" TEXT,
    "reconciliation_note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id_payment")
);

-- CreateTable
CREATE TABLE "PaymentReconciliation" (
    "id_reconciliation" TEXT NOT NULL,
    "id_merchant" TEXT NOT NULL,
    "id_payment" TEXT NOT NULL,
    "opened_by" TEXT NOT NULL,
    "resolved_by" TEXT,
    "id_correction" TEXT,
    "status" "ReconciliationStatus" NOT NULL DEFAULT 'OPEN',
    "reason" TEXT NOT NULL,
    "evidence_note" TEXT,
    "resolution_note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMP(3),
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentReconciliation_pkey" PRIMARY KEY ("id_reconciliation")
);

-- CreateTable
CREATE TABLE "TransactionCorrection" (
    "id_correction" TEXT NOT NULL,
    "id_old_transaction" TEXT NOT NULL,
    "id_new_transaction" TEXT,
    "corrected_by" TEXT NOT NULL,
    "type" "CorrectionType" NOT NULL,
    "reason" TEXT NOT NULL,
    "inventory_returned" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TransactionCorrection_pkey" PRIMARY KEY ("id_correction")
);

-- CreateTable
CREATE TABLE "StockHistory" (
    "id_stock" TEXT NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "id_product" TEXT NOT NULL,
    "id_merchant" TEXT NOT NULL,
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
CREATE TABLE "StockDiscrepancy" (
    "id_discrepancy" TEXT NOT NULL,
    "id_merchant" TEXT NOT NULL,
    "id_product" TEXT NOT NULL,
    "id_device" TEXT NOT NULL,
    "id_transaction" TEXT NOT NULL,
    "shortage" INTEGER NOT NULL,
    "resolved_at" TIMESTAMP(3),
    "resolution" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockDiscrepancy_pkey" PRIMARY KEY ("id_discrepancy")
);

-- CreateTable
CREATE TABLE "SyncReceipt" (
    "id_receipt" TEXT NOT NULL,
    "id_merchant" TEXT NOT NULL,
    "id_device" TEXT NOT NULL,
    "id_operator" TEXT NOT NULL,
    "offline_uuid" TEXT NOT NULL,
    "payload_hash" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "SyncReceiptStatus" NOT NULL DEFAULT 'QUEUED',
    "id_transaction" TEXT,
    "publish_attempts" INTEGER NOT NULL DEFAULT 0,
    "process_attempts" INTEGER NOT NULL DEFAULT 0,
    "retry_step" INTEGER NOT NULL DEFAULT 0,
    "retryable" BOOLEAN NOT NULL DEFAULT true,
    "last_error_code" TEXT,
    "last_error_message" TEXT,
    "next_publish_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "published_at" TIMESTAMP(3),
    "processing_at" TIMESTAMP(3),
    "terminal_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SyncReceipt_pkey" PRIMARY KEY ("id_receipt")
);

-- CreateTable
CREATE TABLE "AuditEvent" (
    "id_event" TEXT NOT NULL,
    "id_merchant" TEXT NOT NULL,
    "id_actor" TEXT,
    "action" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id_event")
);

-- CreateTable
CREATE TABLE "BackendOutbox" (
    "id_event" TEXT NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "id_merchant" TEXT NOT NULL,
    "id_transaction" TEXT,
    "event_type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "OutboxStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "available_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processed_at" TIMESTAMP(3),
    "last_error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BackendOutbox_pkey" PRIMARY KEY ("id_event")
);

-- CreateTable
CREATE TABLE "ReportingAppliedTransaction" (
    "id_application" TEXT NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "id_event" TEXT NOT NULL,
    "id_transaction" TEXT,
    "id_merchant" TEXT NOT NULL,
    "applied_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReportingAppliedTransaction_pkey" PRIMARY KEY ("id_application")
);

-- CreateTable
CREATE TABLE "MerchantDailySales" (
    "id_daily" TEXT NOT NULL,
    "id_merchant" TEXT NOT NULL,
    "sales_date" DATE NOT NULL,
    "gross_sales" INTEGER NOT NULL DEFAULT 0,
    "net_sales" INTEGER NOT NULL DEFAULT 0,
    "transaction_count" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MerchantDailySales_pkey" PRIMARY KEY ("id_daily")
);

-- CreateTable
CREATE TABLE "MerchantProductDailySales" (
    "id_product_daily" TEXT NOT NULL,
    "id_merchant" TEXT NOT NULL,
    "id_product" TEXT NOT NULL,
    "product_name" TEXT NOT NULL,
    "sales_date" DATE NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 0,
    "gross_sales" INTEGER NOT NULL DEFAULT 0,
    "net_sales" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MerchantProductDailySales_pkey" PRIMARY KEY ("id_product_daily")
);

-- CreateIndex
CREATE INDEX "Merchant_is_active_idx" ON "Merchant"("is_active");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_id_merchant_role_idx" ON "User"("id_merchant", "role");

-- CreateIndex
CREATE INDEX "User_is_active_idx" ON "User"("is_active");

-- A merchant has exactly one active primary Owner. Historical inactive Owner rows
-- remain available for audit, but onboarding cannot create a second active Owner.
CREATE UNIQUE INDEX "User_one_active_owner_per_merchant_key"
ON "User"("id_merchant")
WHERE "role" = 'OWNER' AND "is_active" = true;

-- CreateIndex
CREATE UNIQUE INDEX "AuthSession_family_id_key" ON "AuthSession"("family_id");

-- CreateIndex
CREATE INDEX "AuthSession_id_user_revoked_at_idx" ON "AuthSession"("id_user", "revoked_at");

-- CreateIndex
CREATE INDEX "AuthSession_id_device_revoked_at_idx" ON "AuthSession"("id_device", "revoked_at");

-- CreateIndex
CREATE INDEX "AuthSession_family_id_idx" ON "AuthSession"("family_id");

-- CreateIndex
CREATE INDEX "AuthSession_expires_at_idx" ON "AuthSession"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "AuthRefreshToken_token_hash_key" ON "AuthRefreshToken"("token_hash");

-- CreateIndex
CREATE INDEX "AuthRefreshToken_id_session_used_at_revoked_at_idx" ON "AuthRefreshToken"("id_session", "used_at", "revoked_at");

-- CreateIndex
CREATE INDEX "AuthRefreshToken_expires_at_idx" ON "AuthRefreshToken"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "Device_pairing_code_key" ON "Device"("pairing_code");

-- CreateIndex
CREATE INDEX "Device_id_merchant_status_idx" ON "Device"("id_merchant", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Device_id_merchant_device_id_hash_key" ON "Device"("id_merchant", "device_id_hash");

-- CreateIndex
CREATE INDEX "Product_id_merchant_is_active_idx" ON "Product"("id_merchant", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "Product_id_merchant_sku_key" ON "Product"("id_merchant", "sku");

-- CreateIndex
CREATE UNIQUE INDEX "Inventory_id_product_key" ON "Inventory"("id_product");

-- CreateIndex
CREATE INDEX "Inventory_id_merchant_idx" ON "Inventory"("id_merchant");

-- CreateIndex
CREATE INDEX "Transaction_id_merchant_created_at_idx" ON "Transaction"("id_merchant", "created_at");

-- CreateIndex
CREATE INDEX "Transaction_id_user_created_at_idx" ON "Transaction"("id_user", "created_at");

-- CreateIndex
CREATE INDEX "Transaction_id_device_created_at_idx" ON "Transaction"("id_device", "created_at");

-- CreateIndex
CREATE INDEX "Transaction_status_sync_status_idx" ON "Transaction"("status", "sync_status");

-- CreateIndex
CREATE UNIQUE INDEX "Transaction_id_device_offline_uuid_key" ON "Transaction"("id_device", "offline_uuid");

-- CreateIndex
CREATE INDEX "DetailTransaction_id_transaction_idx" ON "DetailTransaction"("id_transaction");

-- CreateIndex
CREATE INDEX "DetailTransaction_id_product_idx" ON "DetailTransaction"("id_product");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_id_transaction_key" ON "Payment"("id_transaction");

-- CreateIndex
CREATE INDEX "Payment_id_merchant_status_idx" ON "Payment"("id_merchant", "status");

-- CreateIndex
CREATE INDEX "Payment_method_created_at_idx" ON "Payment"("method", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentReconciliation_id_correction_key" ON "PaymentReconciliation"("id_correction");

-- CreateIndex
CREATE INDEX "PaymentReconciliation_id_merchant_status_created_at_idx" ON "PaymentReconciliation"("id_merchant", "status", "created_at");

-- CreateIndex
CREATE INDEX "PaymentReconciliation_id_payment_created_at_idx" ON "PaymentReconciliation"("id_payment", "created_at");

-- Reconciliation is an exception case: a payment may have history, but only one
-- unresolved investigation can exist at a time.
CREATE UNIQUE INDEX "PaymentReconciliation_one_open_case_per_payment_key"
ON "PaymentReconciliation"("id_payment")
WHERE "status" = 'OPEN';

-- CreateIndex
CREATE UNIQUE INDEX "TransactionCorrection_id_old_transaction_key" ON "TransactionCorrection"("id_old_transaction");

-- CreateIndex
CREATE UNIQUE INDEX "TransactionCorrection_id_new_transaction_key" ON "TransactionCorrection"("id_new_transaction");

-- CreateIndex
CREATE INDEX "TransactionCorrection_corrected_by_created_at_idx" ON "TransactionCorrection"("corrected_by", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "StockHistory_idempotency_key_key" ON "StockHistory"("idempotency_key");

-- CreateIndex
CREATE INDEX "StockHistory_id_product_date_idx" ON "StockHistory"("id_product", "date");

-- CreateIndex
CREATE INDEX "StockHistory_id_merchant_date_idx" ON "StockHistory"("id_merchant", "date");

-- CreateIndex
CREATE INDEX "StockHistory_movement_type_idx" ON "StockHistory"("movement_type");

-- CreateIndex
CREATE INDEX "StockDiscrepancy_id_merchant_resolved_at_idx" ON "StockDiscrepancy"("id_merchant", "resolved_at");

-- CreateIndex
CREATE UNIQUE INDEX "StockDiscrepancy_id_transaction_id_product_key" ON "StockDiscrepancy"("id_transaction", "id_product");

-- CreateIndex
CREATE UNIQUE INDEX "SyncReceipt_id_transaction_key" ON "SyncReceipt"("id_transaction");

-- CreateIndex
CREATE INDEX "SyncReceipt_status_next_publish_at_idx" ON "SyncReceipt"("status", "next_publish_at");

-- CreateIndex
CREATE INDEX "SyncReceipt_id_merchant_created_at_idx" ON "SyncReceipt"("id_merchant", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "SyncReceipt_id_device_offline_uuid_key" ON "SyncReceipt"("id_device", "offline_uuid");

-- CreateIndex
CREATE INDEX "AuditEvent_id_merchant_created_at_idx" ON "AuditEvent"("id_merchant", "created_at");

-- CreateIndex
CREATE INDEX "AuditEvent_entity_type_entity_id_idx" ON "AuditEvent"("entity_type", "entity_id");

-- CreateIndex
CREATE UNIQUE INDEX "BackendOutbox_idempotency_key_key" ON "BackendOutbox"("idempotency_key");

-- CreateIndex
CREATE INDEX "BackendOutbox_status_available_at_idx" ON "BackendOutbox"("status", "available_at");

-- CreateIndex
CREATE INDEX "BackendOutbox_id_merchant_created_at_idx" ON "BackendOutbox"("id_merchant", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "ReportingAppliedTransaction_idempotency_key_key" ON "ReportingAppliedTransaction"("idempotency_key");

-- CreateIndex
CREATE UNIQUE INDEX "ReportingAppliedTransaction_id_event_key" ON "ReportingAppliedTransaction"("id_event");

-- CreateIndex
CREATE INDEX "ReportingAppliedTransaction_id_merchant_applied_at_idx" ON "ReportingAppliedTransaction"("id_merchant", "applied_at");

-- CreateIndex
CREATE INDEX "MerchantDailySales_id_merchant_sales_date_idx" ON "MerchantDailySales"("id_merchant", "sales_date");

-- CreateIndex
CREATE UNIQUE INDEX "MerchantDailySales_id_merchant_sales_date_key" ON "MerchantDailySales"("id_merchant", "sales_date");

-- CreateIndex
CREATE INDEX "MerchantProductDailySales_id_merchant_sales_date_idx" ON "MerchantProductDailySales"("id_merchant", "sales_date");

-- CreateIndex
CREATE UNIQUE INDEX "MerchantProductDailySales_id_merchant_id_product_sales_date_key" ON "MerchantProductDailySales"("id_merchant", "id_product", "sales_date");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_id_merchant_fkey" FOREIGN KEY ("id_merchant") REFERENCES "Merchant"("id_merchant") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuthSession" ADD CONSTRAINT "AuthSession_id_user_fkey" FOREIGN KEY ("id_user") REFERENCES "User"("id_user") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuthSession" ADD CONSTRAINT "AuthSession_id_device_fkey" FOREIGN KEY ("id_device") REFERENCES "Device"("id_device") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuthRefreshToken" ADD CONSTRAINT "AuthRefreshToken_id_session_fkey" FOREIGN KEY ("id_session") REFERENCES "AuthSession"("id_session") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Device" ADD CONSTRAINT "Device_id_merchant_fkey" FOREIGN KEY ("id_merchant") REFERENCES "Merchant"("id_merchant") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_id_merchant_fkey" FOREIGN KEY ("id_merchant") REFERENCES "Merchant"("id_merchant") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Inventory" ADD CONSTRAINT "Inventory_id_product_fkey" FOREIGN KEY ("id_product") REFERENCES "Product"("id_product") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Inventory" ADD CONSTRAINT "Inventory_id_merchant_fkey" FOREIGN KEY ("id_merchant") REFERENCES "Merchant"("id_merchant") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_id_merchant_fkey" FOREIGN KEY ("id_merchant") REFERENCES "Merchant"("id_merchant") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_id_user_fkey" FOREIGN KEY ("id_user") REFERENCES "User"("id_user") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_id_device_fkey" FOREIGN KEY ("id_device") REFERENCES "Device"("id_device") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DetailTransaction" ADD CONSTRAINT "DetailTransaction_id_transaction_fkey" FOREIGN KEY ("id_transaction") REFERENCES "Transaction"("id_transaction") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DetailTransaction" ADD CONSTRAINT "DetailTransaction_id_product_fkey" FOREIGN KEY ("id_product") REFERENCES "Product"("id_product") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_id_transaction_fkey" FOREIGN KEY ("id_transaction") REFERENCES "Transaction"("id_transaction") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_id_merchant_fkey" FOREIGN KEY ("id_merchant") REFERENCES "Merchant"("id_merchant") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_verified_by_fkey" FOREIGN KEY ("verified_by") REFERENCES "User"("id_user") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentReconciliation" ADD CONSTRAINT "PaymentReconciliation_id_merchant_fkey" FOREIGN KEY ("id_merchant") REFERENCES "Merchant"("id_merchant") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentReconciliation" ADD CONSTRAINT "PaymentReconciliation_id_payment_fkey" FOREIGN KEY ("id_payment") REFERENCES "Payment"("id_payment") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentReconciliation" ADD CONSTRAINT "PaymentReconciliation_opened_by_fkey" FOREIGN KEY ("opened_by") REFERENCES "User"("id_user") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentReconciliation" ADD CONSTRAINT "PaymentReconciliation_resolved_by_fkey" FOREIGN KEY ("resolved_by") REFERENCES "User"("id_user") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentReconciliation" ADD CONSTRAINT "PaymentReconciliation_id_correction_fkey" FOREIGN KEY ("id_correction") REFERENCES "TransactionCorrection"("id_correction") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransactionCorrection" ADD CONSTRAINT "TransactionCorrection_id_old_transaction_fkey" FOREIGN KEY ("id_old_transaction") REFERENCES "Transaction"("id_transaction") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransactionCorrection" ADD CONSTRAINT "TransactionCorrection_id_new_transaction_fkey" FOREIGN KEY ("id_new_transaction") REFERENCES "Transaction"("id_transaction") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransactionCorrection" ADD CONSTRAINT "TransactionCorrection_corrected_by_fkey" FOREIGN KEY ("corrected_by") REFERENCES "User"("id_user") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockHistory" ADD CONSTRAINT "StockHistory_id_product_fkey" FOREIGN KEY ("id_product") REFERENCES "Product"("id_product") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockHistory" ADD CONSTRAINT "StockHistory_id_merchant_fkey" FOREIGN KEY ("id_merchant") REFERENCES "Merchant"("id_merchant") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockHistory" ADD CONSTRAINT "StockHistory_id_user_fkey" FOREIGN KEY ("id_user") REFERENCES "User"("id_user") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockHistory" ADD CONSTRAINT "StockHistory_id_transaction_fkey" FOREIGN KEY ("id_transaction") REFERENCES "Transaction"("id_transaction") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockHistory" ADD CONSTRAINT "StockHistory_id_correction_fkey" FOREIGN KEY ("id_correction") REFERENCES "TransactionCorrection"("id_correction") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockDiscrepancy" ADD CONSTRAINT "StockDiscrepancy_id_merchant_fkey" FOREIGN KEY ("id_merchant") REFERENCES "Merchant"("id_merchant") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockDiscrepancy" ADD CONSTRAINT "StockDiscrepancy_id_product_fkey" FOREIGN KEY ("id_product") REFERENCES "Product"("id_product") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockDiscrepancy" ADD CONSTRAINT "StockDiscrepancy_id_device_fkey" FOREIGN KEY ("id_device") REFERENCES "Device"("id_device") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockDiscrepancy" ADD CONSTRAINT "StockDiscrepancy_id_transaction_fkey" FOREIGN KEY ("id_transaction") REFERENCES "Transaction"("id_transaction") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SyncReceipt" ADD CONSTRAINT "SyncReceipt_id_merchant_fkey" FOREIGN KEY ("id_merchant") REFERENCES "Merchant"("id_merchant") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SyncReceipt" ADD CONSTRAINT "SyncReceipt_id_device_fkey" FOREIGN KEY ("id_device") REFERENCES "Device"("id_device") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SyncReceipt" ADD CONSTRAINT "SyncReceipt_id_operator_fkey" FOREIGN KEY ("id_operator") REFERENCES "User"("id_user") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SyncReceipt" ADD CONSTRAINT "SyncReceipt_id_transaction_fkey" FOREIGN KEY ("id_transaction") REFERENCES "Transaction"("id_transaction") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_id_merchant_fkey" FOREIGN KEY ("id_merchant") REFERENCES "Merchant"("id_merchant") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_id_actor_fkey" FOREIGN KEY ("id_actor") REFERENCES "User"("id_user") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BackendOutbox" ADD CONSTRAINT "BackendOutbox_id_merchant_fkey" FOREIGN KEY ("id_merchant") REFERENCES "Merchant"("id_merchant") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BackendOutbox" ADD CONSTRAINT "BackendOutbox_id_transaction_fkey" FOREIGN KEY ("id_transaction") REFERENCES "Transaction"("id_transaction") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportingAppliedTransaction" ADD CONSTRAINT "ReportingAppliedTransaction_id_transaction_fkey" FOREIGN KEY ("id_transaction") REFERENCES "Transaction"("id_transaction") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportingAppliedTransaction" ADD CONSTRAINT "ReportingAppliedTransaction_id_event_fkey" FOREIGN KEY ("id_event") REFERENCES "BackendOutbox"("id_event") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportingAppliedTransaction" ADD CONSTRAINT "ReportingAppliedTransaction_id_merchant_fkey" FOREIGN KEY ("id_merchant") REFERENCES "Merchant"("id_merchant") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MerchantDailySales" ADD CONSTRAINT "MerchantDailySales_id_merchant_fkey" FOREIGN KEY ("id_merchant") REFERENCES "Merchant"("id_merchant") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MerchantProductDailySales" ADD CONSTRAINT "MerchantProductDailySales_id_merchant_fkey" FOREIGN KEY ("id_merchant") REFERENCES "Merchant"("id_merchant") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MerchantProductDailySales" ADD CONSTRAINT "MerchantProductDailySales_id_product_fkey" FOREIGN KEY ("id_product") REFERENCES "Product"("id_product") ON DELETE RESTRICT ON UPDATE CASCADE;

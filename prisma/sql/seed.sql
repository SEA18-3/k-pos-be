-- Seed Data untuk Load Test

-- 1. Insert Merchant
INSERT INTO "Merchant" (id_merchant, name, created_at, updated_at)
VALUES ('M-LOAD', 'Merchant Load Test', NOW(), NOW())
ON CONFLICT (id_merchant) DO NOTHING;

-- 2. Insert User (Kasir)
-- Password bcrypt dari "password123": $2b$10$wO0Q3oXgKxL5v0qVjQdXZ.YtO5HnE/8cQ5WwY6e0wYfF8KxQvQjM2
INSERT INTO "User" (id_user, id_merchant, full_name, email, password, role, is_active, created_at, updated_at)
-- nosemgrep
VALUES ('U-LOAD-KASIR', 'M-LOAD', 'Kasir Load Test', 'kasir@load.com', '$2b$10$wO0Q3oXgKxL5v0qVjQdXZ.YtO5HnE/8cQ5WwY6e0wYfF8KxQvQjM2', 'OPERATOR', true, NOW(), NOW())
ON CONFLICT (email) DO NOTHING;

-- 3. Insert Device
INSERT INTO "Device" (id_device, id_merchant, id_user, name, status, is_active, created_at, updated_at)
VALUES ('DEV-LOAD-TEST', 'M-LOAD', 'U-LOAD-KASIR', 'Device Load Test', 'PAIRED', true, NOW(), NOW())
ON CONFLICT (id_device) DO NOTHING;

-- 4. Insert Product
INSERT INTO "Product" (id_product, id_merchant, name, sku, price, is_active, created_at, updated_at)
VALUES ('dummy-product-id', 'M-LOAD', 'Produk Load Test', 'SKU-LOAD-1', 10000, true, NOW(), NOW())
ON CONFLICT (id_product) DO NOTHING;

-- 5. Insert Inventory
INSERT INTO "Inventory" (id_inventory, id_product, id_merchant, current_stock, last_updated)
VALUES ('INV-LOAD-1', 'dummy-product-id', 'M-LOAD', 999999, NOW())
ON CONFLICT (id_product) DO NOTHING;

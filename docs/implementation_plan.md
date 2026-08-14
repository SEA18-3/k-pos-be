# Implementation Plan - K-POS Backend

## 1. Development Rules

### 1.1 Pedoman NFR
Seluruh implementasi harus mengacu pada NFR yang telah didefinisikan di `docs/NFR.md`. Berikut adalah target yang harus menjadi acuan saat menulis kode:
- Waktu respons satu transaksi di backend (validasi + confirm + inventory update) harus selesai di bawah 200 ms.
- Satu batch 100 transaksi harus selesai diproses worker dalam waktu kurang dari 5 detik.
- Rate limiting wajib diterapkan pada endpoint login (brute-force protection, NFR-SEC-06).
- Password harus di-hash menggunakan bcrypt atau argon2; tidak boleh disimpan dalam bentuk plaintext (NFR-SEC-01).
- Seluruh komunikasi antar service menggunakan HTTPS/TLS (NFR-SEC-02).
- Seluruh input dari request body harus divalidasi di layer controller sebelum masuk ke service (NFR-SEC-07).

### 1.2 Clean Code dan Maintainability
- **Design Patterns (Creational, Structural, Behavioral):**
  - **Creational:** *Dependency Injection (DI)* via NestJS IoC container dan *Singleton* untuk semua Services.
  - **Structural:** *Data Transfer Object (DTO)* untuk standarisasi format komunikasi, serta *Decorator Pattern* (`@Injectable()`, `@Controller()`) bawaan framework.
  - **Behavioral:** *Strategy Pattern* (misal: `JwtStrategy` untuk validasi token) dan *Service Pattern* (memusatkan logika bisnis dan pemanggilan ORM Prisma di layer service.).
- **Separation of Concerns:** Logika bisnis hanya boleh berada di layer service. Controller hanya bertanggung jawab atas parsing request dan formatting response. Tidak boleh ada logika bisnis di controller.
- **Naming Convention:** Gunakan `camelCase` untuk variabel dan fungsi, `PascalCase` untuk class dan DTO, `SCREAMING_SNAKE_CASE` untuk konstanta dan enum.
- **Satu File, Satu Tanggung Jawab:** Setiap service, controller, dan modul harus memiliki satu tanggung jawab yang jelas dan tidak melakukan operasi di luar domain-nya.
- **Tidak Ada Magic Number:** Semua nilai statis yang bermakna bisnis (misal: ukuran batch, durasi token) harus didefinisikan sebagai konstanta bernama atau environment variable.
- **Structured Logging:** Setiap operasi penting (create provisional, sync attempt, validation result, conflict detected) harus menghasilkan log terstruktur menggunakan `nestjs-pino`.

### 1.3 Testing
- Setiap service wajib memiliki unit test yang menguji logika bisnis secara terisolasi (mock dependency).
- Setiap endpoint wajib memiliki integration test yang menguji alur end-to-end (request masuk hingga response keluar).
- Coverage target minimum: 70% pada core modules (transaction, sync, auth).
- Test tidak boleh bergantung pada state database yang persisten; gunakan transaksi database yang di-rollback setelah setiap test, atau database terpisah.

### 1.4 GitHub Workflow
| Aturan | Detail |
|---|---|
| **Penamaan branch** | `feature/<nama-fitur>`, `fix/<nama-bug>`, `chore/<nama-task>`, `docs/<nama-dokumen>` |
| **Target PR** | Semua PR harus diarahkan ke branch `develop`, bukan `main` |
| **Kewajiban PR** | Tidak ada direct push ke `develop` atau `main`. Semua perubahan harus melalui Pull Request |
| **PR kecil** | Usahakan setiap PR berfokus pada satu fitur atau perbaikan. Hindari PR raksasa yang menyentuh banyak modul sekaligus |
| **Status CI** | PR hanya boleh di-merge apabila seluruh pipeline CI (lint, test) berjalan hijau |
| **Branch `main`** | Hanya menerima merge dari `develop` pada saat rilis resmi |

---

## 2. Pemetaan Dependensi dan Paralelisasi (Workflow Paralel)

```text
[TAHAP-0: setup infrastruktur] ............... SELESAI
       |
       v
[TAHAP-1: perbaikan skema] ................... SELESAI
       |
       v
[TAHAP-2: auth (lanjutan)] ................... SELESAI
       |
       +=======================================+
       |         PARALEL 1           |
       |                                       |
[TAHAP-3A: merchant]                    [TAHAP-3B: device]
       |                                       |
       v                                       |
[TAHAP-4: product]                             |
       |                                       |
       +=======================================+
       |
       v
[TAHAP-5: transaction core] .................. TO-DO
       |
       +=======================================+
       |         PARALEL 2           |
       |                                       |
[TAHAP-6A: sync pipeline]               [TAHAP-6B: payment]
       |                                       |
       v                                       |
[TAHAP-7: reconciliation]                      |
       |                                       |
       +=======================================+
       |
       v
[TAHAP-8: integration test] .................. TO-DO
       |
       v
[TAHAP-9: finalisasi & rilis] ................ TO-DO
```

**Keterangan Paralelisasi:**
- **Warna Hijau**: Selesai.
- **Warna Ungu**: Dapat dikerjakan secara paralel (bersamaan) oleh developer berbeda.
- **Warna Biru**: Menunggu tahap sebelumnya selesai (sekuensial).
- **Paralel 1:** *Device Pairing* dapat dikerjakan tanpa perlu menunggu *Merchant* selesai. *Product* baru bisa dikerjakan setelah *Merchant* selesai.
- **Paralel 2:** *Sync Pipeline* (RabbitMQ) dan *Payment* bisa dikerjakan berbarengan setelah *Transaction Core* selesai.

---

## 3. Rincian Tahap Pengerjaan

### TAHAP-0: Setup Infrastruktur - SELESAI

**To-Do:**
- [x] Setup NestJS, Prisma, ESLint, Prettier, Jest.
- [x] Global ValidationPipe, ExceptionFilter, TransformInterceptor, Swagger.
- [x] Buat `docker-compose.yml` untuk PostgreSQL + RabbitMQ.
- [x] Buat `prisma/seed.ts` untuk data awal.

### TAHAP-1: Perbaikan Skema & Arsitektur - SELESAI

**To-Do:**
- [x] Revisi Enum `UserRole` (ADMIN, OWNER, OPERATOR, ENTRY).
- [x] Hapus model `UserMerchant`, relasi `User` ke `Merchant` menjadi N:1.
- [x] Refactor `StockHistory` (hapus `reference_id` polymorphic).
- [x] Arsitektur Koreksi Transaksi (Tabel Jembatan `TransactionCorrection`).
- [x] Tambah model `RefreshToken`.
- [x] Hapus `sync_version`.

### TAHAP-2: Auth (Lanjutan) - SELESAI

**Branch:** `feature/user-authentication`

**To-Do:**
- [x] Implementasi `POST /auth/register` - Hanya untuk **OWNER** (self-serve onboarding). Role selalu `OWNER`, tidak bisa dipilih.
- [x] Implementasi `POST /auth/login` - Semua role, login dengan email + password.
- [x] Modifikasi login untuk mereturn `refresh_token` (opaque hex, bukan JWT).
- [x] Implementasi `POST /auth/refresh` dan `POST /auth/logout`.
- [x] Implementasi `GET /auth/profile` - Mendapatkan profil user yang sedang login (butuh JWT).
- [x] Pasang `ThrottlerModule` (Rate limiting pada endpoint login).
- [x] Unit test `auth.service.spec.ts` dengan mock `PrismaService` & `JwtService`.

### TAHAP-3A: Merchant & User Management - TO-DO (PARALEL)

**Branch:** `feature/merchant`

**To-Do:**
- [ ] Implementasi Endpoint Merchant:
  - [ ] `GET /merchants/me` - (OWNER/OPERATOR/ENTRY) Ambil profil merchant dari user yang sedang login via JWT.
- [ ] Implementasi Endpoint User Management:
  - [ ] `POST /users` - (OWNER) Buat akun `OPERATOR` atau `ENTRY` baru yang langsung terikat ke merchant si OWNER. Request body: `full_name`, `email`, `password`, `role`. Response menyertakan `id_merchant`.
  - [ ] `GET /users` - (OWNER) Lihat daftar seluruh user di merchantnya (filter by `role`, `is_active`).
  - [ ] `PATCH /users/:id_user/status` - (OWNER) Aktifkan/nonaktifkan akun user (`is_active`). Sebagai pengganti delete permanen.
- [ ] Unit test lengkap untuk `MerchantsService` dan `UsersService`.

### TAHAP-3B: Device Pairing Flow - TO-DO (PARALEL)

**Branch:** `feature/device-pairing`

**To-Do:**
- [ ] Update Schema Prisma: Tambah `pairing_code` (opsional, String?) dan `DeviceStatus` (enum `UNPAIRED, PAIRED, REVOKED`) ke tabel `Device`. Jadikan `device_id_hash` opsional sebelum pairing. Jalankan migrasi.
- [ ] Implementasi Endpoint Device:
  - [ ] `POST /devices` - (OWNER) Daftarkan device baru, generate `pairing_code` 6 digit unik. Response: `{ id_device, pairing_code, status: "UNPAIRED" }`.
  - [ ] `POST /devices/pair` - (OPERATOR/Public) Input `pairing_code` + `hardware_id`. Lock `hardware_id` ke `device_id_hash`, ubah status ke `PAIRED`, null-kan `pairing_code`. Response: `{ id_device, status: "PAIRED" }`.
  - [ ] `GET /devices` - (OWNER) List device aktif beserta statusnya (`id_device`, `status`, `device_id_hash`, `created_at`).
  - [ ] `DELETE /devices/:id_device` - (OWNER) Soft delete device (`is_active = false`, status `REVOKED`).
- [ ] Unit test lengkap untuk `DevicesService`.

### TAHAP-4: Product & Inventory - TO-DO

**Branch:** `feature/product`

**To-Do:**
- [ ] Implementasi Endpoint Product & Inventory:
  - [ ] `GET /products` - (Semua Role) List produk merchant + stok terkini. Query params: `page`, `limit`, `search` (by `name`/`sku`), `is_active`. Response menyertakan nested `inventory` (`current_stock`, `reserved`, `last_updated`).
  - [ ] `POST /products` - (OWNER/ENTRY) Tambah produk & otomatis buat record `Inventory` dengan `current_stock = 0`. Request: `name`, `sku`, `price`.
  - [ ] `PATCH /products/:id_product` - (OWNER/ENTRY) Update detail produk (`name`, `sku`, `price`). Semua field opsional.
  - [ ] `POST /products/:id_product/stock` - (OWNER/ENTRY) Penyesuaian stok manual. Request: `quantity` (positif/negatif), `notes`. Mencatat `StockHistory` dengan `movement_type = ADJUSTMENT`.
  - [ ] `DELETE /products/:id_product` - (OWNER/ENTRY) Soft delete produk (`is_active = false`).
- [ ] Unit test lengkap untuk `ProductsService` dan operasi `Inventory`.

### TAHAP-5: Transaction Core - TO-DO

**Branch:** `feature/transaction-core`

**To-Do:**
- [ ] Implementasi Endpoint Transaction:
  - [ ] `GET /transactions` - (Semua Role) List transaksi. Query params: `status` (`PENDING`, `CONFIRMED`, `VOIDED`, `FAILED`), `sync_status` (`PENDING_SYNC`, `SYNCING`, `SYNCED`, `SYNC_FAILED`, `SYNC_CONFLICT`), `id_device`, `page`, `limit`, `start_date`, `end_date`. OPERATOR hanya melihat transaksi merchantnya.
  - [ ] `GET /transactions/:id_transaction` - Detail transaksi beserta array `details` (item per produk: `id_detail`, `id_product`, `quantity`, `unit_price`, `subtotal`) dan object `payment` (`id_payment`, `amount`, `method`, `status`, `cash_received`, `change_amount`, `qris_code`, `transfer_ref`, `verified_at`).
  - [ ] `PATCH /transactions/:id_transaction/void` - (OPERATOR) Request body: `{ void_reason }`. OPERATOR hanya bisa void transaksi berstatus `PENDING`. OWNER/ADMIN bisa void `PENDING` atau `CONFIRMED`.
- [ ] Logika State Machine di `TransactionService` untuk mencegah transisi status tidak valid.
- [ ] Immutability Guard: Cegah void/modifikasi transaksi `CONFIRMED` oleh OPERATOR (response: `TRANSACTION_IMMUTABLE`).
- [ ] Unit test lengkap untuk `TransactionService`.

### TAHAP-6A: Sync Pipeline & Offline Worker - TO-DO (PARALEL)

**Branch:** `feature/sync-pipeline`

**To-Do:**
- [ ] Implementasi Endpoint Sync:
  - [ ] `POST /sync` - Terima batch transaksi (maks 100) dari OPERATOR, publish ke queue RabbitMQ `sync.transactions`. Request body per item: `offline_uuid`, `id_device`, `created_at_local`, `subtotal`, `total`, `notes`, `items[]` (`id_product`, `quantity`, `unit_price`, `subtotal`), `payment` (`method`, `amount`, `cash_received`, `change_amount`, `qris_code`, `transfer_ref`).
- [ ] Setup Konfigurasi RabbitMQ (Resilience):
  - [ ] Konfigurasi *Dead Letter Exchange* (DLX) dan *Dead Letter Queue* (DLQ) untuk pesan gagal.
  - [ ] Implementasi mekanisme *Retry* (maksimal 3 kali) untuk *Transient Error* (misal: koneksi DB putus).
  - [ ] Pesan *malformed* langsung di-reject tanpa *requeue* agar dibuang ke DLX.
- [ ] Implementasi RabbitMQ Consumer (Worker):
  - [ ] Idempotency Check: Cek tabel `Transaction` dengan `offline_uuid`. Jika duplikat, acknowledge & skip.
  - [ ] Business Validation: Pastikan produk aktif dan stok cukup.
  - [ ] Success Flow: Simpan `Transaction` + `DetailTransaction[]` + `Payment`, kurangi stok (`SELECT ... FOR UPDATE`), set `status = CONFIRMED`, `sync_status = SYNCED`.
  - [ ] Conflict Flow: Jika stok habis, simpan ke DB dengan `sync_status = SYNC_CONFLICT` (bukan ke DLX). Akan direkonsiliasi oleh OWNER/ADMIN.
- [ ] Unit test untuk pipeline Sinkronisasi dan Worker RabbitMQ.

### TAHAP-6B: Payment Handling - TO-DO (PARALEL)

**Branch:** `feature/payment`

**To-Do:**
- [ ] Payment tidak memiliki endpoint tersendiri — detail payment sudah di-embed dalam `GET /transactions/:id_transaction` (field `payment`).
- [ ] Implementasi logika payment di dalam worker sync (TAHAP-6A):
  - [ ] `CASH`: `amount`, `cash_received`, `change_amount`. Status langsung `VERIFIED`.
  - [ ] `STATIC_QRIS`: `amount`, `qris_code`. Status `OPERATOR_ASSERTED` — perlu rekonsiliasi jika ditemukan salah.
  - [ ] `BANK_TRANSFER`: `amount`, `transfer_ref`. Status `OPERATOR_ASSERTED` — perlu rekonsiliasi.
- [ ] Unit test untuk logika Payment creation.

### TAHAP-7: Reconciliation (OWNER/ADMIN) - TO-DO

**Branch:** `feature/reconciliation`

**To-Do:**
- [ ] Implementasi Endpoint Rekonsiliasi (OWNER dan ADMIN saja):
  - [ ] Filter `GET /transactions?sync_status=SYNC_CONFLICT` - Menggunakan endpoint `GET /transactions` yang sudah ada (tidak perlu endpoint baru). OWNER hanya melihat merchant miliknya.
  - [ ] `POST /transactions/:id_transaction/resolve` - Selesaikan konflik `SYNC_CONFLICT` secara manual. Request: `{ action: "CONFIRM" | "VOID", notes }`. Response: `{ id_transaction, status, sync_status: "SYNCED", confirmed_at }`.
  - [ ] `POST /transactions/:id_transaction/correct` - Koreksi transaksi `CONFIRMED`. Buat *Immutable Bridge* ke `TransactionCorrection`. Request: `{ reason, items[], subtotal, total }`. Response: `{ id_correction, id_old_transaction, id_new_transaction, corrected_by, reason, created_at }`.
- [ ] Unit test untuk skenario Exception/Reconciliation Workflow.

### TAHAP-8: Integration Test - TO-DO

**Branch:** `feature/integration-test`

**To-Do:**
- [ ] Buat skenario End-to-End Test:
  - [ ] Skenario sukses: Register OWNER -> Login -> `POST /users` (buat OPERATOR) -> Device Pairing -> `POST /products` -> `POST /sync` -> Cek `GET /transactions` status `SYNCED`.
  - [ ] Skenario idempotency: Kirim dua `POST /sync` dengan `offline_uuid` yang sama, pastikan hanya satu transaksi yang tersimpan.
  - [ ] Skenario konflik stok: Sync transaksi ketika stok habis, pastikan `sync_status = SYNC_CONFLICT`.
  - [ ] Skenario reconciliation: `POST /transactions/:id_transaction/resolve` setelah konflik stok.
  - [ ] Skenario koreksi: `POST /transactions/:id_transaction/correct` pada transaksi `CONFIRMED`, validasi `TransactionCorrection` terbuat dan transaksi original tidak berubah.

### TAHAP-9: Finalisasi dan Rilis - TO-DO

**Branch:** `chore/final-integration`

**To-Do:**
- [ ] Periksa kembali keseluruhan *codebase* terhadap NFR dan `docs/api_contract.md`.
- [ ] Pastikan `.env.example` sinkron dengan *environment variables* yang digunakan.
- [ ] Gabung ke branch `main` dan pastikan sukses di-deploy ke environment produksi.

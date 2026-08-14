# Implementation Plan — K-POS Backend

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

## 2. Pemetaan Dependensi dan Paralelisasi

```
[TAHAP-0: setup infrastruktur] ............... SELESAI
       |
       v
[TAHAP-1: perbaikan skema] ................... SELESAI
       |
       +---------------------------------------+
       |                                       |
       v                                       v
[TAHAP-2: auth (lanjutan)] ................... SELESAI
       |
       v
[TAHAP-3: merchant & device] ................. TO-DO
       |
       v
[TAHAP-4: product] ........................... TO-DO
       |
       v
[TAHAP-5: transaction core] .................. TO-DO
       |
       +---------------------------------------+
       |                                       |
       v                                       v
[TAHAP-6: sync pipeline + payment] ........... TO-DO
       |                                       |
       v                                       v
[TAHAP-7: reconciliation] .................... TO-DO
       |
       v
[TAHAP-8: integration test] .................. TO-DO
       |
       v
[TAHAP-9: finalisasi & rilis] ................ TO-DO
```

**Keterangan:**
- **Bisa paralel:** TAHAP-6 (sync + payment) dan TAHAP-7 (reconciliation) dapat dikerjakan bersamaan setelah TAHAP-5 selesai.
- **Sekuensial:** TAHAP-3 (merchant & device) perlu auth selesai. TAHAP-4 (product) perlu merchant selesai. TAHAP-5 perlu product selesai. TAHAP-8 baru dimulai setelah seluruh business logic selesai.

---

## 3. Rincian Tahap Pengerjaan

### TAHAP-0: Setup Infrastruktur — SELESAI

**Branch:** `chore/setup`

**To-Do:**
- [x] Setup NestJS, Prisma, ESLint, Prettier, Jest.
- [x] Global ValidationPipe, ExceptionFilter, TransformInterceptor, Swagger.
- [x] Buat `docker-compose.yml` untuk PostgreSQL + RabbitMQ.
- [x] Buat `prisma/seed.ts` untuk data awal.

### TAHAP-1: Perbaikan Skema & Arsitektur — SELESAI

**Branch:** `feature/schema-refactor`

**To-Do:**
- [x] Revisi Enum `UserRole` (ADMIN, OWNER, OPERATOR, ENTRY).
- [x] Hapus model `UserMerchant`, relasi `User` ke `Merchant` menjadi N:1.
- [x] Refactor `StockHistory` (hapus `reference_id` polymorphic).
- [x] Arsitektur Koreksi Transaksi (Tabel Jembatan `TransactionCorrection`).
- [x] Tambah model `RefreshToken`.
- [x] Hapus `sync_version`.

### TAHAP-2: Auth (Lanjutan) — SELESAI

**Branch:** `feature/auth`

**To-Do:**
- [x] Implementasi `POST /auth/register` dan `POST /auth/login`.
- [x] Modifikasi login untuk mereturn `refresh_token`.
- [x] Implementasi `POST /auth/refresh` dan `POST /auth/logout`.
- [x] Pasang `ThrottlerModule` (Rate limiting pada endpoint login).
- [x] Unit test `auth.service.spec.ts` dengan mock `PrismaService` & `JwtService`.

### TAHAP-3: Merchant dan Device (Device Pairing Flow) — TO-DO

**Branch:** `feature/merchant-device`

**To-Do:**
- [ ] Update Schema Prisma: Tambah `pairing_code` (opsional) dan status `DeviceStatus` (enum `UNPAIRED, PAIRED, REVOKED`) ke tabel `Device`. Jadikan `device_id_hash` opsional. Jalankan migrasi.
- [ ] Implementasi Endpoint Merchant:
  - [ ] `GET /merchants/me` — Ambil profil merchant dari user (Owner/Kasir) yang sedang login via JWT.
- [ ] Implementasi Endpoint Device:
  - [ ] `POST /devices` — (Owner/Admin) Daftarkan device baru, generate `pairing_code` 6 digit unik.
  - [ ] `POST /devices/pair` — (Kasir/Public) Input `pairing_code` dan `hardware_id`. Lock `hardware_id` ke `device_id_hash`, ubah status ke `PAIRED`, null-kan `pairing_code`.
  - [ ] `GET /devices` — (Owner/Admin) List device aktif beserta statusnya.
  - [ ] `DELETE /devices/:id` — (Owner/Admin) Soft delete device (`is_active = false`).
- [ ] Unit test lengkap untuk `MerchantsService` dan `DevicesService`.

### TAHAP-4: Product — TO-DO

**Branch:** `feature/product`

**To-Do:**
- [ ] Implementasi Endpoint Product:
  - [ ] `GET /products` — List produk merchant + stok (Pagination, Search by name/SKU, Filter `is_active`).
  - [ ] `POST /products` — (Admin/Owner/Entry) Tambah produk & otomatis buat relasi tabel `Inventory` dengan `current_stock = 0`.
  - [ ] `PATCH /products/:id` — (Admin/Owner/Entry) Update detail produk (Nama, SKU, Harga).
  - [ ] `DELETE /products/:id` — (Admin/Owner/Entry) Soft delete produk.
- [ ] Unit test lengkap untuk `ProductsService`.

### TAHAP-5: Transaction Core — TO-DO

**Branch:** `feature/transaction-core`

**To-Do:**
- [ ] Implementasi Endpoint Transaction:
  - [ ] `GET /transactions` — List transaksi (Filter status, date, device). Kasir hanya melihat transaksi merchant-nya.
  - [ ] `GET /transactions/:id` — Detail transaksi beserta `DetailTransaction` (item) dan `Payment`.
  - [ ] `PATCH /transactions/:id/void` — (Kasir) Membatalkan transaksi. Hanya transaksi berstatus `PENDING` yang bisa di-`VOID`.
- [ ] Logika State Machine di `TransactionService` untuk mencegah transisi status tidak valid.
- [ ] Immutability Guard: Cegah pengubahan/void transaksi yang sudah berstatus `CONFIRMED` kecuali melalui prosedur rekonsiliasi oleh Admin.
- [ ] Unit test lengkap untuk `TransactionService`.

### TAHAP-6: Sync Pipeline dan Payment — TO-DO

**Branch:** `feature/sync-pipeline`

**To-Do:**
- [ ] Implementasi Endpoint Sync:
  - [ ] `POST /sync` — Terima batch transaksi (maks 100), publish ke queue RabbitMQ `sync.transactions`.
- [ ] Setup Konfigurasi RabbitMQ (Edge Cases & Resilience):
  - [ ] Konfigurasi *Dead Letter Exchange* (DLX) dan *Dead Letter Queue* (DLQ) untuk menampung pesan yang gagal.
  - [ ] Implementasi mekanisme *Retry* (maksimal 3 kali) untuk *Transient Error* (contoh: koneksi database putus tiba-tiba).
  - [ ] Pesan *malformed* (payload rusak/tidak sesuai) langsung di-reject (tanpa *requeue*) agar otomatis dibuang ke DLX.
- [ ] Implementasi RabbitMQ Consumer (Worker):
  - [ ] Idempotency Check: Cek tabel `Transaction` dengan `offline_uuid` untuk mencegah duplikasi (Jika duplikat, acknowledge pesan dan *skip*).
  - [ ] Business Validation: Pastikan produk aktif dan stok cukup.
  - [ ] Success Flow: Simpan transaksi, simpan payment, kurangi stok (dengan mekanisme `SELECT ... FOR UPDATE`), tandai status `CONFIRMED`.
  - [ ] Conflict Flow (Business Error): Jika stok habis, **JANGAN** masukkan ke DLX. Pesan tetap dianggap "sukses diproses" namun disimpan ke database dengan status `SYNC_CONFLICT` agar direkonsiliasi oleh Admin.
- [ ] Implementasi Endpoint Payment:
  - [ ] `GET /payments/:transactionId` — Ambil detail pembayaran.
- [ ] Unit test untuk pipeline Sinkronisasi dan Worker RabbitMQ.

### TAHAP-7: Reconciliation (Admin) — TO-DO

**Branch:** `feature/reconciliation`

**To-Do:**
- [ ] Implementasi Endpoint Rekonsiliasi (berlaku khusus Role Admin):
  - [ ] `GET /transactions?sync_status=SYNC_CONFLICT` — List transaksi bermasalah.
  - [ ] `POST /transactions/:id/resolve` — Selesaikan konflik stok secara manual (tetap confirm atau paksa void).
  - [ ] `POST /transactions/:id/correct` — Lakukan koreksi untuk transaksi `CONFIRMED`. Buat *Immutable Bridge* ke tabel `TransactionCorrection` sehingga transaksi original tidak terganggu.
- [ ] Unit test khusus untuk skenario Exception/Reconciliation Workflow.

### TAHAP-8: Integration Test — TO-DO

**Branch:** `feature/integration-test`

**To-Do:**
- [ ] Buat skenario End-to-End Test:
  - [ ] Skenario sukses (Pairing -> Login -> Sync Batch -> Confirmed).
  - [ ] Skenario idempotency (Kirim dua batch dengan `offline_uuid` sama).
  - [ ] Skenario konflik stok (Produk habis saat sync).
  - [ ] Skenario koreksi Admin (Immutable Bridge validation).

### TAHAP-9: Finalisasi dan Rilis — TO-DO

**Branch:** `chore/final-integration`

**To-Do:**
- [ ] Periksa kembali keseluruhan *codebase* terhadap NFR dan API Contract.
- [ ] Pastikan `.env.example` sinkron dengan *environment variables* yang digunakan.
- [ ] Update dokumentasi *Postman Collection* / `api_contract.md`.
- [ ] Gabung ke branch `main` dan pastikan sukses di-deploy ke environment produksi (contoh: Render/Vercel).

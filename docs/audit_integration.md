# Audit Kodebase vs integration.md & implementation_plan_integration.md
> Branch: `develop` | Tanggal: 2026-08-18

---

## Ringkasan Status

| Prioritas | Total Item | ✅ DONE | 🟡 PARTIAL | ❌ MISSING |
|---|---|---|---|---|
| 🔴 TINGGI | 7 | 7 | 0 | 0 |
| 🟡 MENENGAH | 11 | 5 | 2 | 4 |
| 🟢 RENDAH | 7 | 2 | 0 | 5 |

---

## 🔴 TINGGI — Semua Selesai

| # | Item | Status | Catatan |
|---|---|---|---|
| 1 | Schema: hapus `ADMIN` dari `UserRole` | ✅ DONE | `enum UserRole { OWNER, OPERATOR, ENTRY }` |
| 2 | Schema: hapus `PENDING` & `RECONCILED` dari `PaymentStatus` | ✅ DONE | `enum PaymentStatus { VERIFIED, FAILED }` |
| 3 | Schema: tambah `ReconciliationStatus` + model `Reconciliation` | ✅ DONE | Lengkap dengan `id_payment`, `opened_by`, `status`, `resolved_by`, dll |
| 4 | Schema: tambah `payload_hash` ke `Transaction` | ✅ DONE | Field opsional ada di schema |
| 5 | Schema: tambah snapshot fields ke `DetailTransaction` | ✅ DONE | `product_name`, `sku_snapshot`, `catalog_version` |
| 6 | Worker: semua payment → `VERIFIED` | ✅ DONE | `sync-consumer.service.ts` set `status: PaymentStatus.VERIFIED` |
| 7 | `main.ts`: start degraded (try/catch `startAllMicroservices`) | ✅ DONE | Baris 90–98 `main.ts` sudah wrap dalam try/catch |
| 8 | `GET /api/v1/sync/status?offline_uuid=` | ✅ DONE | `SyncController.getStatus()` + `SyncService.getStatusByOfflineUuids()` |

---

## 🟡 MENENGAH — Ada yang Perlu Perhatian

| # | Item | Status | Catatan |
|---|---|---|---|
| 9 | Worker: simpan `product_name`, `sku_snapshot`, `catalog_version` di `DetailTransaction` | ✅ DONE | `sync-consumer.service.ts` sudah menyimpan snapshot fields |
| 10 | Producer: confirm channel + `persistent: true` + timeout 503 | 🟡 PARTIAL | `amqp-connection-manager` dipakai, tapi belum ada **publisher confirm** (`waitForConfirms()`) + belum return 503 jika Rabbit gagal |
| 11 | Validasi subtotal/total arithmetic di worker | ✅ DONE | `processTransaction()` memvalidasi arithmetic sebelum menyimpan |
| 12 | Tiga TTL retry queues (5s→30s→120s) + DLQ consumer terminal `FAILED` | 🟡 PARTIAL | Retry queue ada (`publishToRetry`), DLQ consumer ada (`handleDlqMessage`), tapi TTL delay queue belum dikonfigurasi via dead-letter exchange |
| 13 | `PaymentsController`: `GET /payments`, `POST /payments/:id/reconcile` | ✅ DONE | Tapi endpoint rekonsiliasi dipindahkan ke `ReconciliationsController` (`POST /reconciliations`, `POST /reconciliations/:id/resolve`) |
| 14 | Payment reconciliation: Owner resolve exception → `VALID` atau `INVALID` | ✅ DONE | `reconciliations.service.ts` sudah menangani `RESOLVED_VALID` dan `RESOLVED_INVALID` secara atomik |
| 15 | Owner confirm conflict (negative stock diperbolehkan) + void conflict | ❌ MISSING | Belum ada endpoint `POST /transactions/:id/confirm-conflict` |
| 16 | Idempotency: cek `payload_hash` di worker → 409 `IDEMPOTENCY_PAYLOAD_MISMATCH` | ❌ MISSING | `payload_hash` dihitung di `sync.service.ts` (validateBatch) dan dilempar `ConflictException`, tapi hash belum disimpan ke DB (`payload_hash: null` di consumer) |
| 17 | `X-Device-ID` header → `id_device` dihapus dari DTO | ❌ MISSING | `id_device` masih ada di `SyncTransactionDto`, padahal harusnya dari `X-Device-ID` header saja |
| 18 | Auth: access token expiry 15 menit | ❌ MISSING | Env default `1d`, tidak hardcode 15 menit |
| 19 | Auth: rotating refresh token (hapus token lama saat refresh) | ❌ MISSING | Refresh token tersimpan di DB tapi belum ada invalidasi token lama |
| 20 | Auth: refresh token via `HttpOnly` cookie | ❌ MISSING | Refresh token dikirim di body, bukan cookie |
| 21 | Device revoke/logout → invalidate sesi terkait | ❌ MISSING | Logout ada, tapi tidak mencabut semua refresh token device |

---

## 🟢 RENDAH — Belum Diimplementasikan

| # | Item | Status |
|---|---|---|
| 22 | Signed offline lease JWT 7 hari terikat merchant + device + Operator | ❌ MISSING |
| 23 | Device offline buka sesi Operator terakhir | ❌ MISSING |
| 24 | Wire money: migrasi `Decimal` → `Int` rupiah | ❌ MISSING |
| 25 | `GET /api/v1/owner/dashboard` reporting | ❌ MISSING |
| 26 | PostgreSQL outbox + idempotent daily/product projections | ❌ MISSING |

---

## Dockerfile & Render — Perlu Fix

### Dockerfile (kondisi sekarang)
```dockerfile
CMD ["sh", "-c", "npx prisma db push --accept-data-loss && npm run start:prod"]
```
**Masalah**: `prisma db push` membutuhkan `DIRECT_URL` (non-pooled connection Supabase), bukan `DATABASE_URL` yang pakai pooler (port 6543). Jika tidak diset, `db push` akan gagal.

### Environment Variables yang Harus Diisi di Render

| Variable | Nilai | Keterangan |
|---|---|---|
| `DATABASE_URL` | `postgresql://postgres.[proj]:[pw]@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres?pgbouncer=true` | Connection pooler Supabase |
| `DIRECT_URL` | `postgresql://postgres.[proj]:[pw]@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres` | Direct connection (untuk `db push`) |
| `JWT_SECRET` | string random panjang | Wajib, jangan pakai default |
| `RABBITMQ_URL` | `amqps://[user]:[pw]@chimpanzee.rmq.cloudamqp.com/[vhost]` | CloudAMQP URL |
| `PORT` | `3000` | Port container |
| `API_PREFIX` | `/api/v1` | Global prefix |
| `CORS_ORIGINS` | URL frontend FE | Contoh: `https://k-pos.vercel.app` |
| `NODE_ENV` | `production` | Sudah ada di Dockerfile |
| `JWT_EXPIRATION_TIME` | `15m` | Sesuai requirement integration.md |

### render.yaml — Perlu Tambah
```yaml
      - key: RABBITMQ_URL
        sync: false
      - key: JWT_EXPIRATION_TIME
        sync: false
```
Saat ini `render.yaml` tidak punya `RABBITMQ_URL` sehingga consumer tidak akan terkoneksi ke CloudAMQP.

---

## Yang Perlu Segera Diperbaiki (Sebelum Deploy)

1. **`render.yaml`**: Tambah `RABBITMQ_URL` dan `DIRECT_URL` ke daftar env vars
2. **`Dockerfile`**: Sudah benar secara struktur, tapi perlu dipastikan `DIRECT_URL` diset di Render
3. **Publisher confirm**: Producer belum pakai `waitForConfirms()` — sync silently gagal tanpa 503
4. **`payload_hash` disimpan ke DB**: Worker memasukkan `payload_hash: null` ke DB, sehingga idempotency mismatch check tidak pernah trigger


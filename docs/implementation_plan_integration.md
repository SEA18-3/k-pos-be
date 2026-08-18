# Integration.md — Audit & Implementation Plan (Final)

> Dokumen ini memetakan seluruh poin `integration.md` terhadap kondisi kodebase saat ini.
> **Satu-satunya bagian yang dimodifikasi** dari `integration.md` adalah rancangan `SyncReceipt`, yang
> telah disesuaikan menjadi *Broker-first durable acceptance boundary* tanpa tabel receipt sementara,
> sesuai dengan kesepakatan desain terakhir. Semua poin lainnya mengikuti `integration.md` sepenuhnya, 
> dan tidak ada yang di-skip.

---

## Status Legend
- ✅ **DONE** — Sudah diimplementasikan sepenuhnya
- 🟡 **PARTIAL** — Sudah ada tapi belum lengkap
- ❌ **MISSING** — Belum ada, perlu dibuat
- 🔵 **MODIFIED** — Dimodifikasi dari `integration.md` (khusus bagian SyncReceipt)

---

## Bagian 1: Canonical Backend Contract

### 1A. Role Enum
| Poin integration.md | Status | Prioritas | Keterangan |
|---|---|---|---|
| Role hanya: `OWNER`, `ENTRY`, `OPERATOR` | 🟡 PARTIAL | 🟡 MENENGAH | `ADMIN` masih ada di enum `UserRole` |
| `ADMIN` dihapus dari schema + semua guard/controller | ❌ MISSING | 🟡 MENENGAH | Butuh migrasi DB + update semua guard/controller |

---

### 1B. Auth
| Poin integration.md | Status | Prioritas |
|---|---|---|
| Access token 15 menit di memory | 🟡 PARTIAL | 🟡 MENENGAH |
| Rotating refresh session 7 hari via `HttpOnly`, `Secure`, `SameSite` cookie | ❌ MISSING | 🟡 MENENGAH |
| Refresh token rotating: setiap refresh, token lama dihapus | ❌ MISSING | 🟡 MENENGAH |
| Login/refresh menghasilkan signed offline lease 7 hari terikat merchant + device + Operator | ❌ MISSING | 🟢 RENDAH |
| Device offline bisa buka sesi Operator terakhir; ganti Operator butuh online auth | ❌ MISSING | 🟢 RENDAH |
| Logout/deactivation/password change/device revoke → invalidate sesi terkait (tanpa hapus queued tx) | ❌ MISSING | 🟡 MENENGAH |
| Device = shared merchant counter, Operator identity dari authenticated session, merchant + device diverifikasi server-side | 🟡 PARTIAL | 🟡 MENENGAH |

---

### 1C. Sync — `X-Device-ID` Header
| Poin integration.md | Status | Prioritas |
|---|---|---|
| `X-Device-ID` authoritative di header | ❌ MISSING | 🟡 MENENGAH |
| `id_device` dihapus dari `SyncTransactionDto` (item body) | ❌ MISSING | 🟡 MENENGAH |

---

### 1D. Idempotency — Canonical Payload Hash
| Poin integration.md | Status | Prioritas |
|---|---|---|
| `(deviceId, offlineUuid)` unique → idempotent | ✅ DONE | — |
| UUID v4 dan v7 diterima | ✅ DONE | — |
| Same key + same payload = idempotent (skip) | ✅ DONE | — |
| Same key + different payload = 409 `IDEMPOTENCY_PAYLOAD_MISMATCH` seluruh batch ditolak | ❌ MISSING | 🟡 MENENGAH |
| Canonical payload hash disimpan di DB | ❌ MISSING | 🟡 MENENGAH |

---

### 1E. Response Envelope
| Poin integration.md | Status | Prioritas |
|---|---|---|
| Success: `{ status, message, data }` | ✅ DONE | — |
| Error: `{ status: "error", message, error: { code, details, request_id } }` | 🟡 PARTIAL | 🟢 RENDAH |
| Semua endpoint pakai `/api/v1`, `snake_case`, parameter route `:id` | 🟡 PARTIAL | 🟢 RENDAH |

---

## Bagian 2: Durable RabbitMQ Sync (Modifikasi SyncReceipt)

> **Desain yang disepakati untuk menggantikan SyncReceipt:**
> - Broker menjadi durable acceptance boundary tanpa tabel `SyncReceipt` di DB.
> - Publish message secara persistent dan tunggu publisher confirm (RabbitMQ).
> - Status dipoll lewat satu endpoint gabungan `GET /api/v1/sync/status?offline_uuid=...`
> - Response: `{ offline_uuid, status: "SYNCED | CONFLICT | FAILED | UNKNOWN", transaction_id, error }`
> - `UNKNOWN` bukan berarti `QUEUED`. FE mempertahankan local outbox dan retry via `POST /sync` setelah polling timeout. Duplicate publish aman karena idempotency.

| Poin integration.md | Status | Prioritas | Catatan |
|---|---|---|---|
| `POST /api/v1/sync` max 100, chunk 25 dari FE | ✅ DONE | — | |
| All-or-nothing validation: 1 item malformed → reject seluruh batch | ✅ DONE | — | |
| API membuat/reuse `SyncReceipt` atomik sebelum publish | 🔵 MODIFIED | — | Dihapus (diganti broker-first durable acceptance) |
| Publisher confirm: Rabbit gagal → 503 retryable | ❌ MISSING | 🔴 TINGGI | Harus pakai `amqp-connection-manager` confirm channel + `persistent: true` + timeout |
| Response 200: `{ accepted, queued_at }` | ✅ DONE | — | |
| Receipt dispatcher retry jika Rabbit gagal | 🔵 MODIFIED | — | Dihapus (karena tidak ada SyncReceipt) |
| `GET /api/v1/sync/receipts?offline_uuid=...` | 🔵 MODIFIED | 🔴 TINGGI | Diganti menjadi `GET /api/v1/sync/status?offline_uuid=...` |
| Response: receipt ID, status `QUEUED\|PROCESSING\|...` | 🔵 MODIFIED | 🔴 TINGGI | Diganti: `{ offline_uuid, status: "SYNCED\|CONFLICT\|FAILED\|UNKNOWN", ... }` |
| `POST /api/v1/sync/receipts/:id/retry` (Owner retry) | 🔵 MODIFIED | — | Dihapus (FE retry via local outbox ke `POST /sync`) |
| ACK hanya setelah PostgreSQL commit | ✅ DONE | — | |
| Transient error → tiga TTL retry queues (5s → 30s → 120s backoff) | ❌ MISSING | 🟡 MENENGAH | |
| Permanent error → DLQ langsung | ❌ MISSING | 🟡 MENENGAH | |
| DLQ consumer mengubah status menjadi terminal `FAILED` | ❌ MISSING | 🟡 MENENGAH | |
| Stock shortage → `PENDING + CONFLICT` | ✅ DONE | — | |
| Owner confirm conflict: stock movement diterapkan tepat sekali, negative stock diperbolehkan, discrepancy dicatat | ❌ MISSING | 🟡 MENENGAH | |
| Owner void conflict: transaction effectively void tanpa stock movement | 🟡 PARTIAL | 🟡 MENENGAH | `voidTransaction` ada tapi belum khusus untuk CONFLICT |
| Start degraded: HTTP API tetap hidup jika Rabbit down | ❌ MISSING | 🔴 TINGGI | `main.ts` crash jika Rabbit unavailable saat startup |

---

## Bagian 3: Transaction, Payment, Catalog, Reporting

### Transaction
| Poin integration.md | Status | Prioritas |
|---|---|---|
| Confirmed transaction append-only | ✅ DONE | — |
| Void/correction = `TransactionCorrection` row baru; original tetap `CONFIRMED` | ✅ DONE | — |
| Transaction item simpan: product ID, **name, SKU, unit-price snapshot, catalog version** | ❌ MISSING | 🟡 MENENGAH |
| Sale dari stale offline catalog diterima (product dari merchant yang sama, termasuk yang di-archive) | ✅ DONE | — |
| Wire money = **integer rupiah** (bukan Decimal) | 🟡 PARTIAL | 🟢 RENDAH |
| Backend validasi subtotal/total arithmetic (tidak repricing) | ❌ MISSING | 🟡 MENENGAH |

### Payment Lifecycle

> **ADR-001: Payment Status Simplification**
> Pembayaran non-cash (QRIS/Transfer) tidak memerlukan rekonsiliasi manual sebagai *normal operation*. Semua pembayaran (Cash/QRIS/Transfer) masuk sebagai `VERIFIED`. Fitur rekonsiliasi tetap ada tetapi hanya sebagai *exception workflow* jika belakangan ditemukan masalah.

| Poin integration.md | Status | Prioritas |
|---|---|---|
| Semua payment (Cash/QRIS/Transfer) → `VERIFIED` | ❌ MISSING | 🔴 TINGGI |
| Tabel `Reconciliation` terpisah untuk exception workflow | ❌ MISSING | 🔴 TINGGI |
| Owner resolve exception → `VALID` (transaksi tetap) atau `INVALID` (payment `FAILED` + void/correction) | ❌ MISSING | 🟡 MENENGAH |
| Payment reconciliation list + mutation + audit event | ❌ MISSING | 🟡 MENENGAH |

### Reporting
| Poin integration.md | Status | Prioritas |
|---|---|---|
| `GET /api/v1/owner/dashboard?from=&to=` | ❌ MISSING | 🟢 RENDAH |
| PostgreSQL outbox + idempotent daily/product projections | ❌ MISSING | 🟢 RENDAH |
| Dashboard memuat: gross/net sales, tx count, AOV, daily series, top products, `data_as_of`, `projection_lag_seconds` | ❌ MISSING | 🟢 RENDAH |
| Default 30 hari, maks 90 hari, timezone merchant | ❌ MISSING | 🟢 RENDAH |
| Hapus penuh business insight/AI | ✅ DONE | — |

---

## Bagian 4: Deployment
| Poin integration.md | Status | Prioritas |
|---|---|---|
| Consumer dalam Nest API process | ✅ DONE | — |
| HTTP dapat start degraded ketika broker unavailable | ❌ MISSING | 🔴 TINGGI |
| Hapus penuh AI/Business Insight | ✅ DONE | — |

---

## Public API yang Harus Ada (Sesuai modifikasi SyncReceipt)

| Endpoint | Status | Prioritas |
|---|---|---|
| `POST /api/v1/sync` | ✅ DONE | — |
| `GET /api/v1/sync/status?offline_uuid=...` | ❌ MISSING | 🔴 TINGGI |
| `GET /api/v1/payments` | ❌ MISSING | 🟡 MENENGAH |
| `POST /api/v1/payments/:id/reconcile` | ❌ MISSING | 🟡 MENENGAH |
| `GET /api/v1/owner/dashboard?from=&to=` | ❌ MISSING | 🟢 RENDAH |

---

## Schema Changes yang Dibutuhkan

```diff
 enum UserRole {
-  ADMIN
   OWNER
   OPERATOR
   ENTRY
 }

 enum PaymentStatus {
-  PENDING
   VERIFIED
-  RECONCILED
   FAILED
 }

+enum ReconciliationStatus {
+  OPEN
+  RESOLVED_VALID
+  RESOLVED_INVALID
+}

+model Reconciliation {
+  id_reconciliation  String               @id @default(cuid())
+  id_payment         String
+  opened_by          String
+  reason             String
+  evidence_note      String?
+  status             ReconciliationStatus @default(OPEN)
+  resolved_by        String?
+  resolved_at        DateTime?
+  resolution_note    String?
+  id_correction      String?
+  created_at         DateTime             @default(now())
+  updated_at         DateTime             @updatedAt
+
+  payment            Payment   @relation(fields: [id_payment], references: [id_payment])
+  openedByUser       User      @relation("OpenedReconciliations", fields: [opened_by], references: [id_user])
+  resolvedByUser     User?     @relation("ResolvedReconciliations", fields: [resolved_by], references: [id_user])
+
+  @@index([id_payment])
+  @@index([status])
+  @@index([opened_by])
+}

 model Transaction {
   // existing fields...
+  payload_hash  String?   // canonical payload hash untuk idempotency mismatch check
 }

 model DetailTransaction {
   // existing fields...
+  product_name      String    // snapshot nama produk saat transaksi
+  sku_snapshot      String    // snapshot SKU saat transaksi
+  catalog_version   DateTime  // updated_at produk saat transaksi (audit trail)
 }
```

---

## Prioritas Akhir

### 🔴 TINGGI — Selesaikan sebelum submission

| # | Item | File yang diubah |
|---|---|---|
| 1 | Schema: hapus `PENDING` & `RECONCILED` dari `PaymentStatus`, tambah model `Reconciliation`, hapus `ADMIN` dari `UserRole`, tambah `payload_hash` ke `Transaction`, tambah snapshot fields ke `DetailTransaction` | `schema.prisma` |
| 2 | `prisma migrate dev` + regenerate client | — |
| 3 | Worker: Semua payment → `VERIFIED` (hapus `PENDING`) | `sync-consumer.service.ts` |
| 4 | Worker: simpan `product_name`, `sku_snapshot`, `catalog_version` di `DetailTransaction` | `sync-consumer.service.ts` |
| 5 | Producer: confirm channel via `amqp-connection-manager` + `persistent: true` + timeout 5000ms + 503 | `sync-producer.service.ts` |
| 6 | `GET /api/v1/sync/status?offline_uuid=` → response `UNKNOWN\|SYNCED\|CONFLICT\|FAILED` | `sync.controller.ts`, `sync.service.ts` |
| 7 | `main.ts`: start degraded — try/catch pada `startAllMicroservices()` | `main.ts` |

### 🟡 MENENGAH — Fitur inti

| # | Item | File yang diubah |
|---|---|---|
| 8 | `PaymentsController`: `GET /payments`, `POST /payments/:id/reconcile` | `payments.controller.ts`, `payments.service.ts` |
| 9 | Payment reconciliation: Owner resolve exception → `VALID` (tetap VERIFIED) atau `INVALID` (payment FAILED + void) | `payments.service.ts` |
| 10 | Owner confirm conflict (negative stock diperbolehkan, discrepancy dicatat) + void conflict | `transactions.service.ts` |
| 11 | Idempotency: cek `payload_hash` di worker → 409 `IDEMPOTENCY_PAYLOAD_MISMATCH` | `sync-consumer.service.ts` |
| 12 | Tiga TTL retry queues (5s → 30s → 120s) + DLQ consumer → terminal `FAILED` | `sync-producer.service.ts`, consumer baru |
| 13 | `X-Device-ID` header → `id_device` dihapus dari `SyncTransactionDto` | `sync.controller.ts`, `sync-batch.dto.ts`, `sync-consumer.service.ts` |
| 14 | Validasi subtotal/total arithmetic di worker | `sync-consumer.service.ts` |
| 15 | Auth: access token expiry → `'15m'` | `auth.service.ts` / env |
| 16 | Auth: rotating refresh token (hapus token lama saat refresh) | `auth.service.ts` |
| 17 | Auth: refresh token via `HttpOnly` cookie | `auth.controller.ts` |
| 18 | Device revoke/logout/password change → invalidate sesi terkait | `auth.service.ts`, `devices.service.ts` |

### 🟢 RENDAH — Enhancement / Future Work

| # | Item |
|---|---|
| 19 | Signed offline lease JWT 7 hari terikat merchant + device + Operator |
| 20 | Device offline buka sesi Operator terakhir; ganti Operator butuh online auth |
| 21 | Wire money: migrasi `Decimal` → `Int` rupiah |
| 22 | `GET /api/v1/owner/dashboard` reporting (gross/net, top products, daily series, projection) |
| 23 | PostgreSQL outbox + idempotent daily/product projections |
| 24 | Error envelope: standarisasi `error.code` + `request_id` di semua respons |
| 25 | Quorum queue RabbitMQ untuk toleransi node failure |

---

## Delivery Sequence

```
Fase 1 — ~3 jam (Prioritas TINGGI):
  1. schema.prisma (+ migrate + regenerate)
  2. sync-consumer.service.ts (payment status, DetailTransaction snapshot)
  3. sync-producer.service.ts (confirm channel)
  4. sync.controller.ts + sync.service.ts (GET /sync/status)
  5. main.ts (start degraded)

Fase 2 — ~3 jam (Payments + Reconciliation):
  6. payments.controller.ts + payments.service.ts
  7. Conflict resolution (confirm + void)

Fase 3 — ~2 jam (Idempotency + Retry):
  8. sync-consumer.service.ts (payload hash check + 409)
  9. RabbitMQ TTL retry queues + DLQ consumer

Fase 4 — Auth + Breaking Changes:
  10. Auth: 15m token + rotating refresh + HttpOnly cookie
  11. X-Device-ID header (koordinasi FE)
  12. Hapus ADMIN role (koordinasi semua guard)
```

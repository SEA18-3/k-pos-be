# K-POS Canonical Contract dan Cross-Repo Integration

## Summary

Jadikan `k-pos-be/develop` sebagai backend resmi dan repository COMPOS sebagai tiga frontend K-POS. Perbaiki kontradiksi requirements lebih dahulu, freeze OpenAPI backend, lalu adapt frontend. Existing Fastify `apps/api` dihapus penuh setelah seluruh behavior dipindahkan ke NestJS.

Source precedence:

1. Case/project overview.
2. FRD dan NFR.
3. Architecture dan user flows.
4. API contract.
5. Current code.

Public brand menjadi **K-POS**. Role canonical hanya:

- `OPERATOR`: offline checkout.
- `ENTRY`: catalog dan inventory.
- `OWNER`: satu primary Owner per merchant, user/device administration, reconciliation, dan reporting.
- `ADMIN` dihapus; “admin” hanya nama capability Owner.

## Implementation Changes

### 1. Canonical backend contract

- Rewrite seluruh tujuh docs agar role, state machine, permissions, API, dan implementation status konsisten. Tambahkan ADR, ERD, testing strategy, deployment/runbook, dan traceability.
- Auth memakai email/password:
  - Owner registration membuat merchant dan satu primary Owner.
  - Owner hanya dapat membuat Entry atau Operator.
  - Access token 15 menit di memory.
  - Rotating refresh session 7 hari melalui `HttpOnly`, `Secure`, `SameSite` cookie.
  - Login/refresh menghasilkan signed offline lease tujuh hari yang terikat merchant, device, dan Operator.
  - Device offline dapat membuka sesi Operator terakhir; pergantian Operator memerlukan online authentication.
  - Logout/deactivation/password change/device revoke menginvalidasi sesi terkait tanpa menghapus queued transaction.
- Device menjadi shared merchant counter, bukan milik permanen user. Operator identity selalu berasal dari authenticated session; merchant dan device diverifikasi server-side.
- Exactly-once boundary memakai unique `(deviceId, offlineUuid)` plus canonical payload hash. UUID v4 dan v7 diterima; same key/same payload bersifat idempotent, same key/different payload menolak seluruh batch dengan `409 IDEMPOTENCY_PAYLOAD_MISMATCH`.
- Standard response tetap `{ status, message, data }`; error menjadi `{ status: "error", message, error: { code, details, request_id } }`. Semua endpoint dan examples menggunakan `/api/v1`, `snake_case`, dan parameter route `:id`.

### 2. Durable RabbitMQ sync

- `POST /api/v1/sync` menerima maksimum 100 transaction; Operator PWA mengirim chunk 25. `X-Device-ID` authoritative dan `id_device` dihapus dari item body.
- Seluruh request-shape validation bersifat all-or-nothing. Jika satu item malformed, batch ditolak dan tidak ada receipt/publish.
- API atomically membuat/reuse durable `SyncReceipt`, lalu publish persistent messages dengan publisher confirm. Response tetap `200` dengan `accepted` count dan `queued_at`; artinya queued, bukan settled.
- Jika receipt tersimpan tetapi Rabbit gagal, API mengembalikan retryable `503`; receipt dispatcher akan mencoba publish kembali. REST non-sync tetap hidup dalam degraded mode.
- Status dipoll lewat `GET /api/v1/sync/receipts` dengan repeated `offline_uuid` query, maksimum 100. Response item memuat receipt ID, offline UUID, `QUEUED | PROCESSING | SYNCED | CONFLICT | FAILED`, canonical transaction ID, error, dan timestamp.
- Consumer berada dalam Nest API process sesuai keputusan deployment. ACK hanya setelah PostgreSQL commit. Transient error memakai tiga TTL retry queues dengan backoff 5 detik, 30 detik, dan 120 detik; permanent error langsung DLQ.
- DLQ consumer mengubah receipt menjadi terminal `FAILED`. Owner dapat melihat failure dan menjalankan owner-only retry untuk error yang diklasifikasikan retryable.
- Stock shortage menghasilkan `PENDING + CONFLICT`. Owner dapat:
  - Confirm: stock movement diterapkan tepat sekali, negative stock diperbolehkan, discrepancy dicatat.
  - Void: transaction menjadi effectively void tanpa stock movement.
- Local state dipisah dari backend:
  - `PROVISIONAL → QUEUED → SETTLED | CONFLICT | FAILED`.
  - IndexedDB tetap menyimpan immutable transaction/receipt history; delivery outbox dibersihkan setelah terminal.

### 3. Transaction, payment, catalog, dan reporting

- Confirmed transaction benar-benar append-only. Void/correction membuat `TransactionCorrection`; original row tetap `CONFIRMED`. API menampilkan effective status tanpa mengubah historical row.
- Transaction item menyimpan product ID, name, SKU, unit-price snapshot, dan catalog version. Sale dari stale offline catalog tetap diterima selama product berasal dari merchant yang sama, termasuk setelah product di-archive.
- Wire money memakai integer rupiah; backend memvalidasi subtotal/total arithmetic tetapi tidak melakukan server repricing terhadap historical offline snapshot.
- Payment lifecycle:
  - Cash → `VERIFIED`.
  - Static QRIS/transfer → `OPERATOR_ASSERTED`.
  - Owner hanya merekonsiliasi exception menjadi `RECONCILED` atau `DISPUTED`; semua non-cash tidak memerlukan manual verification sebagai normal operation.
- Tambahkan payment reconciliation list/mutation serta audit event untuk user, device, catalog, stock, conflict, payment, void, dan correction.
- Owner reporting dipindahkan dari Fastify ke NestJS:
  - PostgreSQL outbox dan idempotent daily/product projections.
  - Dashboard memuat gross/net sales, transaction count, AOV, daily series, top products, `data_as_of`, dan `projection_lag_seconds`.
  - Default 30 hari, maksimal 90 hari, timezone merchant.
- Hapus penuh business insight/AI: UI, routes, provider, jobs, tables, metrics, tests, dan docs.

### 4. Tiga frontend dan deployment

- Repository frontend berisi:
  - Operator PWA di `/`.
  - Entry PWA di `/entry/` untuk catalog, price, image, archive, stock adjustment, dan stock history.
  - Owner PWA di `/owner/` untuk users, devices, reconciliation, sync failures, audit, dan sales reporting.
- Wrong-role login menampilkan actionable redirect; authorization tetap ditegakkan backend.
- Operator root service worker mengecualikan `/entry/`, `/owner/`, `/api/`, `/health`, dan `/metrics`; nested Entry/Owner service workers memakai scope masing-masing.
- Backend OpenAPI menjadi normative. Backend menyimpan generated `openapi.json`; frontend mem-pin snapshot commit, generate client/types, dan memakai explicit snake_case wire → camelCase domain mappers. CI gagal jika generated client drift.
- Hosted demo menggunakan same-origin reverse proxy:
  - `/api/v1`, `/health`, `/metrics` → NestJS.
  - `/entry/` → Entry static PWA.
  - `/owner/` → Owner static PWA.
  - `/` → Operator static PWA.
- Local ports: Operator `5173`, Entry `5174`, Owner `5175`, API `3001`, PostgreSQL `5432`, RabbitMQ `5672/15672`.
- PostgreSQL dan RabbitMQ memakai Docker pada local dan hosted demo. Rabbit data memakai persistent volume; health menampilkan DB/Rabbit/reporting status.
- Lakukan clean reset PostgreSQL dan IndexedDB dengan guarded commands; tidak ada migration data COMPOS karena belum ada production customer.
- Setelah Nest parity hijau, hapus `apps/api`, Fastify dependencies/scripts/config, legacy contracts, Render wiring, dan seluruh docs yang menunjuk API lama.
- Public text menjadi K-POS. COMPOS wordmark/banner tidak dipakai; receipt/sync symbol netral boleh dipertahankan dengan text wordmark K-POS.

## Public API Additions/Changes

- Role enum: `OWNER | ENTRY | OPERATOR`.
- Auth session: rotating refresh cookie dan signed offline lease.
- Sync:
  - `POST /api/v1/sync`
  - `GET /api/v1/sync/receipts`
  - `POST /api/v1/sync/receipts/:id/retry`
- Payment reconciliation:
  - `GET /api/v1/payments?status=OPERATOR_ASSERTED`
  - `POST /api/v1/payments/:id/reconcile`
- Owner report:
  - `GET /api/v1/owner/dashboard?from=YYYY-MM-DD&to=YYYY-MM-DD`
- Existing user/device/product/transaction endpoints dipertahankan setelah role, tenant scope, response envelope, path, dan append-only semantics dibetulkan.
- Tidak ada insight/AI endpoint.

## Test Plan dan Acceptance

- Unit: roles/permissions, exactly-one Owner, rotating sessions, offline lease, payload hashing, sync transitions, retry classification, payment rules, stale catalog snapshot, append-only correction, reporting math.
- PostgreSQL/Rabbit integration: tenant/device binding, durable receipt recovery, publisher failure, duplicate retry, payload mismatch, partial worker outcomes, three retry delays, DLQ, stock conflict, negative-stock confirmation, payment reconciliation, projection replay, and audit.
- Fake IndexedDB: atomic checkout/outbox, restart recovery, ordered writes, offline session reopen, no offline operator switch, terminal outbox cleanup, local history retention.
- Playwright production builds:
  1. Operator offline checkout dan browser restart.
  2. Reconnect → queued → Rabbit settlement.
  3. Lost HTTP response dan exactly-once retry.
  4. Stock conflict → Owner confirm/void.
  5. Entry price/archive saat Operator masih offline.
  6. Payment exception reconciliation.
  7. Role isolation ketiga PWA.
  8. Device/account revocation preserving queued sales.
  9. Owner reporting convergence.
  10. Rabbit unavailable dengan API degraded.
- Load evidence:
  - CI smoke: 50 merchant selama 15–30 detik.
  - Explicit capacity: 500 merchant selama lima menit.
  - Local checkout p95 `<500 ms`, enqueue p95 `<500 ms`, settlement p95 `<750 ms`, dashboard p95 `<1.5 s`, projection lag p95 `<30 s`.
  - Zero lost/duplicate business effects dan 100% valid receipts mencapai terminal state dalam test window.
- Run full cross-repo CI dengan real PostgreSQL/RabbitMQ, three-PWA production builds, docs links, OpenAPI drift check, E2E, dan load smoke sebelum Fastify deletion/cutover.

## Delivery Sequence

1. Backend branch `feature/canonical-contract-sync`: docs decisions, role/schema reset, auth/device identity, OpenAPI.
2. Backend sync durability, retry/DLQ, immutable reconciliation, payments, reporting, and full tests.
3. Merge/freeze backend contract on `develop`.
4. Frontend branch `codex/k-pos-integration`: pin OpenAPI, adapt Operator, add Entry, migrate Owner reporting.
5. Cross-repo E2E dan 50/500 load evidence.
6. Remove Fastify COMPOS API and obsolete insight/COMPOS branding.
7. Update same-origin Docker deployment and complete documentation.
8. Push/merge only after all acceptance gates are green.

## Assumptions

- Public product name final adalah K-POS; repository `k-pos-be` tetap backend source.
- Satu active primary Owner per merchant; backend tetap multi-tenant tetapi setiap app session hanya memiliki satu merchant context.
- API dan Rabbit consumer tetap satu process, tetapi HTTP dapat start degraded ketika broker unavailable.
- Tidak ada production data yang harus dipertahankan.
- Tidak ada RabbitMQ cloud service, external AI provider, dual backend, atau business insight feature.

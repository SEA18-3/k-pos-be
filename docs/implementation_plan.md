# K-POS Canonical Integration Plan

Dokumen ini sengaja membedakan **target** dari **implemented**. Checklist hanya boleh dicentang setelah code, test, dan generated OpenAPI membuktikannya.

## Current baseline

Branch `develop` sudah memiliki NestJS, Prisma, PostgreSQL/Rabbit Docker services, sebagian auth/product/transaction module, dan sync consumer awal. Baseline belum memenuhi canonical contract: role masih bercampur, refresh/session belum final, device ownership salah, receipt/publisher recovery belum durable, retry queues belum lengkap, dan reporting/reconciliation belum parity.

## Delivery gates

### Gate 1 — Canonical docs

- [x] Freeze product roles `OWNER | ENTRY | OPERATOR` dan permission matrix.
- [x] Freeze auth/device/offline lease policy.
- [x] Freeze durable receipt, idempotency, retry/DLQ, transaction/payment semantics.
- [x] Define architecture, API policy, ERD, test strategy, runbook, ADR, dan traceability.
- [ ] Review dan approve docs PR ke `develop`.

### Gate 2 — Identity, schema, dan OpenAPI

- [ ] Clean-reset migration dengan exactly-one Owner constraint/policy.
- [ ] Rotating hashed refresh sessions + reuse detection + revocation.
- [ ] Signed seven-day Operator offline lease.
- [ ] Shared merchant device pairing/revoke dan verified `X-Device-ID` context.
- [ ] Role guards: Owner, Entry, Operator; hapus role `ADMIN`.
- [ ] Standard response/error envelope dan generated `openapi.json`.
- [ ] Trusted Owner provisioning CLI dengan secret via environment/stdin.

### Gate 3 — Durable sync

- [ ] Batch validation max 100 dan client expectation chunk 25.
- [ ] Canonical payload hash + unique `(device_id, offline_uuid)`.
- [ ] Durable SyncReceipt/publish state + publisher confirms.
- [ ] Dispatcher recovery untuk committed-but-unpublished receipt.
- [ ] Receipt polling dan owner-only retry endpoint.
- [ ] Consumer ACK-after-commit, retry queues 5/30/120 detik, DLQ terminal handler.
- [ ] API degraded startup/health saat Rabbit unavailable.

### Gate 4 — Ledger, payment, inventory, reporting

- [ ] Historical product/payment snapshots dan integer rupiah validation.
- [ ] Stale/archived catalog acceptance dengan tenant verification.
- [ ] Append-only void/correction + effective status.
- [ ] Conflict confirm/void + idempotent negative-stock discrepancy.
- [ ] Payment exception list/reconcile/dispute.
- [ ] PostgreSQL outbox fan-out inventory/reporting.
- [ ] Daily/product read models + Owner dashboard + freshness.
- [ ] Audit coverage seluruh privileged mutation.

### Gate 5 — Frontend cutover

- [ ] Backend OpenAPI frozen dan frontend pins exact snapshot/commit.
- [ ] Operator PWA adapt ke `/api/v1`, snake_case mapper, receipt polling, new auth/lease.
- [ ] Entry PWA `/entry/` untuk catalog/inventory.
- [ ] Owner PWA `/owner/` untuk admin/reconciliation/audit/reporting.
- [ ] Role redirect dan service-worker scope isolation.
- [ ] Hapus Fastify API, legacy contracts, AI insights, dan obsolete COMPOS wiring setelah parity.

### Gate 6 — Evidence dan release

- [ ] Unit + PostgreSQL/Rabbit integration tests hijau.
- [ ] Sepuluh cross-repo Playwright scenarios hijau.
- [ ] 50-merchant mixed-load CI smoke memenuhi threshold.
- [ ] Explicit 500-merchant/5-minute capacity artifact tersimpan.
- [ ] OpenAPI drift, docs links, lint, typecheck, build, security checks hijau.
- [ ] Same-origin Docker smoke untuk tiga PWA/API/Rabbit/PostgreSQL hijau.
- [ ] Runbook restore/degraded/replay drill direview.

## Branch dan merge strategy

1. Backend `feature/canonical-contract-sync` → PR ke `develop` untuk canonical docs dan backend stages.
2. Generated OpenAPI baru di-freeze setelah backend contract tests hijau.
3. Frontend `codex/k-pos-integration` pins backend commit/spec.
4. Fastify dihapus hanya setelah cross-repo parity dan rollback point tersedia.
5. Tidak ada force-push/direct merge ke `develop` atau `main`; commit dibuat fokus dan buildable.

## Stop conditions

Jangan cut over jika payload mismatch masih dapat membuat partial batch, consumer ACK sebelum DB commit, revoked identity dapat sync tanpa policy yang jelas, correction mengubah original row, atau OpenAPI/frontend client drift.

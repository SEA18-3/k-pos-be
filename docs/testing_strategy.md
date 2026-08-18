# Testing Strategy

## Principles

- Test public behavior dan invariant, bukan framework implementation detail.
- PostgreSQL/Rabbit behavior kritikal diuji dengan real isolated services, bukan hanya mocks.
- Time, UUID, retry delay, dan network failure dibuat deterministic.
- Setiap bug idempotency/recovery wajib mendapat regression test.
- Test artifact mencatat commit, Node version, CPU/memory, database/broker config, concurrency, dan raw percentiles.

## Unit

- Role/permission dan exactly-one Owner policy.
- Refresh rotation/reuse detection, offline lease signature/binding/expiry.
- Canonical payload normalization/hash, UUID v4/v7, arithmetic.
- Sync state transition, retry classification, delay selection.
- Payment verification, reconciliation exception transition, invalid-resolution atomic correction, stale catalog acceptance, effective transaction/correction.
- Projection math, timezone/date boundary, idempotency keys.

## PostgreSQL + Rabbit integration

- Clean migration dan constraint rejection untuk invalid role/second Owner.
- Owner provisioning/register/login/logout/refresh/revocation.
- Tenant/device binding dan authoritative `X-Device-ID`.
- Durable receipt recovery saat Rabbit publish fail.
- Identical duplicate, payload mismatch whole-batch rejection, lost HTTP response.
- Consumer crash/redelivery, ACK-after-commit, three retry queues, DLQ terminal state.
- Per-item business outcomes setelah whole-request shape valid.
- Stock conflict, confirm negative stock exactly once, void without movement.
- Stale/archived product snapshot, append-only correction, payment reconciliation.
- Reporting fan-out, replay-safe convergence, void/correction net effect.

## Contract dan hosting

- Generated OpenAPI matches committed `openapi.json`.
- Envelope/error codes/path/role guards validated from real app.
- Frontend generated client reproducible dari pinned spec.
- `/`, `/entry/`, `/owner/` deep links benar; `/api/v1`, `/health`, `/metrics` tidak tertelan SPA fallback.
- Service-worker scopes tidak saling mengontrol.

## Cross-repo Playwright

1. Operator checkout offline lalu browser restart.
2. Reconnect: local queued → Rabbit settlement → settled receipt.
3. Dropped successful HTTP response: retry exactly once.
4. Stock conflict lalu Owner confirm dan void variants.
5. Entry price/archive saat Operator masih offline; historical snapshot accepted.
6. Payment exception reconciliation/dispute.
7. Role isolation tiga PWA dan actionable redirect.
8. Account/device revocation mempertahankan queued local sale.
9. Owner reporting eventually converge.
10. Rabbit unavailable: API degraded, sync retryable, recovery succeeds.

## Load evidence

CI smoke menjalankan 50 merchant selama 15–30 detik. Capacity command menjalankan 500 merchant selama lima menit. Pada capacity profile, setiap counter membuat satu sale per 30 detik (steady-state 16,67 sale/detik); 20% counter juga menguji duplicate retry dan catalog read, 10% menjalankan Owner dashboard read, dan 5% menjalankan Owner control read plus Entry stock mutation. Arrival diberi deterministic phase agar merepresentasikan toko independen, bukan synthetic millisecond-zero herd. Receipt polling dan reporting convergence diperiksa untuk seluruh sale.

Acceptance:

- local checkout p95 `<500 ms`;
- enqueue p95 `<500 ms`;
- settlement p95 `<750 ms`;
- dashboard p95 `<1.5 s`;
- projection lag p95 `<30 s`;
- zero lost/duplicate effect;
- 100% valid receipts terminal dalam window.

CI smoke failure memblokir merge. Capacity profile bukan setiap PR, tetapi wajib sebelum release/capacity claim dan hasil JSON menjadi versioned artifact.

## Quality gate

Docs link/format, lint, typecheck, unit, integration, OpenAPI drift, production builds tiga PWA, E2E, dan mixed-load smoke harus hijau sebelum release. Skipped test harus disebut eksplisit di handoff.

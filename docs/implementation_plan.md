# K-POS Integration Status

Checklist ini mencatat implemented behavior pada branch integration. Release evidence baru final
setelah full cross-repository suite hijau dan commit OpenAPI dipin frontend.

## Implemented

- [x] Canonical roles `OWNER | ENTRY | OPERATOR`, tenant guards, one primary Owner policy.
- [x] Email/password auth, server sessions, rotating refresh, signed seven-day Operator lease.
- [x] Shared merchant device pairing/revoke and verified `X-Device-ID` context.
- [x] Clean Prisma baseline, deterministic seed, guarded reset, generated OpenAPI.
- [x] Durable `SyncReceipt`, canonical payload hash, confirmed persistent Rabbit publish.
- [x] Receipt dispatcher, polling, Owner retry, 5/30/120 retry queues, DLQ terminal failure.
- [x] ACK-after-commit and API degraded mode when Rabbit is unavailable.
- [x] Historical item/price/catalog snapshot and integer-rupiah arithmetic validation.
- [x] Append-only transaction void/correction and stock conflict confirm/void.
- [x] Payment `VERIFIED | FAILED` with separate exception reconciliation records.
- [x] Atomic invalid reconciliation: payment failed + correction + reporting reversal.
- [x] Backend outbox and idempotent daily/product reporting projection with merchant timezone.
- [x] Merchant audit events for privileged mutation.
- [x] Frontend pinned OpenAPI/client; Operator, Entry, and Owner PWAs integrated.
- [x] Legacy frontend API/contracts and obsolete non-product feature path removed.
- [x] Same-origin Docker topology for three PWAs, NestJS, PostgreSQL, RabbitMQ.

## Evidence gate before push/merge

- [x] Backend lint, unit, integration, build, OpenAPI generation all green on final diff.
- [x] Frontend format, docs links, OpenAPI drift, lint, typecheck, unit, build all green.
- [x] Full Playwright scenarios and Rabbit degraded/recovery smoke green on final Docker images.
- [x] 50-merchant mixed-load smoke records zero duplicate/lost effect and latency baseline.
- [x] Explicit 500-merchant/5-minute profile is available as an opt-in local command/artifact.
- [ ] Two repositories committed in dependency order; backend commit pinned by frontend handoff.

## Local verification evidence — 18 Agustus 2026

Supported Docker profile memakai PostgreSQL 15, RabbitMQ management image, satu Nest process, pool 32, Rabbit prefetch 8, reporting batch 100, dan reporting concurrency 4.

| Profile                  | Result                                                                                                                                                        |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 50 merchant / 15 detik   | 250 sale; enqueue p95 139,75 ms; settlement p95 76 ms; dashboard p95 38,86 ms; 250/250 terminal; nol lost/duplicate                                           |
| 500 merchant / 5 menit   | 5.000 sale pada 16,67 sale/detik; enqueue p95 127,60 ms; settlement p95 71 ms; dashboard p95 25,57 ms; 5.000/5.000 terminal; nol lost/duplicate               |
| Browser production build | 9/9 Playwright scenario lulus untuk offline reload, reconnect, lost response, conflict, stale catalog, payment invalid, role isolation, revoke, dan reporting |
| Dependency degradation   | Rabbit dihentikan; health menjadi degraded sementara non-sync REST tetap melayani; broker restart dan health recovery berhasil                                |

Benchmark dijalankan pada Windows `win32/x64`, Node `v25.6.0`, dan local Docker Desktop. JSON raw disimpan di ignored local `artifacts/load/`; CI/release harus menghasilkan artifact baru agar metadata sesuai runner/commit yang diuji.

## Cutover order

1. Commit backend schema/contract/runtime/tests/docs.
2. Generate and freeze `openapi.json` at that commit.
3. Commit frontend pinned snapshot/client, three PWAs, Docker gateway, E2E, docs/CI.
4. Push backend integration branch, then frontend integration branch.
5. Merge backend to `develop` before changing frontend CI ref from integration branch to `develop`.

Do not cut over if payload mismatch can partially accept a batch, consumer ACK precedes DB commit,
reconciliation edits original transaction, Rabbit outage kills REST, or OpenAPI/client drift exists.

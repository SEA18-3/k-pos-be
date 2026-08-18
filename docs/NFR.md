# Non-Functional Requirements

Target berikut berlaku pada supported test environment yang metadata-nya disimpan bersama hasil benchmark. Angka bukan janji SLA production sebelum observability, capacity planning, backup, dan restore drill selesai.

## Performance dan convergence

| ID          | Target                                                                                                      |
| ----------- | ----------------------------------------------------------------------------------------------------------- |
| NFR-PERF-01 | Local offline checkout p95 `< 500 ms`, termasuk atomic IndexedDB commit.                                    |
| NFR-PERF-02 | `POST /api/v1/sync` durable enqueue p95 `< 500 ms` saat dependency sehat.                                   |
| NFR-PERF-03 | Rabbit-to-ledger settlement p95 `< 750 ms` untuk normal message.                                            |
| NFR-PERF-04 | Owner dashboard p95 `< 1.5 s` untuk range sampai 90 hari.                                                   |
| NFR-PERF-05 | Reporting projection lag p95 `< 30 s` pada mixed-load acceptance profile.                                   |
| NFR-PERF-06 | 100% valid receipts mencapai terminal state di dalam test window; tidak ada lost/duplicate business effect. |

## Scale profile

- CI smoke: 50 merchant selama 15–30 detik dengan sync writer, Entry mutation, Owner reader, dan reconciliation activity.
- Capacity profile: 500 merchant selama lima menit, satu sale per counter per 30 detik (steady-state 16,67 sale/detik), melalui command eksplisit dan bukan setiap PR.
- Connection pool, Rabbit prefetch, batch limit, concurrency, dan retry delay harus configurable dan dicatat dalam benchmark artifact.
- Reporting query dan worker backlog tidak boleh menghabiskan operational connection budget.
- Supported single-process profile memakai pool 32 koneksi, Rabbit prefetch 8, dan reporting concurrency 4. Artinya background work memakai maksimal 12 koneksi secara bersamaan dan menyisakan 20 untuk HTTP/control path. Setiap replica tambahan membutuhkan budget pool terpisah terhadap `max_connections` PostgreSQL.

## Availability dan resilience

| ID         | Requirement                                                                                                                    |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------ |
| NFR-RES-01 | Operator checkout tetap tersedia selama backend/network outage selama offline lease valid.                                     |
| NFR-RES-02 | API dapat start degraded saat Rabbit unavailable; health menunjukkan dependency status dan sync mengembalikan retryable `503`. |
| NFR-RES-03 | Rabbit message persistent, queue durable, publisher confirm aktif, dan volume broker persistent pada hosted demo.              |
| NFR-RES-04 | Consumer ACK hanya sesudah DB commit; transient retry menggunakan TTL queues 5/30/120 detik lalu DLQ.                          |
| NFR-RES-05 | Receipt dispatcher recovery membuat DB-receipt-before-publish gap dapat dipulihkan tanpa duplicate effect.                     |
| NFR-RES-06 | Shutdown berhenti menerima traffic, menyelesaikan in-flight work dalam bounded grace period, lalu menutup consumer/pool.       |

## Security dan privacy

- Password di-hash memakai Argon2id atau bcrypt dengan cost yang direview; raw password tidak pernah dilog.
- Access token 15 menit disimpan di memory. Refresh token hanya lewat rotating HttpOnly, Secure, SameSite cookie dan server-side hashed session.
- Offline lease ditandatangani, maksimal tujuh hari, dan terikat merchant/user/device.
- Rate limit minimal: login per IP+identity, refresh per session, sync per device, Owner mutation per session.
- Seluruh business access tenant-scoped dari verified identity; IDOR diuji pada semua role.
- CORS allow-list eksplisit; production wajib TLS, secret manager, security headers, dependency scanning, dan audit log redaction.
- Raw password/token/device secret tidak masuk audit. Payment reference diperlakukan sensitif dan tidak dikirim ke telemetry pihak ketiga.

## Consistency

- PostgreSQL transaction memberi atomic ledger effect.
- Delivery at-least-once; idempotency dan payload hash memberi exactly-once business effect.
- Inventory dan reporting eventual tetapi replay-safe.
- Canonical transaction append-only; correction mengubah effective view, bukan history.
- Queue bukan source of truth; receipt/ledger di PostgreSQL adalah durable state yang dapat direkonsiliasi.

## Maintainability

- Nest module boundaries mengikuti business capability; controller hanya auth/parse/call/serialize.
- Prisma access dan transaction boundary berada di repository/application service, bukan controller.
- DTO/OpenAPI `snake_case` konsisten; internal TypeScript boleh `camelCase` dengan explicit mapper.
- Structured logs selalu menyertakan `request_id`, dan bila relevan `merchant_id`, `device_id`, `offline_uuid`, `receipt_id`, tanpa secret.
- Generated OpenAPI committed dan drift-check di CI. Frontend mem-pin backend commit/spec version.
- Minimum verification: format, lint, typecheck, unit, PostgreSQL/Rabbit integration, OpenAPI drift, dan affected E2E.

## Operations

- `/health` melaporkan API, PostgreSQL, Rabbit, dan reporting freshness secara terpisah; degraded bukan selalu process-down.
- `/metrics` mencakup request latency/error, Rabbit publish/consume/retry/DLQ, receipt age/depth, settlement latency, projection lag, dan pool wait.
- Production memerlukan managed backup/PITR, restore drill, alerting, log retention, secret rotation, dan capacity budget. Demo hijau tidak sama dengan production-ready.

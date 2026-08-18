# Requirements Traceability Matrix

Status `Verified` berarti behavior punya automated evidence pada branch ini. `Partial` berarti runtime path sudah ada tetapi satu atau lebih edge case di kolom verification belum punya direct automated assertion.

| Requirement     | Component/API                              | Verification                                    | Status   |
| --------------- | ------------------------------------------ | ----------------------------------------------- | -------- |
| FR-AUTH-01..04  | Auth, Users, provisioning CLI              | register + second-Owner rejection integration   | Verified |
| FR-AUTH-05..06  | AuthSession, refresh cookie, offline lease | lease binding E2E; rotation/reuse edge tests    | Partial  |
| FR-AUTH-07..10  | Devices, guards, revocation                | shared-device and revoke E2E                    | Verified |
| FR-CAT-01..03   | Products/Inventory, Entry/Operator PWA     | CRUD/isolation/cache E2E                        | Verified |
| FR-CAT-04..05   | Sync validator + snapshots                 | stale/archive/no-reprice E2E                    | Verified |
| FR-INV-01..03   | Stock ledger + conflict                    | adjustment/load/conflict integration + E2E      | Verified |
| FR-SYNC-01..03  | Operator IndexedDB engine                  | fake IndexedDB atomic/restart + browser reload  | Verified |
| FR-SYNC-04..07  | Sync controller/receipt repository         | hash/mismatch/concurrent duplicate integration  | Verified |
| FR-SYNC-08      | Receipt API + frontend poller              | reconnect/lost-response E2E                     | Verified |
| FR-SYNC-09..11  | Rabbit retry queues, dispatcher, DLQ       | outage/recovery E2E; retry/DLQ direct cases     | Partial  |
| FR-SYNC-12      | Operator persistence                       | terminal cleanup/history retention tests        | Verified |
| FR-TXN-01..05   | Transaction/correction/effective mapper    | append-only conflict/payment E2E                | Verified |
| FR-PAY-01..03   | Payment/reconciliation                     | policy unit + concurrent resolution integration | Verified |
| FR-REP-01..04   | Backend outbox/read models/dashboard       | convergence/correction/load tests               | Verified |
| FR-AUD-01       | Audit module                               | privileged mutation integration                 | Verified |
| NFR-PERF-01     | Operator local checkout                    | functional browser flow; p95 probe belum ada    | Partial  |
| NFR-PERF-02..05 | API/worker/reporting                       | 50/500 mixed-load harness                       | Verified |
| NFR-PERF-06     | Receipts + ledger guards                   | 5.000-sale capacity reconciliation              | Verified |
| NFR-RES-01..06  | PWA, API degraded mode, Rabbit             | outage/recovery + graceful worker shutdown      | Verified |

Matrix di-update bersama code PR. Requirement tidak boleh diberi status “Implemented” tanpa link ke test/evidence pada PR atau release artifact.

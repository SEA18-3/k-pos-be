# Requirements Traceability Matrix

Status `Target` berarti canonical requirement sudah disepakati tetapi belum dibuktikan oleh implementation/test di branch saat ini.

| Requirement     | Component/API                              | Verification                                  | Status |
| --------------- | ------------------------------------------ | --------------------------------------------- | ------ |
| FR-AUTH-01..04  | Auth, Users, provisioning CLI              | register + second-Owner rejection integration | Target |
| FR-AUTH-05..06  | AuthSession, refresh cookie, offline lease | rotation/reuse/binding/expiry tests           | Target |
| FR-AUTH-07..10  | Devices, guards, revocation                | shared-device and revoke E2E                  | Target |
| FR-CAT-01..03   | Products/Inventory, Entry/Operator PWA     | CRUD/isolation/cache E2E                      | Target |
| FR-CAT-04..05   | Sync validator + snapshots                 | stale/archive/no-reprice integration          | Target |
| FR-INV-01..03   | Stock ledger + conflict                    | adjustment/replay/conflict tests              | Target |
| FR-SYNC-01..03  | Operator IndexedDB engine                  | fake IndexedDB atomic/restart tests           | Target |
| FR-SYNC-04..07  | Sync controller/receipt repository         | max/whole-batch/hash/idempotency integration  | Target |
| FR-SYNC-08      | Receipt API + frontend poller              | reconnect/lost-response E2E                   | Target |
| FR-SYNC-09..11  | Rabbit retry queues, dispatcher, DLQ       | outage/redelivery/retry/DLQ integration       | Target |
| FR-SYNC-12      | Operator persistence                       | terminal cleanup/history retention test       | Target |
| FR-TXN-01..05   | Transaction/correction/effective mapper    | append-only and correction projection tests   | Target |
| FR-PAY-01..03   | Payment/reconciliation                     | payment state/isolation/audit tests           | Target |
| FR-REP-01..04   | Backend outbox/read models/dashboard       | replay/convergence/timezone/load tests        | Target |
| FR-AUD-01       | Audit module                               | privileged mutation integration               | Target |
| NFR-PERF-01     | Operator local checkout                    | browser performance probe                     | Target |
| NFR-PERF-02..05 | API/worker/reporting                       | 50/500 mixed-load harness                     | Target |
| NFR-PERF-06     | Receipts + ledger guards                   | reconciliation assertion after load           | Target |
| NFR-RES-01..06  | PWA, API degraded mode, Rabbit             | outage/crash/shutdown suites                  | Target |

Matrix di-update bersama code PR. Requirement tidak boleh diberi status “Implemented” tanpa link ke test/evidence pada PR atau release artifact.

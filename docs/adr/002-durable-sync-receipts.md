# ADR-002: Durable Sync Receipt sebelum Rabbit Delivery

- Status: Accepted
- Date: 2026-08-17

## Context

Direct publish lalu response tidak menutup crash gap dan tidak memberi status durable untuk polling/lost response. Menjadikan Rabbit sebagai ledger juga menyulitkan reconciliation.

## Decision

PostgreSQL menyimpan canonical SyncReceipt, payload hash, payload/publish intent, attempt, dan terminal status. API publish persistent Rabbit message dengan publisher confirm. Dispatcher memulihkan committed-but-unpublished receipt. Consumer ACK hanya setelah ledger commit. Transient retry memakai TTL queue 5/30/120 detik lalu DLQ.

HTTP `200` berarti queued, bukan settled. Client polling receipt. Key `(device_id, offline_uuid)` + hash memberi idempotency dan mismatch detection.

## Consequences

Flow lebih kompleks daripada fire-and-forget tetapi dapat dipulihkan dan diaudit. Duplicate delivery tetap mungkin di transport, sehingga semua handler wajib idempotent. PostgreSQL tetap source of truth; Rabbit dapat direbuild dari pending publish intent.

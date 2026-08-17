# ADR-004: Reporting Read Models di PostgreSQL

- Status: Accepted
- Date: 2026-08-17

## Context

Owner dashboard memiliki access pattern agregasi yang dapat mengganggu operational settlement bila membaca raw ledger berulang. Read replica/microservice terlalu dini untuk skala target awal.

## Decision

Confirmed/effective ledger effect mengeluarkan PostgreSQL outbox events. Independent worker lane mengisi merchant daily dan product daily read models secara idempotent. Dashboard membaca projection dan selalu menampilkan `data_as_of` serta `projection_lag_seconds`.

## Consequences

Reporting eventual dan bisa tertinggal tanpa memblokir checkout. Replay aman melalui application guard. Satu PostgreSQL cukup sampai benchmark menunjukkan connection/I/O budget tidak memadai; read replica baru dipertimbangkan berdasarkan evidence.

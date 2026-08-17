# ADR-005: Generated OpenAPI dan Clean Reset

- Status: Accepted
- Date: 2026-08-17

## Context

Backend dan frontend berada di repository terpisah. Handwritten duplicate contract cepat drift. Prototype belum memiliki customer production data, sementara mempertahankan migration/model lama akan membawa role dan lifecycle yang kontradiktif.

## Decision

Backend generated `openapi.json` menjadi normative contract. Frontend pins exact spec/backend commit, generates client/types, lalu memakai explicit snake_case-wire ke camelCase-domain mapper. CI memeriksa generation drift.

Schema dibangun ulang sebagai clean baseline pada local/isolated environment. Tidak ada migration data dari prototype Fastify/COMPOS. Reset command wajib guarded terhadap database name/environment.

## Consequences

Breaking change terlihat jelas dan frontend cutover terkoordinasi. Clean baseline mempercepat correctness sekarang, tetapi policy berhenti begitu customer data live; setelah itu migration harus additive dan backup-aware.

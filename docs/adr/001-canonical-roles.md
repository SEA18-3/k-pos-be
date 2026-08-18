# ADR-001: Tiga Role dan Tiga PWA

- Status: Accepted
- Date: 2026-08-17

## Context

Dokumen lama mencampur empat role, sementara kebutuhan produk hanya memiliki tiga access pattern nyata.

## Decision

Role canonical hanya `OWNER | ENTRY | OPERATOR`. Owner memegang capability administration. Operator, Entry, dan Owner memakai PWA terpisah pada `/`, `/entry/`, dan `/owner/`. Satu merchant memiliki tepat satu active primary Owner. Owner hanya membuat Entry/Operator melalui API.

## Consequences

Permission lebih mudah diaudit dan UI tidak penuh conditional navigation. Ada tambahan build/deploy PWA, tetapi backend tetap satu modular monolith. Owner recovery/provisioning membutuhkan trusted CLI, bukan public role selector.

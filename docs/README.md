# K-POS Engineering Playbook

Dokumentasi ini adalah source of truth produk/backend yang bisa ditelusuri ke API dan verification evidence. Baca sesuai kebutuhan:

1. [Project overview](project_overview.md) — product promise, role, invariant, scope.
2. [FRD](FRD.md) — functional requirement dan permission.
3. [NFR](NFR.md) — performance, resilience, security, operations.
4. [User flows](user_flows.md) — lifecycle lintas actor dan failure mode.
5. [Architecture](architecture.md) — component, sync path, consistency boundary.
6. [API contract](api_contract.md) — public HTTP policy dan endpoint shape.
7. [Database design](database_design.md) — ERD, constraint, idempotency boundary.
8. [Testing strategy](testing_strategy.md) — test pyramid dan acceptance scenarios.
9. [Deployment runbook](deployment_runbook.md) — local/hosted topology dan incident steps.
10. [Traceability matrix](traceability_matrix.md) — requirement → component → test.
11. [Implementation plan](implementation_plan.md) — status nyata dan delivery gates.
12. [ADR index](adr/README.md) — keputusan arsitektur dan trade-off.

## Cara menjaga docs tetap benar

- Requirement ID hanya didefinisikan di FRD/NFR dan dirujuk, bukan disalin dengan arti berbeda.
- OpenAPI generated adalah contract machine-readable; perubahan endpoint wajib update docs, contract test, dan pinned frontend snapshot.
- Checklist implementation tidak boleh dicentang dari asumsi atau compile-only evidence.
- Diagram menjelaskan target architecture. Selisih current code wajib dicatat di implementation plan.
- Bahasa Indonesian-first dengan technical English yang natural; hindari duplikasi bilingual.

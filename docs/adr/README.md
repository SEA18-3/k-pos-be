# Architecture Decision Records

| ADR                                         | Decision                                        | Status   |
| ------------------------------------------- | ----------------------------------------------- | -------- |
| [001](001-canonical-roles.md)               | Tiga role dan tiga PWA                          | Accepted |
| [002](002-durable-sync-receipts.md)         | PostgreSQL receipts + RabbitMQ durable delivery | Accepted |
| [003](003-shared-device-offline-session.md) | Shared device dan bound offline lease           | Accepted |
| [004](004-reporting-read-models.md)         | PostgreSQL outbox + reporting projections       | Accepted |
| [005](005-contract-and-reset-policy.md)     | OpenAPI cross-repo contract + clean reset       | Accepted |

ADR mencatat keputusan yang sulit dibalik. Perubahan keputusan dibuat sebagai ADR baru yang supersede dokumen lama; history tidak diedit seolah trade-off sebelumnya tidak pernah ada.

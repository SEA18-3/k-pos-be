# K-POS Backend

Canonical NestJS backend untuk K-POS: merchant-scoped auth, shared devices, catalog/inventory,
durable RabbitMQ sync receipts, immutable transaction/payment ledger, exception reconciliation,
audit, dan eventual Owner reporting.

## Quick start

Requirements: Node.js 22+, npm, Docker Desktop/Compose.

```bash
npm ci
npm run db:up
npm run db:migrate
npm run seed
npm run start:dev
```

API `http://localhost:3001`, Swagger `http://localhost:3001/docs`, Rabbit Management
`http://localhost:15672` (`guest/guest`). Copy `.env.example` ke `.env` dan ganti secrets di luar
local demo.

## Canonical contract

- roles: `OWNER | ENTRY | OPERATOR`;
- prefix `/api/v1`, JSON `snake_case`, standard success/error envelope;
- access token 15 minutes, rotating refresh 7 days, signed Operator offline lease 7 days;
- sync unique `(device_id, offline_uuid)` plus canonical payload hash;
- payment `VERIFIED | FAILED`;
- exception reconciliation `OPEN | RESOLVED_VALID | RESOLVED_INVALID`;
- confirmed ledger immutable; void/correction append-only;
- Rabbit consumer ACK only after PostgreSQL commit.

Generated machine contract: [openapi.json](openapi.json). Product/engineering decisions:
[docs/README.md](docs/README.md).

## Quality

```bash
npm run lint
npm test -- --runInBand
npm run test:integration
npm run build
npm run openapi:generate
```

Integration requires local PostgreSQL and RabbitMQ. Full three-PWA Docker/Playwright verification
lives in the sibling frontend repository.

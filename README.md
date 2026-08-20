<div align="center">
  
# K-POS

**Sync Without Signal - An Offline-First Point of Sales Backend**

![Coverage](https://img.shields.io/badge/Coverage-92.6%25-brightgreen)
![NestJS](https://img.shields.io/badge/NestJS-E0234E?logo=nestjs&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-316192?logo=postgresql&logoColor=white)
![Prisma](https://img.shields.io/badge/Prisma-2D3748?logo=prisma&logoColor=white)
![RabbitMQ](https://img.shields.io/badge/RabbitMQ-FF6600?logo=rabbitmq&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-2496ED?logo=docker&logoColor=white)

[**OpenAPI Docs**](https://k-pos-be.onrender.com/docs) • [**Prometheus Metrics**](https://k-pos-be.onrender.com/metrics)

</div>

---

## Case Study Overview

K-POS is a robust Point of Sales (POS) backend tailored for modern retail environments experiencing **unstable internet connectivity**. Traditional cloud-based POS systems completely halt operations when the network goes down. K-POS shifts the paradigm by implementing an **Offline-First Architecture**.

Store operators (cashiers) can continuously process hundreds of transactions, manage carts, and accept local payments without any network signal. Upon reconnection, the system orchestrates a massive burst of offline data syncing. Powered by **RabbitMQ** and a distributed microservice approach, K-POS seamlessly resolves inventory conflicts, prevents race conditions, guarantees idempotency, and maintains strict financial audit trails—ensuring the primary HTTP server remains highly available and unblocked under heavy synchronization loads.

---

## Key Features & Engineering Implementations

1. **Event-Driven Synchronization (RabbitMQ)**
   Offline batches are ingested via `POST /api/v1/sync` and immediately pushed to a RabbitMQ queue (`sync.transactions`). A dedicated worker consumes the queue, validates mathematical consistency, and executes database transactions sequentially.
2. **Idempotency & Replay Protection**
   Every local transaction is bound to a unique `offline_uuid` and `device_id`. If network packet drops cause a client to retry syncing an already processed batch, the system safely ignores it without creating duplicate payments or inventory deductions.
3. **Conflict Resolution & Reconciliation**
   If an offline transaction is pushed but the central stock has already been depleted, it enters a `PENDING` conflict state. Store owners can investigate these cases via the Reconciliation API and decide to `CONFIRM` (force deduction) or `VOID` (cancel) the transaction.
4. **Immutable Audit Trail & Corrections**
   Mistakes happen, but data mutability is dangerous. Modifying a transaction (`correctTransaction`) actually issues a new `TransactionCorrection` bridge. It restores the old stock, voids the old transaction, clones the payment, and creates a completely new transaction record.
5. **Role-Based Access Control (RBAC) & Security**
   Secured via JWT (Access & Refresh tokens) with strict 4-level hierarchy: `ADMIN`, `OWNER`, `OPERATOR` (Cashier), and `ENTRY` (Inventory Manager). Additionally, all inbound requests are guarded by `@nestjs/throttler` (Rate Limiting) and Helmet (Security Headers).

---

## Repository Structure

```text
k-pos-be/
├── src/
│   ├── modules/
│   │   ├── auth/              # JWT Authentication, Login, Register
│   │   ├── users/             # RBAC & Employee management
│   │   ├── merchants/         # Multi-tenancy isolation
│   │   ├── devices/           # Device pairing & revocation logic
│   │   ├── products/          # Catalog & Inventory management
│   │   ├── transactions/      # Sales, Voiding, and Correction logics
│   │   ├── sync/              # RabbitMQ Producer & Consumer workflows
│   │   ├── reconciliations/   # Cash drawer & Conflict dispute handling
│   │   └── payments/          # Payment recording & verification
│   ├── common/
│   │   ├── interceptors/      # Global response formatting (status, message, data)
│   │   ├── filters/           # Global HttpException handling
│   │   ├── decorators/        # Custom @CurrentUser decorators
│   │   └── utils/             # DRY utilities (e.g. inventory.util.ts)
│   └── main.ts                # Application Entry Point
├── docs/                      # Architectural & Technical Documents
├── test/                      # Jest e2e & API Integration Tests
├── prisma/                    # Prisma Schema & PostgreSQL Migrations
└── docker-compose.yml         # Local Container Infrastructure (DB & Broker)
```

---

## How to Run (Local Development)

### 1. Prerequisites
- Docker & Docker Compose
- Node.js v18+
- npm

### 2. Environment Variables
Create a `.env` file in the root directory based on the following template:

```env
# Server
PORT=3000
API_PREFIX=/api/v1
CORS_ORIGINS=http://localhost:5173,https://k-pos-app.netlify.app

# Database (PostgreSQL 17)
DATABASE_URL="postgresql://postgres:password@localhost:5432/kpos_db?schema=public"

# Message Broker (RabbitMQ)
RABBITMQ_URL="amqp://localhost:5672"

# Security (JWT)
JWT_SECRET="supersecret_access_key"
JWT_REFRESH_SECRET="supersecret_refresh_key"
JWT_EXPIRES_IN="15m"
JWT_REFRESH_EXPIRES_IN="7d"
```

### 3. Start Infrastructure
Boot up PostgreSQL and RabbitMQ containers:
```bash
docker-compose up -d
```

### 4. Setup Database
Install dependencies, generate Prisma Client, and run schema migrations:
```bash
npm install
npx prisma generate
npx prisma migrate dev
```

### 5. Start the Server
```bash
# Development watch mode
npm run start:dev
```
*The server will be available at `http://localhost:3000` and Swagger docs at `http://localhost:3000/docs`*

---

## Testing

The codebase maintains a strict >90% test coverage through isolated Unit Tests (Jest) and End-to-End Tests (Supertest).

```bash
# Run Unit Tests
npm run test

# Run E2E Integration Tests
npm run test:e2e
```

---

## Phase Demo (End-to-End Walkthrough)

To simulate the real-world flow of the K-POS ecosystem locally, follow this exact sequence (testable via Postman, cURL, or the [Swagger UI](http://localhost:3000/docs)):

1. **Register Store Owner**
   - `POST /api/v1/auth/register`
   - Create a new store tenant. Returns an `OWNER` token.
2. **Register Cashier**
   - `POST /api/v1/users` *(Requires OWNER Token)*
   - Register an employee with the `OPERATOR` role.
3. **Pair Cashier Device**
   - `POST /api/v1/devices/pair` *(Requires OWNER Token)*
   - The Owner generates a pairing session and securely links the physical POS tablet/device to the store.
4. **Populate Inventory**
   - `POST /api/v1/products` *(Requires OWNER Token)*
   - Add master products to the catalog (e.g., SKU: `COF-01`, Name: `Kopi Susu`).
5. **Process Offline Transactions (Simulate Sync)**
   - `POST /api/v1/sync` *(Requires Operator Token & `X-Device-ID` Header)*
   - Push an array of queued offline transactions to the server. The server responds with `202 Accepted` immediately, routing the heavy payload to RabbitMQ.
6. **Poll Sync Status**
   - `GET /api/v1/sync/status/:batchId`
   - Check if the background worker has finished processing the batch (`SYNCED` or `SYNC_CONFLICT`).
7. **Perform Transaction Correction**
   - `POST /api/v1/transactions/:id/correct` *(Requires OWNER Token)*
   - Void an erroneous transaction and replace it with a new one while maintaining strict audit trails.

---

## Documentation Reference

1. [Functional Requirements](./docs/FRD.md)
2. [Non-Functional Requirements](./docs/NFR.md)
3. [Architecture Justification](./docs/architecture_justification.md)
4. [Database Design](./docs/database_design.md)
5. [Security](./docs/security.md)
6. [Test Strategy](./docs/test_strategy.md)
7. [Clean Code Implementation](./docs/clean_code_implementation.md)
8. [Observability](./docs/observability.md)
9. [Performance Validation](./docs/performance_validation.md)

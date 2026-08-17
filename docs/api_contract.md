# K-POS API Contract

OpenAPI yang di-generate dari backend adalah normative machine-readable contract. Dokumen ini menjelaskan policy dan shape utama. Semua path berada di `/api/v1`, wire JSON memakai `snake_case`, dan route parameter memakai `:id`.

## Envelope

Success:

```json
{
  "status": "success",
  "message": "Sync batch queued",
  "data": {}
}
```

Error:

```json
{
  "status": "error",
  "message": "Offline UUID was reused with a different payload",
  "error": {
    "code": "IDEMPOTENCY_PAYLOAD_MISMATCH",
    "details": {},
    "request_id": "req_01..."
  }
}
```

`request_id` wajib ada pada error. HTTP status tetap meaningful; envelope tidak mengubah error menjadi `200`.

## Authentication

### `POST /api/v1/auth/register`

Membuat merchant dan primary `OWNER`. Tidak menerima role dari client.

```json
{
  "merchant_name": "Kedai Nusa",
  "timezone": "Asia/Jakarta",
  "full_name": "Nadia",
  "email": "owner@kedainusa.test",
  "password": "strong-password"
}
```

### `POST /api/v1/auth/login`

```json
{
  "email": "operator@kedainusa.test",
  "password": "strong-password",
  "device_id": "dev_01..."
}
```

Response memberi access token 15 menit dan, untuk Operator pada paired device, signed offline lease. Rotating refresh token dikirim hanya sebagai `HttpOnly; Secure; SameSite` cookie, bukan JSON/header custom.

### `POST /api/v1/auth/refresh`

Memutar refresh session dan cookie; mendeteksi token reuse. Operator mendapat refreshed offline lease bila device masih valid.

### `POST /api/v1/auth/logout`

Mencabut current refresh session dan clear cookie. Local queued sale tidak dihapus.

### `GET /api/v1/auth/me`

Mengembalikan authenticated user, merchant, role, dan device context bila ada.

## User dan merchant

- `GET /api/v1/merchants/me` — semua role.
- `GET /api/v1/users` — Owner; merchant-scoped, filter `role`/`is_active`.
- `POST /api/v1/users` — Owner; role hanya `ENTRY | OPERATOR`.
- `PATCH /api/v1/users/:id` — Owner; name/role hanya Entry/Operator.
- `PATCH /api/v1/users/:id/status` — Owner; activate/deactivate.
- `POST /api/v1/users/:id/change-password` — Owner atau self sesuai policy.

Public API tidak dapat membuat/demote/menonaktifkan primary Owner.

## Device

- `POST /api/v1/devices` — Owner membuat pairing code.
- `POST /api/v1/devices/pair` — online pairing dengan pairing code + hardware identity.
- `GET /api/v1/devices` — Owner list shared counter.
- `DELETE /api/v1/devices/:id` — Owner revoke.

Pairing code single-use, short-lived, dan rate-limited. Revocation menginvalidasi session/lease terkait tanpa menghapus local queue.

## Product dan stock

- `GET /api/v1/products` — semua role, merchant-scoped.
- `POST /api/v1/products` — Entry/Owner.
- `PATCH /api/v1/products/:id` — Entry/Owner.
- `POST /api/v1/products/:id/archive` — Entry/Owner.
- `POST /api/v1/products/:id/restore` — Entry/Owner.
- `POST /api/v1/products/:id/stock-adjustments` — Entry/Owner.
- `GET /api/v1/products/:id/stock-history` — Entry/Owner.

Price, quantity, subtotal, dan total adalah integer rupiah/units. Historical sync membawa product snapshot dan tidak direprice ke current catalog.

## Sync

### `POST /api/v1/sync`

Authorization: Operator. Header `X-Device-ID` required dan authoritative. Maksimum API 100 transaction; Operator PWA mengirim chunk 25.

```json
{
  "transactions": [
    {
      "offline_uuid": "018f0f3e-7b9a-7f0c-9a4f-3c2d58ebf990",
      "created_at_local": "2026-08-17T15:20:10+07:00",
      "subtotal": 42000,
      "total": 42000,
      "notes": null,
      "items": [
        {
          "id_product": "prd_01...",
          "product_name": "Kopi Susu Aren",
          "product_sku": "KSA-01",
          "catalog_version": 7,
          "quantity": 2,
          "unit_price": 21000,
          "subtotal": 42000
        }
      ],
      "payment": {
        "method": "CASH",
        "amount": 42000,
        "cash_received": 50000,
        "change_amount": 8000,
        "qris_code": null,
        "transfer_ref": null
      }
    }
  ]
}
```

`id_device`, `id_merchant`, dan `id_user` tidak boleh ada pada item. Server mengambilnya dari verified request context.

Validation rules:

- Entire shape is validated before durable receipt creation.
- Arithmetic (`quantity × unit_price`, subtotal, total, cash change) harus konsisten.
- Semua product ID harus milik merchant; archived/stale snapshot tetap boleh.
- Existing key dengan different canonical hash menolak seluruh batch `409`.
- Existing identical key direuse dan tidak dipublish sebagai business effect baru.

Accepted response (`200`, berarti queued):

```json
{
  "status": "success",
  "message": "Sync batch queued",
  "data": {
    "accepted": 2,
    "queued_at": "2026-08-17T08:20:13.240Z"
  }
}
```

Rabbit/publish unavailable mengembalikan `503 SYNC_BROKER_UNAVAILABLE`; receipt yang sudah committed tetap direcover dispatcher. Client retry exact batch dengan stable ID/payload.

### `GET /api/v1/sync/receipts`

Repeated query, maksimum 100:

```text
/api/v1/sync/receipts?offline_uuid=uuid-a&offline_uuid=uuid-b
```

```json
{
  "status": "success",
  "message": "Sync receipts retrieved",
  "data": {
    "items": [
      {
        "id": "rcp_01...",
        "offline_uuid": "uuid-a",
        "status": "SYNCED",
        "id_transaction": "txn_01...",
        "error": null,
        "queued_at": "2026-08-17T08:20:13.240Z",
        "updated_at": "2026-08-17T08:20:13.811Z"
      }
    ]
  }
}
```

Status: `QUEUED | PROCESSING | SYNCED | CONFLICT | FAILED`.

### `POST /api/v1/sync/receipts/:id/retry`

Owner-only. Hanya receipt `FAILED` dengan classified retryable error. Replay menggunakan stored canonical payload.

## Transaction dan reconciliation

- `GET /api/v1/transactions` — Owner/Entry merchant-wide; Operator sesuai permission policy.
- `GET /api/v1/transactions/:id` — merchant-scoped detail + original/effective status.
- `POST /api/v1/transactions/:id/conflict-resolution` — Owner, `{ "action": "CONFIRM" | "VOID", "notes": "..." }`.
- `POST /api/v1/transactions/:id/void` — Owner append-only correction.
- `POST /api/v1/transactions/:id/corrections` — Owner membuat replacement transaction + bridge.

Confirm conflict mengizinkan negative stock dan mencatat discrepancy exactly once. Void conflict tidak membuat stock movement.

## Payment exception

- `GET /api/v1/payments?status=PENDING` — Owner; daftar pembayaran non-cash yang perlu diperiksa.
- `POST /api/v1/payments/:id/reconcile` — Owner; action `CONFIRM | REJECT`, reason required. `CONFIRM` menghasilkan `RECONCILED`; `REJECT` menghasilkan `FAILED`.

Canonical payment status hanya `PENDING | VERIFIED | FAILED | RECONCILED`. Payment `FAILED` tidak otomatis mengubah immutable transaction. Owner tetap menjalankan append-only void/correction bila efek sale perlu dibatalkan dari ledger dan reporting.

## Owner dashboard dan audit

- `GET /api/v1/owner/dashboard?from=YYYY-MM-DD&to=YYYY-MM-DD` — Owner only; default 30 hari, max 90, merchant timezone.
- `GET /api/v1/audit-events` — Owner only, cursor pagination.

Dashboard response memuat `gross_sales`, `net_sales`, `transaction_count`, `average_order_value`, `daily_series`, `top_products`, `data_as_of`, dan `projection_lag_seconds`.

## Health dan metrics

- `GET /health` — dependency-aware JSON untuk API, PostgreSQL, Rabbit, dan reporting freshness.
- `GET /metrics` — protected/internal Prometheus metrics pada production.

## Stable error codes

Minimal codes: `VALIDATION_ERROR`, `UNAUTHENTICATED`, `FORBIDDEN`, `TENANT_MISMATCH`, `DEVICE_NOT_PAIRED`, `DEVICE_REVOKED`, `OFFLINE_LEASE_EXPIRED`, `IDEMPOTENCY_PAYLOAD_MISMATCH`, `SYNC_BROKER_UNAVAILABLE`, `SYNC_RECEIPT_NOT_RETRYABLE`, `TRANSACTION_CONFLICT`, `INVALID_STATE_TRANSITION`, `NOT_FOUND`, dan `RATE_LIMITED`.

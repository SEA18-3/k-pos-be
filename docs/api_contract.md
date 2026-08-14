# API Contract — K-POS Backend

Dokumen ini mendefinisikan spesifikasi lengkap seluruh endpoint REST API untuk backend K-POS. Seluruh endpoint (kecuali yang dicatat secara eksplisit) memerlukan autentikasi melalui Bearer Token JWT pada header `Authorization`.

---

## Konvensi Umum

### Base URL

```
https://<host>/api
```

### Format Response

Seluruh response, baik sukses maupun error, membungkus data dalam struktur JSON yang seragam berikut.

**Response Sukses**

```json
{
  "status": "success",
  "message": "Deskripsi singkat hasil operasi",
  "data": { }
}
```

**Response Error**

```json
{
  "status": "error",
  "message": "Deskripsi singkat error",
  "error": {
    "code": "ERROR_CODE",
    "details": "Penjelasan lebih lanjut atau array error validasi"
  }
}
```

### Header Wajib

| Header | Nilai | Keterangan |
|---|---|---|
| `Content-Type` | `application/json` | Wajib untuk semua request dengan body |
| `Authorization` | `Bearer <access_token>` | Wajib untuk semua endpoint yang terautentikasi |
| `X-Device-ID` | `<uuid>` | Wajib untuk semua endpoint transaksi, mengidentifikasi perangkat Kasir |

---

## Tabel HTTP Status Code dan Error Code

| HTTP Status | Error Code | Trigger |
|---|---|---|
| `200 OK` | - | Request berhasil diproses |
| `201 Created` | - | Resource baru berhasil dibuat |
| `400 Bad Request` | `VALIDATION_ERROR` | Body request tidak memenuhi skema validasi |
| `400 Bad Request` | `INVALID_TRANSITION` | Perubahan status transaksi tidak sah (misal: mencoba void transaksi yang sudah confirmed) |
| `401 Unauthorized` | `INVALID_CREDENTIALS` | Username atau password salah |
| `401 Unauthorized` | `TOKEN_EXPIRED` | Access token sudah kedaluwarsa |
| `401 Unauthorized` | `TOKEN_INVALID` | Token tidak dapat diverifikasi |
| `403 Forbidden` | `INSUFFICIENT_PERMISSION` | Pengguna terautentikasi tidak memiliki hak akses ke resource ini |
| `403 Forbidden` | `TRANSACTION_IMMUTABLE` | Operasi modifikasi atau penghapusan pada transaksi yang sudah confirmed oleh backend |
| `404 Not Found` | `RESOURCE_NOT_FOUND` | Resource yang diminta tidak ditemukan |
| `409 Conflict` | `DUPLICATE_TRANSACTION` | `transaction_id` yang dikirim sudah ada di sistem (idempotency check) |
| `409 Conflict` | `INSUFFICIENT_STOCK` | Stok produk tidak mencukupi saat konfirmasi transaksi |
| `422 Unprocessable Entity` | `SYNC_VALIDATION_FAILED` | Transaksi gagal melewati validasi bisnis backend saat proses sync |
| `429 Too Many Requests` | `RATE_LIMIT_EXCEEDED` | Jumlah request melebihi batas rate limiting |
| `500 Internal Server Error` | `INTERNAL_ERROR` | Kesalahan tidak terduga di sisi server |

---

## 1. Auth

### POST /auth/login

Login untuk Kasir dan Admin. Tidak memerlukan autentikasi.

**Request Body**

```json
{
  "username": "string",
  "password": "string"
}
```

**Response Sukses (200 OK)**

```json
{
  "status": "success",
  "message": "Login berhasil",
  "data": {
    "access_token": "eyJhbGci...",
    "refresh_token": "dGhpcyBp...",
    "expires_in": 900,
    "user": {
      "id": "usr_01j...",
      "username": "kasir01",
      "role": "KASIR",
      "merchant_id": "mrc_01j..."
    }
  }
}
```

**Response Error (401 Unauthorized)**

```json
{
  "status": "error",
  "message": "Username atau password salah",
  "error": {
    "code": "INVALID_CREDENTIALS",
    "details": null
  }
}
```

**Response Error (429 Too Many Requests)**

```json
{
  "status": "error",
  "message": "Terlalu banyak percobaan login. Coba lagi dalam 60 detik.",
  "error": {
    "code": "RATE_LIMIT_EXCEEDED",
    "details": null
  }
}
```

---

### POST /auth/refresh

Memperbarui access token menggunakan refresh token yang masih valid.

**Request Body**

```json
{
  "refresh_token": "string"
}
```

**Response Sukses (200 OK)**

```json
{
  "status": "success",
  "message": "Token berhasil diperbarui",
  "data": {
    "access_token": "eyJhbGci...",
    "expires_in": 900
  }
}
```

**Response Error (401 Unauthorized)**

```json
{
  "status": "error",
  "message": "Refresh token tidak valid atau sudah kedaluwarsa",
  "error": {
    "code": "TOKEN_INVALID",
    "details": null
  }
}
```

---

### POST /auth/logout

Mencabut (revoke) refresh token. Memerlukan autentikasi.

**Request Body**

```json
{
  "refresh_token": "string"
}
```

**Response Sukses (200 OK)**

```json
{
  "status": "success",
  "message": "Logout berhasil",
  "data": null
}
```

---

## 2. User Management

### POST /users

Membuat akun pengguna baru. Hanya dapat dilakukan oleh Admin.

**Request Body**

```json
{
  "username": "string",
  "password": "string",
  "role": "KASIR | ADMIN",
  "merchant_id": "string"
}
```

**Response Sukses (201 Created)**

```json
{
  "status": "success",
  "message": "Pengguna berhasil dibuat",
  "data": {
    "id": "usr_01j...",
    "username": "kasir02",
    "role": "KASIR",
    "merchant_id": "mrc_01j...",
    "created_at": "2025-08-13T10:00:00Z"
  }
}
```

**Response Error (400 Bad Request)**

```json
{
  "status": "error",
  "message": "Data request tidak valid",
  "error": {
    "code": "VALIDATION_ERROR",
    "details": [
      { "field": "password", "message": "Password minimal 8 karakter" }
    ]
  }
}
```

**Response Error (403 Forbidden)**

```json
{
  "status": "error",
  "message": "Anda tidak memiliki izin untuk melakukan aksi ini",
  "error": {
    "code": "INSUFFICIENT_PERMISSION",
    "details": null
  }
}
```

---

### GET /users/me

Mendapatkan profil pengguna yang sedang login.

**Response Sukses (200 OK)**

```json
{
  "status": "success",
  "message": "Profil pengguna",
  "data": {
    "id": "usr_01j...",
    "username": "kasir01",
    "role": "KASIR",
    "merchant_id": "mrc_01j..."
  }
}
```

---

## 3. Produk

### GET /products

Mendapatkan daftar produk milik merchant yang sedang login. Digunakan Kasir untuk mengisi item transaksi.

**Query Parameters**

| Parameter | Tipe | Keterangan |
|---|---|---|
| `page` | `integer` | Halaman (default: 1) |
| `limit` | `integer` | Jumlah item per halaman (default: 50) |
| `search` | `string` | Pencarian berdasarkan nama produk |

**Response Sukses (200 OK)**

```json
{
  "status": "success",
  "message": "Daftar produk",
  "data": {
    "items": [
      {
        "id": "prd_01j...",
        "name": "Mie Goreng",
        "price": 15000,
        "stock": 200,
        "unit": "pcs"
      }
    ],
    "meta": {
      "page": 1,
      "limit": 50,
      "total": 120
    }
  }
}
```

---

## 4. Transaksi

### POST /transactions/sync

Endpoint inti sinkronisasi. Menerima satu batch berisi maksimal 100 transaksi yang sebelumnya berstatus Provisional dari perangkat Kasir. Setiap transaksi diproses secara idempoten berdasarkan `transaction_id`.

**Request Body**

```json
{
  "transactions": [
    {
      "transaction_id": "string (UUID v4, generated by device)",
      "created_at_device": "2025-08-13T07:30:00Z",
      "payment_method": "CASH | STATIC_QRIS | TRANSFER",
      "items": [
        {
          "product_id": "string",
          "quantity": 2,
          "price_at_sale": 15000
        }
      ],
      "total_amount": 30000,
      "notes": "string | null"
    }
  ]
}
```

**Response Sukses (200 OK)**

Diterima berarti batch telah berhasil diantrekan ke message queue untuk diproses worker. Bukan berarti seluruh transaksi sudah confirmed.

```json
{
  "status": "success",
  "message": "Batch diterima dan sedang diproses",
  "data": {
    "accepted": 100,
    "queued_at": "2025-08-13T10:05:00Z"
  }
}
```

**Response Error (400 Bad Request)**

```json
{
  "status": "error",
  "message": "Struktur batch tidak valid",
  "error": {
    "code": "VALIDATION_ERROR",
    "details": [
      { "field": "transactions[2].items", "message": "Items tidak boleh kosong" }
    ]
  }
}
```

---

### GET /transactions

Mendapatkan daftar transaksi. Kasir hanya dapat melihat transaksi merchant sendiri. Admin dapat mengakses seluruh transaksi merchant yang dikelola.

**Query Parameters**

| Parameter | Tipe | Keterangan |
|---|---|---|
| `status` | `string` | Filter: `PROVISIONAL`, `CONFIRMED`, `VOIDED`, `CONFLICT` |
| `device_id` | `string` | Filter berdasarkan perangkat |
| `page` | `integer` | Halaman (default: 1) |
| `limit` | `integer` | Jumlah item per halaman (default: 20) |
| `start_date` | `string (ISO 8601)` | Filter awal tanggal |
| `end_date` | `string (ISO 8601)` | Filter akhir tanggal |

**Response Sukses (200 OK)**

```json
{
  "status": "success",
  "message": "Daftar transaksi",
  "data": {
    "items": [
      {
        "id": "txn_01j...",
        "transaction_id": "b6a3c1d2-...",
        "status": "CONFIRMED",
        "payment_method": "CASH",
        "total_amount": 30000,
        "created_at_device": "2025-08-13T07:30:00Z",
        "confirmed_at": "2025-08-13T10:05:00Z",
        "device_id": "dev_01j..."
      }
    ],
    "meta": {
      "page": 1,
      "limit": 20,
      "total": 340
    }
  }
}
```

---

### GET /transactions/:id

Mendapatkan detail satu transaksi berdasarkan ID internal backend.

**Response Sukses (200 OK)**

```json
{
  "status": "success",
  "message": "Detail transaksi",
  "data": {
    "id": "txn_01j...",
    "transaction_id": "b6a3c1d2-...",
    "status": "CONFIRMED",
    "payment_method": "CASH",
    "items": [
      {
        "product_id": "prd_01j...",
        "product_name": "Mie Goreng",
        "quantity": 2,
        "price_at_sale": 15000,
        "subtotal": 30000
      }
    ],
    "total_amount": 30000,
    "created_at_device": "2025-08-13T07:30:00Z",
    "confirmed_at": "2025-08-13T10:05:00Z",
    "device_id": "dev_01j...",
    "merchant_id": "mrc_01j..."
  }
}
```

**Response Error (403 Forbidden)**

```json
{
  "status": "error",
  "message": "Anda tidak memiliki akses ke transaksi ini",
  "error": {
    "code": "INSUFFICIENT_PERMISSION",
    "details": null
  }
}
```

**Response Error (404 Not Found)**

```json
{
  "status": "error",
  "message": "Transaksi tidak ditemukan",
  "error": {
    "code": "RESOURCE_NOT_FOUND",
    "details": null
  }
}
```

---

### PATCH /transactions/:id/void

Membatalkan (void) transaksi. Hanya dapat dilakukan pada transaksi berstatus `PROVISIONAL` oleh Kasir, atau oleh Admin untuk transaksi yang belum `CONFIRMED`.

**Request Body**

```json
{
  "reason": "string"
}
```

**Response Sukses (200 OK)**

```json
{
  "status": "success",
  "message": "Transaksi berhasil dibatalkan",
  "data": {
    "id": "txn_01j...",
    "status": "VOIDED",
    "voided_at": "2025-08-13T10:10:00Z",
    "voided_by": "usr_01j..."
  }
}
```

**Response Error (403 Forbidden) — Transaksi Immutable**

```json
{
  "status": "error",
  "message": "Transaksi yang sudah dikonfirmasi backend tidak dapat diubah oleh Kasir",
  "error": {
    "code": "TRANSACTION_IMMUTABLE",
    "details": null
  }
}
```

**Response Error (400 Bad Request) — Transisi Status Tidak Sah**

```json
{
  "status": "error",
  "message": "Transaksi dengan status VOIDED tidak dapat dibatalkan kembali",
  "error": {
    "code": "INVALID_TRANSITION",
    "details": null
  }
}
```

---

## 5. Reconciliation (Admin Only)

### GET /reconciliation

Mendapatkan daftar transaksi yang memerlukan penanganan manual (status `CONFLICT`). Hanya Admin.

**Response Sukses (200 OK)**

```json
{
  "status": "success",
  "message": "Daftar transaksi dalam antrean reconciliation",
  "data": {
    "items": [
      {
        "id": "txn_01j...",
        "transaction_id": "b6a3c1d2-...",
        "status": "CONFLICT",
        "conflict_reason": "INSUFFICIENT_STOCK",
        "payment_method": "TRANSFER",
        "total_amount": 75000,
        "created_at_device": "2025-08-13T07:30:00Z"
      }
    ],
    "meta": {
      "page": 1,
      "limit": 20,
      "total": 5
    }
  }
}
```

---

### POST /reconciliation/:id/resolve

Admin menyelesaikan satu transaksi conflict dengan keputusan: dikonfirmasi secara manual atau di-void.

**Request Body**

```json
{
  "action": "CONFIRM | VOID",
  "notes": "string"
}
```

**Response Sukses (200 OK)**

```json
{
  "status": "success",
  "message": "Transaksi berhasil diselesaikan secara manual",
  "data": {
    "id": "txn_01j...",
    "status": "CONFIRMED",
    "resolved_by": "usr_admin_01j...",
    "resolved_at": "2025-08-13T11:00:00Z"
  }
}
```

---

### POST /reconciliation/:id/correct

Admin melakukan koreksi data pada transaksi yang sudah berstatus `CONFIRMED` sebagai exception workflow. Koreksi tidak menghapus atau mengubah record asli, melainkan membuat correction entry yang terhubung.

**Request Body**

```json
{
  "correction_notes": "string",
  "items": [
    {
      "product_id": "string",
      "quantity": 1,
      "price_at_sale": 15000
    }
  ],
  "total_amount": 15000
}
```

**Response Sukses (201 Created)**

```json
{
  "status": "success",
  "message": "Koreksi transaksi berhasil dicatat",
  "data": {
    "correction_id": "cor_01j...",
    "original_transaction_id": "txn_01j...",
    "corrected_by": "usr_admin_01j...",
    "corrected_at": "2025-08-13T11:30:00Z"
  }
}
```

**Response Error (403 Forbidden)**

```json
{
  "status": "error",
  "message": "Koreksi transaksi hanya dapat dilakukan oleh Admin",
  "error": {
    "code": "INSUFFICIENT_PERMISSION",
    "details": null
  }
}
```

---

## 6. Health Check

### GET /health

Mengecek kondisi sistem. Tidak memerlukan autentikasi.

**Response Sukses (200 OK)**

```json
{
  "status": "success",
  "message": "OK",
  "data": {
    "uptime": 3600,
    "database": "connected",
    "message_queue": "connected"
  }
}
```

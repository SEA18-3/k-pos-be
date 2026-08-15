# API Contract — K-POS Backend

Dokumen ini mendefinisikan spesifikasi lengkap seluruh endpoint REST API untuk backend K-POS. Seluruh endpoint (kecuali yang dicatat secara eksplisit) memerlukan autentikasi melalui Bearer Token JWT pada header `Authorization`.

---

## Konvensi Umum

### Base URL

```
https://<host>/api/v1
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

> Semua endpoint Auth di bawah prefix `/auth`. Endpoint `register`, `login`, `refresh`, `logout` **tidak memerlukan Bearer Token**. Hanya `GET /auth/profile` yang memerlukan token.

---

### POST /auth/register

Mendaftarkan **OWNER** baru secara self-serve. OPERATOR dan ENTRY tidak bisa mendaftar sendiri — harus dibuat oleh OWNER via `POST /users`.

**Request Body**

```json
{
  "full_name": "Budi Santoso",
  "email": "budi@example.com",
  "password": "password123",
  "merchant_name": "Toko Kopi Budi"
}
```

*Field `role` tidak perlu dikirim — selalu `OWNER` secara default.*

**Response Sukses (201 Created)**

```json
{
  "status": "success",
  "message": "Berhasil",
  "data": {
    "user": {
      "id_user": "clxxxxx...",
      "full_name": "Budi Santoso",
      "email": "budi@example.com",
      "role": "OWNER",
      "is_active": true,
      "created_at": "2025-08-14T10:00:00.000Z"
    }
  }
}
```

**Response Error (409 Conflict)**

```json
{
  "status": "error",
  "message": "Email already registered",
  "error": {
    "code": "CONFLICT",
    "details": null
  }
}
```

**Response Error (400 Bad Request)**

```json
{
  "status": "error",
  "message": "Validasi gagal",
  "error": {
    "code": "VALIDATION_ERROR",
    "details": [
      { "field": "password", "message": "Password must be at least 8 characters" }
    ]
  }
}
```

---

### POST /auth/login

Login untuk semua role.

**Request Body**

```json
{
  "email": "budi@example.com",
  "password": "password123"
}
```

**Response Sukses (200 OK)**

```json
{
  "status": "success",
  "message": "Berhasil",
  "data": {
    "access_token": "eyJhbGci...",
    "refresh_token": "a3f9c2d1e4b5...",
    "user": {
      "id_user": "clxxxxx...",
      "full_name": "Budi Santoso",
      "email": "budi@example.com",
      "role": "OPERATOR",
      "is_active": true
    }
  }
}
```

*Catatan: `access_token` adalah JWT yang di-sign dengan payload `{ sub, email, role }`. `refresh_token` adalah opaque random hex (80 karakter), disimpan di tabel `RefreshToken`, berlaku 7 hari.*

**Response Error (401 Unauthorized)**

```json
{
  "status": "error",
  "message": "Invalid credentials",
  "error": {
    "code": "UNAUTHORIZED",
    "details": null
  }
}
```

**Response Error (429 Too Many Requests)**

```json
{
  "status": "error",
  "message": "Terlalu banyak request. Coba lagi dalam beberapa saat.",
  "error": {
    "code": "RATE_LIMIT_EXCEEDED",
    "details": null
  }
}
```

---

### GET /auth/profile

Mendapatkan profil user yang sedang login. **Memerlukan Bearer Token JWT.**

**Header:** `Authorization: Bearer <access_token>`

**Response Sukses (200 OK)**

```json
{
  "status": "success",
  "message": "Berhasil",
  "data": {
    "user": {
      "id_user": "clxxxxx...",
      "full_name": "Budi Santoso",
      "email": "budi@example.com",
      "role": "OPERATOR",
      "is_active": true,
      "created_at": "2025-08-14T10:00:00.000Z",
      "updated_at": "2025-08-14T10:00:00.000Z"
    }
  }
}
```

**Response Error (401 Unauthorized)**

```json
{
  "status": "error",
  "message": "Unauthorized",
  "error": {
    "code": "UNAUTHORIZED",
    "details": null
  }
}
```

---

### POST /auth/refresh

Memperbarui access token menggunakan refresh token yang masih valid. Tidak memerlukan Bearer Token.

**Request Body**

```json
{
  "refreshToken": "a3f9c2d1e4b5..."
}
```

*Catatan: field name adalah `refreshToken` (camelCase), bukan `refresh_token`.*

**Response Sukses (200 OK)**

```json
{
  "status": "success",
  "message": "Berhasil",
  "data": {
    "access_token": "eyJhbGci..."
  }
}
```

**Response Error (401 Unauthorized)**

```json
{
  "status": "error",
  "message": "Invalid or expired refresh token",
  "error": {
    "code": "UNAUTHORIZED",
    "details": null
  }
}
```

---

### POST /auth/logout

Mencabut (revoke) refresh token dengan menghapusnya dari database. Tidak memerlukan Bearer Token.

**Request Body**

```json
{
  "refreshToken": "a3f9c2d1e4b5..."
}
```

*Field name: `refreshToken` (camelCase).*

**Response Sukses (200 OK)**

```json
{
  "status": "success",
  "message": "Berhasil",
  "data": {
    "success": true
  }
}
```

---

## 2. Merchant Management

> Manajemen profil toko (Merchant). Profil ini otomatis dibuatkan saat OWNER mendaftar.

### GET /merchants/me

Mengambil data profil merchant dari user yang sedang login.

**Header:** `Authorization: Bearer <access_token>`

**Response Sukses (200 OK)**
```json
{
  "status": "success",
  "message": "Merchant profile retrieved successfully",
  "data": {
    "merchant": {
      "id_merchant": "clyyyyy...",
      "name": "Toko Kopi Budi",
      "address": null,
      "phone": null,
      "email": null,
      "is_active": true,
      "onboarded_at": "2025-08-14T10:00:00.000Z",
      "created_at": "2025-08-14T10:00:00.000Z",
      "updated_at": "2025-08-14T10:00:00.000Z"
    }
  }
}
```

---

## 3. User Management

### POST /users

Membuat akun pengguna baru di dalam merchant. Dapat dilakukan oleh **OWNER** (hanya untuk OPERATOR/ENTRY di merchantnya sendiri) atau **ADMIN**.

**Header:** `Authorization: Bearer <access_token>`

**Request Body**

```json
{
  "full_name": "Budi Santoso",
  "email": "budi@toko.com",
  "password": "password123",
  "role": "OPERATOR"
}
```

*Nilai `role` yang diizinkan: `OPERATOR`, `ENTRY`, `OWNER` (ADMIN tidak bisa dibuat via endpoint ini).*

**Response Sukses (201 Created)**

```json
{
  "status": "success",
  "message": "Berhasil",
  "data": {
    "id_user": "clxxxxx...",
    "full_name": "Budi Santoso",
    "email": "budi@toko.com",
    "role": "OPERATOR",
    "id_merchant": "clyyyyy...",
    "is_active": true,
    "created_at": "2025-08-13T10:00:00.000Z"
  }
}
```

---

### GET /users

Mengambil daftar seluruh user/staf yang berada dalam satu merchant yang sama.

**Header:** `Authorization: Bearer <access_token>` *(OWNER)*

**Response Sukses (200 OK)**

```json
{
  "status": "success",
  "message": "Berhasil",
  "data": {
    "items": [
      {
        "id_user": "clxxxxx...",
        "full_name": "Budi Santoso",
        "email": "budi@toko.com",
        "role": "OPERATOR",
        "id_merchant": "clyyyyy...",
        "is_active": true,
        "created_at": "2025-08-13T10:00:00.000Z",
        "updated_at": "2025-08-13T10:00:00.000Z"
      }
    ]
  }
}
```

---

### PATCH /users/:id_user/status

Mengaktifkan atau menonaktifkan akun staf (Soft Delete).

**Header:** `Authorization: Bearer <access_token>` *(OWNER)*

**Request Body**
```json
{
  "is_active": false
}
```

**Response Sukses (200 OK)**

```json
{
  "status": "success",
  "message": "Berhasil",
  "data": {
    "id_user": "clxxxxx...",
    "full_name": "Budi Santoso",
    "email": "budi@toko.com",
    "role": "OPERATOR",
    "id_merchant": "clyyyyy...",
    "is_active": false,
    "updated_at": "2025-08-14T10:00:00.000Z"
  }
}
```



---

## 4. Device Pairing & Management

> Endpoint untuk manajemen perangkat kasir. Hanya `OWNER` yang dapat mendaftarkan dan menghapus perangkat. Endpoint `/devices/pair` dapat diakses secara publik (tanpa token) oleh aplikasi kasir.

---

### POST /devices

Mendaftarkan perangkat baru dan meng-*generate* kode pairing 6 digit.

**Header:** `Authorization: Bearer <access_token>` *(OWNER)*

**Request Body**

```json
{
  "name": "Tablet Kasir Depan"
}
```

**Response Sukses (201 Created)**

```json
{
  "status": "success",
  "message": "Berhasil mendaftarkan perangkat",
  "data": {
    "id_device": "cldevxxx...",
    "name": "Tablet Kasir Depan",
    "pairing_code": "482910",
    "status": "UNPAIRED",
    "created_at": "2025-08-14T10:00:00.000Z"
  }
}
```

---

### POST /devices/pair

Melakukan *pairing* dari perangkat fisik. Mengunci `hardware_id` ke perangkat yang didaftarkan.

**Header:** Tidak wajib *(Public Endpoint)*

**Request Body**

```json
{
  "pairing_code": "482910",
  "hardware_id": "uuid-atau-android-id-unik-disini"
}
```

**Response Sukses (200 OK)**

```json
{
  "status": "success",
  "message": "Perangkat berhasil dipairing",
  "data": {
    "id_device": "cldevxxx...",
    "status": "PAIRED"
  }
}
```

**Response Error (404/400) — Kode salah/kadaluwarsa**

```json
{
  "status": "error",
  "message": "Invalid pairing code or device already paired",
  "error": {
    "code": "VALIDATION_ERROR",
    "details": null
  }
}
```

---

### GET /devices

Mendapatkan daftar perangkat milik merchant.

**Header:** `Authorization: Bearer <access_token>` *(OWNER)*

**Response Sukses (200 OK)**

```json
{
  "status": "success",
  "message": "Berhasil",
  "data": {
    "items": [
      {
        "id_device": "cldevxxx...",
        "name": "Tablet Kasir Depan",
        "status": "PAIRED",
        "last_online_at": "2025-08-14T10:30:00.000Z",
        "created_at": "2025-08-14T10:00:00.000Z"
      }
    ]
  }
}
```

---

### DELETE /devices/:id_device

Mencabut akses (*revoke*) dan men-soft delete perangkat.

**Header:** `Authorization: Bearer <access_token>` *(OWNER)*

**Response Sukses (200 OK)**

```json
{
  "status": "success",
  "message": "Perangkat berhasil dihapus",
  "data": {
    "id_device": "cldevxxx...",
    "status": "REVOKED",
    "is_active": false
  }
}
```

---

## 5. Upload & Storage

> Endpoint upload ini digunakan secara generik untuk mengunggah gambar (seperti gambar produk, logo merchant, dll) ke Supabase Storage. Mengembalikan URL gambar yang bisa digunakan untuk endpoint lain.

---

### POST /upload/image

Upload file gambar (maksimal 5MB, format: `jpeg`, `png`, `webp`).

**Header:**
- `Authorization: Bearer <access_token>` *(OWNER, OPERATOR, atau ENTRY)*
- `Content-Type: multipart/form-data`

**Request Body (Form-Data)**

| Key | Tipe | Keterangan |
|---|---|---|
| `file` | `file` | File gambar biner |

**Response Sukses (201 Created)**

```json
{
  "status": "success",
  "message": "File berhasil diunggah",
  "data": {
    "file_url": "https://xxxxx.supabase.co/storage/v1/object/public/k-pos-images/products/123456789.jpg"
  }
}
```

**Response Error (400 Bad Request - File terlalu besar/format salah)**

```json
{
  "status": "error",
  "message": "Validasi gagal",
  "error": {
    "code": "VALIDATION_ERROR",
    "details": "File must be a valid image and not exceed 5MB"
  }
}
```

---

## 6. Produk & Inventory

> Seluruh endpoint produk memerlukan autentikasi. `GET /products` dapat diakses semua role dalam satu merchant. Endpoint mutasi (POST, PATCH, DELETE) hanya untuk `OWNER` dan `ENTRY`.

---

### GET /products

Mendapatkan daftar produk beserta stok terkini milik merchant yang sedang login.

**Header:** `Authorization: Bearer <access_token>`

**Query Parameters**

| Parameter | Tipe | Keterangan |
|---|---|---|
| `cursor` | `string` | Cursor untuk pagination (menggunakan `id_product`) |
| `limit` | `integer` | Jumlah item per halaman (default: 50) |
| `search` | `string` | Pencarian berdasarkan `name` atau `sku` |
| `is_active` | `boolean` | Filter produk aktif/nonaktif |

**Response Sukses (200 OK)**

```json
{
  "status": "success",
  "message": "Berhasil",
  "data": {
    "items": [
      {
        "id_product": "clxxxxx...",
        "id_merchant": "clyyyyy...",
        "name": "Mie Goreng",
        "sku": "MG-001",
        "price": "15000.00",
        "image_url": "https://storage.googleapis.com/bucket/products/mg-001.jpg",
        "is_active": true,
        "created_at": "2025-08-13T10:00:00.000Z",
        "updated_at": "2025-08-13T10:00:00.000Z",
        "inventory": {
          "id_inventory": "clinvxx...",
          "current_stock": 200,
          "reserved": 0,
          "last_updated": "2025-08-13T10:00:00.000Z"
        }
      }
    ],
    "meta": {
      "next_cursor": "clprdxxx...",
      "limit": 50
    }
  }
}
```

---

### POST /products

Menambahkan produk baru dan otomatis membuat record `Inventory` dengan `current_stock = 0`.

**Header:** `Authorization: Bearer <access_token>` *(OWNER atau ENTRY)*

**Request Body**

```json
{
  "name": "Mie Goreng",
  "sku": "MG-001",
  "price": 15000,
  "image_url": "https://storage.googleapis.com/bucket/products/mg-001.jpg"
}
```

**Response Sukses (201 Created)**

```json
{
  "status": "success",
  "message": "Berhasil",
  "data": {
    "id_product": "clxxxxx...",
    "id_merchant": "clyyyyy...",
    "name": "Mie Goreng",
    "sku": "MG-001",
    "price": "15000.00",
    "image_url": "https://storage.googleapis.com/bucket/products/mg-001.jpg",
    "is_active": true,
    "created_at": "2025-08-13T10:00:00.000Z",
    "inventory": {
      "id_inventory": "clinvxx...",
      "current_stock": 0,
      "reserved": 0
    }
  }
}
```

---

### PATCH /products/:id_product

Update detail produk (nama, SKU, harga).

**Header:** `Authorization: Bearer <access_token>` *(OWNER atau ENTRY)*

**Request Body** *(semua field opsional)*

```json
{
  "name": "Mie Goreng Spesial",
  "sku": "MG-001-S",
  "price": 17000,
  "image_url": "https://storage.googleapis.com/bucket/products/mg-001-s.jpg"
}
```

**Response Sukses (200 OK)**

```json
{
  "status": "success",
  "message": "Berhasil",
  "data": {
    "id_product": "clxxxxx...",
    "name": "Mie Goreng Spesial",
    "sku": "MG-001-S",
    "price": "17000.00",
    "image_url": "https://storage.googleapis.com/bucket/products/mg-001-s.jpg",
    "is_active": true,
    "updated_at": "2025-08-13T11:00:00.000Z"
  }
}
```

---

### POST /products/:id_product/stock

Penyesuaian stok manual (*Stock Opname* / Barang Masuk / Barang Keluar). Mencatat `StockHistory` dengan `movement_type = ADJUSTMENT`.

**Header:** `Authorization: Bearer <access_token>` *(OWNER atau ENTRY)*

**Request Body**

```json
{
  "quantity": 50,
  "notes": "Barang masuk dari supplier"
}
```

*`quantity` positif = penambahan stok; negatif = pengurangan (misal: barang rusak/hilang).*

**Response Sukses (200 OK)**

```json
{
  "status": "success",
  "message": "Berhasil",
  "data": {
    "id_product": "clxxxxx...",
    "previous_stock": 200,
    "current_stock": 250,
    "stock_history": {
      "id_stock": "clstkxx...",
      "movement_type": "ADJUSTMENT",
      "quantity": 50,
      "notes": "Barang masuk dari supplier",
      "date": "2025-08-13T10:00:00.000Z"
    }
  }
}
```

---

### DELETE /products/:id_product

Soft delete produk (`is_active = false`). Produk tidak akan muncul di daftar kecuali difilter.

**Header:** `Authorization: Bearer <access_token>` *(OWNER atau ENTRY)*

**Response Sukses (200 OK)**

```json
{
  "status": "success",
  "message": "Berhasil",
  "data": {
    "id_product": "clxxxxx...",
    "is_active": false,
    "updated_at": "2025-08-13T12:00:00.000Z"
  }
}
```

---

## 7. Transaksi

---

### POST /sync

Endpoint inti sinkronisasi. Menerima satu batch berisi maksimal 100 transaksi *provisional* dari perangkat OPERATOR. Setiap transaksi diproses secara idempoten berdasarkan `offline_uuid`.

**Header:** `Authorization: Bearer <access_token>`

**Request Body**

```json
{
  "transactions": [
    {
      "offline_uuid": "b6a3c1d2-...",
      "id_device": "cldevxxx...",
      "created_at_local": "2025-08-13T07:30:00.000Z",
      "payment_method": "CASH",
      "subtotal": 30000,
      "total": 30000,
      "notes": null,
      "items": [
        {
          "id_product": "clprdxxx...",
          "quantity": 2,
          "unit_price": 15000,
          "subtotal": 30000
        }
      ],
      "payment": {
        "method": "CASH",
        "amount": 30000,
        "cash_received": 50000,
        "change_amount": 20000
      }
    }
  ]
}
```

*Untuk STATIC_QRIS: sertakan `qris_code`. Untuk BANK_TRANSFER: sertakan `transfer_ref`.*

**Response Sukses (200 OK)**

```json
{
  "status": "success",
  "message": "Batch diterima dan sedang diproses",
  "data": {
    "accepted": 1,
    "queued_at": "2025-08-13T10:05:00.000Z"
  }
}
```

---

### GET /transactions

Mendapatkan daftar transaksi. OPERATOR hanya melihat transaksi merchant-nya sendiri. OWNER/ADMIN melihat seluruh transaksi merchant.

**Header:** `Authorization: Bearer <access_token>`

**Query Parameters**

| Parameter | Tipe | Keterangan |
|---|---|---|
| `status` | `string` | Filter: `PENDING`, `CONFIRMED`, `VOIDED`, `FAILED` |
| `sync_status` | `string` | Filter: `PENDING_SYNC`, `SYNCING`, `SYNCED`, `SYNC_FAILED`, `SYNC_CONFLICT` |
| `id_device` | `string` | Filter berdasarkan `id_device` |
| `page` | `integer` | Halaman (default: 1) |
| `limit` | `integer` | Jumlah per halaman (default: 20) |
| `start_date` | `string (ISO 8601)` | Filter awal tanggal |
| `end_date` | `string (ISO 8601)` | Filter akhir tanggal |

**Response Sukses (200 OK)**

```json
{
  "status": "success",
  "message": "Berhasil",
  "data": {
    "items": [
      {
        "id_transaction": "cltxnxxx...",
        "id_merchant": "clmrcxxx...",
        "id_user": "clusrxxx...",
        "id_device": "cldevxxx...",
        "offline_uuid": "b6a3c1d2-...",
        "status": "CONFIRMED",
        "sync_status": "SYNCED",
        "subtotal": "30000.00",
        "total": "30000.00",
        "created_at_local": "2025-08-13T07:30:00.000Z",
        "created_at": "2025-08-13T10:05:00.000Z",
        "confirmed_at": "2025-08-13T10:05:00.000Z",
        "notes": null
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

### GET /transactions/:id_transaction

Mendapatkan detail satu transaksi beserta item (`DetailTransaction`) dan pembayaran (`Payment`).

**Header:** `Authorization: Bearer <access_token>`

**Response Sukses (200 OK)**

```json
{
  "status": "success",
  "message": "Berhasil",
  "data": {
    "id_transaction": "cltxnxxx...",
    "id_merchant": "clmrcxxx...",
    "id_user": "clusrxxx...",
    "id_device": "cldevxxx...",
    "offline_uuid": "b6a3c1d2-...",
    "status": "CONFIRMED",
    "sync_status": "SYNCED",
    "subtotal": "30000.00",
    "total": "30000.00",
    "notes": null,
    "created_at_local": "2025-08-13T07:30:00.000Z",
    "created_at": "2025-08-13T10:05:00.000Z",
    "confirmed_at": "2025-08-13T10:05:00.000Z",
    "synced_at": "2025-08-13T10:05:00.000Z",
    "voided_at": null,
    "voided_by": null,
    "void_reason": null,
    "details": [
      {
        "id_detail": "cldetxxx...",
        "id_product": "clprdxxx...",
        "quantity": 2,
        "unit_price": "15000.00",
        "subtotal": "30000.00"
      }
    ],
    "payment": {
      "id_payment": "clpaymxx...",
      "amount": "30000.00",
      "method": "CASH",
      "status": "VERIFIED",
      "cash_received": "50000.00",
      "change_amount": "20000.00",
      "qris_code": null,
      "transfer_ref": null,
      "verified_at": "2025-08-13T10:05:00.000Z",
      "verified_by": null
    }
  }
}
```

---

### PATCH /transactions/:id_transaction/void

Membatalkan transaksi. OPERATOR hanya bisa void transaksi berstatus `PENDING` milik merchantnya. OWNER/ADMIN bisa void transaksi berstatus `PENDING` atau `CONFIRMED`.

**Header:** `Authorization: Bearer <access_token>`

**Request Body**

```json
{
  "void_reason": "Pelanggan membatalkan pesanan"
}
```

*Field name sesuai schema: `void_reason`.*

**Response Sukses (200 OK)**

```json
{
  "status": "success",
  "message": "Berhasil",
  "data": {
    "id_transaction": "cltxnxxx...",
    "status": "VOIDED",
    "voided_at": "2025-08-13T10:10:00.000Z",
    "voided_by": "clusrxxx..."
  }
}
```

**Response Error (403 Forbidden) — Transaksi Immutable**

```json
{
  "status": "error",
  "message": "Transaksi yang sudah dikonfirmasi backend tidak dapat diubah oleh OPERATOR",
  "error": {
    "code": "TRANSACTION_IMMUTABLE",
    "details": null
  }
}
```

---

## 7. Reconciliation (OWNER / ADMIN)

> Seluruh endpoint ini hanya dapat diakses oleh role `OWNER` (hanya untuk merchantnya sendiri) atau `ADMIN`.

---

### GET /transactions?sync_status=SYNC_CONFLICT

Mendapatkan daftar transaksi bermasalah. Gunakan endpoint `GET /transactions` yang sama dengan query param `sync_status=SYNC_CONFLICT`.

**Contoh Request**

```
GET /api/transactions?sync_status=SYNC_CONFLICT
```

Response mengikuti format `GET /transactions` di atas dengan `sync_status: "SYNC_CONFLICT"`.

---

### POST /transactions/:id_transaction/resolve

Menyelesaikan satu transaksi berstatus `SYNC_CONFLICT` secara manual.

**Header:** `Authorization: Bearer <access_token>` *(OWNER atau ADMIN)*

**Request Body**

```json
{
  "action": "CONFIRM",
  "notes": "Dikonfirmasi manual oleh owner karena stok sudah diisi ulang"
}
```

*`action`: `CONFIRM` atau `VOID`.*

**Response Sukses (200 OK)**

```json
{
  "status": "success",
  "message": "Berhasil",
  "data": {
    "id_transaction": "cltxnxxx...",
    "status": "CONFIRMED",
    "sync_status": "SYNCED",
    "confirmed_at": "2025-08-13T11:00:00.000Z"
  }
}
```

---

### POST /transactions/:id_transaction/correct

Koreksi transaksi yang sudah `CONFIRMED`. Membuat transaksi baru yang dihubungkan ke transaksi lama via tabel `TransactionCorrection` (*Immutable Bridge* — transaksi asli tidak diubah).

**Header:** `Authorization: Bearer <access_token>` *(OWNER atau ADMIN)*

**Request Body**

```json
{
  "reason": "Salah input jumlah item",
  "items": [
    {
      "id_product": "clprdxxx...",
      "quantity": 1,
      "unit_price": 15000,
      "subtotal": 15000
    }
  ],
  "subtotal": 15000,
  "total": 15000
}
```

**Response Sukses (201 Created)**

```json
{
  "status": "success",
  "message": "Berhasil",
  "data": {
    "id_correction": "clcorxxx...",
    "id_old_transaction": "cltxnxxx...",
    "id_new_transaction": "cltxnyyy...",
    "corrected_by": "clusrxxx...",
    "reason": "Salah input jumlah item",
    "created_at": "2025-08-13T11:30:00.000Z"
  }
}
```

---

## 8. Health Check

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

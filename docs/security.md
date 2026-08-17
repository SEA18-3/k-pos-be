# Security Architecture & Implementation

Dokumen ini menjelaskan rancangan arsitektur keamanan untuk sistem K-POS, mencakup autentikasi, autorisasi, mitigasi ancaman otomatis, dan keamanan CI/CD, sebagai pemenuhan NFR Keamanan dan kriteria *Security Implementation* (10% Skor).

## 1. Authentication & Authorization (NFR-SEC-01)

Sistem menggunakan **JWT (JSON Web Token)** untuk otentikasi karena sifatnya yang *stateless* dan sangat cocok untuk arsitektur REST API terdistribusi.

- **Password Hashing:** Menggunakan `bcrypt` dengan *salt rounds* 10 untuk mencegah serangan *Rainbow Table* dan *Brute-Force*.
- **Role-Based Access Control (RBAC):** Memiliki 4 level hierarki:
  1. `ADMIN`: Superuser sistem.
  2. `OWNER`: Pemilik toko/merchant.
  3. `OPERATOR`: Kasir (hanya memiliki akses sinkronisasi transaksi).
  4. `ENTRY`: Petugas input stok (hanya memiliki akses inventaris).
  - *Justifikasi:* Pemisahan ini mencegah kasir untuk mengubah harga produk (NFR-SEC-03) atau melakukan rekonsiliasi DLQ.

## 2. API Protection & Mitigasi Ancaman (NFR-SEC-02)

- **Rate Limiting (Throttler):**
  - Menggunakan `@nestjs/throttler`. Endpoint sensitif seperti `POST /auth/login` dibatasi maksimal 5 permintaan per menit per IP untuk mencegah *Brute-Force Attack*.
- **Data Sanitization & Validation:**
  - Menggunakan `class-validator` di seluruh DTO. Semua input dari Frontend divaksinasi menggunakan `ValidationPipe(whitelist: true, forbidNonWhitelisted: true)`. Ini mencegah serangan *Payload Injection* dan *Over-posting*.

## 3. CI/CD Security Pipeline

Sistem mengimplementasikan pengamanan kode otomatis di GitHub Actions untuk memastikan kualitas dan integritas repositori:

### A. Semgrep (Static Application Security Testing - SAST)
- **Implementasi:** *Workflow* Github Actions khusus yang menjalankan pemindaian Semgrep pada setiap *Pull Request*.
- **Justifikasi:** Semgrep bertindak sebagai pemindai kode statis otomatis. *Tool* ini mendeteksi pola kode rentan (seperti *SQL Injection* atau *Hardcoded Secrets*) sebelum kode digabungkan ke cabang utama. Semgrep terintegrasi langsung di GitHub Actions tanpa memerlukan infrastruktur tambahan.

### B. OpenSSF Scorecard
- **Implementasi:** Pengecekan otomatis terhadap metrik keamanan repositori standar *Open Source Security Foundation*.
- **Justifikasi:** Memastikan repositori mematuhi standar *Supply Chain Security*, seperti mencegah penggabungan kode tanpa ulasan (Code Review), kontrol akses, dan pemantauan kerentanan dependensi (memenuhi NFR-SEC-04).

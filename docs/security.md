# Security Architecture & Implementation

Dokumen ini menjelaskan rancangan arsitektur keamanan untuk sistem K-POS, mencakup autentikasi, autorisasi, mitigasi ancaman otomatis, dan keamanan CI/CD, sebagai pemenuhan NFR Keamanan dan kriteria *Security Implementation*.

## 1. Authentication & Authorization

Sistem menggunakan **JWT (JSON Web Token)** untuk otentikasi karena sifatnya yang *stateless* dan sangat cocok untuk arsitektur REST API terdistribusi.

- **Access & Refresh Token (NFR-SEC-03):** Access token JWT dibuat berdurasi pendek (15-30 menit) untuk mengurangi risiko kebocoran token. Sistem juga mengimplementasikan mekanisme Refresh Token yang disimpan secara persisten di database (tabel `RefreshToken`). Hal ini memungkinkan fitur pembatalan sesi (*token revocation*) seperti *logout* dari semua perangkat atau pemblokiran akun, yang tidak mungkin dilakukan dengan JWT *stateless* murni. Saat perangkat *offline*, autentikasi menggunakan *session/credential* lokal yang tidak bergantung pada validasi *expiry* secara *real-time*.
- **Password Hashing (NFR-SEC-01):** Menggunakan `bcrypt` dengan *salt rounds* 10 untuk melakukan *secure hashing* pada password pengguna, mencegah serangan *Rainbow Table* dan *Brute-Force*.
- **Role-Based Access Control (RBAC):** Memiliki 4 level hierarki (`OWNER`, `OPERATOR`, `ENTRY`) untuk mencegah ekskalasi hak akses (misalnya mencegah kasir mengubah harga produk).

## 2. API Protection & Mitigasi Ancaman

- **Data in Transit (NFR-SEC-02):** Seluruh komunikasi antara aplikasi klien (Kasir) dan backend (termasuk saat sinkronisasi transaksi) wajib menggunakan protokol **HTTPS/TLS** untuk mencegah *Man-in-the-Middle* (MitM) *attack*.
- **SQL Injection Prevention (NFR-SEC-04):** Sistem menggunakan **Prisma ORM** yang secara otomatis melakukan *parameterized query* untuk seluruh operasi database, sehingga sama sekali tidak ada celah *raw query* langsung dari input pengguna.
- **XSS Prevention (NFR-SEC-05):** Semua data output ke UI di-sanitasi. Selain itu, backend menggunakan **Helmet** (`app.use(helmet())`) yang mengatur *HTTP Security Headers* secara otomatis untuk mencegah serangan *Cross-Site Scripting* (XSS) dan eksploitasi sejenis.
- **Brute-Force Protection & Rate Limiting (NFR-SEC-06):** Menggunakan modul `@nestjs/throttler` sebagai pengaman *Rate Limiting* global. Endpoint sensitif seperti `POST /auth/login` dibatasi dengan ketat untuk mencegah serangan penebakan kata sandi secara paksa (*Brute-force attack*).
- **Data Sanitization & Input Validation (NFR-SEC-07):** Menggunakan `class-validator` di seluruh DTO. Semua *request body* yang masuk dari frontend divalidasi secara ketat menggunakan `ValidationPipe(whitelist: true, forbidNonWhitelisted: true)` untuk membuang parameter tak terduga, mencegah *Payload Injection* dan *Over-posting*.

## 3. Supply Chain Security (OSSF)

Sistem mengimplementasikan pengamanan kode otomatis (*DevSecOps*) di GitHub Actions untuk memastikan integritas repositori melalui **Semgrep (Static Application Security Testing - SAST)**. Melalui *workflow* khusus, pemindaian Semgrep dijalankan pada setiap *Pull Request* sebagai pemindai statis otomatis. Hal ini berfungsi untuk mendeteksi pola kode rentan (seperti *hardcoded secrets*, celah logika, atau kesalahan konfigurasi keamanan) sebelum kode digabungkan ke cabang utama.
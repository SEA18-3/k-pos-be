# Architectural Justification & Trade-offs

Dokumen ini menjelaskan setiap keputusan arsitektur yang diimplementasikan pada K-POS Backend, beserta alasan teknis yang mendasarinya.

---

## 1. Framework: NestJS (Backend) & Progressive Web App (Frontend)

**Keputusan:** Menggunakan NestJS v11 sebagai framework utama backend dan membangun aplikasi sisi klien (K-POS Kasir) sebagai *Progressive Web App* (PWA).

NestJS menyediakan struktur yang modular secara native melalui sistem `@Module()`. Setiap domain bisnis dienkapsulasi ke dalam modul tersendiri yang dapat dikembangkan dan diuji secara independen. NestJS juga memiliki dukungan bawaan untuk *microservice transport* (RabbitMQ), `@nestjs/jwt`, dan *dependency injection*, sehingga mengurangi boilerplate.

PWA memungkinkan aplikasi berjalan di *browser* berbagai perangkat (PC, tablet, *smartphone*) tanpa proses instalasi yang rumit, namun tetap memiliki kapabilitas *offline* melalui *Service Worker* dan IndexedDB. Hal ini sangat krusial untuk memenuhi syarat operasional *offline-first* di lingkungan dengan koneksi internet yang tidak stabil.

**Trade-off:** Node.js (NestJS) bersifat *single-threaded*, namun sangat cocok karena mayoritas operasi K-POS bersifat I/O-bound.

---

## 2. Arsitektur Offline-First & Sinkronisasi via RabbitMQ

**Keputusan:** Transaksi di sisi klien bersifat *provisional* dan disinkronkan secara asinkron ke server melalui antrean pesan RabbitMQ, bukan melalui request HTTP langsung ke database.

Ini adalah keputusan arsitektur paling mendasar di K-POS. Jika sinkronisasi dilakukan secara sinkron, lonjakan koneksi dari ratusan *device* yang reconnect bersamaan (skenario NFR-SCA-04) akan langsung membebani database. Dengan menempatkan RabbitMQ sebagai *buffer*, request dari klien hanya perlu melakukan `publish` ke antrean, sementara pemrosesan ke database dilakukan secara terkontrol oleh *consumer* sesuai kapasitas yang tersedia.

**Trade-off:** Menambah kompleksitas operasional, namun kemampuannya menyerap lonjakan lalu lintas secara elastis adalah pertimbangan yang jauh lebih penting dari kebutuhan simplisitas.

---

## 3. Hybrid Application: HTTP + RabbitMQ Consumer dalam Satu Proses

**Keputusan:** NestJS dikonfigurasi sebagai *hybrid application*, HTTP server dan RabbitMQ microservice consumer berjalan dalam satu proses yang sama.

Pendekatan ini dipilih karena consumer dan HTTP API berbagi dependensi yang sama (`PrismaService`, dsb.). Memisahkan keduanya ke dalam dua proses yang berbeda hanya menambah overhead infrastruktur tanpa manfaat yang signifikan pada skala proyek saat ini.

**Trade-off:** Jika beban konsumsi pesan sangat tinggi, proses ini tidak dapat di-*scale* secara independen dari HTTP API. Untuk mengatasi ini, `prefetchCount: 10` digunakan untuk membatasi jumlah pesan yang diproses secara bersamaan. Sebagai *future work* jika skala aplikasi semakin besar, *consumer* RabbitMQ dapat dipisah menjadi *microservice* yang benar-benar independen agar dapat di-*scale* (contoh: diperbanyak *instance*-nya) terpisah dari HTTP API.

---

## 4. Degraded Mode: Startup Tanpa RabbitMQ

**Keputusan:** Jika RabbitMQ tidak tersedia saat startup, aplikasi tetap berjalan dengan hanya HTTP API yang aktif.

Ini memastikan aplikasi tidak crash total jika broker sedang *restart* atau belum tersedia. Endpoint HTTP seperti `/health`, `/auth`, dan data master tetap dapat melayani request. Hanya alur sinkronisasi yang tertunda.

---

## 5. Topologi RabbitMQ: DLX + DLQ + TTL Retry Queues

**Keputusan:** Menggunakan topologi antrean bertingkat: antrean utama (`sync.transactions`) → DLX/DLQ (`sync.dlq`) → TTL retry queues (`sync.retry.5s`, `sync.retry.30s`, `sync.retry.120s`).

Mekanisme retry dengan jeda waktu bertahap memberikan waktu pemulihan jika kegagalan disebabkan oleh kondisi sementara. Setelah melebihi `MAX_RETRIES = 3`, transaksi dicatat secara permanen ke tabel `SyncQueue` dengan status `SYNC_FAILED` untuk diinvestigasi secara manual.

**Trade-off:** Kompleksitas topologi meningkat, namun penting untuk keandalan tinggi (NFR-REL-01: 99% success rate).

---

## 6. Idempotency: `offline_uuid` + `payload_hash`

**Keputusan:** Setiap transaksi memiliki dua penjaga duplikasi: `@@unique([id_device, offline_uuid])` di database, dan validasi `payload_hash` (SHA-256) sebelum publish ke antrean.

`offline_uuid` memastikan transaksi tidak diproses dua kali akibat *network retry*. `payload_hash` menolak request jika UUID yang sama dikirim ulang dengan payload yang berbeda (indikasi manipulasi/korupsi data).

---

## 7. Database Locking: `SELECT ... FOR UPDATE`

**Keputusan:** Pengecekan stok di dalam sync consumer menggunakan raw query `SELECT ... FOR UPDATE`.

Implementasi *row-level locking* memastikan hanya satu transaksi yang membaca dan memodifikasi stok produk pada satu waktu, mencegah *race condition* yang bisa menyebabkan stok menjadi negatif saat banyak perangkat sync barang yang sama bersamaan.

---

## 8. Penanganan Konflik Stok: Status `PENDING` + `SYNC_CONFLICT`

**Keputusan:** Jika stok tidak mencukupi saat sinkronisasi, transaksi tidak ditolak melainkan disimpan dengan status `PENDING` dan `SYNC_CONFLICT`.

Menolak transaksi akan menghilangkan jejak audit. Dengan menyimpannya sebagai konflik, pemilik toko dapat menginvestigasi dan menyelesaikannya secara manual melalui API `PATCH /transactions/:id/resolve-conflict`. Stok tidak dikurangi pada transaksi yang konflik.

---

## 9. Validasi Aritmatika di Consumer

**Keputusan:** Consumer memvalidasi kebenaran perhitungan (quantity × unit_price = subtotal) sebelum menyimpan data.

Mencegah masuknya data yang rusak secara matematis akibat korupsi penyimpanan lokal di sisi klien, meskipun struktur payload-nya tampak valid secara DTO.

---

## 10. ORM: Prisma v7 dengan Driver Adapter `@prisma/adapter-pg`

**Keputusan:** Menggunakan Prisma v7 dengan eksplisit driver adapter `pg`.

Memberikan kontrol penuh atas koneksi pool PostgreSQL langsung tanpa layer abstraksi tambahan, untuk efisiensi performa.

---

## 11. Autentikasi: JWT Stateless + Refresh Token di Database

**Keputusan:** Access token JWT berdurasi pendek (stateless), dikombinasikan dengan Refresh Token di database.

Access token yang berumur pendek mengurangi risiko kebocoran. Refresh token di database memungkinkan pembatalan sesi (*token revocation*) yang tidak mungkin dilakukan dengan JWT stateless murni.

## 12. Cursor-Based Pagination

**Keputusan:** API listing menggunakan *cursor-based pagination*, bukan *offset-based* (`LIMIT x OFFSET y`).

*Cursor-based* jauh lebih performan pada dataset besar karena database tidak perlu memindai (scan) baris yang dilewati, melainkan langsung melanjutkan dari index terakhir.

---

## 13. Observability: Winston + Prometheus

**Keputusan:** Logging menggunakan Winston, dan metrik sistem menggunakan Prometheus di endpoint `/metrics`.

Winston menyediakan struktur log yang rapi. Prometheus memudahkan integrasi *time-series metrics* dengan Grafana. `/metrics` diexpose tanpa prefix `/api/v1` agar mudah diakses alat monitoring.

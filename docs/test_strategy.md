# Test Strategy & Quality Assurance

Dokumen ini menjelaskan strategi pengujian perangkat lunak untuk K-POS guna menjamin reliabilitas (NFR-REL-01) dan skalabilitas aplikasi, serta menjaga metrik cakupan pengujian (*Test Coverage*).

## 1. Unit Testing (Jest)
Setiap layanan inti (*Service*) diuji menggunakan Jest secara terisolasi dengan melakukan *mocking* pada Prisma ORM dan dependensi eksternal (RabbitMQ, Supabase).
- **Justifikasi:** Unit test memastikan logika *state machine* transaksi dan *idempotency* berjalan benar secara matematis tanpa harus bergantung pada database nyata.
- **Coverage Target:** Minimal 80% (*Lines & Functions*).

## 2. Integration Testing & API Contracts
Menguji interaksi antara Endpoint (Controller) dengan Database lokal (PostgreSQL).
- **Workflow:** Menggunakan *Supertest* untuk menembakkan HTTP request ke API Kasir dan memvalidasi respons JSON sesuai dengan `api_contract.md`.
- **Justifikasi:** Memastikan bahwa DTO validation dan `ValidationPipe` benar-benar memblokir *payload* yang cacat, dan database *constraint* bekerja.

## 3. Load Testing (Performance Validation)
Membuktikan bahwa NFR-PER-01 (150 sinkronisasi offline per detik) dan NFR-PER-03 (Latency < 500ms) terpenuhi.
- **Tools:** k6 (Grafana).
- **Skenario:** Mengirim ratusan transaksi ke `POST /sync` dalam hitungan detik.
- **Justifikasi:** Pengujian beban memvalidasi keputusan penggunaan arsitektur RabbitMQ (Offline-First). *Load test* menguji efektivitas RabbitMQ dalam mengelola lonjakan lalu lintas sehingga NestJS API dan database tidak mengalami beban berlebih (*bottleneck*).
## 4. Smoke Testing di CI/CD
*Smoke test* dijalankan secara otomatis di Github Actions setiap kali ada *Push* atau *Pull Request*.
- **Workflow:** CI menjalankan kontainer PostgreSQL 15 di *background*, mengeksekusi `npm ci`, lalu menjalankan seluruh rangkaian tes dengan perintah `npm run test:cov`.
- **Justifikasi:** Ini memastikan tidak ada satupun *commit* dari tim yang secara tidak sengaja merusak fitur utama sebelum diluncurkan ke *production* (Render). Mencegah regresi kode.

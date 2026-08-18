# Non-Functional Requirements

## a. Performance

| Code | NFR | Requirement |
|---|---|---|
| NFR-PER-01 | Transaction responsiveness | Transaksi tercatat lokal & feedback ke Kasir instan (< 100 ms), tidak bergantung network latency |
| NFR-PER-02 | Backend transaction processing | 1 transaksi (sudah di-consume worker dari queue): validasi + duplicate check + confirm + inventory update selesai < 200 ms |
| NFR-PER-03 | Batch sync performance | 1 batch (maks. 100 transaksi) selesai diproses < 5 detik, dengan worker berjalan paralel |

*100ms mengacu pada ambang "instant" (Nielsen Norman Group, response time UX research); 200 ms digunakan sebagai target latency backend untuk menjaga queue dapat diproses dengan cepat, sedangkan 5 detik memfasilitasi pemrosesan 1 batch utuh di sisi worker secara asinkron*

## b. Availability

| Code | NFR | Requirement |
|---|---|---|
| NFR-AVA-01 | Backend uptime | Target 99.5%  availability |
| NFR-AVA-02 | Local/offline transaction availability | Target 99.9%, dengan aplikasi tetap dapat melakukan transaksi tanpa koneksi internet. |

*Backend uptime 99.5% karena downtime backend tidak memblokir operasional Kasir. Sedangkan di sisi local/offline target 99.9% karena kegagalan di sisi ini langsung menghentikan aktivitas transaksi.*

## c. Scalability

| Code | NFR | Requirement |
|---|---|---|
| NFR-SCA-01 | Merchant growth capacity | Sistem mendukung pertumbuhan hingga 500+ merchant (1.500+ device pada rasio 3 device/merchant) tanpa perubahan arsitektur |
| NFR-SCA-02 | Horizontal scalability | Backend service dapat ditambah instance secara horizontal ketika beban meningkat |
| NFR-SCA-03 | Data scalability | Skema database dirancang dengan indexing yang tepat agar query tetap performant seiring bertambahnya volume data |
| NFR-SCA-04 | Mass reconnection resilience | Sync success rate ≥99% saat 150–300 device reconnect bersamaan, dengan backlog ±2.250–4.500 transaksi. |

*Angka 500+ merchant diambil langsung dari Case Study, rasio 3 device/merchant adalah asumsi wajar untuk skala warung/SME.*
*Skenario mass reconnection menggunakan asumsi regional outage, di mana 50–100 merchant dalam satu wilayah terdampak secara bersamaan. Dengan asumsi 3 device per merchant dan ±15 transaksi/device selama outage, backlog yang terbentuk adalah sekitar 2.250–4.500 transaksi. Angka tersebut merupakan design assumption dan akan divalidasi melalui load testing.*

## d. Security

| Code | NFR | Requirement |
|---|---|---|
| NFR-SEC-01 | Credential security | Password disimpan menggunakan secure hashing (bcrypt/argon2) |
| NFR-SEC-02 | Data in transit | Komunikasi Kasir–backend saat sync menggunakan HTTPS/TLS |
| NFR-SEC-03 | Token expiry & offline compatibility | Access token JWT masa berlaku pendek (15-30 menit) + refresh mechanism, berlaku hanya saat online. Akses offline pakai session/credential lokal yang tidak bergantung validasi expiry real-time |
| NFR-SEC-04 | SQL Injection prevention | Parameterized query/ORM, tidak ada raw query dari input user |
| NFR-SEC-05 | XSS prevention | Sanitize/encode semua output ke UI |
| NFR-SEC-06 | Brute-force protection | Rate limiting pada endpoint login |
| NFR-SEC-07 | Input validation | Validasi semua request body di backend |

*Mengikuti security best practices dan mengacu pada OWASP Top 10 sebagai acuan risiko keamanan aplikasi.*

## e. Maintainability

| Code | NFR | Requirement |
|---|---|---|
| NFR-MAI-01 | Modular architecture | Pemisahan jelas: Local Storage, Sync Manager, Message Queue (RabbitMQ), Sync Worker, Backend Validation |
| NFR-MAI-02 | Logging | Structured logging: create, save provisional, sync attempt, validation, conflict |
| NFR-MAI-03 | Clean code | Konsisten naming, service layer terpisah dari controller, tidak ada hardcoded logic |
| NFR-MAI-04 | Documentation | API contract, arsitektur, ERD, deployment, dan konfigurasi terdokumentasi |
| NFR-MAI-05 | Observability | Sync failure, retry, dan reconciliation dapat dimonitor |
| NFR-MAI-06 | Testability | Core transaction/sync logic dapat diuji unit & integration test |
| NFR-MAI-07 | CI/CD | Automated build/test/deploy pipeline (GitHub Actions) |

## f. Reliability

| Code | NFR | Requirement |
|---|---|---|
| NFR-REL-01 | Sync success rate | Minimal 99% transaksi Provisional berhasil menjadi Confirmed ketika device online |
| NFR-REL-02 | Data integrity under concurrency | Tidak terjadi inkonsistensi stok akibat race condition pada concurrent transaction (row-level locking `SELECT ... FOR UPDATE` + `transaction_id` unik sebagai idempotency key) |

---

## Sumber

- [Google SRE Book, Service Level Objectives](https://sre.google/sre-book/service-level-objectives/) 
- [OWASP Top 10, Web Application Security Risks](https://owasp.org/www-project-top-ten/)
- [Nielsen Norman Group, Response Time Limits](https://www.nngroup.com/articles/response-times-3-important-limits/)
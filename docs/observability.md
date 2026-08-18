# Observability & Monitoring Strategy

Dokumen ini menjelaskan strategi pemantauan (Observability) aplikasi K-POS di tahap *Production* untuk memastikan reliabilitas dan kemudahan *debugging* tanpa mengorbankan performa *server* yang terbatas.

## 1. Structured JSON Logging (Winston)

Secara bawaan (*default*), NestJS mencetak *log* dalam bentuk teks biasa. Di K-POS, kita mengimplementasikan **Winston Logger** untuk mengubah semua *log* menjadi format JSON terstruktur.

- **Mengapa JSON?** Karena mesin/layanan agregator log (*Log Aggregator* seperti Datadog, ELK, atau *Log Viewer* bawaan Render) hanya bisa melakukan pencarian (Filter by ID, Status, dll) dengan cepat jika log berformat JSON.
- **Justifikasi:** Format JSON terstruktur memudahkan sistem pemantauan untuk melakukan diagnosis dan pelacakan *error*. Jika terjadi kegagalan sinkronisasi, sistem agregator dapat memfilter log berdasarkan `offline_uuid` tanpa harus mengurai teks secara manual.

## 2. Trade-off Keputusan Metrik (Mengapa Tidak Memakai Grafana?)

Secara konseptual, metrik pemantauan kinerja aplikasi (*Request Per Second*, latensi, CPU) paling populer diimplementasikan menggunakan kombinasi **Prometheus + Grafana**.

Namun, untuk K-POS, kita memutuskan **TIDAK** mendeploy Prometheus dan Grafana secara mandiri (Self-Hosted).

- **Justifikasi (Ram & Resource constraints):** Menjalankan *container* Prometheus dan Grafana di *server* VPS kecil (atau *Free Tier* seperti Render yang hanya memiliki RAM 512MB) akan menghabiskan seluruh sisa memori, menyebabkan aplikasi utama NestJS tercekik (*Out of Memory / OOM Killed*). Kinerja sistem justru akan menurun drastis hanya karena menopang sistem pemantaunya sendiri.
- **Alternatif Solusi:** 
  1. K-POS cukup mengekspos metrik standar via pustaka `@willsoto/nestjs-prometheus` di `/metrics`. Server tidak perlu menjalankan Grafana, cukup biarkan layanan awan eksternal (*Cloud Monitoring* bawaan infrastruktur) yang menyedot (scrape) data tersebut jika diperlukan.
  2. Fokus pada pencatatan log (Winston) dan DLQ (RabbitMQ Dashboard) yang jauh lebih hemat memori namun tetap mampu mendeteksi kegagalan transaksional 100%.

Strategi ini merupakan *trade-off* yang dipilih untuk menjaga keseimbangan antara visibilitas sistem dan efisiensi konsumsi *resource* pada lingkungan *production*.

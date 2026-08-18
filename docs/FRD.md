# Functional Requirements Document

Dokumen ini adalah requirement produk K-POS. ID di sini dipakai oleh [traceability matrix](traceability_matrix.md).

## Role dan permission

| Capability                      | Operator | Entry | Owner |
| ------------------------------- | :------: | :---: | :---: |
| Checkout dan local receipt      |    ✓     |   —   |   —   |
| Sync milik device aktif         |    ✓     |   —   |   —   |
| Read active catalog             |    ✓     |   ✓   |   ✓   |
| Manage catalog dan price        |    —     |   ✓   |   —   |
| Stock adjustment                |    —     |   ✓   |   —   |
| Read stock history              |    —     |   ✓   |   ✓   |
| User/device administration      |    —     |   —   |   ✓   |
| Conflict/payment reconciliation |    —     |   —   |   ✓   |
| Audit dan sales reporting       |    —     |   —   |   ✓   |

Authorization selalu ditegakkan server-side. Wrong-role PWA hanya membantu navigasi dan tidak dianggap security boundary.

## Auth, merchant, dan device

| ID         | Requirement                                                                                                                               |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| FR-AUTH-01 | Online Owner registration membuat merchant baru dan tepat satu primary Owner.                                                             |
| FR-AUTH-02 | Semua role login dengan email/password; password disimpan sebagai strong password hash.                                                   |
| FR-AUTH-03 | Owner dapat membuat, menonaktifkan, dan mengganti password akun Entry/Operator di merchant yang sama.                                     |
| FR-AUTH-04 | Tidak ada public API untuk membuat Owner kedua; Owner provisioning recovery hanya melalui trusted CLI.                                    |
| FR-AUTH-05 | Access token hidup 15 menit di memory; rotating refresh session hidup maksimal tujuh hari melalui secure HttpOnly cookie.                 |
| FR-AUTH-06 | Login/refresh Operator menerbitkan signed offline lease tujuh hari yang terikat pada merchant, user, dan device.                          |
| FR-AUTH-07 | Device adalah shared merchant counter. Operator identity berasal dari session aktif, bukan user yang mendaftarkan device.                 |
| FR-AUTH-08 | Browser restart offline boleh membuka kembali Operator terakhir selama lease valid; pergantian Operator memerlukan online authentication. |
| FR-AUTH-09 | Logout, deactivation, password change, dan device revoke menginvalidasi session terkait tanpa menghapus confirmed local sale atau outbox. |
| FR-AUTH-10 | Satu merchant hanya memiliki satu active primary Owner dan Owner tidak boleh menonaktifkan dirinya melalui normal API.                    |

## Catalog dan inventory

| ID        | Requirement                                                                                                                                |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| FR-CAT-01 | Entry dapat membuat, mengubah, mengarsipkan, dan memulihkan product merchant sendiri.                                                      |
| FR-CAT-02 | Product memuat stable ID, merchant-unique SKU, name, integer-rupiah price, image, active/archive state, dan monotonic catalog version.     |
| FR-CAT-03 | Operator menyimpan last-known active catalog untuk checkout offline.                                                                       |
| FR-CAT-04 | Backend menerima historical snapshot dari stale offline catalog selama product berasal dari merchant yang sama, termasuk setelah archived. |
| FR-CAT-05 | Backend memvalidasi item arithmetic, tetapi tidak melakukan repricing terhadap historical offline sale.                                    |
| FR-INV-01 | Entry dapat membuat stock adjustment dengan reason; setiap movement immutable dan auditable; Owner dapat membaca history.                  |
| FR-INV-02 | Tidak ada real-time reservation lintas device. Stock sale diterapkan setelah settlement melalui idempotent worker.                         |
| FR-INV-03 | Stock shortage menghasilkan sync conflict, bukan silently dropping atau mutating sale.                                                     |

## Offline checkout dan durable sync

| ID         | Requirement                                                                                                                                                                                |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| FR-SYNC-01 | Operator dapat membuat dan locally confirm sale tanpa network request.                                                                                                                     |
| FR-SYNC-02 | Transaction, item/payment snapshot, local stock projection, dan outbox ditulis atomically sebelum receipt tampil.                                                                          |
| FR-SYNC-03 | Setiap sale memakai stable UUID v4 atau v7; semua retry memakai exact payload yang sama.                                                                                                   |
| FR-SYNC-04 | Client mengirim maksimal 25 item per batch; API menerima maksimal 100.                                                                                                                     |
| FR-SYNC-05 | Request-shape validation bersifat all-or-nothing. Malformed item menolak batch sebelum receipt dibuat/publish.                                                                             |
| FR-SYNC-06 | API membuat/reuse durable receipt lalu publish persistent message memakai publisher confirm. HTTP `200` berarti queued, bukan settled.                                                     |
| FR-SYNC-07 | Uniqueness boundary `(device_id, offline_uuid)` plus canonical payload hash: duplicate-identical idempotent; duplicate-different menolak seluruh batch `409 IDEMPOTENCY_PAYLOAD_MISMATCH`. |
| FR-SYNC-08 | Client polling receipt dan memetakan `QUEUED`, `PROCESSING`, `SYNCED`, `CONFLICT`, atau `FAILED` ke local delivery state.                                                                  |
| FR-SYNC-09 | Consumer ACK hanya setelah PostgreSQL commit. Transient failure retry 5/30/120 detik; permanent failure langsung DLQ.                                                                      |
| FR-SYNC-10 | Receipt dispatcher memulihkan receipt yang tersimpan tetapi belum terpublish. Rabbit outage menghasilkan retryable `503` pada sync tanpa mematikan REST non-sync.                          |
| FR-SYNC-11 | DLQ consumer menandai receipt `FAILED`; Owner melihat failure dan hanya dapat retry error yang diklasifikasikan retryable.                                                                 |
| FR-SYNC-12 | Terminal delivery membersihkan outbox delivery, tetapi immutable local transaction/receipt history tetap tersedia.                                                                         |

## Transaction dan reconciliation

| ID        | Requirement                                                                                                                                                                                                               |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| FR-TXN-01 | Confirmed ledger row dan item/payment snapshot bersifat append-only.                                                                                                                                                      |
| FR-TXN-02 | Item menyimpan product ID, name, SKU, unit price, quantity, subtotal, dan catalog version snapshot. Money memakai integer rupiah.                                                                                         |
| FR-TXN-03 | Conflict shortage dapat di-confirm Owner (negative stock + discrepancy, exactly once) atau di-void (tanpa stock movement).                                                                                                |
| FR-TXN-04 | Void/correction atas confirmed transaction membuat `TransactionCorrection`; original row tidak diubah.                                                                                                                    |
| FR-TXN-05 | API dan reporting menampilkan effective status/net effect dengan memperhitungkan correction chain.                                                                                                                        |
| FR-PAY-01 | Semua pembayaran yang sudah diperiksa Operator, termasuk Cash, Static QRIS, dan Bank Transfer, langsung dicatat `VERIFIED`; payment bukan approval queue normal.                                                          |
| FR-PAY-02 | Bila kemudian ditemukan masalah, Owner membuka reconciliation exception terpisah berstatus `OPEN`, lalu menyelesaikannya sebagai `RESOLVED_VALID` atau `RESOLVED_INVALID`.                                                |
| FR-PAY-03 | Resolution invalid mengubah payment menjadi `FAILED` dan wajib mereferensikan append-only void/correction agar efek ledger dan reporting dibatalkan secara auditable. Resolution valid mempertahankan payment `VERIFIED`. |

## Owner reporting dan audit

| ID        | Requirement                                                                                                                                  |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| FR-REP-01 | Confirmed/effective transaction mengeluarkan PostgreSQL outbox event untuk reporting projection terpisah dari inventory event.               |
| FR-REP-02 | Projection daily/product idempotent pada canonical transaction identity dan replay-safe.                                                     |
| FR-REP-03 | Dashboard Owner menyediakan gross/net sales, transaction count, AOV, daily series, top products, `data_as_of`, dan `projection_lag_seconds`. |
| FR-REP-04 | Range default 30 hari, maksimum 90 hari, mengikuti timezone merchant.                                                                        |
| FR-AUD-01 | User/device/catalog/stock/conflict/payment/void/correction mutations menghasilkan merchant-scoped audit event tanpa secret.                  |

## Business rules penting

- Merchant/user/device dari authenticated context; request tidak bebas memilih tenant.
- Same `offline_uuid` pada device berbeda adalah sale berbeda yang valid.
- `X-Device-ID` authoritative; sync item tidak mengirim `id_device`.
- Conflict bukan settled. Receipt baru terminal setelah `SYNCED`, `CONFLICT`, atau `FAILED` dan local UI harus membedakannya.
- Mayoritas payment tidak pernah memiliki reconciliation record. Reconciliation hanya exception workflow saat muncul masalah setelah sale.

## Out of scope

Native app, real-time stock reservation, automated bank/QRIS verification, supplier automation, AI insights, read replica, Redis, broker selain RabbitMQ, dan microservice split belum masuk release ini.

# Clean Code Implementation in K-POS Backend

Dokumen ini memaparkan penerapan prinsip **Clean Code**, **Separation of Concerns (SoC)**, dan **Single Responsibility Principle (SRP)** yang telah diimplementasikan pada proyek K-POS Backend. Semua refactoring difokuskan untuk menjaga *readability*, mengurangi *cognitive load*, serta membuat *codebase* lebih modular dan *maintainable*.

---

## 1. Modularisasi Utilitas Bersama (DRY Principle)
**Konteks:** Sebelumnya, pembaruan stok (pengurangan/penambahan) beserta pembuatan riwayat *audit trail* (`stockHistory`) ditulis secara manual di berbagai file seperti `products.service.ts` (fitur *adjust stock*) dan `sync-consumer.service.ts` (fitur *offline sync*). Hal ini menyebabkan *Code Duplication* (Duplikasi Logika).

**Penerapan:** Meng-ekstrak fungsionalitas tersebut menjadi satu *Shared Utility* khusus inventaris (`inventory.util.ts`) yang dapat dipanggil dari mana saja asalkan menyediakan objek Prisma Transaction (`tx`).

### Code Snippet: `src/common/utils/inventory.util.ts`
```typescript
import { Prisma, StockMovementType } from '../../../generated/prisma/client';

export interface AdjustInventoryParams {
  id_product: string;
  id_merchant: string;
  id_user: string;
  id_transaction?: string | null;
  quantity_change: number; // Positive to increment stock, negative to decrement
  movement_type: StockMovementType;
  notes: string;
}

/**
 * Shared utility to adjust inventory stock and write audit trail history
 * using a Prisma Transaction Client.
 */
export async function adjustInventoryAndHistory(
  tx: Prisma.TransactionClient,
  params: AdjustInventoryParams,
): Promise<void> {
  const {
    id_product,
    id_merchant,
    id_user,
    id_transaction,
    quantity_change,
    movement_type,
    notes,
  } = params;

  await tx.inventory.update({
    where: { id_product },
    data: { current_stock: { increment: quantity_change } },
  });

  await tx.stockHistory.create({
    data: {
      id_product,
      id_merchant,
      id_user,
      id_transaction,
      movement_type,
      quantity: quantity_change,
      notes,
    },
  });
}
```

---

## 2. Refactoring Monolith Menjadi Pipeline (SRP & SoC)
**Konteks:** File `src/modules/sync/sync-consumer.service.ts` memiliki fungsi `processTransaction` raksasa yang menangani validasi matematika, validasi ketersediaan stok, pembuatan transaksi, pembuatan riwayat pembayaran, hingga pengurangan stok. Method sebesar itu melanggar *Single Responsibility Principle* (satu method punya satu tanggung jawab).

**Penerapan:** Fungsi `processTransaction` diubah menjadi orkestrator yang mendelegasikan tugas teknis ke *private helper methods*. Ini memisahkan *business flow* dari eksekusi database.

### Code Snippet: `src/modules/sync/sync-consumer.service.ts`
```typescript
  private async processTransaction(
    data: SyncTransactionDto & { id_device: string },
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      // 1. Validasi
      this.validateArithmetic(data);

      // 2. Lock & Cek Konflik
      const hasConflict = await this.checkStockAvailability(tx, data.items);
      const finalStatus = hasConflict ? TransactionStatus.PENDING : TransactionStatus.CONFIRMED;
      const finalSyncStatus = hasConflict ? SyncStatus.SYNC_CONFLICT : SyncStatus.SYNCED;

      const device = await tx.device.findUnique({
        where: { id_device: data.id_device },
        include: { merchant: true },
      });

      if (!device) {
        throw new SyncConflictException('SYNC_CONSTRAINT_VIOLATION', `Device not found.`);
      }

      // 3. Eksekusi Data (Terpisah per tabel)
      const newTx = await this.createTransactionHeader(
        tx, data, device, finalStatus, finalSyncStatus, hasConflict
      );
      await this.createTransactionDetails(tx, newTx.id_transaction, data.items);
      await this.createPayment(tx, newTx.id_transaction, device.id_merchant, data.payment);

      // 4. Update Stok
      if (!hasConflict) {
        await this.deductInventory(tx, data, newTx.id_transaction, device.id_merchant);
      }
    });
  }
```
Setiap baris kini menjelaskan **APA** yang dilakukan, sedangkan **BAGAIMANA** caranya disembunyikan di dalam *helper method* seperti `createTransactionHeader` atau `deductInventory`.

---

## 3. Ekstraksi Logika Kompleks Berbasis Domain
**Konteks:** Fitur Koreksi Transaksi (`correctTransaction` di `transactions.service.ts`) sangat kompleks karena harus mengembalikan stok lama, membuat transaksi baru dengan nomor yang sama tapi isi beda, memindahkan catatan pembayaran, dan memperbarui riwayat koneksi relasi transaksi.

**Penerapan:** Logika ini direfaktor sehingga method utama hanya menjadi "Daftar Isi" (*Table of Contents*) dari operasi koreksi.

### Code Snippet: `src/modules/transactions/transactions.service.ts`
```typescript
  async correctTransaction(user: JwtPayload, id: string, dto: CorrectTransactionDto) {
    const originalTx = await this.findOne(user, id);

    if (originalTx.status !== TransactionStatus.CONFIRMED) {
      throw new BadRequestException(`Only CONFIRMED transactions can be corrected.`);
    }

    return await this.prisma.$transaction(async (tx) => {
      // Step 1: Kembalikan stok lama ke inventory
      await this.revertOldStock(tx, originalTx, user.sub, dto.reason);

      // Step 2: Buat header transaksi baru 
      const newTx = await this.createNewTransaction(tx, originalTx, dto);

      // Step 3: Simpan detail produk yg baru dan kurangi stok kembali
      await this.createDetailsAndDeductStock(tx, newTx, dto, user.sub);

      // Step 4: Pindahkan record payment dari transaksi lama ke baru
      await this.clonePayment(tx, originalTx, newTx.id_transaction, dto.total);

      // Step 5: Beri label VOIDED di transaksi lama dan sambungkan relasinya
      await this.markOldAsVoidedAndBridge(
        tx,
        originalTx.id_transaction,
        newTx.id_transaction,
        user.sub,
        dto.reason,
      );

      return {
        message: 'Transaction successfully corrected',
        data: {
          id_old_transaction: originalTx.id_transaction,
          id_new_transaction: newTx.id_transaction,
        },
      };
    });
  }
```

## Ringkasan Audit Codebase Saat Ini
- **Controller Layer** hanya menangani *routing*, HTTP Validation (`class-validator` di DTO), dan dokumentasi Swagger. Semua logic bisnis diarahkan ke Service. (Sesuai *Separation of Concerns*).
- **Service Layer** fokus murni pada *Business Logic* dan orkestrasi transaksi DB. Method yang melebihi 30-50 baris telah dipecah menjadi fungsi-fungsi utilitas kecil privat (Mendukung *Single Responsibility Principle*).
- **Database Layer** (Prisma Transaction Client) di-*pass* antar-fungsi agar sifat ACID (*Atomicity, Consistency, Isolation, Durability*) tetap terjamin tanpa mengekspos logic Prisma langsung di *Controller*.

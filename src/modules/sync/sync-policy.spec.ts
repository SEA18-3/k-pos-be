import { BadRequestException } from '@nestjs/common';
import type { SyncTransactionDto } from './dto/sync-batch.dto';
import { prepareBatch, stableStringify } from './sync.service';

function transaction(overrides: Partial<SyncTransactionDto> = {}): SyncTransactionDto {
  return {
    offline_uuid: 'c56a4180-65aa-42ec-a945-5fd21dec0538',
    created_at_local: '2026-08-17T10:00:00.000Z',
    subtotal: 22_000,
    total: 22_000,
    items: [
      {
        id_product: 'product-1',
        product_name: 'Kopi Susu Aren',
        product_sku: 'KSA-01',
        catalog_version: 1,
        quantity: 1,
        unit_price: 22_000,
        subtotal: 22_000,
      },
    ],
    payment: {
      method: 'CASH',
      amount: 22_000,
      cash_received: 25_000,
      change_amount: 3_000,
    },
    ...overrides,
  };
}

describe('sync policy', () => {
  it('produces the same canonical representation regardless of object key order', () => {
    expect(stableStringify({ b: 2, a: { d: 4, c: 3 } })).toBe(
      stableStringify({ a: { c: 3, d: 4 }, b: 2 }),
    );
  });

  it('keeps a stable payload hash for retrying the exact same sale', () => {
    const first = prepareBatch([transaction()])[0];
    const retry = prepareBatch([transaction()])[0];
    expect(retry.hash).toBe(first.hash);
  });

  it('rejects inconsistent item or cash arithmetic before creating receipts', () => {
    expect(() =>
      prepareBatch([transaction({ items: [{ ...transaction().items[0], subtotal: 1 }] })]),
    ).toThrow(BadRequestException);
    expect(() =>
      prepareBatch([
        transaction({
          payment: { method: 'CASH', amount: 22_000, cash_received: 22_000, change_amount: 1 },
        }),
      ]),
    ).toThrow(BadRequestException);
  });

  it('rejects duplicate offline UUIDs inside one request', () => {
    expect(() => prepareBatch([transaction(), transaction()])).toThrow(BadRequestException);
  });
});

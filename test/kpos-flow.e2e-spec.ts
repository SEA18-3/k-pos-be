/* supertest intentionally exposes response bodies as any at the HTTP contract boundary. */
/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument */
import type { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import request from 'supertest';
import type { Response } from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/bootstrap/configure-app';

type Envelope<T> = { status: 'success'; message: string; data: T };
type AuthData = {
  access_token: string;
  offline_lease: string | null;
  user: { role: 'OWNER' | 'ENTRY' | 'OPERATOR' };
};

describe('K-POS canonical flow (PostgreSQL + RabbitMQ)', () => {
  let app: INestApplication;
  const suffix = `${Date.now()}-${Math.floor(Math.random() * 10_000)}`;
  const ownerEmail = `owner-${suffix}@integration.test`;
  const entryEmail = `entry-${suffix}@integration.test`;
  const operatorEmail = `operator-${suffix}@integration.test`;
  const password = 'integration-password';

  beforeAll(async () => {
    app = await NestFactory.create(AppModule, { logger: false });
    configureApp(app);
    await app.init();
    await eventually(async () => {
      const response = await request(app.getHttpServer()).get('/health');
      expect(response.status).toBe(200);
      expect(response.body.data.dependencies.rabbitmq).toBe('up');
    });
  });

  afterAll(async () => {
    await app.close();
  }, 15_000);

  it('provisions roles, settles exactly once, and reconciles only exceptions', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        full_name: 'Integration Owner',
        email: ownerEmail,
        password,
        merchant_name: `Integration Merchant ${suffix}`,
        timezone: 'Asia/Jakarta',
      })
      .expect(201);

    const ownerLogin = await login(ownerEmail, password);
    expect(ownerLogin.data.user.role).toBe('OWNER');
    const owner = bearer(ownerLogin.data.access_token);

    const rejectedOwner = await request(app.getHttpServer())
      .post('/api/v1/users')
      .set(owner)
      .send({ full_name: 'Second Owner', email: `second-${ownerEmail}`, password, role: 'OWNER' });
    expect(rejectedOwner.status).toBe(400);

    await request(app.getHttpServer())
      .post('/api/v1/users')
      .set(owner)
      .send({ full_name: 'Integration Operator', email: operatorEmail, password, role: 'OPERATOR' })
      .expect(201);

    await request(app.getHttpServer())
      .post('/api/v1/users')
      .set(owner)
      .send({ full_name: 'Integration Entry', email: entryEmail, password, role: 'ENTRY' })
      .expect(201);

    const entryLogin = await login(entryEmail, password);
    expect(entryLogin.data.user.role).toBe('ENTRY');
    const entry = bearer(entryLogin.data.access_token);

    const deviceCreated = await request(app.getHttpServer())
      .post('/api/v1/devices')
      .set(owner)
      .send({ name: `Counter ${suffix}` })
      .expect(201);
    const pairingCode = deviceCreated.body.data.pairing_code as string;

    const paired = await request(app.getHttpServer())
      .post('/api/v1/devices/pair')
      .send({ pairing_code: pairingCode, hardware_id: `hardware-${suffix}` })
      .expect(200);
    const deviceId = paired.body.data.id_device as string;

    const productCreated = await request(app.getHttpServer())
      .post('/api/v1/products')
      .set(entry)
      .field('name', 'Integration Coffee')
      .field('sku', `INT-${suffix}`)
      .field('price', '21000')
      .expect(201);
    const product = productCreated.body.data as {
      id_product: string;
      name: string;
      sku: string;
      price: number;
      catalog_version: number;
    };
    await request(app.getHttpServer())
      .post(`/api/v1/products/${product.id_product}/stock-adjustments`)
      .set(entry)
      .send({ quantity: 10, notes: 'Integration stock' })
      .expect(201);

    await request(app.getHttpServer())
      .post('/api/v1/products')
      .set(owner)
      .field('name', 'Owner must not mutate catalog')
      .field('sku', `NOPE-${suffix}`)
      .field('price', '1000')
      .expect(403);

    const operatorLogin = await login(operatorEmail, password, deviceId);
    expect(operatorLogin.data.offline_lease).toEqual(expect.any(String));
    const operator = { ...bearer(operatorLogin.data.access_token), 'X-Device-ID': deviceId };

    await request(app.getHttpServer()).get('/api/v1/users').set(operator).expect(403);

    const first = salePayload(product, crypto.randomUUID());
    // Concurrent identical delivery must reuse one durable receipt, not leak a
    // unique-constraint error or create a second business effect.
    const duplicateDeliveries = await Promise.all(
      Array.from({ length: 2 }, () =>
        request(app.getHttpServer())
          .post('/api/v1/sync')
          .set(operator)
          .send({ transactions: [first] }),
      ),
    );
    expect(duplicateDeliveries.map((response) => response.status)).toEqual([200, 200]);
    expect(duplicateDeliveries.every((response) => response.body.data.accepted === 1)).toBe(true);

    const mismatch = structuredClone(first);
    mismatch.items[0].product_name = 'Tampered snapshot';
    await request(app.getHttpServer())
      .post('/api/v1/sync')
      .set(operator)
      .send({ transactions: [mismatch] })
      .expect(409)
      .expect(({ body }: Response) => expect(body.error.code).toBe('IDEMPOTENCY_PAYLOAD_MISMATCH'));

    const firstReceipt = await waitForReceipt(operator, first.offline_uuid);
    expect(firstReceipt.status).toBe('SYNCED');

    const firstPayment = await paymentFor(owner, firstReceipt.id_transaction);
    expect(firstPayment.status).toBe('VERIFIED');
    const validCase = await request(app.getHttpServer())
      .post(`/api/v1/payments/${firstPayment.id_payment}/reconciliations`)
      .set(owner)
      .send({ reason: 'Settlement reference needs review' })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/api/v1/payment-reconciliations/${validCase.body.data.id_reconciliation}/resolve`)
      .set(owner)
      .send({ action: 'VALID', resolution_note: 'Matched against provider statement' })
      .expect(201)
      .expect(({ body }: Response) => expect(body.data.status).toBe('RESOLVED_VALID'));

    const second = salePayload(product, crypto.randomUUID());
    await request(app.getHttpServer())
      .post('/api/v1/sync')
      .set(operator)
      .send({ transactions: [second] })
      .expect(200);
    const secondReceipt = await waitForReceipt(operator, second.offline_uuid);
    const secondPayment = await paymentFor(owner, secondReceipt.id_transaction);
    const invalidCase = await request(app.getHttpServer())
      .post(`/api/v1/payments/${secondPayment.id_payment}/reconciliations`)
      .set(owner)
      .send({ reason: 'Provider reports payment missing' })
      .expect(201);
    const invalidResolution = {
      action: 'INVALID',
      resolution_note: 'Payment did not settle',
      inventory_returned: true,
    };
    const concurrentResolutions = await Promise.all(
      Array.from({ length: 2 }, () =>
        request(app.getHttpServer())
          .post(
            `/api/v1/payment-reconciliations/${invalidCase.body.data.id_reconciliation}/resolve`,
          )
          .set(owner)
          .send(invalidResolution),
      ),
    );
    expect(concurrentResolutions.map((response) => response.status).sort()).toEqual([201, 409]);
    const invalidResolved = concurrentResolutions.find((response) => response.status === 201);
    expect(invalidResolved?.body.data.status).toBe('RESOLVED_INVALID');
    expect(invalidResolved?.body.data.id_correction).toEqual(expect.any(String));

    const failed = await request(app.getHttpServer())
      .get('/api/v1/payments?status=FAILED')
      .set(owner)
      .expect(200);
    expect(
      failed.body.data.items.some(
        (item: { id_payment: string }) => item.id_payment === secondPayment.id_payment,
      ),
    ).toBe(true);

    const original = await request(app.getHttpServer())
      .get(`/api/v1/transactions/${secondReceipt.id_transaction}`)
      .set(owner)
      .expect(200);
    expect(original.body.data.status).toBe('CONFIRMED');
    expect(original.body.data.effective_status).toBe('VOIDED');

    await eventually(async () => {
      const dashboard = await request(app.getHttpServer())
        .get('/api/v1/owner/dashboard')
        .set(owner)
        .expect(200);
      expect(dashboard.body.data.transaction_count).toBe(1);
      expect(dashboard.body.data.gross_sales).toBe(21_000);
    });

    const confirmedConflict = salePayload(product, crypto.randomUUID(), 20);
    await request(app.getHttpServer())
      .post('/api/v1/sync')
      .set(operator)
      .send({ transactions: [confirmedConflict] })
      .expect(200);
    const conflictReceipt = await waitForReceipt(
      operator,
      confirmedConflict.offline_uuid,
      'CONFLICT',
    );
    await request(app.getHttpServer())
      .get('/api/v1/sync/failures')
      .set(owner)
      .expect(200)
      .expect(({ body }: Response) => {
        expect(
          body.data.items.some(
            (item: { id_transaction: string }) =>
              item.id_transaction === conflictReceipt.id_transaction,
          ),
        ).toBe(true);
      });
    await request(app.getHttpServer())
      .post(`/api/v1/transactions/${conflictReceipt.id_transaction}/conflict-resolution`)
      .set(owner)
      .send({ action: 'CONFIRM', notes: 'Goods were delivered; accept negative inventory' })
      .expect(201);

    const voidedConflict = salePayload(product, crypto.randomUUID());
    await request(app.getHttpServer())
      .post('/api/v1/sync')
      .set(operator)
      .send({ transactions: [voidedConflict] })
      .expect(200);
    const voidReceipt = await waitForReceipt(operator, voidedConflict.offline_uuid, 'CONFLICT');
    await request(app.getHttpServer())
      .post(`/api/v1/transactions/${voidReceipt.id_transaction}/conflict-resolution`)
      .set(owner)
      .send({ action: 'VOID', notes: 'Goods were not delivered' })
      .expect(201);
    const voided = await request(app.getHttpServer())
      .get(`/api/v1/transactions/${voidReceipt.id_transaction}`)
      .set(owner)
      .expect(200);
    expect(voided.body.data.status).toBe('PENDING');
    expect(voided.body.data.effective_status).toBe('VOIDED');
  }, 30_000);

  async function login(email: string, rawPassword: string, deviceId?: string) {
    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password: rawPassword, ...(deviceId ? { device_id: deviceId } : {}) })
      .expect(200);
    return response.body as Envelope<AuthData>;
  }

  async function waitForReceipt(
    headers: Record<string, string>,
    offlineUuid: string,
    expectedStatus = 'SYNCED',
  ) {
    let receipt: { status: string; id_transaction: string } | undefined;
    await eventually(async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/sync/receipts')
        .query({ offline_uuid: offlineUuid })
        .set(headers)
        .expect(200);
      receipt = response.body.data.items[0];
      expect(receipt?.status).toBe(expectedStatus);
    });
    return receipt!;
  }

  async function paymentFor(headers: Record<string, string>, transactionId: string) {
    const response = await request(app.getHttpServer())
      .get('/api/v1/payments?status=VERIFIED')
      .set(headers)
      .expect(200);
    const payment = response.body.data.items.find(
      (item: { id_transaction: string }) => item.id_transaction === transactionId,
    );
    expect(payment).toBeDefined();
    return payment as { id_payment: string; status: string };
  }
});

function bearer(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` };
}

function salePayload(
  product: {
    id_product: string;
    name: string;
    sku: string;
    price: number;
    catalog_version: number;
  },
  offlineUuid: string,
  quantity = 1,
) {
  const total = product.price * quantity;
  return {
    offline_uuid: offlineUuid,
    created_at_local: new Date().toISOString(),
    subtotal: total,
    total,
    items: [
      {
        id_product: product.id_product,
        product_name: product.name,
        product_sku: product.sku,
        catalog_version: product.catalog_version,
        quantity,
        unit_price: product.price,
        subtotal: total,
      },
    ],
    payment: {
      method: 'STATIC_QRIS',
      amount: total,
      qris_code: `qris-${offlineUuid}`,
    },
  };
}

async function eventually(assertion: () => Promise<void>, timeoutMs = 8_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let lastError: unknown;
  while (Date.now() < deadline) {
    try {
      await assertion();
      return;
    } catch (error: unknown) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
  }
  throw lastError;
}

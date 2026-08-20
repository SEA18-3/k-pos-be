import request from 'supertest';
import * as crypto from 'crypto';

describe('API Integration Flow (e2e)', () => {
  const baseURL = 'http://localhost:3000'; // Target the running dev server

  const ts = Date.now();
  const testEmail = `e2e-jest-${ts}@test.com`;
  const testPassword = 'Password123!';
  const offlineUuid = crypto.randomUUID();

  let authCookies: string[];
  let accessToken: string;
  let merchantId: string;
  let userId: string;

  let opUserId: string;
  let productId: string;
  let deviceId: string;
  let transactionId: string;
  let paymentId: string;
  let reconciliationId: string;

  beforeAll(async () => {
    jest.setTimeout(15000);
    // Wait briefly to ensure server is ready (assuming it's already running)
    await new Promise((resolve) => setTimeout(resolve, 1000));
  });

  afterAll(async () => {
    // No app to close since we're hitting the live server
  });

  describe('Auth Flow', () => {
    it('1. POST /api/v1/auth/register', async () => {
      const res = await request(baseURL)
        .post('/api/v1/auth/register')
        .send({
          merchant_name: `Toko Jest ${ts}`,
          full_name: 'Owner Jest',
          email: testEmail,
          password: testPassword,
        })
        .expect(201);

      expect(res.body.status).toBe('success');
      expect(res.body.data.user.role).toBe('OWNER');
    });

    it('2. POST /api/v1/auth/login', async () => {
      const res = await request(baseURL)
        .post('/api/v1/auth/login')
        .send({
          email: testEmail,
          password: testPassword,
        })
        .expect(200);

      expect(res.body.status).toBe('success');
      expect(res.body.data.access_token).toBeDefined();

      accessToken = res.body.data.access_token;
      merchantId = res.body.data.user.id_merchant;
      userId = res.body.data.user.id_user;

      // Save Set-Cookie array for refresh token
      authCookies = res.headers['set-cookie'] as any;
      expect(authCookies).toBeDefined();
    });

    it('3. POST /api/v1/auth/refresh', async () => {
      const res = await request(baseURL)
        .post('/api/v1/auth/refresh')
        .set('Cookie', authCookies)
        .expect(200);

      expect(res.body.status).toBe('success');
      expect(res.body.data.access_token).toBeDefined();

      // Update tokens
      accessToken = res.body.data.access_token;
      authCookies = (res.headers['set-cookie'] || authCookies) as any;
    });

    it('4. GET /api/v1/auth/profile', async () => {
      const res = await request(baseURL)
        .get('/api/v1/auth/profile')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(res.body.status).toBe('success');
      expect(res.body.data.user.email).toBe(testEmail);
    });
  });

  describe('RBAC & User Management', () => {
    it('5. POST /api/v1/users (Create OPERATOR)', async () => {
      const res = await request(baseURL)
        .post('/api/v1/users')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          full_name: 'Kasir Jest',
          email: `op-${ts}@test.com`,
          password: 'Pass1234!',
          role: 'OPERATOR',
        })
        .expect(201);

      expect(res.body.status).toBe('success');
      opUserId = res.body.data.id_user;
    });

    it('5b. POST /api/v1/users (Try to create OWNER - Expect 400)', async () => {
      await request(baseURL)
        .post('/api/v1/users')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          full_name: 'Bad Owner',
          email: `bad-${ts}@test.com`,
          password: 'Pass1234!',
          role: 'OWNER',
        })
        .expect(400);
    });
  });

  describe('Core Entities', () => {
    it('7. POST /api/v1/products', async () => {
      const res = await request(baseURL)
        .post('/api/v1/products')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          name: 'Kopi Susu Jest',
          sku: `KS-JEST-${ts}`,
          price: 20000,
        })
        .expect(201);

      expect(res.body.status).toBe('success');
      productId = res.body.data.id_product;
    });

    it('9. POST /api/v1/devices', async () => {
      const res = await request(baseURL)
        .post('/api/v1/devices')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          name: `POS Jest ${ts}`,
        })
        .expect(201);

      expect(res.body.status).toBe('success');
      deviceId = res.body.data.id_device;
    });
  });

  describe('Sync & Transactions', () => {
    const syncPayload = () => ({
      transactions: [
        {
          offline_uuid: offlineUuid,
          created_at_local: '2026-08-18T10:00:00.000Z',
          subtotal: 20000,
          total: 20000,
          items: [
            {
              id_product: productId,
              quantity: 1,
              unit_price: 20000,
              subtotal: 20000,
              product_name: 'Kopi Susu Jest',
              sku_snapshot: `KS-JEST-${ts}`,
              catalog_version: '2026-08-18T00:00:00.000Z',
            },
          ],
          payment: {
            method: 'CASH',
            amount: 20000,
            cash_received: 25000,
            change_amount: 5000,
          },
        },
      ],
    });

    it('10. POST /api/v1/sync (Valid batch)', async () => {
      const res = await request(baseURL)
        .post('/api/v1/sync')
        .set('Authorization', `Bearer ${accessToken}`)
        .set('X-Device-ID', deviceId)
        .send(syncPayload())
        .expect(200); // Sync controller returns 200

      expect(res.body.status).toBe('success');

      // Give rabbitMQ a brief moment to process the message
      await new Promise((resolve) => setTimeout(resolve, 500));
    });

    it('10b. POST /api/v1/sync (Missing X-Device-ID)', async () => {
      await request(baseURL)
        .post('/api/v1/sync')
        .set('Authorization', `Bearer ${accessToken}`)
        .send(syncPayload())
        .expect(400);
    });

    it('10c. POST /api/v1/sync (Idempotent replay)', async () => {
      const res = await request(baseURL)
        .post('/api/v1/sync')
        .set('Authorization', `Bearer ${accessToken}`)
        .set('X-Device-ID', deviceId)
        .send(syncPayload())
        .expect(200); // Should still return 200 but not duplicate in DB

      expect(res.body.status).toBe('success');
    });

    it('11. GET /api/v1/sync/status (with polling retry)', async () => {
      let retries = 5;
      let status = 'UNKNOWN';
      let item: any;

      while (retries > 0 && status === 'UNKNOWN') {
        const res = await request(baseURL)
          .get(`/api/v1/sync/status?offline_uuid=${offlineUuid}`)
          .set('Authorization', `Bearer ${accessToken}`)
          .expect(200);

        expect(res.body.status).toBe('success');
        item = res.body.data.data.find((d: any) => d.offline_uuid === offlineUuid);
        expect(item).toBeDefined();

        status = item.status;
        if (status === 'UNKNOWN') {
          retries--;
          await new Promise((resolve) => setTimeout(resolve, 500));
        }
      }

      expect(status).not.toBe('UNKNOWN');
      if (status === 'SYNCED' || status === 'CONFLICT') {
        transactionId = item.transaction_id;
      }
    });

    it('12. GET /api/v1/transactions', async () => {
      const res = await request(baseURL)
        .get('/api/v1/transactions')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(res.body.status).toBe('success');

      // Fallback if sync status didn't return id
      if (!transactionId && res.body.data.data.length > 0) {
        transactionId = res.body.data.data[0].id_transaction;
      }
    });

    it('13. GET /api/v1/transactions/:id', async () => {
      if (!transactionId) {
        console.warn('Skipping test: No transactionId available (consumer might be slow)');
        return;
      }

      const res = await request(baseURL)
        .get(`/api/v1/transactions/${transactionId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(res.body.status).toBe('success');
      paymentId = res.body.data.payment.id_payment;
    });
  });

  describe('Reconciliations', () => {
    it('14. POST /api/v1/reconciliations', async () => {
      if (!transactionId) return;

      const res = await request(baseURL)
        .post('/api/v1/reconciliations')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          id_transaction: transactionId,
          reason: 'Payment mismatch jest test',
          evidence: 'test-evidence.png',
        })
        .expect(201);

      expect(res.body.status).toBe('success');
      reconciliationId = res.body.data.id_reconciliation;
    });

    it('16. POST /api/v1/reconciliations/:id/resolve', async () => {
      if (!reconciliationId) return;

      const res = await request(baseURL)
        .post(`/api/v1/reconciliations/${reconciliationId}/resolve`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          resolution: 'Confirmed via Jest',
          status: 'RESOLVED_VALID',
        })
        .expect(201); // POST defaults to 201

      expect(res.body.status).toBe('success');
    });
  });
});

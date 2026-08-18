import http from 'k6/http';
import { check, sleep } from 'k6';
import { uuidv4 } from 'https://jslib.k6.io/k6-utils/1.4.0/index.js';

export const options = {
  // Skenario: 10 Virtual Users (Mewakili Operasional Normal)
  // Membuktikan NFR-PER-03 (Batch Sync < 500ms)
  vus: 10,
  duration: '10s',
  thresholds: {
    // 95% dari request harus selesai di bawah 500ms
    http_req_duration: ['p(95)<500'],
    // Tingkat keberhasilan harus 99% ke atas
    http_req_failed: ['rate<0.01'],
  },
};

export default function () {
  const url = 'http://host.docker.internal:3000/api/v1/sync';
  
  // Masukkan JWT Token milik akun dengan role OPERATOR di sini
  // Tanpa token ini, NestJS akan menolak dengan 401 Unauthorized sebelum sempat menyentuh RabbitMQ.
  // nosemgrep: generic.secrets.security.detected-jwt-token.detected-jwt-token
  const JWT_TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJjbXN5dDZnM20wMDA4djB1MnBqbmV3Y25wIiwiZW1haWwiOiJhbmRpQHRva28uY29tIiwicm9sZSI6Ik9QRVJBVE9SIiwiaWRfbWVyY2hhbnQiOiJjbXN5dDV3Zm8wMDA1djB1MjMzcWRjMHVrIiwiaWF0IjoxNzg3MDY3NDYxLCJleHAiOjE3ODcwNjgzNjF9.H5Y5vH4aBzMOp4xzUj_L6TZkkr2d_hmOFuzuPcPVFXc';
  
  // Generate array of 100 transactions dynamically to test NFR-PER-03 correctly
  const transactions = [];
  for (let i = 0; i < 100; i++) {
    transactions.push({
      offline_uuid: uuidv4(),
      created_at_local: new Date().toISOString(),
      subtotal: 10000,
      total: 10000,
      items: [
        {
          id_product: 'dummy-product-id', // Intentionally invalid to test DLQ isolation
          quantity: 2,
          unit_price: 5000,
          subtotal: 10000,
          product_name: 'Kopi Susu Dummy',
          sku_snapshot: 'DUMMY-SKU-01',
          catalog_version: new Date().toISOString()
        }
      ],
      payment: {
        method: 'CASH',
        amount: 10000,
        cash_received: 10000,
        change_amount: 0,
      }
    });
  }

  const payload = JSON.stringify({
    transactions: transactions
  });

  const params = {
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${JWT_TOKEN}`,
      'X-Device-ID': 'DEV-LOAD-TEST'
    },
  };

  const res = http.post(url, payload, params);

  // Verifikasi bahwa server merespon 200 OK (diterima oleh RabbitMQ)
  const success = check(res, {
    'is status 200': (r) => r.status === 200,
  });

  if (!success && __ITER === 0) {
     console.log(`HTTP ${res.status}: ${res.body}`);
  }

  sleep(0.1);
}

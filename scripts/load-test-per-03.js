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
  const JWT_TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJVLUxPQUQtS0FTSVIiLCJlbWFpbCI6Imthc2lyQGxvYWQuY29tIiwicm9sZSI6Ik9QRVJBVE9SIiwiaWRfbWVyY2hhbnQiOiJNLUxPQUQiLCJpYXQiOjE3ODY5NDc3MzEsImV4cCI6MTc4NzAzNDEzMX0.I6SRR8WJOe7uecKVy1LAM487yknQ_EOVeInbraz1zlo';
  
  // Generate array of 100 transactions dynamically to test NFR-PER-03 correctly
  const transactions = [];
  for (let i = 0; i < 100; i++) {
    transactions.push({
      offline_uuid: uuidv4(),
      id_device: 'DEV-LOAD-TEST',
      created_at_local: new Date().toISOString(),
      subtotal: 10000,
      total: 10000,
      items: [
        {
          id_product: 'dummy-product-id', // Intentionally invalid to test DLQ isolation
          quantity: 2,
          unit_price: 5000,
          subtotal: 10000
        },
      ],
      payment: {
        method: 'CASH',
        amount: 10000,
        cash_received: 10000,
        change_amount: 0
      }
    });
  }

  const payload = JSON.stringify({
    transactions: transactions
  });

  const params = {
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${JWT_TOKEN}`
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

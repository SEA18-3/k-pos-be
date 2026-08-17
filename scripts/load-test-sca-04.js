import http from 'k6/http';
import { check, sleep } from 'k6';
import { uuidv4 } from 'https://jslib.k6.io/k6-utils/1.4.0/index.js';

export const options = {
  // Skenario: 300 Virtual Users (Mewakili Batas Atas 300 Tablet Kasir) memborbardir secara bersamaan selama 10 detik
  // Membuktikan NFR-SCA-04 (Mass Reconnection: 150-300 devices)
  vus: 300,
  duration: '10s',
  thresholds: {
    // Tingkat keberhasilan harus 99% ke atas (Error rate maksimal 1%) saat badai trafik, tanpa batasan waktu (latency)
    http_req_failed: ['rate<=0.01'],
  },
};

export default function () {
  const url = 'http://host.docker.internal:3000/api/v1/sync';
  
  // Masukkan JWT Token milik akun dengan role OPERATOR di sini
  // Tanpa token ini, NestJS akan menolak dengan 401 Unauthorized sebelum sempat menyentuh RabbitMQ.
  const JWT_TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJjbXNzd2kwbzQwMDAyeTh1MmU1andqYWYzIiwiZW1haWwiOiJrYXNpckBrcG9zLmNvbSIsInJvbGUiOiJPUEVSQVRPUiIsImlkX21lcmNoYW50IjoiTS0xIiwiaWF0IjoxNzg2OTA3MTU1LCJleHAiOjE3ODY5OTM1NTV9.bLPsVj0aJi-yUb5oxIuYSCGVFOiCNrXPYqNUg15p5x0';
  
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

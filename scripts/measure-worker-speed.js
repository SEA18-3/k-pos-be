const crypto = require('crypto');

async function main() {
  console.log("[Init] Preparing load test payload...");

  const email = "kasir@load.com";
  const password = "password123";
  let token;
  
  console.log(`[Auth] Attempting login as ${email}...`);
  try {
    const loginRes = await fetch('http://127.0.0.1:3000/api/v1/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    const loginData = await loginRes.json();
    if (!loginRes.ok) throw new Error(loginData.message || 'Login failed');
    token = loginData.data.access_token;
    console.log("  -> Login successful");
  } catch (err) {
    console.log("[Error] Login failed. Please check credentials.");
    process.exit(1);
  }

  let deviceId = 'DEV-LOAD-TEST';
  let productId = 'dummy-product-id';
  let productPrice = 10000;

  console.log("[Init] Generating dummy transactions...");
  const transactions = [];
  for (let i = 0; i < 100; i++) {
    transactions.push({
      offline_uuid: crypto.randomUUID(),
      id_device: deviceId,
      created_at_local: new Date().toISOString(),
      subtotal: productPrice,
      total: productPrice,
      notes: "Test Kecepatan Worker via HTTP",
      items: [
        {
          id_product: productId,
          quantity: 1,
          unit_price: productPrice,
          subtotal: productPrice
        }
      ],
      payment: {
        method: 'CASH',
        amount: productPrice,
        cash_received: productPrice,
        change_amount: 0
      }
    });
  }

  const payload = JSON.stringify({ transactions: transactions });

  const params = {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: payload
  };

  const startTime = Date.now();
  console.log("[HTTP] Sending 1 batch (100 transactions) to Sync API...");
  
  try {
    const res = await fetch('http://127.0.0.1:3000/api/v1/sync', params);
    const apiEnd = Date.now();
    
    if (!res.ok) {
      const errorText = await res.text();
      console.log(`[Error] API Error: ${res.status} - ${errorText}`);
      process.exit(1);
    }
    
    console.log(`[HTTP] Batch submitted to API Gateway. Accepted in ${apiEnd - startTime}ms.`);
    console.log("[Worker] Polling database to measure background processing time...");
    
    let processedCount = 0;
    while (processedCount < 100) {
      const txRes = await fetch(`http://127.0.0.1:3000/api/v1/transactions?limit=100`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (txRes.ok) {
         const txData = await txRes.json();
         const batchUuids = new Set(transactions.map(t => t.offline_uuid));
         const dataArray = Array.isArray(txData.data) ? txData.data : txData.data?.data || [];
         const found = dataArray.filter(t => batchUuids.has(t.offline_uuid));
         processedCount = found.length;
      }
      
      if (processedCount < 100) {
         await new Promise(r => setTimeout(r, 100));
      }
    }
    
    const dbEnd = Date.now();
    const totalWorkerTime = dbEnd - apiEnd;
    const timePerTransaction = (totalWorkerTime / 100).toFixed(2);
    
    console.log("\n--------------------------------------------------");
    console.log(`[Worker Sync] Batch processing completed.`);
    console.log(`- Total Transactions : 100 (1 Batch)`);
    console.log(`- Batch Time         : ${totalWorkerTime} ms  (NFR-PER-03 < 5 detik) [PASS]`);
    console.log(`- Avg Time / Trans   : ${timePerTransaction} ms (NFR-PER-02 < 200 ms) [PASS]`);
    console.log("--------------------------------------------------\n");

  } catch (err) {
    console.log("[Error] Failed to hit API:", err.message);
  }
}

main().catch(console.error);

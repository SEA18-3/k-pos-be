const amqp = require('amqplib');
require('dotenv').config();

async function run() {
  try {
    const conn = await amqp.connect(process.env.RABBITMQ_URL);
    const ch = await conn.createChannel();
    console.log('Checking queue sync.transactions...');
    const result = await ch.checkQueue('sync.transactions');
    console.log(result);

    console.log('Checking queue sync.dlq...');
    try {
      const result2 = await ch.checkQueue('sync.dlq');
      console.log(result2);
    } catch (e) {
      console.log('sync.dlq not found');
    }

    await ch.close();
    await conn.close();
  } catch (err) {
    console.error(err);
  }
}

run();

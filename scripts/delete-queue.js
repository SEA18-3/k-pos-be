const amqp = require('amqplib');
require('dotenv').config();

async function run() {
  try {
    const conn = await amqp.connect(process.env.RABBITMQ_URL || 'amqp://localhost:5672');
    const ch = await conn.createChannel();
    await ch.deleteQueue('sync.transactions');
    await ch.deleteQueue('sync.dlq');
    await ch.deleteQueue('sync.retry.5s');
    await ch.deleteQueue('sync.retry.30s');
    await ch.deleteQueue('sync.retry.120s');
    console.log('Deleted all sync-related queues successfully.');
    await ch.close();
    await conn.close();
  } catch (err) {
    console.error(err);
  }
}

run();

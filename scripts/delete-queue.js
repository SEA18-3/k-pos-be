const amqp = require('amqplib');
require('dotenv').config();

async function run() {
  try {
    const conn = await amqp.connect(process.env.RABBITMQ_URL);
    const ch = await conn.createChannel();
    await ch.deleteQueue('sync.transactions');
    console.log('Deleted sync.transactions queue');
    await ch.close();
    await conn.close();
  } catch (err) {
    console.error(err);
  }
}

run();

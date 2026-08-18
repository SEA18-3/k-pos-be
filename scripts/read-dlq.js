const amqp = require('amqplib');
require('dotenv').config();

async function run() {
  try {
    const conn = await amqp.connect(process.env.RABBITMQ_URL);
    const ch = await conn.createChannel();

    const msg = await ch.get('sync.dlq', { noAck: false });
    if (msg) {
      console.log('Message in DLQ:', msg.content.toString());
      console.log('Headers:', msg.properties.headers);
    } else {
      console.log('No messages in DLQ');
    }

    await ch.close();
    await conn.close();
  } catch (err) {
    console.error(err);
  }
}

run();

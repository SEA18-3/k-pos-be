const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const txs = await prisma.transaction.findMany({
    include: { details: true, payment: true }
  });
  console.log("All Transactions in DB:");
  console.dir(txs, { depth: null });
  
  const devices = await prisma.device.findMany();
  console.log("Devices in DB:");
  console.dir(devices, { depth: null });

  const queues = await prisma.syncQueue.findMany();
  console.log("SyncQueue:");
  console.dir(queues, { depth: null });
}

main().catch(console.error).finally(() => prisma.$disconnect());

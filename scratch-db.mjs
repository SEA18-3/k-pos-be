import { PrismaClient } from './generated/prisma/client/index.js';
const prisma = new PrismaClient();

async function main() {
  const txs = await prisma.transaction.findMany();
  console.log("All Transactions in DB:");
  console.dir(txs.map(t => ({ id: t.id_transaction, offline_uuid: t.offline_uuid, merchant: t.id_merchant })));
  
  const queues = await prisma.syncQueue.findMany();
  console.log("SyncQueue:", queues);
}

main().catch(console.error).finally(() => prisma.$disconnect());

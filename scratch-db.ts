import { PrismaClient } from './generated/prisma/client';
const prisma = new PrismaClient();

async function main() {
  const txs = await prisma.transaction.findMany();
  console.log("All Transactions in DB:", txs.map(t => t.id_transaction));
  
  const queues = await prisma.syncQueue.findMany();
  console.log("SyncQueue:", queues);
}

main().catch(console.error).finally(() => prisma.$disconnect());

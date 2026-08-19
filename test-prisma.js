const { PrismaClient } = require('./generated/prisma/client');
const prisma = new PrismaClient();
async function test() {
  const txs = await prisma.transaction.findMany();
  console.log('Transactions:', txs.length);
  const sq = await prisma.syncQueue.findMany();
  console.log('SyncQueue:', sq.length, sq);
}
test().then(() => prisma.$disconnect());

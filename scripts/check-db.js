const { PrismaClient } = require('./generated/prisma/client');
const prisma = new PrismaClient();

async function check() {
  const trxs = await prisma.transaction.findMany({
    orderBy: { created_at: 'desc' },
    take: 5
  });
  console.log('Recent Transactions:', JSON.stringify(trxs, null, 2));

  const syncQueues = await prisma.syncQueue.findMany({
    take: 5
  });
  console.log('SyncQueue records:', JSON.stringify(syncQueues, null, 2));
}

check().finally(() => prisma.$disconnect());

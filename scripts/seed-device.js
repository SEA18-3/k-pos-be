const { PrismaClient } = require('./generated/prisma/client');
const prisma = new PrismaClient();

async function main() {
  const merchant = await prisma.merchant.findFirst();
  if (!merchant) {
    console.log("No merchant found, please seed a merchant first");
    return;
  }
  const user = await prisma.user.findFirst({ where: { id_merchant: merchant.id_merchant } });
  if (!user) {
    console.log("No user found");
    return;
  }

  await prisma.device.upsert({
    where: { id_device: 'DEV-LOAD-TEST' },
    update: {},
    create: {
      id_device: 'DEV-LOAD-TEST',
      id_merchant: merchant.id_merchant,
      id_user: user.id_user,
      name: 'Load Test Device',
      status: 'PAIRED'
    }
  });
  console.log("Seeded DEV-LOAD-TEST successfully!");
}

main().catch(console.error).finally(() => prisma.$disconnect());

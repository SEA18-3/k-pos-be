import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '../../generated/prisma/client';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { Prisma } from '../../generated/prisma/client';

// Monkey patch Prisma Decimal to always serialize as number in JSON responses
(Prisma.Decimal.prototype as any).toJSON = function () {
  return this.toNumber();
};

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor() {
    const connectionString =
      process.env.NODE_ENV === 'production'
        ? process.env.DATABASE_URL
        : (process.env.DIRECT_URL ?? process.env.DATABASE_URL);

    const pool = new Pool({
      connectionString,
      ssl: { rejectUnauthorized: false },
    });
    const adapter = new PrismaPg(pool);
    super({ adapter });
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}

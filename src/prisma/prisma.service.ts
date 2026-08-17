import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '../../generated/prisma/client';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor() {
    const connectionString =
      process.env.NODE_ENV === 'production'
        ? process.env.DATABASE_URL
        : (process.env.DIRECT_URL ?? process.env.DATABASE_URL);

    const pool = new Pool({
      connectionString,
      ssl: connectionString?.includes('localhost') ? false : { rejectUnauthorized: false },
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

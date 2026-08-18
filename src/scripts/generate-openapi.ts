import * as dotenv from 'dotenv';
dotenv.config();

import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { buildOpenApiDocument, configureApp } from '../bootstrap/configure-app';

async function generate(): Promise<void> {
  // OpenAPI generation only needs controller metadata. Safe placeholders keep provider
  // construction deterministic without opening PostgreSQL/RabbitMQ connections.
  process.env.DATABASE_URL ??= 'postgresql://openapi:openapi@127.0.0.1:5432/openapi';
  process.env.DIRECT_URL ??= process.env.DATABASE_URL;
  process.env.JWT_SECRET ??= 'openapi-generation-only';
  process.env.OFFLINE_LEASE_SECRET ??= 'openapi-generation-only';
  const app = await NestFactory.create(AppModule, { logger: false });
  configureApp(app);
  const document = buildOpenApiDocument(app);
  await writeFile(resolve(process.cwd(), 'openapi.json'), `${JSON.stringify(document, null, 2)}\n`);
  await app.close();
}

generate().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});

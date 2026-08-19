import * as dotenv from 'dotenv';
dotenv.config();
import * as fs from 'fs';

import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { WinstonModule } from 'nest-winston';
import { winstonConfig } from './common/logger/winston.config';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: WinstonModule.createLogger(winstonConfig),
  });
  app.use(cookieParser());

  // 1. Global API prefix (health, root, and metrics excluded)
  const apiPrefix = process.env.API_PREFIX || '/api/v1';
  app.setGlobalPrefix(apiPrefix, {
    exclude: ['health', '', 'metrics'],
  });

  // 2. Global Validation Pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // Strip properties not in DTO
      forbidNonWhitelisted: true, // Throw error if unknown properties sent
      transform: true, // Auto-transform payload to DTO class instances
    }),
  );

  // 3. Global Response Transform & Logging
  app.useGlobalInterceptors(new LoggingInterceptor(), new TransformInterceptor());

  // 4. Global Exception Filter (normalisasi semua error response)
  app.useGlobalFilters(new HttpExceptionFilter());

  // 5. Swagger documentation
  const config = new DocumentBuilder()
    .setTitle('Sync Without Signal API')
    .setDescription('The API documentation for K-POS Backend')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, document);

  // Auto-save pretty-printed openapi.json in development
  try {
    fs.writeFileSync('./openapi.json', JSON.stringify(document, null, 2));
    console.log('Spesifikasi OpenAPI yang rapi berhasil disimpan ke ./openapi.json');
  } catch (err) {
    console.warn('Gagal menyimpan file openapi.json:', err);
  }

  // 6. CORS
  const corsOrigins = process.env.CORS_ORIGINS;
  if (!corsOrigins || corsOrigins === '*') {
    app.enableCors({ origin: true, credentials: true }); // Reflect origin instead of wildcard
  } else {
    app.enableCors({
      origin: corsOrigins.split(',').map((o) => o.trim()),
      credentials: true,
    });
  }

  // 7. Configure RabbitMQ Microservice
  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.RMQ,
    options: {
      urls: [process.env.RABBITMQ_URL || 'amqp://localhost:5672'],
      queue: 'sync.transactions',
      prefetchCount: 10,
      noAck: false,
      queueOptions: {
        durable: true,
        arguments: {
          'x-dead-letter-exchange': 'dlx_exchange',
          'x-dead-letter-routing-key': 'sync.dlq.routingKey',
        },
      },
    },
  });

  // 8. Start server
  const port = process.env.PORT || 3000;

  // Start RabbitMQ microservice — degraded mode if broker is unavailable
  try {
    await app.startAllMicroservices();
    console.log(`RabbitMQ Worker is listening to 'sync.transactions'`);
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    console.warn(
      `[DEGRADED] RabbitMQ unavailable at startup: ${error}. HTTP API will start without consumer.`,
    );
  }

  await app.listen(port);

  console.log(`Application is running on: http://localhost:${port}`);
  console.log(`Swagger documentation is available at: http://localhost:${port}/docs`);
}

bootstrap().catch((err) => {
  console.error('Error during bootstrap:', err);
  process.exit(1);
});

import { INestApplication, ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, OpenAPIObject, SwaggerModule } from '@nestjs/swagger';
import { randomUUID } from 'node:crypto';
import type { Express } from 'express';
import { HttpExceptionFilter } from '../common/filters/http-exception.filter';
import { TransformInterceptor } from '../common/interceptors/transform.interceptor';

export function configureApp(app: INestApplication): void {
  const httpInstance = app.getHttpAdapter().getInstance() as Express;
  httpInstance.set('trust proxy', 1);
  app.use(
    (
      request: { headers: Record<string, string | string[] | undefined> },
      response: { setHeader(name: string, value: string): void },
      next: () => void,
    ) => {
      const requestId = request.headers['x-request-id']?.toString() ?? randomUUID();
      request.headers['x-request-id'] = requestId;
      response.setHeader('x-request-id', requestId);
      next();
    },
  );

  app.setGlobalPrefix(process.env.API_PREFIX || '/api/v1', {
    exclude: ['health', 'metrics', ''],
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.useGlobalInterceptors(new TransformInterceptor());
  app.useGlobalFilters(new HttpExceptionFilter());

  const allowedOrigins = (
    process.env.CORS_ORIGINS ?? 'http://localhost:5173,http://localhost:5174,http://localhost:5175'
  )
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  app.enableCors({ origin: allowedOrigins, credentials: true });
}

export function buildOpenApiDocument(app: INestApplication): OpenAPIObject {
  const config = new DocumentBuilder()
    .setTitle('K-POS API')
    .setDescription('Canonical API for the K-POS multi-app offline-first platform')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  return SwaggerModule.createDocument(app, config);
}

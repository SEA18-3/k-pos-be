import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // 1. Global API prefix (health & root excluded)
  const apiPrefix = process.env.API_PREFIX || '/api/v1';
  app.setGlobalPrefix(apiPrefix, {
    exclude: ['health', ''],
  });

  // 2. Global Validation Pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // Strip properties not in DTO
      forbidNonWhitelisted: true, // Throw error if unknown properties sent
      transform: true, // Auto-transform payload to DTO class instances
    }),
  );

  // 3. Global Response Transform (membungkus semua response sukses)
  app.useGlobalInterceptors(new TransformInterceptor());

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

  // 6. CORS
  const corsOrigins = process.env.CORS_ORIGINS || '*';
  app.enableCors({
    origin: corsOrigins === '*' ? true : corsOrigins.split(','),
    credentials: true,
  });

  // 7. Start server
  const port = process.env.PORT || 3000;
  await app.listen(port);

  console.log(`Application is running on: http://localhost:${port}`);
  console.log(`Swagger documentation is available at: http://localhost:${port}/docs`);
}

bootstrap().catch((err) => {
  console.error('Error during bootstrap:', err);
  process.exit(1);
});

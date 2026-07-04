import { NestFactory } from '@nestjs/core';
import { ValidationPipe, VersioningType } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import helmet from 'helmet';
import compression from 'compression';
import * as express from 'express';
import { join } from 'path';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { AuditInterceptor } from './common/interceptors/audit.interceptor';

// Global BigInt serialization fix
(BigInt.prototype as any).toJSON = function () { return this.toString(); };

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn', 'log', 'debug'],
  });

  // Serve uploaded media (local storage; swap for S3/CDN in production)
  app.use('/uploads', express.static(join(process.cwd(), 'uploads')));

  const config = app.get(ConfigService);
  const nodeEnv = config.get<string>('NODE_ENV', 'development');
  const port = config.get<number>('PORT', 4000);

  // Security
  app.use(helmet());
  app.use(compression());

  // CORS — allow a configurable list of origins (comma-separated CORS_ORIGINS or
  // APP_URL fallback). Native apps (APK/Expo) send no Origin header and are allowed.
  const corsOrigins = (config.get<string>('CORS_ORIGINS') ?? config.get<string>('APP_URL', 'http://localhost:3000'))
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  const allowAll = corsOrigins.includes('*');
  app.enableCors({
    origin: (origin, cb) => {
      // No Origin header = server-to-server / native mobile / curl → allow
      if (!origin || allowAll || corsOrigins.includes(origin)) return cb(null, true);
      // Allow any Cloudflare quick-tunnel + vercel preview during testing
      if (/\.trycloudflare\.com$/.test(origin) || /\.vercel\.app$/.test(origin)) return cb(null, true);
      return cb(null, false);
    },
    credentials: true,
  });

  // Global prefix + versioning
  app.setGlobalPrefix('api');
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });

  // Global pipes
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // Global filters
  app.useGlobalFilters(new HttpExceptionFilter());

  // Global interceptors
  const auditInterceptor = app.get(AuditInterceptor);
  app.useGlobalInterceptors(auditInterceptor);

  // Swagger (non-production only)
  if (nodeEnv !== 'production') {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('Umrah Connect API')
      .setDescription('Multi-tenant SaaS API for Umrah & Hajj operators')
      .setVersion('1.0')
      .addBearerAuth()
      .addTag('auth', 'Authentication & authorization')
      .addTag('tenants', 'Tenant management')
      .addTag('users', 'User management')
      .addTag('pilgrims', 'Pilgrim CRM')
      .addTag('bookings', 'Booking engine')
      .addTag('hotels', 'Hotel inventory')
      .addTag('visa', 'Visa & compliance')
      .addTag('transport', 'Transport & logistics')
      .addTag('finance', 'Finance & payments')
      .addTag('groups', 'Group operations')
      .addTag('marketplace', 'Vendor marketplace')
      .addTag('social', 'Social feed')
      .build();

    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('api/docs', app, document);
  }

  // Bind to 0.0.0.0 so cloud hosts (Render/Koyeb) can route to the container.
  await app.listen(port, '0.0.0.0');
  console.log(`🕋 Umrah Connect API running on port ${port} (prefix /api/v1)`);
  console.log(`   Health: /api/v1/health`);
  if (nodeEnv !== 'production') {
    console.log(`📚 Swagger docs: http://localhost:${port}/api/docs`);
  }
}

bootstrap();

import { INestApplication, Logger, ValidationPipe, VersioningType } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import compression from 'compression';
import * as express from 'express';
import { randomUUID } from 'crypto';
import { HttpExceptionFilter } from '../common/filters/http-exception.filter';
import { AuditInterceptor } from '../common/interceptors/audit.interceptor';
import { IdempotencyInterceptor } from '../common/idempotency/idempotency.interceptor';
import { resolveLocalStorageRoot } from '../modules/storage/storage.service';
import { makeClientIpResolver } from './client-ip';

// BigInt → JSON string (money is stored as bigint minor units).
(BigInt.prototype as any).toJSON = function () {
  return this.toString();
};

const DEV_ORIGINS = ['http://localhost:3000', 'http://127.0.0.1:3000'];

/** Parses TRUST_PROXY: "false" | "true" | hop count | comma list of subnets/names. */
export function trustProxySetting(raw: string | undefined): boolean | number | string {
  const v = (raw ?? 'loopback').trim();
  if (v === 'false') return false;
  if (v === 'true') return true;
  if (/^\d+$/.test(v)) return Number(v);
  return v;
}

export function allowedOrigins(config: ConfigService): { list: string[]; pattern?: RegExp } {
  const production = config.get<string>('NODE_ENV') === 'production';
  const configured = (config.get<string>('CORS_ORIGINS') ?? '')
    .split(',')
    .map((o) => o.trim().replace(/\/+$/, ''))
    .filter((o) => o && o !== '*');
  const web = config.get<string>('WEB_URL')?.replace(/\/+$/, '');
  const list = [...new Set([...configured, ...(web ? [web] : []), ...(production ? [] : DEV_ORIGINS)])];
  const rawPattern = config.get<string>('CORS_ORIGIN_REGEX');
  return { list, pattern: rawPattern ? new RegExp(rawPattern) : undefined };
}

/** Everything main.ts and the integration tests share. */
export function configureApp(app: INestApplication) {
  const expressApp = app as NestExpressApplication;
  const config = app.get(ConfigService);
  const logger = new Logger('Bootstrap');
  const production = config.get<string>('NODE_ENV') === 'production';

  expressApp.set('trust proxy', trustProxySetting(config.get<string>('TRUST_PROXY')));
  expressApp.disable('x-powered-by');

  // Correlation id: accept a sane inbound id (from the reverse proxy) or mint one.
  const clientIp = makeClientIpResolver({
    PROXY_SHARED_SECRET: config.get<string>('PROXY_SHARED_SECRET'),
    CLIENT_IP_HEADER: config.get<string>('CLIENT_IP_HEADER'),
  });
  app.use((req: any, res: any, next: () => void) => {
    req.clientIp = clientIp(req);
    const inbound = req.headers['x-request-id'];
    const id = typeof inbound === 'string' && /^[\w.-]{8,100}$/.test(inbound) ? inbound : randomUUID();
    req.requestId = id;
    req.headers['x-request-id'] = id;
    res.setHeader('X-Request-Id', id);
    next();
  });

  app.use(
    helmet({
      // JSON API: no inline content is served, so the strictest policy applies.
      contentSecurityPolicy: { directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] } },
      crossOriginResourcePolicy: { policy: 'same-site' },
      hsts: production ? { maxAge: 31536000, includeSubDomains: true } : false,
      referrerPolicy: { policy: 'no-referrer' },
    }),
  );
  app.use(compression());

  // Body size limits (the payment webhook keeps its raw body for signature checks).
  const bodyLimit = config.get<string>('BODY_LIMIT', '1mb');
  expressApp.useBodyParser('json', { limit: bodyLimit });
  expressApp.useBodyParser('urlencoded', { limit: bodyLimit, extended: false });

  // Public media only: top-level files written by /uploads (avatars, post and listing images).
  // Nested paths (visa documents, KYC, traveler documents) are never served statically.
  // Same directory the local storage driver writes to (STORAGE_LOCAL_DIR, default ./uploads).
  const uploadsDir = resolveLocalStorageRoot(config.get<string>('STORAGE_LOCAL_DIR'));
  const publicMedia = express.static(uploadsDir, { index: false, dotfiles: 'deny', fallthrough: false });
  app.use('/uploads', (req: any, res: any, next: (err?: unknown) => void) => {
    const segments = String(req.path || '').split('/').filter(Boolean);
    if (segments.length !== 1 || segments[0].startsWith('.')) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Not found' } });
      return;
    }
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
    publicMedia(req, res, next);
  });

  const origins = allowedOrigins(config);
  app.enableCors({
    origin: (origin, cb) => {
      // No Origin header: server-to-server, native apps, same-origin proxy → nothing for CORS to decide.
      if (!origin) return cb(null, true);
      const normalized = origin.replace(/\/+$/, '');
      if (origins.list.includes(normalized) || origins.pattern?.test(normalized)) return cb(null, true);
      return cb(null, false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Authorization', 'Content-Type', 'X-Request-Id', 'Idempotency-Key'],
    exposedHeaders: ['X-Request-Id', 'Retry-After'],
    maxAge: 600,
  });
  if ((config.get<string>('CORS_ORIGINS') ?? '').split(',').some((o) => o.trim() === '*')) {
    logger.warn('CORS_ORIGINS contains "*" — ignored. List explicit origins instead.');
  }

  app.setGlobalPrefix('api');
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );
  app.useGlobalFilters(new HttpExceptionFilter());
  // Order matters: idempotency wraps the audit trail, so a replayed request —
  // which creates nothing — is not written to the trail as a create (N-FORM-1).
  app.useGlobalInterceptors(app.get(IdempotencyInterceptor), app.get(AuditInterceptor));

  if (!production && config.get<string>('SWAGGER_ENABLED', 'true') !== 'false') {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('Umrah Connect API')
      .setDescription('Multi-tenant platform API for Umrah operators, providers and travelers')
      .setVersion('1.0')
      .addBearerAuth()
      .build();
    SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, swaggerConfig));
  }
  return app;
}

import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';
import { AppModule } from './app.module';
import { configureApp } from './bootstrap/configure-app';
import { assertProductionConfig } from './bootstrap/env.validation';

async function bootstrap() {
  assertProductionConfig(process.env);
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    // Payment webhooks are signature-verified against the exact bytes sent.
    rawBody: true,
    bodyParser: false,
    logger: process.env.NODE_ENV === 'production' ? ['error', 'warn', 'log'] : ['error', 'warn', 'log', 'debug'],
  });
  configureApp(app);
  app.enableShutdownHooks();

  const config = app.get(ConfigService);
  const port = Number(config.get<string>('PORT', '4000'));
  const host = config.get<string>('HOST', '0.0.0.0');
  await app.listen(port, host);
  const logger = new Logger('Bootstrap');
  logger.log(`Umrah Connect API listening on ${host}:${port} (prefix /api/v1, env ${config.get('NODE_ENV')})`);
}

bootstrap().catch((err) => {
  console.error(err);
  process.exit(1);
});

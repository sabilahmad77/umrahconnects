import { NestFactory } from '@nestjs/core';
import { INestApplicationContext } from '@nestjs/common';
import { AppModule } from '../../src/app.module';

/**
 * Boots the application context (no HTTP server). Bootstrap hooks run, so the
 * access-policy check passes and the capability catalogue is synced before any
 * script grants a role.
 */
export async function withAppContext<T>(fn: (app: INestApplicationContext) => Promise<T>): Promise<T> {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  try {
    await app.init();
    return await fn(app);
  } finally {
    await app.close();
  }
}

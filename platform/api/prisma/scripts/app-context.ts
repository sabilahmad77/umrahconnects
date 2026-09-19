import { NestFactory } from '@nestjs/core';
import { INestApplicationContext } from '@nestjs/common';
import { AppModule } from '../../src/app.module';
import { withSystemScope } from '../../src/prisma/db-context';

/**
 * Boots the application context (no HTTP server). Bootstrap hooks run, so the
 * access-policy check passes and the capability catalogue is synced before any
 * script grants a role.
 */
export async function withAppContext<T>(fn: (app: INestApplicationContext) => Promise<T>): Promise<T> {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  try {
    await app.init();
    // Operator scripts work across organizations: explicit system scope for Row-Level
    // Security (R05). Seeds that use a bare PrismaClient run as the owner role instead.
    return await withSystemScope('scripts.maintenance', () => fn(app));
  } finally {
    await app.close();
  }
}

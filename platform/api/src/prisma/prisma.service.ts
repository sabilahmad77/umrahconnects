import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { createRlsScopedClient } from './rls-extension';

// Tenant isolation is enforced in the service layer (every tenant-owned query is
// scoped by the caller's tenant) AND, as defence in depth, by PostgreSQL Row-Level
// Security on the tenant-private tables: every query that can reach one runs with
// the request's database scope (rls-extension.ts, db-context.ts). See
// docs/control-tower/RLS.md and docs/adr/001-multi-tenancy-rls.md.

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    super({
      log: [
        ...(process.env.NODE_ENV === 'development' ? [{ emit: 'event' as const, level: 'query' as const }] : []),
        { emit: 'stdout', level: 'error' },
        { emit: 'stdout', level: 'warn' },
      ],
    });

    // Log slow queries in development ($on exists only on the base client).
    if (process.env.NODE_ENV === 'development') {
      (this as any).$on('query', (e: any) => {
        if (e.duration > 500) {
          this.logger.warn(`Slow query (${e.duration}ms): ${e.query}`);
        }
      });
    }

    // Every consumer receives the RLS-scoped client; the class type is unchanged.
    return createRlsScopedClient(this);
  }

  async onModuleInit() {
    await this.$connect();
    this.logger.log('Prisma connected');
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}

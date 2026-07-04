import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

// The tenant_id is set per-request via SET LOCAL app.current_tenant_id
// All RLS policies read current_setting('app.current_tenant_id')
const TENANT_CONTEXT_SETTING = 'app.current_tenant_id';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    super({
      log: [
        { emit: 'event', level: 'query' },
        { emit: 'stdout', level: 'error' },
        { emit: 'stdout', level: 'warn' },
      ],
    });
  }

  async onModuleInit() {
    await this.$connect();
    this.logger.log('Prisma connected');

    // Log slow queries in development
    if (process.env.NODE_ENV === 'development') {
      (this as any).$on('query', (e: any) => {
        if (e.duration > 500) {
          this.logger.warn(`Slow query (${e.duration}ms): ${e.query}`);
        }
      });
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }

  // Sets the tenant context for the current transaction / session.
  // Must be called inside a $transaction or via middleware on every request.
  async setTenantContext(tenantId: string): Promise<void> {
    await this.$executeRawUnsafe(
      `SET LOCAL "${TENANT_CONTEXT_SETTING}" = '${tenantId.replace(/'/g, "''")}'`,
    );
  }

  async clearTenantContext(): Promise<void> {
    await this.$executeRawUnsafe(`SET LOCAL "${TENANT_CONTEXT_SETTING}" = ''`);
  }

  // Run a callback inside a transaction with tenant context pre-set.
  async withTenant<T>(tenantId: string, fn: (prisma: PrismaService) => Promise<T>): Promise<T> {
    return this.$transaction(async (tx) => {
      await (tx as any).$executeRawUnsafe(
        `SET LOCAL "${TENANT_CONTEXT_SETTING}" = '${tenantId.replace(/'/g, "''")}'`,
      );
      return fn(tx as unknown as PrismaService);
    });
  }
}

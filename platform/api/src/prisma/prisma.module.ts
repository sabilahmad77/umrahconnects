import { Global, MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { DbContextMiddleware } from './db-context.middleware';
import { SharedTenantResolver } from './shared-tenant.resolver';

@Global()
@Module({
  providers: [PrismaService, SharedTenantResolver],
  exports: [PrismaService, SharedTenantResolver],
})
export class PrismaModule implements NestModule {
  // Every request gets its own database context (see db-context.ts).
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(DbContextMiddleware).forRoutes('*');
  }
}

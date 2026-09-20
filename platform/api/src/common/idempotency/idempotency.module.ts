import { Global, Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { IdempotencyInterceptor } from './idempotency.interceptor';

/**
 * The interceptor is bound in bootstrap/configure-app.ts rather than through
 * APP_INTERCEPTOR, because it must sit OUTSIDE the audit interceptor: a replayed
 * request creates nothing, so it must not be audited as a create either.
 */
@Global()
@Module({
  imports: [PrismaModule],
  providers: [IdempotencyInterceptor],
  exports: [IdempotencyInterceptor],
})
export class IdempotencyModule {}

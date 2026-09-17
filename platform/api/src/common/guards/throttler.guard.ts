import { ExecutionContext, Injectable } from '@nestjs/common';
import { ThrottlerGuard, ThrottlerLimitDetail } from '@nestjs/throttler';

/**
 * ThrottlerGuard that always sends the standard `Retry-After` header on 429.
 * The library only emits `Retry-After-<name>` for named throttlers (e.g. the
 * per-account login limiter), which clients and the CORS exposure list ignore.
 */
@Injectable()
export class AppThrottlerGuard extends ThrottlerGuard {
  protected async throwThrottlingException(context: ExecutionContext, detail: ThrottlerLimitDetail): Promise<void> {
    const { res } = this.getRequestResponse(context);
    if (res && !res.headersSent) res.header('Retry-After', String(Math.max(1, Math.ceil(detail.timeToBlockExpire))));
    return super.throwThrottlingException(context, detail);
  }
}

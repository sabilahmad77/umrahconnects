import { SetMetadata } from '@nestjs/common';

/**
 * Access policy markers. Every non-public route must declare one of:
 *   @RequirePermissions(...)  — capability-gated
 *   @AnyAuthenticated()       — any signed-in principal; the service MUST enforce
 *                               ownership (own post, own conversation, own request…)
 * A route with neither is refused at runtime and the API refuses to boot (deny-by-default).
 */
export const ANY_AUTHENTICATED_KEY = 'access:anyAuthenticated';
export const AnyAuthenticated = () => SetMetadata(ANY_AUTHENTICATED_KEY, true);

/**
 * Routes that stay reachable while the caller's organization is not ACTIVE
 * (PENDING_KYC, KYC_SUBMITTED, KYC_REJECTED) so onboarding can be completed.
 * Suspended or churned organizations are always refused.
 */
export const ALLOW_PENDING_TENANT_KEY = 'access:allowPendingTenant';
export const AllowPendingTenant = () => SetMetadata(ALLOW_PENDING_TENANT_KEY, true);

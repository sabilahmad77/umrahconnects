import { Injectable, CanActivate, ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSIONS_KEY } from '../decorators/require-permissions.decorator';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { ALLOW_PENDING_TENANT_KEY, ANY_AUTHENTICATED_KEY } from '../decorators/access.decorator';
import { RbacService } from '../../modules/rbac/rbac.service';
import type { Principal } from '../../modules/auth/principal';

const PENDING_TENANT_STATUSES = new Set(['PENDING_KYC', 'KYC_SUBMITTED', 'KYC_REJECTED', 'KYC_APPROVED']);

/**
 * Deny-by-default access guard (runs after JwtAuthGuard).
 *
 * 1. Public routes pass.
 * 2. The caller's organization must be ACTIVE — or pending onboarding on routes
 *    explicitly marked @AllowPendingTenant().
 * 3. Capability routes require every listed capability, resolved server-side
 *    from the database (never from token claims).
 * 4. @AnyAuthenticated routes pass; ownership is enforced in the service.
 * 5. Anything else is refused.
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private rbacService: RbacService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, targets)) return true;

    const request = context.switchToHttp().getRequest();
    const user: Principal | undefined = request.user;
    if (!user?.sub || !user?.tenantId) throw new UnauthorizedException('Authentication required');

    if (user.tenantStatus !== 'ACTIVE') {
      const allowPending = this.reflector.getAllAndOverride<boolean>(ALLOW_PENDING_TENANT_KEY, targets);
      if (!(allowPending && PENDING_TENANT_STATUSES.has(user.tenantStatus))) {
        throw new UnauthorizedException(
          PENDING_TENANT_STATUSES.has(user.tenantStatus)
            ? 'Organization verification is not complete yet'
            : 'Tenant is not active',
        );
      }
    }

    const required = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, targets);
    if (required?.length) {
      const granted = await this.rbacService.permissionsFor(request);
      const missing = required.filter((p) => !granted.has(p));
      if (missing.length) {
        throw new ForbiddenException(`Missing required permissions: ${missing.join(', ')}`);
      }
      return true;
    }

    if (this.reflector.getAllAndOverride<boolean>(ANY_AUTHENTICATED_KEY, targets)) return true;

    throw new ForbiddenException('This route has no access policy');
  }
}

import { Injectable, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY, OPTIONAL_PRINCIPAL_KEY } from '../decorators/public.decorator';
import { bindPrincipalToDbContext } from '../../prisma/db-context';
import { SharedTenantResolver } from '../../prisma/shared-tenant.resolver';
import type { Principal } from '../../modules/auth/principal';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(
    private reflector: Reflector,
    private sharedTenants: SharedTenantResolver,
  ) {
    super();
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler(), context.getClass()];
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, targets);
    if (isPublic) {
      if (this.reflector.getAllAndOverride<boolean>(OPTIONAL_PRINCIPAL_KEY, targets)) {
        await this.resolveOptionalPrincipal(context);
      }
      return true;
    }
    const ok = (await super.canActivate(context)) as boolean;
    if (ok) {
      // Database scope for Row-Level Security: from here on, queries run as this
      // principal (tenant, or platform for the platform organization).
      const principal: Principal = context.switchToHttp().getRequest().user;
      bindPrincipalToDbContext(principal, await this.sharedTenants.communityTenantId());
    }
    return ok;
  }

  /**
   * @PublicWithOptionalUser routes: attribution only. A valid token sets
   * request.user; anything else leaves the caller anonymous. The request is never
   * refused here and no database scope is bound — the route's data access stays
   * that of an anonymous request.
   */
  private async resolveOptionalPrincipal(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest();
    if (!/^Bearer\s+\S+/i.test(String(request.headers?.authorization ?? ''))) return;
    try {
      await super.canActivate(context);
    } catch {
      request.user = undefined;
    }
  }

  handleRequest(err: any, user: any) {
    if (err || !user) {
      throw err || new UnauthorizedException('Authentication required');
    }
    return user;
  }
}

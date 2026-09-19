import { Injectable, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
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
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;
    const ok = (await super.canActivate(context)) as boolean;
    if (ok) {
      // Database scope for Row-Level Security: from here on, queries run as this
      // principal (tenant, or platform for the platform organization).
      const principal: Principal = context.switchToHttp().getRequest().user;
      bindPrincipalToDbContext(principal, await this.sharedTenants.communityTenantId());
    }
    return ok;
  }

  handleRequest(err: any, user: any) {
    if (err || !user) {
      throw err || new UnauthorizedException('Authentication required');
    }
    return user;
  }
}

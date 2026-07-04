import { Injectable, NestMiddleware, UnauthorizedException, Logger } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../prisma/prisma.service';

// This middleware runs on every authenticated request.
// It extracts tenant_id from the JWT, verifies the tenant is active,
// then stores it on the request object and sets the Postgres RLS context.
@Injectable()
export class TenantContextMiddleware implements NestMiddleware {
  private readonly logger = new Logger(TenantContextMiddleware.name);

  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async use(req: Request & { tenantId?: string; user?: any }, res: Response, next: NextFunction) {
    const authHeader = req.headers['authorization'];
    if (!authHeader?.startsWith('Bearer ')) {
      return next();
    }

    const token = authHeader.slice(7);
    try {
      const payload = this.jwtService.verify(token);
      if (!payload?.tenantId) {
        throw new UnauthorizedException('Invalid token: no tenant context');
      }

      // Cache tenant lookup — in production this hits Redis first
      const tenant = await this.prisma.tenant.findUnique({
        where: { id: payload.tenantId },
        select: { id: true, status: true, tier: true },
      });

      if (!tenant || tenant.status !== 'ACTIVE') {
        throw new UnauthorizedException('Tenant is not active');
      }

      req.tenantId = tenant.id;
      req.user = payload;

      // Set Postgres RLS context for this request
      // The actual SET LOCAL runs within each Prisma transaction/query via middleware
      (req as any).setTenantContext = async () => {
        await this.prisma.setTenantContext(tenant.id);
      };
    } catch (err) {
      if (err instanceof UnauthorizedException) throw err;
      this.logger.debug(`Tenant context middleware: ${(err as Error).message}`);
    }

    next();
  }
}

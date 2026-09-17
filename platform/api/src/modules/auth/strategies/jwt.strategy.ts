import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../prisma/prisma.service';
import { JwtPayload } from '../auth.service';
import { Principal } from '../principal';

export const ACCESS_TOKEN_TYPE = 'access';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>('JWT_SECRET'),
      issuer: 'umrah-connects',
      audience: 'umrah-connects-api',
      algorithms: ['HS256'],
    });
  }

  async validate(payload: JwtPayload): Promise<Principal> {
    if (!payload?.sub || !payload.tenantId || payload.typ !== ACCESS_TOKEN_TYPE) {
      throw new UnauthorizedException('Invalid token payload');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: {
        id: true, tenantId: true, email: true, phone: true, status: true, deletedAt: true,
        emailVerifiedAt: true, sessionsRevokedAt: true, lockedUntil: true,
        tenant: { select: { status: true, type: true, deletedAt: true } },
        userRoles: {
          where: { OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
          select: { role: { select: { name: true } } },
        },
      },
    });

    if (!user || user.deletedAt || user.tenantId !== payload.tenantId) {
      throw new UnauthorizedException('Session is no longer valid');
    }
    if (user.status === 'LOCKED' || user.status === 'INACTIVE') {
      throw new UnauthorizedException('Account is not active');
    }
    if (user.sessionsRevokedAt && (payload.iat ?? 0) * 1000 < user.sessionsRevokedAt.getTime()) {
      throw new UnauthorizedException('Session has been revoked');
    }
    if (!user.tenant || user.tenant.deletedAt) {
      throw new UnauthorizedException('Tenant is not active');
    }

    return {
      sub: user.id,
      email: user.email,
      phone: user.phone,
      tenantId: user.tenantId,
      tenantType: user.tenant.type,
      tenantStatus: user.tenant.status,
      roles: user.userRoles.map((ur) => ur.role.name),
      emailVerified: !!user.emailVerifiedAt,
      iat: payload.iat,
      exp: payload.exp,
    };
  }
}

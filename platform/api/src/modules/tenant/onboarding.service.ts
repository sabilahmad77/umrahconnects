import { BadRequestException, ConflictException, ForbiddenException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { RbacService } from '../rbac/rbac.service';
import { AuditService } from '../audit/audit.service';
import { AuthService, SessionContext } from '../auth/auth.service';
import { COMMUNITY_TENANT_SLUG, ORG_ADMIN_ROLE_BY_TENANT_TYPE, ROLE_CODES } from '../rbac/catalog';
import type { Principal } from '../auth/principal';
import type { CreateOrganizationDto } from './dto/onboarding.dto';

/**
 * Provider onboarding: a signed-in traveler founds an organization (agency,
 * hotel, transport company or visa agency). The organization starts in
 * PENDING_KYC; its founder becomes that organization's administrator but can
 * only reach onboarding routes until a Super Admin approves KYC.
 */
@Injectable()
export class OnboardingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rbac: RbacService,
    private readonly audit: AuditService,
    private readonly auth: AuthService,
    private readonly config: ConfigService,
  ) {}

  private slugify(name: string) {
    const base = name.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
    return base || 'organization';
  }

  async createOrganization(principal: Principal, dto: CreateOrganizationDto, ctx: SessionContext) {
    const user = await this.prisma.user.findUnique({
      where: { id: principal.sub },
      include: { tenant: true },
    });
    if (!user || user.tenant.slug !== COMMUNITY_TENANT_SLUG) {
      throw new ForbiddenException('Only traveler accounts can found a new organization');
    }
    const requireVerified = this.config.get<string>('ONBOARDING_REQUIRE_VERIFIED_EMAIL', 'true') !== 'false';
    if (requireVerified && !user.emailVerifiedAt) {
      throw new ForbiddenException('Confirm your email address before registering an organization');
    }
    const adminRole = ORG_ADMIN_ROLE_BY_TENANT_TYPE[dto.type];
    if (!adminRole) throw new BadRequestException('Unsupported organization type');

    let slug = dto.slug ?? this.slugify(dto.name);
    if (await this.prisma.tenant.findUnique({ where: { slug } })) {
      if (dto.slug) throw new ConflictException(`Organization slug '${slug}' is already taken`);
      slug = `${slug}-${Math.random().toString(36).slice(2, 8)}`;
    }
    const adminRoleId = await this.rbac.systemRoleId(adminRole);

    // One transaction for the whole move: the organization, the founder's new
    // home and the founder's new role either all exist or none do. Granting the
    // role afterwards used to leave a founder with no role at all if that
    // second write failed.
    const tenant = await this.prisma
      .$transaction(async (tx) => {
        const org = await tx.tenant.create({
          data: {
            slug,
            name: dto.name.trim(),
            nameAr: dto.nameAr?.trim() || undefined,
            type: dto.type,
            status: 'PENDING_KYC',
            email: dto.email ?? user.email!,
            phone: dto.phone,
            country: dto.country.toUpperCase(),
            licenseNumber: dto.licenseNumber?.trim() || undefined,
            website: dto.website,
            settings: {},
          },
        });
        // The founder moves into the new organization. Traveler-only grants are dropped.
        await tx.user.update({ where: { id: user.id }, data: { tenantId: org.id, status: 'ACTIVE' } });
        await tx.userRole.deleteMany({
          where: { userId: user.id, role: { OR: [{ tenantId: { not: null } }, { name: { in: ROLE_CODES } }] } },
        });
        await tx.userRole.create({ data: { userId: user.id, roleId: adminRoleId, grantedBy: user.id } });
        return org;
      })
      .catch((error: { code?: string }) => {
        // Two founders racing for the same generated slug: the unique index decides.
        if (error?.code === 'P2002') throw new ConflictException('That organization address was just taken. Try again.');
        throw error;
      });
    await this.auth.revokeAllSessions(user.id);
    await this.audit.log({
      tenantId: tenant.id, actorId: user.id, actorEmail: user.email ?? undefined, action: 'CREATE',
      namespace: 'core', resource: 'tenant', resourceId: tenant.id,
      metadata: { via: 'onboarding', type: tenant.type, founderRole: adminRole },
    });

    const refreshed = await this.prisma.user.findUniqueOrThrow({
      where: { id: user.id },
      include: { userRoles: { include: { role: true } }, tenant: true },
    });
    const tokens = await this.auth.generateTokens(refreshed, ctx);
    return {
      organization: { id: tenant.id, name: tenant.name, slug: tenant.slug, type: tenant.type, status: tenant.status },
      role: adminRole,
      tokens,
      next: 'Submit KYC via POST /tenants/me/kyc; the organization is activated after platform review.',
    };
  }
}

import { Injectable } from '@nestjs/common';
import { COMMUNITY_TENANT_SLUG } from '../modules/rbac/catalog';
import { PrismaService } from './prisma.service';

/**
 * The traveler community organization (D-007). Every traveler belongs to it, so
 * its id is never sent to the database as a tenant: the tenant clause of the RLS
 * policies would otherwise treat all travelers as one organization.
 */
@Injectable()
export class SharedTenantResolver {
  private communityId?: string;

  constructor(private readonly prisma: PrismaService) {}

  async communityTenantId(): Promise<string | null> {
    if (this.communityId) return this.communityId;
    const tenant = await this.prisma.tenant.findUnique({ where: { slug: COMMUNITY_TENANT_SLUG }, select: { id: true } });
    if (tenant) this.communityId = tenant.id; // created on first traveler signup; do not cache its absence
    return tenant?.id ?? null;
  }
}

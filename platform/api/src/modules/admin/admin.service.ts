import { Injectable, NotFoundException, BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { TenantStatus, UserStatus } from '@prisma/client';
import { ASSIGNABLE_ROLES_BY_TENANT_TYPE, COMMUNITY_TENANT_SLUG } from '../rbac/catalog';
import { REGISTRY_SOURCES } from './dto/admin.dto';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { DocumentAccessService } from '../storage/document-access.service';

/** Who performed a privileged action — threaded into every audit row. */
export interface AdminActor {
  sub?: string;
  email?: string;
  tenantId?: string;
}

/**
 * States of an organization that is still being verified. They belong to the
 * KYC workflow: an organization enters ACTIVE from one of them only through an
 * approved KYC submission, never through a direct status change.
 */
const VERIFICATION_STATUSES: TenantStatus[] = [
  TenantStatus.PENDING_KYC,
  TenantStatus.KYC_SUBMITTED,
  TenantStatus.KYC_APPROVED,
  TenantStatus.KYC_REJECTED,
];

/** What the platform remembers about a suspension, kept in `tenant.metadata.suspension`. */
interface SuspensionRecord {
  previousStatus: TenantStatus;
  at: string;
  by?: string;
  reason?: string;
}

/** Environment variables Google sign-in needs (see auth/google.service.ts). */
const GOOGLE_SIGN_IN_SETTINGS = ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_REDIRECT_URI'] as const;

type RoleRef = { id: string; name: string; tenantId: string | null };

/**
 * Why `role` may not be granted to an account of an organization of `tenantType`
 * (or null when it may):
 *  - SUPER_ADMIN only to accounts of the PLATFORM organization;
 *  - global organization roles only where that organization type allows them;
 *  - organization custom roles only inside their own organization;
 *  - platform accounts never receive organization roles.
 */
function grantRefusal(
  tenantType: string,
  userTenantId: string,
  role: { name: string; tenantId: string | null },
): { status: 400 | 403; message: string } | null {
  if (role.tenantId) {
    return role.tenantId === userTenantId ? null : { status: 400, message: 'Role belongs to a different tenant' };
  }
  if (role.name === 'SUPER_ADMIN') {
    return tenantType === 'PLATFORM'
      ? null
      : { status: 403, message: 'Super Admin can only be granted to platform accounts' };
  }
  const allowed = (ASSIGNABLE_ROLES_BY_TENANT_TYPE[tenantType] ?? []) as string[];
  const communityRole = role.name === 'PILGRIM';
  if (!allowed.includes(role.name) && !(communityRole && tenantType !== 'PLATFORM')) {
    return { status: 403, message: `Role ${role.name} cannot be granted to a ${tenantType} organization` };
  }
  return null;
}

@Injectable()
export class AdminService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  /**
   * Super Admin actions are the platform's highest-privilege operations
   * (suspending a tenant, granting a role, revoking sessions) — every one of
   * them writes an audit row so the action is attributable after the fact.
   */
  private async trail(
    actor: AdminActor | undefined,
    action: string,
    resource: string,
    resourceId: string,
    before?: unknown,
    after?: unknown,
    metadata?: Record<string, unknown>,
    tenantId?: string,
  ) {
    await this.audit.log({
      tenantId,
      actorId: actor?.sub,
      actorEmail: actor?.email,
      action,
      namespace: 'core',
      resource,
      resourceId,
      beforeState: before,
      afterState: after,
      metadata,
    });
  }

  // ── Platform-wide overview stats ─────────────────────────────────────
  async getStats() {
    const [
      totalTenants, totalUsers, totalPilgrims, totalHotels, totalVehicles, totalBookings,
      tenantByType, tenantByStatus, userByStatus,
      paidInvoices, outstandingInvoices, pendingKyc, activeListings, openInquiries,
    ] = await Promise.all([
      this.prisma.tenant.count(),
      this.prisma.user.count({ where: { deletedAt: null } }),
      this.prisma.pilgrim.count({ where: { deletedAt: null } }),
      this.prisma.hotel.count(),
      this.prisma.vehicle.count(),
      this.prisma.booking.count(),
      this.prisma.tenant.groupBy({ by: ['type'], _count: true }),
      // Platform-wide status breakdowns. Without these the admin tiles counted
      // only the rows on the current page while sitting next to a platform-wide
      // total, which read as a platform-wide figure.
      this.prisma.tenant.groupBy({ by: ['status'], _count: true }),
      this.prisma.user.groupBy({ by: ['status'], where: { deletedAt: null }, _count: true }),
      this.prisma.invoice.aggregate({ where: { status: 'PAID' as any }, _sum: { paidCents: true } }),
      this.prisma.invoice.aggregate({ where: { status: { in: ['ISSUED', 'SENT', 'PARTIALLY_PAID', 'OVERDUE'] as any } }, _sum: { totalCents: true } }),
      this.prisma.tenantKyc.count({ where: { verifiedAt: null, rejectionReason: null } }),
      this.prisma.listing.count({ where: { isActive: true } }),
      this.prisma.listingInquiry.count({ where: { status: 'NEW' } }),
    ]);

    const byType: Record<string, number> = {};
    for (const t of tenantByType) byType[t.type as string] = (t._count as any) ?? 0;
    const tenantStatus: Record<string, number> = {};
    for (const t of tenantByStatus) tenantStatus[t.status as string] = (t._count as any) ?? 0;
    const userStatus: Record<string, number> = {};
    for (const u of userByStatus) userStatus[u.status as string] = (u._count as any) ?? 0;

    const recentActivity = await this.prisma.auditLog.findMany({
      orderBy: { occurredAt: 'desc' }, take: 8,
      select: { id: true, action: true, resource: true, resourceId: true, actorEmail: true, occurredAt: true, tenantId: true },
    });

    return {
      tenants: { total: totalTenants, byType, byStatus: tenantStatus },
      users: totalUsers,
      usersByStatus: userStatus,
      pilgrims: totalPilgrims,
      hotels: totalHotels,
      vehicles: totalVehicles,
      bookings: totalBookings,
      revenue: {
        collectedCents: Number(paidInvoices._sum.paidCents ?? 0),
        outstandingCents: Number(outstandingInvoices._sum.totalCents ?? 0),
        currency: 'SAR',
      },
      kyc: { pending: pendingKyc },
      marketplace: { activeListings, openInquiries },
      recentActivity,
    };
  }

  // ── Tenants ──────────────────────────────────────────────────────────
  /**
   * Each row also says what an administrator can do with it: `verified` (an
   * approved KYC submission exists, so the organization may be ACTIVE) and
   * `restoreStatus` (the status a suspension or archive would return it to).
   */
  async listTenants(query: any = {}) {
    const { status, type, search, page = 1, limit = 50 } = query;
    const where: any = {};
    if (status) where.status = status;
    if (type) where.type = type;
    if (search) where.name = { contains: search, mode: 'insensitive' };
    const skip = (+page - 1) * +limit;
    const [rows, total] = await Promise.all([
      this.prisma.tenant.findMany({
        where, skip, take: +limit, orderBy: { createdAt: 'desc' },
        include: {
          _count: { select: { users: true, kycRecords: { where: { verifiedAt: { not: null } } } } },
        },
      }),
      this.prisma.tenant.count({ where }),
    ]);
    const items = await Promise.all(
      rows.map(async (t) => ({
        ...t,
        verified: t.type === 'PLATFORM' || t._count.kycRecords > 0,
        restoreStatus: await this.restoreStatusOf(t),
      })),
    );
    return { items, total, page: +page, limit: +limit, totalPages: Math.ceil(total / +limit) };
  }

  async findTenant(id: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id },
      include: {
        users: { select: { id: true, email: true, firstName: true, lastName: true, status: true } },
        kycRecords: { orderBy: { createdAt: 'desc' } },
        _count: { select: { users: true, roles: true } },
      },
    });
    if (!tenant) throw new NotFoundException('Tenant not found');
    return {
      ...tenant,
      verified: tenant.type === 'PLATFORM' || tenant.kycRecords.some((k) => !!k.verifiedAt),
      restoreStatus: await this.restoreStatusOf(tenant),
    };
  }

  private static metadataOf(tenant: { metadata?: unknown }): Record<string, any> {
    const m = tenant.metadata;
    return m && typeof m === 'object' && !Array.isArray(m) ? { ...(m as Record<string, any>) } : {};
  }

  /**
   * The status a suspended or archived organization returns to when that is
   * lifted. It is recorded on the organization when the suspension or archive
   * happens; for ones made before that, the audit trail row of the change has it.
   */
  private async restoreStatusOf(tenant: {
    id: string;
    status: TenantStatus;
    metadata?: unknown;
  }): Promise<TenantStatus | null> {
    if (tenant.status !== TenantStatus.SUSPENDED && tenant.status !== TenantStatus.CHURNED) return null;
    const meta = AdminService.metadataOf(tenant);
    const recorded: SuspensionRecord | undefined =
      tenant.status === TenantStatus.SUSPENDED ? meta.suspension : meta.archive;
    if (recorded?.previousStatus) return recorded.previousStatus;
    const row = await this.prisma.auditLog.findFirst({
      where: {
        tenantId: tenant.id,
        resource: 'tenant',
        resourceId: tenant.id,
        action: { in: ['TENANT_CONFIG_CHANGE', 'SOFT_DELETE'] as any },
      },
      orderBy: { occurredAt: 'desc' },
      select: { beforeState: true, afterState: true },
    });
    const after = (row?.afterState as any)?.status;
    const previous = (row?.beforeState as any)?.status;
    return after === tenant.status && previous ? (previous as TenantStatus) : null;
  }

  /**
   * Change an organization's status from the platform console.
   *
   * What this can do: suspend an organization, lift a suspension (the
   * organization returns to the status it had), restore an archived
   * organization, and reactivate an organization that has passed verification.
   * What it cannot do: activate an organization that has not been verified, or
   * move one between verification states. Those decisions belong to KYC review
   * (approve / reject), so there is exactly one path to ACTIVE for a new
   * organization and it leaves a review record behind.
   */
  async updateTenantStatus(id: string, status: TenantStatus, actor?: AdminActor, reason?: string) {
    const before = await this.findTenant(id);
    if (before.status === status) {
      throw new BadRequestException(`Tenant is already ${status}`);
    }
    if (status === TenantStatus.CHURNED) {
      throw new BadRequestException('Use Archive to retire an organization');
    }
    // A non-ACTIVE tenant is rejected at the auth guard, so downgrading your
    // own tenant would immediately lock you out of the admin surface.
    if (status !== TenantStatus.ACTIVE && actor?.tenantId === id) {
      throw new BadRequestException(
        'You cannot suspend the tenant you are signed in to — it would lock you out',
      );
    }
    if (status !== TenantStatus.ACTIVE && before.slug === COMMUNITY_TENANT_SLUG) {
      throw new BadRequestException(
        'The traveler community cannot be suspended — it would sign out every traveler. Lock individual accounts instead.',
      );
    }

    const lifting = before.restoreStatus === status;
    if (!lifting) {
      if (VERIFICATION_STATUSES.includes(status)) {
        throw new BadRequestException('Verification states change only through KYC review');
      }
      if (status === TenantStatus.ACTIVE && !before.verified) {
        throw new BadRequestException(
          'This organization has not been verified. Approve its KYC submission to activate it.',
        );
      }
      if (status === TenantStatus.SUSPENDED && before.deletedAt) {
        throw new BadRequestException('Restore the archived organization before suspending it');
      }
    }

    const metadata = AdminService.metadataOf(before);
    if (status === TenantStatus.SUSPENDED) {
      metadata.suspension = {
        previousStatus: before.status,
        at: new Date().toISOString(),
        by: actor?.email ?? actor?.sub,
        reason,
      } satisfies SuspensionRecord;
    } else if (before.status === TenantStatus.SUSPENDED) {
      delete metadata.suspension;
    }
    if (before.status === TenantStatus.CHURNED) delete metadata.archive;

    const tenant = await this.prisma.tenant.update({
      where: { id },
      data: {
        status,
        metadata,
        // Leaving the archive clears deletedAt: otherwise a tenant reads as
        // ACTIVE while still carrying deletedAt, i.e. active and archived at once.
        ...(before.deletedAt ? { deletedAt: null } : {}),
      },
    });
    await this.trail(
      actor, 'TENANT_CONFIG_CHANGE', 'tenant', id,
      { status: before.status, deletedAt: before.deletedAt },
      { status: tenant.status, deletedAt: tenant.deletedAt },
      { tenantName: tenant.name, reason, lifted: lifting || undefined }, id,
    );
    return tenant;
  }

  /**
   * Archive = soft delete. CHURNED is the real terminal TenantStatus; the
   * previous 'INACTIVE' literal is not a member of the enum, so archiving
   * always failed at the database with a 500.
   */
  async archiveTenant(id: string, actor?: AdminActor) {
    const before = await this.findTenant(id);
    if (before.deletedAt) throw new BadRequestException('Tenant is already archived');
    if (actor?.tenantId === id) {
      throw new BadRequestException(
        'You cannot archive the tenant you are signed in to — it would lock you out',
      );
    }
    if (before.slug === COMMUNITY_TENANT_SLUG) {
      throw new BadRequestException('The traveler community cannot be archived');
    }
    const metadata = AdminService.metadataOf(before);
    metadata.archive = {
      previousStatus: before.status,
      at: new Date().toISOString(),
      by: actor?.email ?? actor?.sub,
    } satisfies SuspensionRecord;
    const tenant = await this.prisma.tenant.update({
      where: { id },
      data: { status: TenantStatus.CHURNED, deletedAt: new Date(), metadata },
    });
    await this.trail(
      actor, 'SOFT_DELETE', 'tenant', id,
      { status: before.status, deletedAt: before.deletedAt }, { status: tenant.status, deletedAt: tenant.deletedAt },
      { tenantName: tenant.name }, id,
    );
    return tenant;
  }

  /** Flat CSV of the current tenant filter, for offline review. */
  async exportTenants(query: any = {}, actor?: AdminActor) {
    const { items } = await this.listTenants({ ...query, page: 1, limit: 5000 });
    await this.trail(actor, 'DATA_EXPORT', 'tenant', 'export', undefined, undefined, { rows: items.length, query });
    const head = ['id', 'name', 'slug', 'type', 'status', 'country', 'email', 'users', 'createdAt'];
    const rows = items.map((t: any) => [
      t.id, t.name, t.slug, t.type, t.status, t.country ?? '', t.email ?? '',
      t._count?.users ?? 0, t.createdAt?.toISOString?.() ?? t.createdAt,
    ]);
    return AdminService.toCsv(head, rows);
  }

  // ── Users ────────────────────────────────────────────────────────────
  /**
   * Users across organizations. Fields are listed explicitly: spreading the
   * whole row used to send every password hash and MFA secret to the browser.
   * `assignableRoles` is what the server would accept for that account, so the
   * console offers only grants that can succeed.
   */
  async listUsers(query: any = {}) {
    const { status, tenantId, search, page = 1, limit = 50 } = query;
    const where: any = {};
    if (status) where.status = status;
    if (tenantId) where.tenantId = tenantId;
    if (search) where.OR = [
      { email: { contains: search, mode: 'insensitive' } },
      { firstName: { contains: search, mode: 'insensitive' } },
      { lastName: { contains: search, mode: 'insensitive' } },
    ];
    const skip = (+page - 1) * +limit;
    const [items, total, roles] = await Promise.all([
      this.prisma.user.findMany({
        where, skip, take: +limit, orderBy: { createdAt: 'desc' },
        select: {
          ...AdminService.USER_FIELDS,
          tenant: { select: { id: true, name: true, type: true, status: true } },
          userRoles: { select: { role: { select: { id: true, name: true } } } },
        },
      }),
      this.prisma.user.count({ where }),
      this.prisma.role.findMany({ select: { id: true, name: true, tenantId: true }, orderBy: { name: 'asc' } }),
    ]);
    return {
      items: items.map(({ userRoles, ...u }) => {
        const held = new Set(userRoles.map((ur) => ur.role.id));
        return {
          ...u,
          roles: userRoles.map((ur) => ({ id: ur.role.id, name: ur.role.name })),
          assignableRoles: roles
            .filter((r: RoleRef) => !held.has(r.id) && !grantRefusal(u.tenant?.type ?? '', u.tenantId, r))
            .map((r) => ({ id: r.id, name: r.name, tenantId: r.tenantId })),
        };
      }),
      total, page: +page, limit: +limit, totalPages: Math.ceil(total / +limit),
    };
  }

  /** The user fields the platform console may see. Never credentials or MFA material. */
  private static readonly USER_FIELDS = {
    id: true, tenantId: true, email: true, phone: true, status: true,
    firstName: true, lastName: true, avatarUrl: true, emailVerifiedAt: true,
    lastLoginAt: true, lockedUntil: true, createdAt: true, updatedAt: true,
  } as const;

  private async mustFindUser(id: string) {
    if (!id) throw new BadRequestException('User id is required');
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: { id: true, email: true, status: true, tenantId: true, firstName: true, lastName: true },
    });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async setUserStatus(id: string, status: UserStatus, actor?: AdminActor, reason?: string) {
    const before = await this.mustFindUser(id);
    if (before.status === status) throw new BadRequestException(`User is already ${status}`);
    if (actor?.sub === id && status !== UserStatus.ACTIVE) {
      throw new BadRequestException('You cannot lock or deactivate your own account');
    }
    const revoke = status === UserStatus.LOCKED || status === UserStatus.INACTIVE;
    const user = await this.prisma.user.update({
      where: { id },
      data: {
        status,
        ...(revoke ? { sessionsRevokedAt: AdminService.revocationInstant() } : {}),
        ...(status === UserStatus.ACTIVE ? { failedLoginCount: 0, lockedUntil: null } : {}),
      },
      select: AdminService.USER_FIELDS,
    });
    if (revoke) {
      await this.prisma.refreshToken.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } });
    }
    await this.trail(
      actor, 'UPDATE', 'user', id,
      { status: before.status }, { status: user.status },
      { email: user.email, reason }, user.tenantId,
    );
    return user;
  }

  /** Revoke every live refresh token. Reports the real count, not a bare ok. */
  async forceLogoutUser(id: string, actor?: AdminActor) {
    const user = await this.mustFindUser(id);
    const res = await this.prisma.refreshToken.updateMany({
      where: { userId: id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    // Access tokens already issued stop working on the next request.
    await this.prisma.user.update({ where: { id }, data: { sessionsRevokedAt: AdminService.revocationInstant() } });
    await this.trail(
      actor, 'LOGOUT', 'user', id, undefined, undefined,
      { email: user.email, sessionsRevoked: res.count }, user.tenantId,
    );
    return { success: true, sessionsRevoked: res.count };
  }

  async assignUserRole(userId: string, roleId: string, actor?: AdminActor) {
    const user = await this.mustFindUser(userId);
    const role = await this.prisma.role.findUnique({ where: { id: roleId } });
    if (!role) throw new NotFoundException('Role not found');
    await this.assertGrantable(user.tenantId, role);
    const existing = await this.prisma.userRole
      .findUnique({ where: { userId_roleId: { userId, roleId } } })
      .catch(() => null);
    if (existing) throw new BadRequestException('User already has this role');

    const created = await this.prisma.userRole.create({ data: { userId, roleId, grantedBy: actor?.sub } });
    await this.trail(
      actor, 'PERMISSION_CHANGE', 'user_role', userId, undefined,
      { roleId, roleName: role.name },
      { email: user.email, granted: role.name }, user.tenantId,
    );
    return created;
  }

  /** Refuses a grant `grantRefusal` would refuse (see the rules there). */
  private async assertGrantable(userTenantId: string, role: { name: string; tenantId: string | null }) {
    const tenant = await this.prisma.tenant.findUnique({ where: { id: userTenantId }, select: { type: true } });
    const refusal = grantRefusal(tenant?.type ?? '', userTenantId, role);
    if (!refusal) return;
    throw refusal.status === 400 ? new BadRequestException(refusal.message) : new ForbiddenException(refusal.message);
  }

  /** Revocation timestamps are truncated to whole seconds to match JWT `iat`. */
  static revocationInstant() {
    return new Date(Math.floor(Date.now() / 1000) * 1000);
  }

  async removeUserRole(userId: string, roleId: string, actor?: AdminActor) {
    const user = await this.mustFindUser(userId);
    if (actor?.sub === userId) throw new BadRequestException('You cannot remove your own roles');
    const existing = await this.prisma.userRole.findUnique({
      where: { userId_roleId: { userId, roleId } },
      include: { role: { select: { name: true } } },
    });
    if (!existing) throw new NotFoundException('This user does not have that role');

    await this.prisma.userRole.delete({ where: { userId_roleId: { userId, roleId } } });
    await this.trail(
      actor, 'PERMISSION_CHANGE', 'user_role', userId,
      { roleId, roleName: existing.role?.name }, undefined,
      { email: user.email, revoked: existing.role?.name }, user.tenantId,
    );
    return { success: true, revoked: existing.role?.name };
  }

  async exportUsers(query: any = {}, actor?: AdminActor) {
    const { items } = await this.listUsers({ ...query, page: 1, limit: 5000 });
    await this.trail(actor, 'DATA_EXPORT', 'user', 'export', undefined, undefined, { rows: items.length, query });
    const head = ['id', 'firstName', 'lastName', 'email', 'phone', 'status', 'tenant', 'roles', 'lastLoginAt', 'createdAt'];
    const rows = items.map((u: any) => [
      u.id, u.firstName, u.lastName, u.email ?? '', u.phone ?? '', u.status,
      u.tenant?.name ?? '', (u.roles ?? []).map((r: any) => r.name).join(' | '),
      u.lastLoginAt?.toISOString?.() ?? u.lastLoginAt ?? '',
      u.createdAt?.toISOString?.() ?? u.createdAt,
    ]);
    return AdminService.toCsv(head, rows);
  }

  /** RFC-4180-ish CSV: quote everything, double embedded quotes. */
  private static toCsv(head: string[], rows: unknown[][]) {
    const cell = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    return [head.map(cell).join(','), ...rows.map((r) => r.map(cell).join(','))].join('\n');
  }

  // ── KYC verification ────────────────────────────────────────────────
  /**
   * Submissions for review, newest first. Each carries its decision history
   * from the audit trail (who approved or rejected it, when, and the note or
   * reason they gave), because the KYC row itself only records the outcome.
   */
  async listKyc(query: any = {}) {
    const { status, tenantId } = query;
    const where: any = {};
    if (status === 'PENDING') {
      where.verifiedAt = null;
      where.rejectionReason = null;
    } else if (status === 'APPROVED') {
      where.verifiedAt = { not: null };
    } else if (status === 'REJECTED') {
      where.rejectionReason = { not: null };
    }
    if (tenantId) where.tenantId = tenantId;
    const records = await this.prisma.tenantKyc.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        tenant: {
          select: {
            id: true, name: true, slug: true, type: true, status: true, email: true, phone: true,
            country: true, licenseNumber: true, website: true, deletedAt: true,
          },
        },
      },
    });
    const decisions = records.length
      ? await this.prisma.auditLog.findMany({
          where: { resource: 'tenant_kyc', resourceId: { in: records.map((r) => r.id) } },
          orderBy: { occurredAt: 'asc' },
          select: { resourceId: true, actorEmail: true, occurredAt: true, metadata: true },
        })
      : [];
    return records.map((record) => ({
      ...record,
      decisions: decisions
        .filter((d) => d.resourceId === record.id && (d.metadata as any)?.decision)
        .map((d) => ({
          decision: (d.metadata as any).decision as string,
          by: d.actorEmail,
          at: d.occurredAt,
          reason: (d.metadata as any).reason as string | undefined,
          notes: (d.metadata as any).notes as string | undefined,
        })),
    }));
  }

  async findKyc(id: string) {
    const kyc = await this.prisma.tenantKyc.findUnique({
      where: { id },
      include: { tenant: true },
    });
    if (!kyc) throw new NotFoundException('KYC record not found');
    return kyc;
  }

  /**
   * A submission is decided exactly once. Revisiting an approval is done by
   * suspending the organization; a rejected submission is answered by the
   * organization submitting corrected documents, which creates a new record.
   */
  private static assertUndecided(kyc: { verifiedAt: Date | null; rejectionReason: string | null }) {
    if (kyc.verifiedAt) throw new BadRequestException('This submission has already been approved');
    if (kyc.rejectionReason) {
      throw new BadRequestException(
        'This submission has already been rejected. The organization can submit corrected documents.',
      );
    }
  }

  /** Whether a KYC decision moves the organization: only while it is being verified. */
  private static inVerification(tenant: { status: TenantStatus; deletedAt: Date | null }) {
    return !tenant.deletedAt && VERIFICATION_STATUSES.includes(tenant.status);
  }

  /**
   * Approve a submission. This is the only way an organization that is being
   * verified becomes ACTIVE. A suspended or archived organization keeps its
   * status; the approval is recorded and counts when the suspension is lifted.
   */
  async approveKyc(id: string, actor?: AdminActor, notes?: string) {
    const kyc = await this.findKyc(id);
    AdminService.assertUndecided(kyc);
    const activates = AdminService.inVerification(kyc.tenant);
    const updated = await this.prisma.$transaction(async (tx) => {
      // Guarded write: two reviewers deciding the same submission at once
      // cannot both succeed, and the loser is told rather than overwriting.
      const decided = await tx.tenantKyc.updateMany({
        where: { id, verifiedAt: null, rejectionReason: null },
        data: { verifiedAt: new Date(), verifiedBy: actor?.sub ?? null },
      });
      if (!decided.count) throw new ConflictException('This submission was decided by someone else just now');
      if (activates) {
        await tx.tenant.update({ where: { id: kyc.tenantId }, data: { status: TenantStatus.ACTIVE } });
      }
      return tx.tenantKyc.findUniqueOrThrow({ where: { id } });
    });
    const tenantStatus = activates ? TenantStatus.ACTIVE : kyc.tenant.status;
    await this.trail(
      actor, 'TENANT_CONFIG_CHANGE', 'tenant_kyc', id,
      { status: kyc.tenant.status }, { status: tenantStatus },
      { decision: 'APPROVED', notes: notes?.trim() || undefined, tenantName: kyc.tenant.name }, kyc.tenantId,
    );
    return { ...updated, tenantStatus };
  }

  /**
   * Send a submission back with a reason the organization will see. The
   * organization stays unverified (KYC_REJECTED) and can resubmit.
   */
  async rejectKyc(id: string, reason: string, actor?: AdminActor) {
    const text = reason?.trim() ?? '';
    if (text.length < 3) {
      throw new BadRequestException('Give the organization a reason of at least 3 characters');
    }
    const kyc = await this.findKyc(id);
    AdminService.assertUndecided(kyc);
    const flags = AdminService.inVerification(kyc.tenant);
    const updated = await this.prisma.$transaction(async (tx) => {
      const decided = await tx.tenantKyc.updateMany({
        where: { id, verifiedAt: null, rejectionReason: null },
        data: { rejectionReason: text },
      });
      if (!decided.count) throw new ConflictException('This submission was decided by someone else just now');
      if (flags) {
        await tx.tenant.update({ where: { id: kyc.tenantId }, data: { status: TenantStatus.KYC_REJECTED } });
      }
      return tx.tenantKyc.findUniqueOrThrow({ where: { id } });
    });
    const tenantStatus = flags ? TenantStatus.KYC_REJECTED : kyc.tenant.status;
    await this.trail(
      actor, 'TENANT_CONFIG_CHANGE', 'tenant_kyc', id,
      { status: kyc.tenant.status }, { status: tenantStatus },
      { decision: 'REJECTED', reason: text, tenantName: kyc.tenant.name }, kyc.tenantId,
    );
    return { ...updated, tenantStatus };
  }

  async createKyc(tenantId: string, dto: { registrySource?: string; documents?: any[]; registryData?: any }, actor?: AdminActor) {
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) throw new NotFoundException('Tenant not found');
    // Reviewers can only open files stored under the organization's own KYC folder.
    DocumentAccessService.assertKycDocuments(tenantId, dto.documents);
    const raw = String(dto.registrySource ?? 'MANUAL').toUpperCase().replace(/[\s-]+/g, '_');
    if (!(REGISTRY_SOURCES as readonly string[]).includes(raw)) {
      throw new BadRequestException(`Invalid registrySource "${dto.registrySource}". Allowed: ${REGISTRY_SOURCES.join(', ')}`);
    }
    const row = await this.prisma.tenantKyc.create({
      data: {
        tenantId,
        registrySource: raw as any,
        documents: Array.isArray(dto.documents) ? dto.documents : [],
        registryData: dto.registryData ?? undefined,
      },
    });
    await this.trail(actor, 'CREATE', 'tenant_kyc', row.id, undefined, undefined, { registrySource: raw }, tenantId);
    return row;
  }

  // ── Roles & permissions ─────────────────────────────────────────────
  async listRoles() {
    return this.prisma.role.findMany({
      orderBy: { name: 'asc' },
      include: {
        _count: { select: { permissions: true, userRoles: true } },
        tenant: { select: { id: true, name: true } },
      },
    });
  }

  async findRole(id: string) {
    const role = await this.prisma.role.findUnique({
      where: { id },
      include: {
        permissions: { include: { permission: true } },
        userRoles: { include: { user: { select: { id: true, email: true, firstName: true, lastName: true } } } },
      },
    });
    if (!role) throw new NotFoundException('Role not found');
    return role;
  }

  async listPermissions() {
    return this.prisma.permission.findMany({ orderBy: [{ namespace: 'asc' }, { resource: 'asc' }, { action: 'asc' }] });
  }

  // ── Marketplace control ─────────────────────────────────────────────
  async listAllListings(query: any = {}) {
    const { status, type, search, page = 1, limit = 50 } = query;
    const where: any = {};
    if (status) where.status = status;
    if (type) where.type = type;
    if (search) where.name = { contains: search, mode: 'insensitive' };
    const skip = (+page - 1) * +limit;
    const [items, total] = await Promise.all([
      this.prisma.listing.findMany({
        where, skip, take: +limit, orderBy: { createdAt: 'desc' },
        include: { vendor: { select: { id: true, name: true, status: true, tenantId: true } } },
      }),
      this.prisma.listing.count({ where }),
    ]);
    return {
      items: items.map((l: any) => ({ ...l, priceCents: Number(l.priceCents) })),
      total, page: +page, limit: +limit, totalPages: Math.ceil(total / +limit),
    };
  }

  async approveListing(id: string, actor?: AdminActor) {
    const before = await this.prisma.listing.findUnique({ where: { id }, include: { vendor: { select: { tenantId: true } } } });
    if (!before) throw new NotFoundException('Listing not found');
    const listing = await this.prisma.listing.update({ where: { id }, data: { status: 'PUBLISHED', isActive: true } });
    await this.trail(actor, 'UPDATE', 'listing', id, { status: before.status }, { status: listing.status }, undefined, before.vendor?.tenantId ?? undefined);
    return { ...listing, priceCents: Number(listing.priceCents) };
  }

  async removeListing(id: string, actor?: AdminActor) {
    const before = await this.prisma.listing.findUnique({ where: { id }, include: { vendor: { select: { tenantId: true } } } });
    if (!before) throw new NotFoundException('Listing not found');
    const listing = await this.prisma.listing.update({ where: { id }, data: { status: 'ARCHIVED', isActive: false } });
    await this.trail(actor, 'SOFT_DELETE', 'listing', id, { status: before.status }, { status: listing.status }, undefined, before.vendor?.tenantId ?? undefined);
    return { ...listing, priceCents: Number(listing.priceCents) };
  }

  // ── Cross-tenant bookings ───────────────────────────────────────────
  async listAllBookings(query: any = {}) {
    const { status, tenantId, page = 1, limit = 50 } = query;
    const where: any = {};
    if (status) where.status = status;
    if (tenantId) where.tenantId = tenantId;
    const skip = (+page - 1) * +limit;
    const [items, total] = await Promise.all([
      this.prisma.booking.findMany({
        where, skip, take: +limit, orderBy: { createdAt: 'desc' },
        include: { package: { select: { name: true, tripType: true } } },
      }),
      this.prisma.booking.count({ where }),
    ]);
    return {
      items: items.map((b: any) => ({
        ...b,
        totalAmountCents: Number(b.totalAmountCents),
        paidAmountCents: Number(b.paidAmountCents),
      })),
      total, page: +page, limit: +limit, totalPages: Math.ceil(total / +limit),
    };
  }

  // ── Finance summary cross-tenant ────────────────────────────────────
  async getFinanceSummary() {
    const [paidAgg, outstandingAgg, paymentsAgg, refundsAgg] = await Promise.all([
      this.prisma.invoice.aggregate({ where: { status: 'PAID' as any }, _sum: { paidCents: true } }),
      this.prisma.invoice.aggregate({ where: { status: { in: ['ISSUED', 'SENT', 'PARTIALLY_PAID', 'OVERDUE'] as any } }, _sum: { totalCents: true } }),
      this.prisma.payment.aggregate({ where: { status: 'COMPLETED' as any }, _sum: { amountCents: true } }),
      this.prisma.payment.aggregate({ where: { status: 'REFUNDED' as any }, _sum: { refundedCents: true } }),
    ]);
    return {
      revenueCollectedCents: Number(paidAgg._sum.paidCents ?? 0),
      outstandingCents: Number(outstandingAgg._sum.totalCents ?? 0),
      paymentsCents: Number(paymentsAgg._sum.amountCents ?? 0),
      refundsCents: Number(refundsAgg._sum.refundedCents ?? 0),
      currency: 'SAR',
    };
  }

  // ── Audit logs ──────────────────────────────────────────────────────
  async listAuditLogs(query: any = {}) {
    const { action, resource, tenantId, actorId, page = 1, limit = 100 } = query;
    const where: any = {};
    if (action) where.action = action;
    if (resource) where.resource = resource;
    if (tenantId) where.tenantId = tenantId;
    if (actorId) where.actorId = actorId;
    const skip = (+page - 1) * +limit;
    const [items, total] = await Promise.all([
      this.prisma.auditLog.findMany({ where, skip, take: +limit, orderBy: { occurredAt: 'desc' } }),
      this.prisma.auditLog.count({ where }),
    ]);
    return { items, total, page: +page, limit: +limit, totalPages: Math.ceil(total / +limit) };
  }

  // ── Platform settings (read-only overview) ──────────────────────────
  /**
   * There is no persisted settings store. This returns real aggregates plus the
   * configuration the running API actually enforces — nothing here is editable,
   * and nothing is presented as a toggle.
   */
  async getSettings() {
    const [marketplaceCategories, regulatorySystems] = await Promise.all([
      this.prisma.listing.groupBy({ by: ['type'], _count: true }),
      this.prisma.visaApplication.groupBy({ by: ['regulatorySystem'], _count: true }),
    ]);
    return {
      editable: false,
      source: 'runtime-configuration',
      enforced: {
        kycRequiredBeforeActivation: true,
        organizationTypesRequiringKyc: ['OPERATOR', 'MU_ASSASA', 'SUB_AGENT', 'VENDOR_HOTEL', 'VENDOR_TRANSPORT', 'VENDOR_VISA'],
        paymentProvider: process.env.PAYMENT_PROVIDER ?? (process.env.NODE_ENV === 'production' ? 'none' : 'sandbox'),
        storageDriver: process.env.STORAGE_DRIVER ?? 'local',
        mailDriver: process.env.MAIL_DRIVER ?? (process.env.NODE_ENV === 'production' ? 'none' : 'log'),
        // Same rule as GoogleService.configured: sign-in works only with all three set.
        googleSignIn: GOOGLE_SIGN_IN_SETTINGS.every((key) => !!process.env[key]),
      },
      marketplaceCategories: marketplaceCategories.map((c) => ({ category: c.type, count: c._count as any })),
      regulatorySystems: regulatorySystems.map((c) => ({ system: c.regulatorySystem, count: c._count as any })),
    };
  }
}

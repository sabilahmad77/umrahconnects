import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  ALL_PERMISSIONS,
  ASSIGNABLE_ROLES_BY_TENANT_TYPE,
  PERMISSION_CATALOG,
  RoleCode,
  ROLE_CODES,
  SYSTEM_ROLES,
  isKnownPermission,
  isPlatformPermission,
} from './catalog';

// Re-exported for existing imports.
export { PERMISSION_CATALOG, SYSTEM_ROLES } from './catalog';

const REQUEST_CACHE = Symbol('uc.permissions');

type RoleRow = { roleName: string; roleTenantId: string | null; perm: string | null };
type Actor = { sub: string; tenantId: string };

@Injectable()
export class RbacService {
  private readonly logger = new Logger(RbacService.name);

  constructor(private prisma: PrismaService) {}

  // ── Catalogue sync ─────────────────────────────────────────────────────

  /**
   * Idempotently writes the capability catalogue and the global system roles to
   * the database so code and data cannot drift. System role permission sets are
   * made to match the catalogue exactly (extra grants are removed), and platform
   * capabilities are stripped from every role other than SUPER_ADMIN.
   */
  async syncCatalog(): Promise<{ permissions: number; roles: number }> {
    const idByKey = new Map<string, string>();
    for (const key of ALL_PERMISSIONS) {
      const [namespace, resource, action] = key.split(':');
      const row = await this.prisma.permission.upsert({
        where: { namespace_resource_action: { namespace, resource, action } },
        create: { namespace, resource, action, description: PERMISSION_CATALOG[key] },
        update: { description: PERMISSION_CATALOG[key] },
      });
      idByKey.set(key, row.id);
    }

    for (const code of ROLE_CODES) {
      const def = SYSTEM_ROLES[code];
      const description = `${def.displayName} — ${def.description}`;
      const found = await this.prisma.role.findFirst({ where: { tenantId: null, name: code } });
      const role = found
        ? await this.prisma.role.update({ where: { id: found.id }, data: { isSystem: true, description } })
        : await this.prisma.role.create({ data: { name: code, isSystem: true, description } });

      const wanted = new Set(def.permissions.map((p) => idByKey.get(p)!));
      const current = await this.prisma.rolePermission.findMany({ where: { roleId: role.id } });
      const stale = current.filter((rp) => !wanted.has(rp.permissionId)).map((rp) => rp.permissionId);
      if (stale.length) {
        await this.prisma.rolePermission.deleteMany({ where: { roleId: role.id, permissionId: { in: stale } } });
      }
      const have = new Set(current.map((rp) => rp.permissionId));
      const add = [...wanted].filter((id) => !have.has(id));
      if (add.length) {
        await this.prisma.rolePermission.createMany({
          data: add.map((permissionId) => ({ roleId: role.id, permissionId })),
          skipDuplicates: true,
        });
      }
    }

    const platformPermIds = [...idByKey.entries()].filter(([k]) => isPlatformPermission(k)).map(([, id]) => id);
    const superAdmin = await this.prisma.role.findFirst({ where: { tenantId: null, name: 'SUPER_ADMIN' } });
    const removed = await this.prisma.rolePermission.deleteMany({
      where: { permissionId: { in: platformPermIds }, roleId: { not: superAdmin!.id } },
    });
    if (removed.count) this.logger.warn(`Removed ${removed.count} platform grant(s) from non-platform roles`);

    return { permissions: idByKey.size, roles: ROLE_CODES.length };
  }

  async systemRoleId(code: RoleCode): Promise<string> {
    const role = await this.prisma.role.findFirst({ where: { tenantId: null, name: code }, select: { id: true } });
    if (!role) throw new NotFoundException(`System role ${code} is missing — catalogue not synced`);
    return role.id;
  }

  // ── Resolution ─────────────────────────────────────────────────────────

  /**
   * Effective capabilities of a user inside the given tenant.
   *  - tenant roles count only inside their own tenant;
   *  - global system roles grant their tenant capabilities inside the holder's own tenant;
   *  - platform capabilities count only via SUPER_ADMIN for users of the PLATFORM tenant,
   *    and platform accounts hold no tenant capabilities.
   */
  async getUserPermissions(userId: string, tenantId: string): Promise<string[]> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { tenantId: true, deletedAt: true, tenant: { select: { type: true } } },
    });
    if (!user || user.deletedAt || user.tenantId !== tenantId) return [];
    const platformTenant = user.tenant?.type === 'PLATFORM';

    const rows = await this.prisma.$queryRaw<RoleRow[]>`
      SELECT r.name AS "roleName", r.tenant_id AS "roleTenantId",
             (p.namespace || ':' || p.resource || ':' || p.action) AS perm
      FROM core.user_roles ur
      JOIN core.roles r ON r.id = ur.role_id
      LEFT JOIN core.role_permissions rp ON rp.role_id = r.id
      LEFT JOIN core.permissions p ON p.id = rp.permission_id
      WHERE ur.user_id = ${userId}::uuid
        AND (r.tenant_id = ${tenantId}::uuid OR r.tenant_id IS NULL)
        AND (ur.expires_at IS NULL OR ur.expires_at > NOW())
    `;

    const granted = new Set<string>();
    for (const row of rows) {
      if (!row.perm || !isKnownPermission(row.perm)) continue;
      if (isPlatformPermission(row.perm)) {
        if (platformTenant && row.roleTenantId === null && row.roleName === 'SUPER_ADMIN') granted.add(row.perm);
      } else if (!platformTenant) {
        granted.add(row.perm);
      }
    }
    return [...granted].sort();
  }

  async userHasPermissions(userId: string, tenantId: string, permissions: string[]): Promise<boolean> {
    const granted = new Set(await this.getUserPermissions(userId, tenantId));
    return permissions.every((p) => granted.has(p));
  }

  /** Per-request memoized capability set for the authenticated principal. */
  permissionsFor(request: any): Promise<Set<string>> {
    if (!request[REQUEST_CACHE]) {
      const user = request.user;
      request[REQUEST_CACHE] = this.getUserPermissions(user.sub, user.tenantId).then((p) => new Set(p));
    }
    return request[REQUEST_CACHE];
  }

  // ── Organization-scoped role management ────────────────────────────────

  /** Roles an organization administrator may grant inside their own organization. */
  async assignableRoles(tenantId: string) {
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId }, select: { type: true } });
    const codes = ASSIGNABLE_ROLES_BY_TENANT_TYPE[tenant?.type ?? ''] ?? [];
    return this.prisma.role.findMany({
      where: { OR: [{ tenantId: null, name: { in: codes } }, { tenantId }] },
      select: { id: true, name: true, description: true, tenantId: true, isSystem: true },
      orderBy: { name: 'asc' },
    });
  }

  /**
   * Grant a role to a user of the caller's own organization. Only assignable
   * roles are accepted, and a caller can never grant a capability they do not hold.
   */
  async assignRoleInTenant(actor: Actor, userId: string, roleId: string, expiresAt?: Date) {
    const target = await this.prisma.user.findFirst({ where: { id: userId, tenantId: actor.tenantId, deletedAt: null } });
    if (!target) throw new NotFoundException('User not found in your organization');

    const assignable = await this.assignableRoles(actor.tenantId);
    if (!assignable.some((r) => r.id === roleId)) {
      throw new ForbiddenException('This role cannot be granted in your organization');
    }
    await this.assertCallerCovers(actor, roleId);

    return this.prisma.userRole.upsert({
      where: { userId_roleId: { userId, roleId } },
      create: { userId, roleId, grantedBy: actor.sub, expiresAt },
      update: { grantedBy: actor.sub, expiresAt },
    });
  }

  async revokeRoleInTenant(actor: Actor, userId: string, roleId: string) {
    const target = await this.prisma.user.findFirst({ where: { id: userId, tenantId: actor.tenantId, deletedAt: null } });
    if (!target) throw new NotFoundException('User not found in your organization');
    if (userId === actor.sub) throw new BadRequestException('You cannot remove your own roles');
    const assignable = await this.assignableRoles(actor.tenantId);
    if (!assignable.some((r) => r.id === roleId)) {
      throw new ForbiddenException('This role cannot be managed in your organization');
    }
    const res = await this.prisma.userRole.deleteMany({ where: { userId, roleId } });
    if (!res.count) throw new NotFoundException('This user does not have that role');
    return { revoked: roleId };
  }

  async createTenantRole(actor: Actor, name: string, description: string | undefined, permissions: string[]) {
    const trimmed = (name ?? '').trim();
    if (!trimmed) throw new BadRequestException('Role name is required');
    if ((ROLE_CODES as string[]).includes(trimmed.toUpperCase().replace(/\s+/g, '_'))) {
      throw new BadRequestException('Role name is reserved for a system role');
    }
    const unknown = permissions.filter((p) => !isKnownPermission(p));
    if (unknown.length) throw new BadRequestException(`Unknown permissions: ${unknown.join(', ')}`);
    if (permissions.some(isPlatformPermission)) {
      throw new ForbiddenException('Platform capabilities cannot be granted to organization roles');
    }
    const held = new Set(await this.getUserPermissions(actor.sub, actor.tenantId));
    const beyond = permissions.filter((p) => !held.has(p));
    if (beyond.length) throw new ForbiddenException(`You cannot grant capabilities you do not hold: ${beyond.join(', ')}`);

    const existing = await this.prisma.role.findFirst({ where: { tenantId: actor.tenantId, name: trimmed } });
    if (existing) throw new ConflictException(`Role '${trimmed}' already exists`);

    const perms = permissions.length
      ? await this.prisma.permission.findMany({
          where: {
            OR: permissions.map((p) => {
              const [namespace, resource, action] = p.split(':');
              return { namespace, resource, action };
            }),
          },
          select: { id: true },
        })
      : [];
    return this.prisma.role.create({
      data: {
        tenantId: actor.tenantId,
        name: trimmed,
        description,
        permissions: { create: perms.map((p) => ({ permissionId: p.id, grantedBy: actor.sub })) },
      },
    });
  }

  private async assertCallerCovers(actor: Actor, roleId: string) {
    const rolePerms = await this.prisma.rolePermission.findMany({
      where: { roleId },
      select: { permission: { select: { namespace: true, resource: true, action: true } } },
    });
    const held = new Set(await this.getUserPermissions(actor.sub, actor.tenantId));
    const beyond = rolePerms
      .map((rp) => `${rp.permission.namespace}:${rp.permission.resource}:${rp.permission.action}`)
      .filter((p) => isPlatformPermission(p) || !held.has(p));
    if (beyond.length) {
      throw new ForbiddenException(`You cannot grant capabilities you do not hold: ${beyond.join(', ')}`);
    }
  }

  /** Server-side grant of a system role (signup, onboarding, bootstrap). */
  async grantSystemRole(userId: string, code: RoleCode, grantedBy?: string) {
    const roleId = await this.systemRoleId(code);
    return this.prisma.userRole.upsert({
      where: { userId_roleId: { userId, roleId } },
      create: { userId, roleId, grantedBy },
      update: {},
    });
  }
}

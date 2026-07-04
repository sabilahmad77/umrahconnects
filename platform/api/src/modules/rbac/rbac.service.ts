import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

// Full permission catalog — namespaced by plugin
// Format: plugin_id:resource:action
export const PERMISSION_CATALOG: Record<string, string> = {
  // Core
  'core:tenant:read': 'View tenant details',
  'core:tenant:update': 'Update tenant profile',
  'core:tenant:admin': 'Platform-level tenant administration',
  'core:user:read': 'View users',
  'core:user:create': 'Create users',
  'core:user:update': 'Update users',
  'core:user:delete': 'Delete users',
  'core:role:read': 'View roles',
  'core:role:manage': 'Create/update/delete roles',
  'core:sub-agent:read': 'View sub-agents',
  'core:sub-agent:manage': 'Manage sub-agents',

  // CRM
  'crm:pilgrim:read': 'View pilgrim profiles',
  'crm:pilgrim:create': 'Create pilgrim profiles',
  'crm:pilgrim:update': 'Update pilgrim profiles',
  'crm:pilgrim:delete': 'Delete pilgrim profiles',
  'crm:pilgrim:export': 'Export pilgrim data',
  'crm:family-group:manage': 'Manage family groups',
  'crm:document:upload': 'Upload pilgrim documents',
  'crm:document:delete': 'Delete pilgrim documents',

  // Booking
  'booking:package:read': 'View packages',
  'booking:package:manage': 'Create/update packages',
  'booking:booking:read': 'View bookings',
  'booking:booking:create': 'Create bookings',
  'booking:booking:update': 'Update bookings',
  'booking:booking:cancel': 'Cancel bookings',

  // Hotel
  'hotel:allotment:read': 'View hotel allotments',
  'hotel:allotment:manage': 'Manage hotel allotments',
  'hotel:room:assign': 'Assign rooms to pilgrims',

  // Visa
  'visa:application:read': 'View visa applications',
  'visa:application:submit': 'Submit visa applications',
  'visa:application:manage': 'Full visa application management',

  // Transport
  'transport:vehicle:read': 'View vehicles',
  'transport:vehicle:manage': 'Manage vehicles',
  'transport:assignment:manage': 'Manage transport assignments',
  'transport:tasreeh:manage': 'Manage Tasreeh permits',

  // Finance
  'finance:invoice:read': 'View invoices',
  'finance:invoice:create': 'Create invoices',
  'finance:invoice:approve': 'Approve invoices',
  'finance:payment:read': 'View payments',
  'finance:payment:process': 'Process payments',
  'finance:report:read': 'View financial reports',

  // Group ops
  'ops:group:read': 'View trip groups',
  'ops:group:manage': 'Manage trip groups',
  'ops:incident:report': 'Report incidents',
  'ops:incident:manage': 'Manage incident resolution',

  // Marketplace
  'marketplace:vendor:read': 'View marketplace vendors',
  'marketplace:quote:request': 'Request quotes from vendors',
  'marketplace:quote:manage': 'Manage vendor quotes',

  // Social
  'social:post:create': 'Create social posts',
  'social:post:moderate': 'Moderate social content',

  // Reporting
  'reporting:read': 'View reports',
  'reporting:export': 'Export reports',
  'reporting:custom': 'Build custom reports',
};

// System roles with their default permissions
export const SYSTEM_ROLES: Record<string, string[]> = {
  operator_admin: Object.keys(PERMISSION_CATALOG),
  operator_ops: [
    'crm:pilgrim:read', 'crm:pilgrim:create', 'crm:pilgrim:update',
    'crm:document:upload', 'crm:family-group:manage',
    'booking:package:read', 'booking:booking:read', 'booking:booking:create', 'booking:booking:update',
    'hotel:allotment:read', 'hotel:room:assign',
    'visa:application:read', 'visa:application:submit',
    'transport:vehicle:read', 'transport:assignment:manage',
    'ops:group:read', 'ops:group:manage', 'ops:incident:report',
    'reporting:read',
  ],
  operator_finance: [
    'finance:invoice:read', 'finance:invoice:create', 'finance:invoice:approve',
    'finance:payment:read', 'finance:payment:process', 'finance:report:read',
    'booking:booking:read', 'reporting:read', 'reporting:export',
  ],
  sub_agent: [
    'crm:pilgrim:read', 'crm:pilgrim:create', 'crm:pilgrim:update',
    'crm:document:upload',
    'booking:package:read', 'booking:booking:read', 'booking:booking:create',
  ],
  pilgrim: [
    // Pilgrims only see their own data — enforced at service layer
  ],
};

@Injectable()
export class RbacService {
  constructor(private prisma: PrismaService) {}

  async seedSystemRoles(): Promise<void> {
    for (const [roleName, permissions] of Object.entries(SYSTEM_ROLES)) {
      let role = await this.prisma.role.findFirst({ where: { name: roleName, tenantId: null } });
      if (!role) {
        role = await this.prisma.role.create({
          data: { name: roleName, isSystem: true },
        });
      }

      for (const perm of permissions) {
        const [namespace, resource, action] = perm.split(':');
        const permission = await this.prisma.permission.upsert({
          where: { namespace_resource_action: { namespace, resource, action } },
          create: { namespace, resource, action, description: PERMISSION_CATALOG[perm] },
          update: {},
        });
        await this.prisma.rolePermission.upsert({
          where: { roleId_permissionId: { roleId: role.id, permissionId: permission.id } },
          create: { roleId: role.id, permissionId: permission.id },
          update: {},
        });
      }
    }
  }

  async userHasPermissions(userId: string, tenantId: string, permissions: string[]): Promise<boolean> {
    for (const perm of permissions) {
      const [namespace, resource, action] = perm.split(':');
      const result = await this.prisma.$queryRaw<{ count: number }[]>`
        SELECT COUNT(*)::int as count
        FROM core.user_roles ur
        JOIN core.role_permissions rp ON rp.role_id = ur.role_id
        JOIN core.permissions p ON p.id = rp.permission_id
        JOIN core.roles r ON r.id = ur.role_id
        WHERE ur.user_id = ${userId}::uuid
          AND (r.tenant_id = ${tenantId}::uuid OR r.tenant_id IS NULL)
          AND p.namespace = ${namespace}
          AND p.resource = ${resource}
          AND p.action = ${action}
          AND (ur.expires_at IS NULL OR ur.expires_at > NOW())
      `;
      if ((result[0]?.count ?? 0) === 0) return false;
    }
    return true;
  }

  async getUserPermissions(userId: string, tenantId: string): Promise<string[]> {
    const result = await this.prisma.$queryRaw<{ perm: string }[]>`
      SELECT DISTINCT (p.namespace || ':' || p.resource || ':' || p.action) as perm
      FROM core.user_roles ur
      JOIN core.role_permissions rp ON rp.role_id = ur.role_id
      JOIN core.permissions p ON p.id = rp.permission_id
      JOIN core.roles r ON r.id = ur.role_id
      WHERE ur.user_id = ${userId}::uuid
        AND (r.tenant_id = ${tenantId}::uuid OR r.tenant_id IS NULL)
        AND (ur.expires_at IS NULL OR ur.expires_at > NOW())
    `;
    return result.map((r) => r.perm);
  }

  async assignRoleToUser(userId: string, roleId: string, grantedBy: string, expiresAt?: Date) {
    return this.prisma.userRole.upsert({
      where: { userId_roleId: { userId, roleId } },
      create: { userId, roleId, grantedBy, expiresAt },
      update: { grantedBy, expiresAt },
    });
  }

  async createTenantRole(tenantId: string, name: string, description: string, permissions: string[]) {
    const existing = await this.prisma.role.findFirst({ where: { tenantId, name } });
    if (existing) throw new ConflictException(`Role '${name}' already exists`);

    const role = await this.prisma.role.create({ data: { tenantId, name, description } });

    for (const perm of permissions) {
      const [namespace, resource, action] = perm.split(':');
      const permission = await this.prisma.permission.findFirst({
        where: { namespace, resource, action },
      });
      if (permission) {
        await this.prisma.rolePermission.create({
          data: { roleId: role.id, permissionId: permission.id },
        });
      }
    }

    return role;
  }
}

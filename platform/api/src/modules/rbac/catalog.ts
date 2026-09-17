/**
 * Capability catalogue — the single source of truth for authorization.
 *
 * Permission format: `namespace:resource:action`.
 *
 * - Every `@RequirePermissions(...)` value must exist here; the API refuses to
 *   start otherwise (see RbacCatalogSync).
 * - `platform:*` capabilities are platform-wide (they cross tenant boundaries).
 *   They are honoured ONLY when granted through a global system role to a user
 *   whose tenant is the PLATFORM tenant. Tenant roles can never carry them.
 * - Every other capability is tenant-scoped: it only ever applies inside the
 *   caller's own tenant (the tenant in the signed JWT).
 *
 * Mapping to business capability names (docs/control-tower/DECISIONS.md):
 *   users.read → core:user:read            platform.users.manage → platform:user:manage
 *   bookings.manage → booking:booking:*    organizations.manage → platform:tenant:manage
 *   payments.manage → finance:payment:process, refunds → finance:payment:refund
 */

export const PLATFORM_NAMESPACE = 'platform';

export const PERMISSION_CATALOG = {
  // ── Platform (Super Admin only) ────────────────────────────────────────
  'platform:tenant:read': 'View every organization on the platform',
  'platform:tenant:manage': 'Suspend, reactivate or archive organizations',
  'platform:user:read': 'View and export users across all organizations',
  'platform:user:manage': 'Lock, unlock and sign out users across organizations',
  'platform:role:manage': 'Grant and revoke roles on any account',
  'platform:kyc:review': 'Review, approve and reject organization KYC',
  'platform:audit:read': 'Read the platform audit log',
  'platform:settings:read': 'Read platform configuration',
  'platform:marketplace:moderate': 'Approve and remove marketplace listings',
  'platform:booking:read': 'Read bookings across organizations',
  'platform:finance:read': 'Read platform-wide financial summaries',
  'platform:inquiry:manage': 'Handle public inquiries sent to the platform',

  // ── Organization administration (own tenant only) ──────────────────────
  'core:tenant:read': 'View own organization profile',
  'core:tenant:update': 'Update own organization profile, plugins and KYC',
  'core:user:read': 'View users of own organization',
  'core:user:create': 'Invite users to own organization',
  'core:user:update': 'Update users of own organization',
  'core:user:delete': 'Remove users from own organization',
  'core:role:read': 'View roles of own organization',
  'core:role:manage': 'Manage roles inside own organization',
  'core:sub-agent:read': 'View sub-agents of own organization',
  'core:sub-agent:manage': 'Manage sub-agents of own organization',

  // ── CRM ────────────────────────────────────────────────────────────────
  'crm:pilgrim:read': 'View traveler (pilgrim) records',
  'crm:pilgrim:create': 'Create traveler records',
  'crm:pilgrim:update': 'Update traveler records and trip groups',
  'crm:pilgrim:delete': 'Delete traveler records',
  'crm:pilgrim:export': 'Export traveler data',
  'crm:document:upload': 'Upload traveler documents',

  // ── Bookings & packages ────────────────────────────────────────────────
  'booking:package:read': 'View packages',
  'booking:package:manage': 'Create and update packages',
  'booking:booking:read': 'View bookings',
  'booking:booking:create': 'Create bookings',
  'booking:booking:update': 'Update bookings',
  'booking:booking:cancel': 'Cancel bookings',

  // ── Hotel ──────────────────────────────────────────────────────────────
  'hotel:allotment:read': 'View hotels, rooms, allotments and hotel bookings',
  'hotel:allotment:manage': 'Manage hotels, rooms, allotments and hotel bookings',
  'hotel:room:assign': 'Assign rooms to travelers',
  'hotel:assignment:manage': 'Manage room assignments',

  // ── Visa ───────────────────────────────────────────────────────────────
  'visa:application:read': 'View visa cases and documents',
  'visa:application:submit': 'Create and submit visa cases',
  'visa:application:manage': 'Decide visa cases and verify documents',

  // ── Transport ──────────────────────────────────────────────────────────
  'transport:vehicle:read': 'View vehicles, drivers, routes and trips',
  'transport:vehicle:manage': 'Manage vehicles, drivers and routes',
  'transport:assignment:manage': 'Manage transport assignments and trips',
  'transport:tasreeh:manage': 'Manage Tasreeh permits',

  // ── Finance (scoped capabilities, see DECISIONS.md D-004) ──────────────
  'finance:invoice:read': 'View invoices (billing.view)',
  'finance:invoice:create': 'Create and edit invoices',
  'finance:invoice:approve': 'Issue and void invoices',
  'finance:payment:read': 'View payments (payments.view)',
  'finance:payment:process': 'Record and collect payments (payments.manage)',
  'finance:payment:refund': 'Refund payments (refunds.manage)',
  'finance:report:read': 'View financial reports (financial_reports.view)',

  // ── Marketplace ────────────────────────────────────────────────────────
  'marketplace:listing:read': 'View marketplace listings, requests and offers',
  'marketplace:listing:manage': 'Publish own listings and respond to requests',

  // ── Social ─────────────────────────────────────────────────────────────
  'social:post:read': 'Read the social feed',
  'social:post:create': 'Post, comment, react and follow',

  // ── Reporting ──────────────────────────────────────────────────────────
  'reporting:report:read': 'View operational reports',
  'reporting:report:export': 'Export operational reports',
} as const;

export type Permission = keyof typeof PERMISSION_CATALOG;

for (const key of Object.keys(PERMISSION_CATALOG)) {
  if (!/^[a-z-]+:[a-z-]+:[a-z-]+$/.test(key)) throw new Error(`Invalid capability key "${key}" (expected namespace:resource:action)`);
}

export const ALL_PERMISSIONS = Object.keys(PERMISSION_CATALOG) as Permission[];
export const PLATFORM_PERMISSIONS = ALL_PERMISSIONS.filter((p) => p.startsWith(`${PLATFORM_NAMESPACE}:`));
export const TENANT_PERMISSIONS = ALL_PERMISSIONS.filter((p) => !p.startsWith(`${PLATFORM_NAMESPACE}:`));

export function isPlatformPermission(p: string): boolean {
  return p.startsWith(`${PLATFORM_NAMESPACE}:`);
}

export function isKnownPermission(p: string): p is Permission {
  return Object.prototype.hasOwnProperty.call(PERMISSION_CATALOG, p);
}

export type RoleCode =
  | 'SUPER_ADMIN'
  | 'OPERATOR_ADMIN'
  | 'OPERATOR_STAFF'
  | 'HOTEL_MANAGER'
  | 'TRANSPORT_MANAGER'
  | 'VISA_OFFICER'
  | 'FINANCE_MANAGER'
  | 'PILGRIM';

export interface SystemRoleDef {
  scope: 'platform' | 'tenant';
  displayName: string;
  description: string;
  permissions: Permission[];
}

const social: Permission[] = ['social:post:read', 'social:post:create'];
const marketplaceProvider: Permission[] = ['marketplace:listing:read', 'marketplace:listing:manage'];
const orgSelf: Permission[] = ['core:tenant:read', 'core:user:read', 'core:role:read'];

/**
 * System roles are global rows (tenant_id NULL). A tenant-scoped system role
 * grants its capabilities only inside the holder's own organization.
 */
export const SYSTEM_ROLES: Record<RoleCode, SystemRoleDef> = {
  SUPER_ADMIN: {
    scope: 'platform',
    displayName: 'Super Admin',
    description: 'Umrah Connect platform administrator. Holds platform capabilities only.',
    permissions: [...PLATFORM_PERMISSIONS],
  },
  OPERATOR_ADMIN: {
    scope: 'tenant',
    displayName: 'Operator Admin',
    description: 'Administers an Umrah agency / operator organization.',
    permissions: [...TENANT_PERMISSIONS],
  },
  OPERATOR_STAFF: {
    scope: 'tenant',
    displayName: 'Operator Staff',
    description: 'Day-to-day operations inside an operator organization.',
    permissions: [
      'core:tenant:read', 'core:user:read',
      'crm:pilgrim:read', 'crm:pilgrim:create', 'crm:pilgrim:update', 'crm:document:upload',
      'booking:package:read', 'booking:booking:read', 'booking:booking:create', 'booking:booking:update',
      'hotel:allotment:read', 'hotel:room:assign',
      'visa:application:read', 'visa:application:submit',
      'transport:vehicle:read', 'transport:assignment:manage',
      'finance:invoice:read', 'finance:payment:read',
      'marketplace:listing:read',
      ...social,
      'reporting:report:read',
    ],
  },
  HOTEL_MANAGER: {
    scope: 'tenant',
    displayName: 'Hotel Manager',
    description: 'Manages a hotel organization: properties, rooms, inventory and reservations.',
    permissions: [
      ...orgSelf, 'core:tenant:update', 'core:user:create', 'core:user:update', 'core:role:manage',
      'hotel:allotment:read', 'hotel:allotment:manage', 'hotel:room:assign', 'hotel:assignment:manage',
      'finance:invoice:read', 'finance:invoice:create', 'finance:payment:read', 'finance:report:read',
      ...marketplaceProvider, ...social, 'reporting:report:read',
    ],
  },
  TRANSPORT_MANAGER: {
    scope: 'tenant',
    displayName: 'Transport Manager',
    description: 'Manages a transport company: vehicles, drivers, routes and trips.',
    permissions: [
      ...orgSelf, 'core:tenant:update', 'core:user:create', 'core:user:update', 'core:role:manage',
      'transport:vehicle:read', 'transport:vehicle:manage', 'transport:assignment:manage', 'transport:tasreeh:manage',
      'finance:invoice:read', 'finance:invoice:create', 'finance:payment:read', 'finance:report:read',
      ...marketplaceProvider, ...social, 'reporting:report:read',
    ],
  },
  VISA_OFFICER: {
    scope: 'tenant',
    displayName: 'Visa Officer',
    description: 'Runs visa cases: applications, documents, submissions and decisions.',
    permissions: [
      ...orgSelf, 'core:tenant:update',
      'crm:pilgrim:read', 'crm:pilgrim:create', 'crm:pilgrim:update', 'crm:document:upload',
      'visa:application:read', 'visa:application:submit', 'visa:application:manage',
      'finance:invoice:read', 'finance:payment:read',
      ...marketplaceProvider, ...social, 'reporting:report:read',
    ],
  },
  FINANCE_MANAGER: {
    scope: 'tenant',
    displayName: 'Finance Manager',
    description: 'Scoped finance capabilities inside one organization (not a platform role).',
    permissions: [
      'core:tenant:read',
      'booking:booking:read', 'booking:package:read',
      'finance:invoice:read', 'finance:invoice:create', 'finance:invoice:approve',
      'finance:payment:read', 'finance:payment:process', 'finance:payment:refund', 'finance:report:read',
      'reporting:report:read', 'reporting:report:export',
      'social:post:read',
    ],
  },
  PILGRIM: {
    scope: 'tenant',
    displayName: 'Traveler',
    description:
      'Self-registered traveler. Travelers share one community organization, so they hold no ' +
      'organization-wide read capability; their own records are reached through ownership checks.',
    permissions: ['marketplace:listing:read', ...social],
  },
};

export const ROLE_CODES = Object.keys(SYSTEM_ROLES) as RoleCode[];

/** Organization type → the administrator role granted to its founding user. */
export const ORG_ADMIN_ROLE_BY_TENANT_TYPE: Record<string, RoleCode> = {
  OPERATOR: 'OPERATOR_ADMIN',
  MU_ASSASA: 'OPERATOR_ADMIN',
  SUB_AGENT: 'OPERATOR_ADMIN',
  VENDOR_HOTEL: 'HOTEL_MANAGER',
  VENDOR_TRANSPORT: 'TRANSPORT_MANAGER',
  VENDOR_VISA: 'VISA_OFFICER',
};

/** Tenant roles an organization administrator may grant, by organization type. */
export const ASSIGNABLE_ROLES_BY_TENANT_TYPE: Record<string, RoleCode[]> = {
  OPERATOR: ['OPERATOR_ADMIN', 'OPERATOR_STAFF', 'HOTEL_MANAGER', 'TRANSPORT_MANAGER', 'VISA_OFFICER', 'FINANCE_MANAGER'],
  MU_ASSASA: ['OPERATOR_ADMIN', 'OPERATOR_STAFF', 'HOTEL_MANAGER', 'TRANSPORT_MANAGER', 'VISA_OFFICER', 'FINANCE_MANAGER'],
  SUB_AGENT: ['OPERATOR_ADMIN', 'OPERATOR_STAFF', 'FINANCE_MANAGER'],
  VENDOR_HOTEL: ['HOTEL_MANAGER', 'FINANCE_MANAGER'],
  VENDOR_TRANSPORT: ['TRANSPORT_MANAGER', 'FINANCE_MANAGER'],
  VENDOR_VISA: ['VISA_OFFICER', 'FINANCE_MANAGER'],
  VENDOR_CATERING: ['FINANCE_MANAGER'],
  VENDOR_GUIDE: ['FINANCE_MANAGER'],
  PLATFORM: [],
};

export const COMMUNITY_TENANT_SLUG = 'umrah-connect-travelers';
export const PLATFORM_TENANT_SLUG = 'umrah-connect-platform';

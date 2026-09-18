/**
 * What a signed-in account may open in the workspace, decided from the
 * capabilities `GET /auth/me` returns — never from role names.
 *
 * This file is the single source of truth for three things:
 *  - route access (the workspace shell shows a denied state, or redirects);
 *  - navigation visibility (the sidebar shows an item only if its route opens);
 *  - the landing page after sign-in when the role's own dashboard is not open.
 *
 * It is a convenience layer: every API route re-checks its own capability and
 * answers 403, so nothing here is a security boundary. It fails closed: a
 * route without a rule, or an account whose capabilities have not loaded,
 * opens nothing.
 *
 * Role names appear in exactly one place: `dashboardType` (derived from roles
 * at sign-in) chooses which dashboard is "home" and how the sidebar is grouped.
 * That is presentation. Whether a page or menu item is available is always a
 * capability question.
 */
import type { DashboardType, StoredUser } from './auth';
import { hasAllCapabilities, hasAnyCapability, hasPlatformCapability, type CapabilityList } from './capabilities';

/** The fields of the signed-in profile these decisions read. */
export type AccessSubject = Pick<StoredUser, 'permissions' | 'tenantType' | 'tenantSlug' | 'tenantStatus' | 'dashboardType'>;

/**
 * Which kind of account this is, from its organization (not its roles):
 *  - `platform`: a Super Admin account in the PLATFORM organization;
 *  - `traveler`: a member of the shared traveler community;
 *  - `organization`: anyone working inside an agency, hotel, transport or visa organization.
 */
export type WorkspaceKind = 'platform' | 'traveler' | 'organization';

/** The shared organization every self-registered traveler belongs to (server: COMMUNITY_TENANT_SLUG). */
export const COMMUNITY_ORGANIZATION_SLUG = 'umrah-connect-travelers';

/**
 * Organization states the API treats as "not verified yet". While in one of
 * them the API answers only onboarding routes (401 "Organization verification
 * is not complete yet" elsewhere), so the workspace offers only those.
 */
export const PENDING_ORGANIZATION_STATUSES = ['PENDING_KYC', 'KYC_SUBMITTED', 'KYC_REJECTED', 'KYC_APPROVED'] as const;

export interface RouteRule {
  /** At least one of these capabilities. */
  any?: readonly string[];
  /** Every one of these capabilities. */
  all?: readonly string[];
  /** Only for platform (Super Admin) accounts; organization accounts never get platform screens. */
  platform?: boolean;
  /** Restrict to these kinds of account (personal traveler pages, for instance). */
  audience?: readonly WorkspaceKind[];
  /** Open to any signed-in account, including one whose organization is still being verified. */
  always?: boolean;
}

/**
 * Every workspace route and what it needs. Keys are path prefixes; the longest
 * matching prefix wins, so `/transport/assignments` can ask for more than
 * `/transport`. Each capability is the one the page's own API calls require
 * (see the route policies in platform/api), so an item is offered exactly when
 * its data will load. A unit test fails if a page exists without a rule here.
 */
export const ROUTE_RULES: Readonly<Record<string, RouteRule>> = {
  // Available to every signed-in account.
  '/settings': { always: true },
  '/onboarding': { always: true },

  // Platform administration (PLATFORM organization, platform:* capabilities only).
  '/admin-dashboard': { platform: true, all: ['platform:tenant:read'] },
  '/admin-tenants': { platform: true, all: ['platform:tenant:read'] },
  '/admin-users': { platform: true, all: ['platform:user:read'] },
  '/admin-kyc': { platform: true, all: ['platform:kyc:review'] },
  '/admin-listings': { platform: true, all: ['platform:marketplace:moderate'] },
  '/admin-inquiries': { platform: true, all: ['platform:inquiry:manage'] },
  '/admin-logs': { platform: true, all: ['platform:audit:read'] },
  '/admin-roles': { platform: true, all: ['platform:role:manage'] },
  '/admin-settings': { platform: true, all: ['platform:settings:read'] },
  '/admin-support': {
    platform: true,
    any: ['platform:inquiry:manage', 'platform:marketplace:moderate', 'platform:kyc:review', 'platform:audit:read'],
  },

  // Organization CRM and operations.
  '/dashboard': { all: ['crm:pilgrim:read'] },
  '/pilgrims': { all: ['crm:pilgrim:read'] },
  '/groups': { all: ['crm:pilgrim:read'] },
  '/bookings': { all: ['booking:booking:read'] },
  '/packages': { all: ['booking:package:read'] },
  '/hotel-dashboard': { all: ['hotel:allotment:read'] },
  '/hotels': { all: ['hotel:allotment:read'] },
  '/hotel-bookings': { all: ['hotel:allotment:read'] },
  '/transport-dashboard': { all: ['transport:vehicle:read'] },
  '/transport': { all: ['transport:vehicle:read'] },
  '/transport/assignments': { all: ['transport:assignment:manage'] },
  '/transport/bookings': { all: ['transport:assignment:manage'] },
  '/visa-dashboard': { all: ['visa:application:read'] },
  '/compliance': { all: ['visa:application:read'] },
  '/visa-documents': { all: ['visa:application:read'] },
  '/visa-requests': { all: ['visa:application:read'] },
  '/finance-dashboard': { all: ['finance:report:read'] },
  '/finance': { all: ['finance:invoice:read'] },
  // GET /finance/payments is authorized on invoice read; payments.view is the product capability.
  '/finance-payments': { all: ['finance:invoice:read', 'finance:payment:read'] },
  '/budget-plans': { all: ['finance:report:read'] },
  // Every /reports/* endpoint requires finance:report:read (not reporting:report:read).
  '/reports': { all: ['finance:report:read'] },

  // Marketplace and community.
  '/marketplace': { all: ['marketplace:listing:read'] },
  '/requests': { all: ['marketplace:listing:read'] },
  '/social': { all: ['social:post:read'] },
  '/discover': { all: ['social:post:read'] },
  '/connections': { all: ['social:post:read'] },
  '/messages': { all: ['social:post:read'] },
  '/profile': { all: ['social:post:read'] },

  // A traveler's own journey. The API scopes these to the caller; for anyone
  // else they are empty pages, so they are not offered.
  '/my-offers': { all: ['marketplace:listing:read'], audience: ['traveler'] },
  '/my-bookings': { all: ['marketplace:listing:read'], audience: ['traveler'] },
  '/travel-plan': { all: ['marketplace:listing:read'], audience: ['traveler'] },
};

const RULE_PREFIXES = Object.keys(ROUTE_RULES).sort((a, b) => b.length - a.length);

/** The path without query string or fragment. */
export function normalizePath(pathname: string): string {
  const path = (pathname || '/').split(/[?#]/)[0];
  return path.length > 1 ? path.replace(/\/+$/, '') : path;
}

/** The rule governing a path (longest matching prefix), or undefined when no rule exists. */
export function ruleFor(pathname: string): RouteRule | undefined {
  const path = normalizePath(pathname);
  const prefix = RULE_PREFIXES.find((route) => path === route || path.startsWith(`${route}/`));
  return prefix ? ROUTE_RULES[prefix] : undefined;
}

export function isPlatformAccount(user?: AccessSubject | null): boolean {
  return !!user && user.tenantType === 'PLATFORM' && hasPlatformCapability(user.permissions);
}

export function workspaceKind(user: AccessSubject): WorkspaceKind {
  if (isPlatformAccount(user)) return 'platform';
  if (user.tenantSlug === COMMUNITY_ORGANIZATION_SLUG) return 'traveler';
  return 'organization';
}

/** The account's organization exists but has not passed KYC review yet. */
export function isPendingOrganization(user?: AccessSubject | null): boolean {
  return !!user?.tenantStatus && (PENDING_ORGANIZATION_STATUSES as readonly string[]).includes(user.tenantStatus);
}

function satisfies(permissions: CapabilityList, rule: RouteRule): boolean {
  if (rule.all?.length && !hasAllCapabilities(permissions, rule.all)) return false;
  if (rule.any?.length && !hasAnyCapability(permissions, rule.any)) return false;
  return true;
}

/**
 * Whether the account may open a route right now. False while capabilities
 * are missing, for unknown routes, for platform screens outside the platform
 * organization, and for anything but onboarding while the organization is
 * pending verification.
 */
export function canOpenRoute(user: AccessSubject | null | undefined, pathname: string): boolean {
  if (!user || !Array.isArray(user.permissions)) return false;
  const rule = ruleFor(pathname);
  if (!rule) return false;
  if (rule.always) return true;
  if (isPendingOrganization(user)) return false;
  const kind = workspaceKind(user);
  if (rule.platform ? kind !== 'platform' : kind === 'platform') return false;
  if (rule.audience && !rule.audience.includes(kind)) return false;
  return satisfies(user.permissions, rule);
}

// ─── Navigation ───────────────────────────────────────────────────────────────

export type NavKey =
  | 'overview' | 'tenants' | 'users' | 'listings' | 'kyc' | 'inquiries' | 'roles' | 'logs' | 'support' | 'platformSettings'
  | 'dashboard' | 'pilgrims' | 'bookings' | 'packages' | 'groups' | 'hotels' | 'transport' | 'visa' | 'finance' | 'reports'
  | 'hotelDashboard' | 'hotelBookings'
  | 'transportDashboard' | 'vehicles' | 'drivers' | 'routes' | 'assignments' | 'transportBookings'
  | 'visaDashboard' | 'visaApplications' | 'applicants' | 'visaDocuments' | 'serviceRequests'
  | 'financeDashboard' | 'invoices' | 'payments' | 'budgetPlans'
  | 'marketplace' | 'social' | 'connections' | 'requests' | 'discover' | 'messages' | 'myGroups'
  | 'myRequests' | 'myOffers' | 'myBookings' | 'travelPlan' | 'profile' | 'registerOrganization' | 'verification';

export interface NavItem {
  key: NavKey;
  label: string;
  href: string;
}

export interface NavSection {
  section: string;
  items: NavItem[];
}

const item = (key: NavKey, label: string, href: string): NavItem => ({ key, label, href });

const SHARED: NavSection = {
  section: 'Shared platform',
  items: [
    item('marketplace', 'Marketplace', '/marketplace'),
    item('social', 'Social Hub', '/social'),
    item('connections', 'Connections', '/connections'),
    item('groups', 'Groups', '/groups'),
    item('requests', 'Requests', '/requests'),
  ],
};

/**
 * How each workspace groups its menu. This is layout only: every item is
 * filtered through `canOpenRoute`, so a layout can never show something the
 * account's capabilities do not open.
 */
const LAYOUTS: Record<DashboardType, NavSection[]> = {
  operator: [
    {
      section: 'My CRM',
      items: [
        item('dashboard', 'Dashboard', '/dashboard'),
        item('pilgrims', 'Pilgrims & CRM', '/pilgrims'),
        item('bookings', 'Bookings', '/bookings'),
        item('packages', 'Packages', '/packages'),
        item('groups', 'Groups', '/groups'),
      ],
    },
    {
      section: 'My Inventory',
      items: [
        item('hotels', 'Hotels', '/hotels'),
        item('transport', 'Transport', '/transport'),
        item('visa', 'Visa & Compliance', '/compliance'),
      ],
    },
    {
      section: 'My Finance',
      items: [item('finance', 'Finance', '/finance'), item('reports', 'Reports', '/reports')],
    },
    SHARED,
  ],
  admin: [
    {
      section: 'Platform control',
      items: [
        item('overview', 'Overview', '/admin-dashboard'),
        item('tenants', 'All Tenants', '/admin-tenants'),
        item('users', 'All Users', '/admin-users'),
        item('listings', 'Marketplace Listings', '/admin-listings'),
      ],
    },
    {
      section: 'Governance',
      items: [
        item('kyc', 'KYC Verification', '/admin-kyc'),
        item('inquiries', 'Website Inquiries', '/admin-inquiries'),
        item('roles', 'Roles & Permissions', '/admin-roles'),
        item('logs', 'System Logs', '/admin-logs'),
        item('support', 'Support / Issues', '/admin-support'),
      ],
    },
    { section: 'Config', items: [item('platformSettings', 'Platform Settings', '/admin-settings')] },
  ],
  hotel: [
    {
      section: 'My Hotel CRM',
      items: [
        item('hotelDashboard', 'Dashboard', '/hotel-dashboard'),
        item('hotels', 'My Hotels & Rooms', '/hotels'),
        item('hotelBookings', 'Bookings', '/hotel-bookings'),
        item('finance', 'Finance', '/finance'),
      ],
    },
    SHARED,
  ],
  transport: [
    {
      section: 'My Fleet CRM',
      items: [
        item('transportDashboard', 'Dashboard', '/transport-dashboard'),
        item('vehicles', 'Vehicles & Fleet', '/transport/vehicles'),
        item('drivers', 'Drivers', '/transport/drivers'),
        item('routes', 'Routes', '/transport/routes'),
        item('assignments', 'Assignments', '/transport/assignments'),
        item('transportBookings', 'Bookings', '/transport/bookings'),
        item('finance', 'Finance', '/finance'),
      ],
    },
    SHARED,
  ],
  compliance: [
    {
      section: 'My Visa CRM',
      items: [
        item('visaDashboard', 'Dashboard', '/visa-dashboard'),
        item('visaApplications', 'Visa Applications', '/compliance'),
        item('applicants', 'Pilgrims / Applicants', '/pilgrims'),
        item('visaDocuments', 'Document Management', '/visa-documents'),
        item('serviceRequests', 'Service Requests', '/visa-requests'),
        item('finance', 'Finance', '/finance'),
        item('reports', 'Reports', '/reports'),
      ],
    },
    SHARED,
  ],
  finance: [
    {
      section: 'My Finance CRM',
      items: [
        item('financeDashboard', 'Dashboard', '/finance-dashboard'),
        item('invoices', 'Invoices', '/finance'),
        item('payments', 'Payments', '/finance-payments'),
        item('bookings', 'Bookings', '/bookings'),
        item('budgetPlans', 'Budget Plans', '/budget-plans'),
        item('reports', 'Reports', '/reports'),
      ],
    },
    SHARED,
  ],
  pilgrim: [
    {
      section: 'Community',
      items: [
        item('social', 'Social Hub', '/social'),
        item('discover', 'Discover', '/discover'),
        item('connections', 'Connections', '/connections'),
        item('messages', 'Messages', '/messages'),
        item('myGroups', 'My Groups', '/travel-plan#my-groups'),
      ],
    },
    {
      section: 'My Travel',
      items: [
        item('marketplace', 'Marketplace', '/marketplace'),
        item('myRequests', 'My Requests', '/requests'),
        item('myOffers', 'My Offers', '/my-offers'),
        item('myBookings', 'My Bookings', '/my-bookings'),
        item('travelPlan', 'My Travel Plan', '/travel-plan'),
      ],
    },
    {
      section: 'Account',
      items: [
        item('profile', 'Profile', '/profile'),
        item('registerOrganization', 'Register your organization', '/onboarding'),
      ],
    },
  ],
};

/**
 * Organization areas an account can reach through a capability its own
 * workspace menu does not list (a custom role, or a second role granted by an
 * administrator). They are offered under "More tools" so every capability the
 * account holds is reachable from the menu.
 */
const DOMAIN_ENTRY_POINTS: NavItem[] = [
  item('pilgrims', 'Pilgrims & CRM', '/pilgrims'),
  item('bookings', 'Bookings', '/bookings'),
  item('packages', 'Packages', '/packages'),
  item('groups', 'Groups', '/groups'),
  item('hotels', 'Hotels', '/hotels'),
  item('transport', 'Transport', '/transport'),
  item('visa', 'Visa & Compliance', '/compliance'),
  item('finance', 'Finance', '/finance'),
  item('reports', 'Reports', '/reports'),
];

/** The menu layout for an account: platform and travelers by organization, others by their dashboard. */
export function layoutFor(user: AccessSubject): DashboardType {
  const kind = workspaceKind(user);
  if (kind === 'platform') return 'admin';
  if (kind === 'traveler') return 'pilgrim';
  return user.dashboardType === 'admin' || user.dashboardType === 'pilgrim' ? 'operator' : user.dashboardType;
}

/**
 * The sidebar sections for an account: its layout filtered by capability,
 * duplicates removed, empty sections dropped, plus "More tools" for anything
 * else it may open. An organization still being verified gets only the
 * verification entry.
 */
export function navigationFor(user: AccessSubject | null | undefined): NavSection[] {
  if (!user || !Array.isArray(user.permissions)) return [];
  if (isPendingOrganization(user)) {
    return [{ section: 'Organization setup', items: [item('verification', 'Organization verification', '/onboarding')] }];
  }
  // A layout may list one page twice under different sections (Groups in "My CRM"
  // and "Shared platform"); it is shown once. Anchored links such as
  // /travel-plan#my-groups are distinct menu entries.
  const shownHrefs = new Set<string>();
  const shownPaths = new Set<string>();
  const visible = (entry: NavItem) => {
    if (shownHrefs.has(entry.href) || !canOpenRoute(user, entry.href)) return false;
    shownHrefs.add(entry.href);
    shownPaths.add(normalizePath(entry.href));
    return true;
  };
  const sections = LAYOUTS[layoutFor(user)]
    .map((section) => ({ section: section.section, items: section.items.filter(visible) }))
    .filter((section) => section.items.length > 0);
  if (workspaceKind(user) === 'organization') {
    // An area is already covered when it, or one of its sub-pages, is in the menu.
    const covered = (path: string) => [...shownPaths].some((shown) => shown === path || shown.startsWith(`${path}/`));
    const more = DOMAIN_ENTRY_POINTS.filter((entry) => !covered(normalizePath(entry.href)) && visible(entry));
    if (more.length) sections.push({ section: 'More tools', items: more });
  }
  return sections;
}

// ─── Landing ──────────────────────────────────────────────────────────────────

/** Each workspace's own dashboard. Mirrors getDashboardPath in the auth provider (a test keeps them equal). */
export const WORKSPACE_HOME: Readonly<Record<DashboardType, string>> = {
  operator: '/dashboard',
  admin: '/admin-dashboard',
  hotel: '/hotel-dashboard',
  transport: '/transport-dashboard',
  compliance: '/visa-dashboard',
  finance: '/finance-dashboard',
  pilgrim: '/travel-plan',
};

/**
 * Where to send an account after sign-in or when it asks for "its workspace":
 * the organization verification page while pending, otherwise its dashboard
 * when that opens, otherwise the first menu item it can open, otherwise its
 * account settings (which always open).
 */
export function landingPathFor(user: AccessSubject | null | undefined): string {
  if (!user) return '/login';
  if (isPendingOrganization(user)) return '/onboarding';
  const home = WORKSPACE_HOME[layoutFor(user)];
  if (canOpenRoute(user, home)) return home;
  const first = navigationFor(user).flatMap((section) => section.items)[0];
  return first ? normalizePath(first.href) : '/settings';
}

export type RouteDecision = { kind: 'allow' } | { kind: 'deny' } | { kind: 'redirect'; to: string };

/**
 * What the workspace shell does with the current path:
 *  - a pending organization is taken to the verification page from anywhere else;
 *  - the account's own dashboard, when it no longer opens, sends it to the
 *    landing page instead (for example after a grant was withdrawn);
 *  - any other route it may not open shows the denied state.
 */
export function routeDecision(user: AccessSubject, pathname: string): RouteDecision {
  if (canOpenRoute(user, pathname)) return { kind: 'allow' };
  if (!Array.isArray(user.permissions)) return { kind: 'deny' };
  // /onboarding always opens, so this cannot loop.
  if (isPendingOrganization(user)) return { kind: 'redirect', to: '/onboarding' };
  const path = normalizePath(pathname);
  const landing = landingPathFor(user);
  const home = WORKSPACE_HOME[layoutFor(user)];
  if (path === home && landing !== path) return { kind: 'redirect', to: landing };
  return { kind: 'deny' };
}

export type DeniedReason = 'platform-only' | 'organization-only' | 'audience' | 'permission' | 'unknown';

/** Why a route does not open, so the denied state can say something useful. */
export function deniedReason(user: AccessSubject, pathname: string): DeniedReason {
  const rule = ruleFor(pathname);
  if (!rule) return 'unknown';
  const kind = workspaceKind(user);
  if (rule.platform && kind !== 'platform') return 'platform-only';
  if (!rule.platform && !rule.always && kind === 'platform') return 'organization-only';
  if (rule.audience && !rule.audience.includes(kind)) return 'audience';
  return 'permission';
}

/** Header label for the workspace. */
export function workspaceLabel(user: AccessSubject): string {
  if (isPendingOrganization(user)) return 'Organization verification';
  switch (layoutFor(user)) {
    case 'admin': return 'Platform governance';
    case 'pilgrim': return 'Your journey';
    case 'hotel': return 'Hotel workspace';
    case 'transport': return 'Transport workspace';
    case 'compliance': return 'Visa workspace';
    case 'finance': return 'Finance workspace';
    default: return 'Operator workspace';
  }
}

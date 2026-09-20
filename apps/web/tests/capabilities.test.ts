import { describe, expect, it } from 'vitest';
import { readdirSync, statSync } from 'fs';
import { join } from 'path';
import { SYSTEM_ROLES, type RoleCode } from '../../../platform/api/src/modules/rbac/catalog';
import type { DashboardType } from '../lib/auth';
import {
  canOpenRoute,
  deniedReason,
  isPlatformAccount,
  landingPathFor,
  navigationFor,
  normalizePath,
  routeDecision,
  ruleFor,
  workspaceKind,
  WORKSPACE_HOME,
  ROUTE_RULES,
  type AccessSubject,
} from '../lib/workspace-access';

/**
 * The workspace's route and menu decisions, checked against the capability
 * sets the API actually grants (read from platform/api's catalogue, so a
 * server-side change to a role is reflected here without editing the test).
 */
const perms = (...roles: RoleCode[]) => [...new Set(roles.flatMap((r) => SYSTEM_ROLES[r].permissions))].sort();

function account(
  roles: RoleCode[],
  dashboardType: DashboardType,
  overrides: Partial<AccessSubject> = {},
): AccessSubject {
  return {
    permissions: perms(...roles),
    tenantType: 'OPERATOR',
    tenantSlug: 'al-haramain-ksa',
    tenantStatus: 'ACTIVE',
    dashboardType,
    ...overrides,
  };
}

const operator = account(['OPERATOR_ADMIN'], 'operator', { tenantType: 'MU_ASSASA' });
const staff = account(['OPERATOR_STAFF'], 'operator');
const hotel = account(['HOTEL_MANAGER'], 'hotel', { tenantType: 'VENDOR_HOTEL', tenantSlug: 'makkah-grand-hotels' });
const transport = account(['TRANSPORT_MANAGER'], 'transport', { tenantType: 'VENDOR_TRANSPORT', tenantSlug: 'haramain-transport' });
const visa = account(['VISA_OFFICER'], 'compliance', { tenantType: 'VENDOR_VISA', tenantSlug: 'fastvisa-agency' });
const finance = account(['FINANCE_MANAGER'], 'finance');
const traveler = account(['PILGRIM'], 'pilgrim', { tenantSlug: 'umrah-connect-travelers' });
const superAdmin = account(['SUPER_ADMIN'], 'admin', { tenantType: 'PLATFORM', tenantSlug: 'umrah-connect-platform' });

const hrefs = (user: AccessSubject) => navigationFor(user).flatMap((s) => s.items.map((i) => i.href));
const sectionOf = (user: AccessSubject, name: string) =>
  navigationFor(user).find((s) => s.section === name)?.items.map((i) => i.href) ?? [];

describe('route rules', () => {
  it('cover every page of the workspace, so nothing opens by default', () => {
    const root = join(__dirname, '..', 'app', '(dashboard)');
    const pages: string[] = [];
    const walk = (dir: string, route: string) => {
      for (const name of readdirSync(dir)) {
        const full = join(dir, name);
        if (statSync(full).isDirectory()) walk(full, `${route}/${name.startsWith('[') ? 'sample-id' : name}`);
        else if (name === 'page.tsx') pages.push(route || '/');
      }
    };
    walk(root, '');
    expect(pages.length).toBeGreaterThan(50);
    expect(pages.filter((page) => !ruleFor(page))).toEqual([]);
  });

  it('use only capabilities the API catalogue defines', async () => {
    const { PERMISSION_CATALOG } = await import('../../../platform/api/src/modules/rbac/catalog');
    const used = Object.values(ROUTE_RULES).flatMap((rule) => [...(rule.all ?? []), ...(rule.any ?? [])]);
    expect(used.filter((capability) => !(capability in PERMISSION_CATALOG))).toEqual([]);
  });

  it('pick the longest prefix and ignore query strings and fragments', () => {
    expect(ruleFor('/social/groups/abc')).toEqual({ authenticated: true });
    expect(ruleFor('/social/feed')?.all).toEqual(['social:post:read']);
    // F16: viewing trips is transport:vehicle:read (the catalogue's wording); managing them stays server-side.
    expect(ruleFor('/transport/assignments')?.all).toEqual(['transport:vehicle:read']);
    expect(ruleFor('/transport/bookings')?.all).toEqual(['transport:vehicle:read']);
    expect(ruleFor('/transport/vehicles/abc')?.all).toEqual(['transport:vehicle:read']);
    expect(ruleFor('/finance/invoices/123?tab=payments')?.all).toEqual(['finance:invoice:read']);
    expect(ruleFor('/finance-payments')?.all).toEqual(['finance:invoice:read', 'finance:payment:read']);
    expect(normalizePath('/travel-plan#my-groups')).toBe('/travel-plan');
    expect(ruleFor('/admin-tenantsXYZ')).toBeUndefined();
    expect(ruleFor('/nope')).toBeUndefined();
  });

  it('fail closed while capabilities are unknown', () => {
    const loading = { ...operator, permissions: undefined };
    expect(canOpenRoute(loading, '/dashboard')).toBe(false);
    expect(canOpenRoute(loading, '/settings')).toBe(false);
    expect(canOpenRoute(null, '/settings')).toBe(false);
    expect(navigationFor(loading)).toEqual([]);
    expect(routeDecision(loading, '/dashboard')).toEqual({ kind: 'deny' });
    expect(canOpenRoute(operator, '/nope')).toBe(false);
    expect(deniedReason(operator, '/nope')).toBe('unknown');
  });
});

describe('navigation per identity (only what the capabilities open)', () => {
  it('operator admin: the full organization workspace, nothing of the platform', () => {
    expect(hrefs(operator)).toEqual([
      '/dashboard', '/pilgrims', '/bookings', '/packages', '/groups',
      '/hotels', '/transport', '/compliance', '/finance', '/reports',
      '/marketplace', '/social', '/connections', '/requests', '/notifications',
    ]);
    expect(landingPathFor(operator)).toBe('/dashboard');
  });

  it('operator staff: operational reports open (reporting:report:read), money figures stay hidden', () => {
    // The API serves /reports/overview|pilgrims|bookings|hotels|visa|transport on
    // reporting:report:read and only /reports/finance on finance:report:read, so the page
    // opens and hides the money sections. Requiring the finance capability here denied a
    // page the server happily served (A10 browser QA).
    expect(hrefs(staff)).toContain('/reports');
    expect(hrefs(staff)).toContain('/pilgrims');
    expect(canOpenRoute(staff, '/reports')).toBe(true);
    expect(canOpenRoute(staff, '/budget-plans')).toBe(false);
    expect(deniedReason(staff, '/budget-plans')).toBe('permission');
  });

  it('hotel manager: hotel CRM, finance and the shared platform; reports as an extra tool', () => {
    expect(hrefs(hotel)).toEqual([
      '/hotel-dashboard', '/hotels', '/hotel-bookings', '/finance',
      '/marketplace', '/social', '/connections', '/requests', '/reports', '/notifications',
    ]);
    expect(sectionOf(hotel, 'More tools')).toEqual(['/reports']);
    expect(canOpenRoute(hotel, '/pilgrims')).toBe(false);
    expect(canOpenRoute(hotel, '/transport/vehicles')).toBe(false);
    expect(landingPathFor(hotel)).toBe('/hotel-dashboard');
  });

  it('transport manager: fleet CRM including assignments', () => {
    expect(hrefs(transport)).toEqual([
      '/transport-dashboard', '/transport/vehicles', '/transport/drivers', '/transport/routes',
      '/transport/assignments', '/transport/bookings', '/finance',
      '/marketplace', '/social', '/connections', '/requests', '/reports', '/notifications',
    ]);
    expect(canOpenRoute(transport, '/hotels')).toBe(false);
  });

  it('F16: a custom role with only transport:vehicle:read can open the trip views (read-only)', () => {
    const viewer = { ...transport, permissions: ['transport:vehicle:read'] };
    expect(canOpenRoute(viewer, '/transport/assignments')).toBe(true);
    expect(canOpenRoute(viewer, '/transport/bookings')).toBe(true);
    expect(canOpenRoute({ ...transport, permissions: ['transport:assignment:manage'] }, '/transport/assignments')).toBe(false);
  });

  it('visa officer: visa CRM, applicants and operational reports; no money reports', () => {
    expect(hrefs(visa)).toEqual([
      '/visa-dashboard', '/compliance', '/pilgrims', '/visa-documents', '/visa-requests', '/finance',
      '/reports', '/marketplace', '/social', '/connections', '/groups', '/requests', '/notifications',
    ]);
    expect(canOpenRoute(visa, '/reports')).toBe(true);
    expect(canOpenRoute(visa, '/budget-plans')).toBe(false);
    expect(canOpenRoute(visa, '/hotels')).toBe(false);
  });

  it('finance manager: finance, social read and package reads; no marketplace or CRM', () => {
    expect(hrefs(finance)).toEqual([
      '/finance-dashboard', '/finance', '/finance-payments', '/bookings', '/budget-plans', '/reports',
      '/social', '/connections', '/packages', '/notifications',
    ]);
    expect(sectionOf(finance, 'More tools')).toEqual(['/packages']);
    expect(canOpenRoute(finance, '/pilgrims')).toBe(false);
    expect(canOpenRoute(finance, '/marketplace')).toBe(false);
  });

  it('traveler: community and own journey, plus the way to register an organization', () => {
    expect(hrefs(traveler)).toEqual([
      '/social', '/discover', '/connections', '/messages', '/social/groups',
      '/marketplace', '/requests', '/my-offers', '/my-bookings', '/travel-plan',
      '/profile', '/notifications', '/onboarding',
    ]);
    expect(landingPathFor(traveler)).toBe('/travel-plan');
    for (const path of ['/pilgrims', '/bookings', '/groups', '/finance', '/admin-dashboard']) {
      expect(canOpenRoute(traveler, path), path).toBe(false);
    }
  });

  it('super admin: the platform console only, never organization or community pages', () => {
    expect(hrefs(superAdmin)).toEqual([
      '/admin-dashboard', '/admin-tenants', '/admin-users', '/admin-listings',
      '/admin-kyc', '/admin-inquiries', '/admin-roles', '/admin-logs', '/admin-support', '/admin-settings',
      '/notifications',
    ]);
    expect(workspaceKind(superAdmin)).toBe('platform');
    expect(landingPathFor(superAdmin)).toBe('/admin-dashboard');
    for (const path of ['/pilgrims', '/marketplace', '/social', '/profile', '/finance', '/connections']) {
      expect(canOpenRoute(superAdmin, path), path).toBe(false);
      expect(deniedReason(superAdmin, path), path).toBe('organization-only');
    }
    expect(canOpenRoute(superAdmin, '/settings')).toBe(true);
  });

  it('no organization account ever gets platform chrome or routes', () => {
    for (const user of [operator, staff, hotel, transport, visa, finance, traveler]) {
      expect(isPlatformAccount(user)).toBe(false);
      expect(hrefs(user).some((h) => h.startsWith('/admin-'))).toBe(false);
      expect(canOpenRoute(user, '/admin-kyc')).toBe(false);
      expect(deniedReason(user, '/admin-users')).toBe('platform-only');
    }
    // Defence in depth: platform capabilities outside the PLATFORM organization open nothing.
    const planted = { ...operator, permissions: [...(operator.permissions ?? []), 'platform:tenant:read'] };
    expect(isPlatformAccount(planted)).toBe(false);
    expect(canOpenRoute(planted, '/admin-dashboard')).toBe(false);
  });

  it('personal traveler pages are not offered to organization accounts', () => {
    expect(canOpenRoute(operator, '/my-bookings')).toBe(false);
    expect(deniedReason(operator, '/travel-plan')).toBe('audience');
  });

  it('every item in every menu can open for someone', () => {
    const everyone = [operator, staff, hotel, transport, visa, finance, traveler, superAdmin];
    for (const user of everyone) {
      for (const href of hrefs(user)) expect(canOpenRoute(user, href), href).toBe(true);
    }
  });
});

describe('capabilities, not roles, decide', () => {
  it('a withdrawn grant removes its menu entry and its route', () => {
    const financeWithStaff = { ...finance, permissions: perms('FINANCE_MANAGER', 'OPERATOR_STAFF') };
    // Groups joins the "Shared platform" section of the finance menu; the rest are extra tools.
    expect(sectionOf(financeWithStaff, 'Shared platform')).toContain('/groups');
    expect(sectionOf(financeWithStaff, 'More tools')).toEqual(['/pilgrims', '/packages', '/hotels', '/transport', '/compliance']);
    expect(canOpenRoute(financeWithStaff, '/pilgrims')).toBe(true);
    const revoked = { ...financeWithStaff, permissions: perms('FINANCE_MANAGER') };
    expect(hrefs(revoked)).not.toContain('/pilgrims');
    expect(routeDecision(revoked, '/pilgrims')).toEqual({ kind: 'deny' });
  });

  it('a custom role sees exactly what it holds, whatever its dashboard', () => {
    const custom = account([], 'operator', { permissions: ['finance:invoice:read', 'social:post:read'] });
    expect(hrefs(custom)).toEqual(['/finance', '/social', '/connections', '/notifications']);
    // Its dashboard does not open, so it lands on the first page that does.
    expect(landingPathFor(custom)).toBe('/finance');
    expect(routeDecision(custom, '/dashboard')).toEqual({ kind: 'redirect', to: '/finance' });
    expect(routeDecision(custom, '/pilgrims')).toEqual({ kind: 'deny' });
  });

  it('an account left with no capability keeps only its own pages', () => {
    const empty = account([], 'hotel', { permissions: [] });
    expect(hrefs(empty)).toEqual(['/notifications']);
    expect(landingPathFor(empty)).toBe('/notifications');
    expect(routeDecision(empty, '/hotel-dashboard')).toEqual({ kind: 'redirect', to: '/notifications' });
    expect(canOpenRoute(empty, '/settings')).toBe(true);
  });

  it('notifications and a traveler’s groups open for every active account, never while pending', () => {
    for (const user of [operator, staff, hotel, transport, visa, finance, traveler, superAdmin]) {
      expect(canOpenRoute(user, '/notifications')).toBe(true);
      expect(canOpenRoute(user, '/social/groups/some-group')).toBe(true);
    }
    const pending = { ...hotel, tenantStatus: 'KYC_SUBMITTED' };
    expect(canOpenRoute(pending, '/notifications')).toBe(false);
    expect(routeDecision(pending, '/notifications')).toEqual({ kind: 'redirect', to: '/onboarding' });
  });
});

describe('an organization pending verification', () => {
  const pending = { ...hotel, tenantStatus: 'PENDING_KYC' };

  it('is offered only verification and settings', () => {
    expect(hrefs(pending)).toEqual(['/onboarding']);
    expect(canOpenRoute(pending, '/onboarding')).toBe(true);
    expect(canOpenRoute(pending, '/settings')).toBe(true);
    expect(canOpenRoute(pending, '/hotel-dashboard')).toBe(false);
    expect(canOpenRoute(pending, '/social')).toBe(false);
    expect(landingPathFor(pending)).toBe('/onboarding');
  });

  it('is taken to verification from any other page, including its dashboard', () => {
    for (const status of ['PENDING_KYC', 'KYC_SUBMITTED', 'KYC_REJECTED']) {
      const user = { ...hotel, tenantStatus: status };
      expect(routeDecision(user, '/hotel-dashboard')).toEqual({ kind: 'redirect', to: '/onboarding' });
      expect(routeDecision(user, '/hotels/abc')).toEqual({ kind: 'redirect', to: '/onboarding' });
      expect(routeDecision(user, '/onboarding')).toEqual({ kind: 'allow' });
    }
  });

  it('gets its whole workspace back once ACTIVE', () => {
    expect(hrefs({ ...pending, tenantStatus: 'ACTIVE' })).toEqual(hrefs(hotel));
  });
});

describe('landing', () => {
  it('matches the auth provider’s dashboard for every workspace', async () => {
    const { getDashboardPath } = await import('../components/providers/auth-provider');
    for (const type of Object.keys(WORKSPACE_HOME) as DashboardType[]) {
      expect(getDashboardPath(type), type).toBe(WORKSPACE_HOME[type]);
    }
  });
});

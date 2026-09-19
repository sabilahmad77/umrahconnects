import { describe, expect, it } from 'vitest';
import { bookingEstimateCents } from '../lib/booking-estimate';
import { safeReturnPath } from '../lib/safe-return-path';
describe('booking review estimate', () => {
  it('uses people only for per-person pricing', () => { expect(bookingEstimateCents(12500, 'PER_PERSON', 3)).toBe(37500); });
  it('does not multiply a per-group rate by people', () => { expect(bookingEstimateCents('12500', 'PER_GROUP', 3)).toBe(12500); });
  it.each(['PER_NIGHT', 'CUSTOM', 'unknown'])('requires a provider quote for %s', model => { expect(bookingEstimateCents(12500, model, 3)).toBeNull(); });
  it.each([0, -1, 1.5, NaN])('rejects invalid party size %s', size => { expect(bookingEstimateCents(12500, 'PER_PERSON', size)).toBeNull(); });
  it('distinguishes free from unknown and prevents unsafe monetary arithmetic', () => { expect(bookingEstimateCents(0, 'PER_PERSON', 1)).toBe(0); expect(bookingEstimateCents(null, 'PER_PERSON', 1)).toBeNull(); expect(bookingEstimateCents(Number.MAX_SAFE_INTEGER, 'PER_PERSON', 2)).toBeNull(); });
});
describe('sign-in return destination', () => {
  it('preserves internal path and query', () => { expect(safeReturnPath('/bookings?page=2')).toBe('/bookings?page=2'); });
  it.each(['https://evil.example', '//evil.example', '/\\evil.example', '/%5cevil.example', '/%2fevil.example', '/login', '/signup', '/reset-password', '/%00bad'])('rejects unsafe or cyclic return %s', path => { expect(safeReturnPath(path)).toBeNull(); });
});

import { decodeJwt, isTokenExpired } from '../lib/auth';
describe('stored authentication claims', () => {
  const token = (payload: unknown) => `header.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.signature`;
  it('rejects historical fabricated demo tokens', () => { const demo = `demo.${Buffer.from(JSON.stringify({sub:'demo',roles:['SUPER_ADMIN'],exp:9999999999})).toString('base64')}`; expect(decodeJwt(demo)).toBeNull(); expect(isTokenExpired(demo)).toBe(true); });
  it.each([{sub:'user',roles:'SUPER_ADMIN',exp:9999999999},{sub:'user',roles:['PILGRIM']},{roles:['PILGRIM'],exp:9999999999}])('rejects malformed stored claims', payload => { expect(decodeJwt(token(payload))).toBeNull(); });
  it('decodes Unicode and detects expired real-format claims', () => { const t=token({sub:'user',email:'أحمد@example.com',roles:['PILGRIM'],exp:1}); expect(decodeJwt(t)?.email).toBe('أحمد@example.com'); expect(isTokenExpired(t)).toBe(true); });
});

import { canOpenRoute, type AccessSubject } from '../lib/workspace-access';
// Access is decided by the organization and the capabilities /auth/me returns, never by role names.
const platform = (permissions: string[]): AccessSubject => ({ permissions, tenantType: 'PLATFORM', tenantSlug: 'umrah-connect-platform', tenantStatus: 'ACTIVE', dashboardType: 'admin' });
const organization = (permissions: string[]): AccessSubject => ({ permissions, tenantType: 'OPERATOR', tenantSlug: 'al-haramain-ksa', tenantStatus: 'ACTIVE', dashboardType: 'operator' });
const PLATFORM_ROUTE_CAPABILITY: Record<string, string> = { '/admin-dashboard': 'platform:tenant:read', '/admin-tenants': 'platform:tenant:read', '/admin-tenants/record': 'platform:tenant:read', '/admin-roles': 'platform:role:manage', '/admin-support': 'platform:kyc:review' };
describe('frontend workspace boundary', () => {
  it.each(Object.keys(PLATFORM_ROUTE_CAPABILITY))('reserves %s for platform accounts holding its capability', route => { const cap = PLATFORM_ROUTE_CAPABILITY[route]; expect(canOpenRoute(organization([cap, 'crm:pilgrim:read']), route)).toBe(false); expect(canOpenRoute(platform([cap]), route)).toBe(true); expect(canOpenRoute(platform([]), route)).toBe(false); });
  it('retains operator operational routes', () => { expect(canOpenRoute(organization(['booking:booking:read']), '/bookings')).toBe(true); });
});

import { validPassword } from '../lib/password-policy';
import { bookingTransitions } from '../lib/booking-transitions';
describe('current backend acceptance contracts',()=>{
 it('rejects passwords the API rejects, including line breaks',()=>{expect(validPassword('Travel2026')).toBe(true);for(const value of ['short1','abcdefgh','12345678','Travel2026\n','a1'.repeat(65)])expect(validPassword(value)).toBe(false);});
 it('keeps captured/refunded states out of provider-controlled transitions',()=>{expect(bookingTransitions('PENDING')).toEqual(['CONFIRMED','CANCELLED']);expect(bookingTransitions('PAID')).toEqual(['COMPLETED']);for(const status of ['COMPLETED','CANCELLED','REFUNDED','unknown'])expect(bookingTransitions(status)).toEqual([]);});
 it('requires server-resolved permissions for operational and platform screens',()=>{expect(canOpenRoute(organization(['hotel:allotment:read']),'/pilgrims')).toBe(false);expect(canOpenRoute(organization(['crm:pilgrim:read']),'/pilgrims')).toBe(true);expect(canOpenRoute(platform([]),'/admin-tenants')).toBe(false);});
});

import { readFileSync } from 'fs';
import { join } from 'path';
describe('booking and budget-plan lifecycles mirror the server', () => {
  const API = join(__dirname, '..', '..', '..', 'platform', 'api', 'src', 'modules');
  const grab = (file: string, name: string) => {
    const src = readFileSync(file, 'utf8');
    const m = src.match(new RegExp(`${name}: Record<string, string\\[\\]> = \\{([\\s\\S]*?)\\};`));
    return m ? m[1].replace(/\s/g, '') : null;
  };
  it('operator booking status moves', () => {
    const web = grab(join(__dirname, '..', 'components/bookings/booking-detail.tsx'), 'BOOKING_STATUS_TRANSITIONS');
    expect(web).not.toBeNull();
    expect(web).toBe(grab(join(API, 'bookings/booking-money.ts'), 'BOOKING_STATUS_TRANSITIONS'));
    // Paid statuses are derived from payments, never offered as a manual move.
    const targets = [...web!.matchAll(/'([A-Z_]+)'/g)].map((m) => m[1]);
    expect(targets.length).toBeGreaterThan(0);
    expect(targets.filter((t) => ['PARTIALLY_PAID', 'FULLY_PAID', 'REFUNDED', 'CANCELLED'].includes(t))).toEqual([]);
  });
  it('budget plan status moves', () => {
    const web = grab(join(__dirname, '..', 'components/finance/budget-plans-view.tsx'), 'PLAN_TRANSITIONS');
    expect(web).not.toBeNull();
    expect(web).toBe(grab(join(API, 'finance/finance.service.ts'), 'PLAN_TRANSITIONS'));
  });
});

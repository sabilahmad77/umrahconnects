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

import { canOpenWorkspaceRoute } from '../lib/workspace-access';
describe('frontend workspace boundary', () => {
  it.each(['/admin-dashboard','/admin-tenants','/admin-tenants/record','/admin-roles','/admin-support'])('reserves %s for the existing Super Admin navigation role', route => { expect(canOpenWorkspaceRoute(route,['OPERATOR_ADMIN'])).toBe(false); expect(canOpenWorkspaceRoute(route,['SUPER_ADMIN'])).toBe(true); });
  it('retains operator operational routes', () => { expect(canOpenWorkspaceRoute('/bookings',['OPERATOR_ADMIN'])).toBe(true); });
});

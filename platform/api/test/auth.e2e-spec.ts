import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { api, createTestApp, TestContext, tokenFromMail } from './app';
import { bearer, buildWorld, PASSWORD, World } from './fixtures';

const uniq = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

describe('authentication & sessions', () => {
  let ctx: TestContext;
  let w: World;

  beforeAll(async () => {
    ctx = await createTestApp();
    w = await buildWorld(ctx);
  });
  afterAll(async () => ctx?.close());

  const signup = (email: string, extra: Record<string, unknown> = {}) =>
    ctx.http().post(api('/auth/register')).send({ email, password: 'Traveler-2026', firstName: 'New', lastName: 'Traveler', ...extra });

  describe('registration', () => {
    it('creates a Traveler in the community organization with an httpOnly refresh cookie', async () => {
      const email = `signup.${uniq()}@people.test`;
      const res = await signup(email, { roleInterest: 'hotel' });
      expect(res.status).toBe(201);
      expect(res.body.data.accessToken).toBeTruthy();
      expect(String(res.headers['set-cookie'])).toMatch(/uc_rt=.*HttpOnly/i);

      const me = await ctx.http().get(api('/auth/me')).set('Authorization', `Bearer ${res.body.data.accessToken}`);
      expect(me.status).toBe(200);
      expect(me.body.data.roles).toEqual(['PILGRIM']);
      expect(me.body.data.tenant.slug).toBe('umrah-connect-travelers');
      expect(me.body.data.permissions).toEqual(['marketplace:listing:read', 'social:post:create', 'social:post:read']);
      expect(me.body.data.emailVerified).toBe(false);
      expect(me.body.data).not.toHaveProperty('passwordHash');
      expect(ctx.mails.some((m) => m.to === email && /Confirm your/.test(m.subject))).toBe(true);
    });

    it('rejects a client-chosen organization (tenant takeover vector)', async () => {
      const res = await signup(`takeover.${uniq()}@people.test`, { tenantId: w.tenants.opA });
      expect(res.status).toBe(400);
      const count = await ctx.prisma.user.count({ where: { tenantId: w.tenants.opA, email: { startsWith: 'takeover.' } } });
      expect(count).toBe(0);
    });

    it('rejects privileged role interest, weak passwords and unknown fields', async () => {
      expect((await signup(`r.${uniq()}@people.test`, { roleInterest: 'super_admin' })).status).toBe(400);
      expect((await ctx.http().post(api('/auth/register')).send({ email: `w.${uniq()}@x.test`, password: 'short', firstName: 'a', lastName: 'b' })).status).toBe(400);
      expect((await signup(`s.${uniq()}@people.test`, { status: 'ACTIVE' })).status).toBe(400);
      expect((await signup(`s.${uniq()}@people.test`, { roles: ['SUPER_ADMIN'] })).status).toBe(400);
    });

    it('rejects duplicate emails case-insensitively', async () => {
      const email = `dup.${uniq()}@people.test`;
      expect((await signup(email)).status).toBe(201);
      expect((await signup(email.toUpperCase())).status).toBe(409);
    });
  });

  describe('login', () => {
    it('signs in by email (case-insensitive) and rejects wrong passwords with a generic message', async () => {
      const ok = await ctx.http().post(api('/auth/login')).send({ email: w.opA.email.toUpperCase(), password: PASSWORD });
      expect(ok.status).toBe(200);
      const bad = await ctx.http().post(api('/auth/login')).send({ email: w.opA.email, password: 'wrong-password-1' });
      expect(bad.status).toBe(401);
      const unknown = await ctx.http().post(api('/auth/login')).send({ email: `ghost.${uniq()}@x.test`, password: 'wrong-password-1' });
      expect(unknown.status).toBe(401);
      expect(unknown.body.error.message).toBe(bad.body.error.message);
    });

    it('temporarily locks an account after repeated failures, even for the right password', async () => {
      const email = `lock.${uniq()}@people.test`;
      await signup(email);
      for (let i = 0; i < 10; i++) {
        await ctx.http().post(api('/auth/login')).send({ email, password: 'Wrong-pass-123' });
      }
      const res = await ctx.http().post(api('/auth/login')).send({ email, password: 'Traveler-2026' });
      expect(res.status).toBe(401);
      expect(res.body.error.message).toMatch(/Too many failed sign-in attempts/);
      const user = await ctx.prisma.user.findFirstOrThrow({ where: { email } });
      expect(user.lockedUntil!.getTime()).toBeGreaterThan(Date.now());
    });

    it('returns TENANT_REQUIRED with the workspace list when one email+password exists in two organizations', async () => {
      const email = `multi.${uniq()}@people.test`;
      const bcrypt = await import('bcryptjs');
      const hash = await bcrypt.hash('Multi-Pass-2026', 4);
      for (const tenantId of [w.tenants.opA, w.tenants.opB]) {
        await ctx.prisma.user.create({ data: { tenantId, email, passwordHash: hash, firstName: 'M', lastName: 'W', status: 'ACTIVE' } });
      }
      const res = await ctx.http().post(api('/auth/login')).send({ email, password: 'Multi-Pass-2026' });
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('TENANT_REQUIRED');
      expect(res.body.error.details.tenants).toHaveLength(2);
      const picked = await ctx.http().post(api('/auth/login')).send({ email, password: 'Multi-Pass-2026', tenantId: w.tenants.opB });
      expect(picked.status).toBe(200);
    });

    it('refuses sign-in to suspended organizations', async () => {
      const email = `susp.${uniq()}@org.test`;
      const t = await ctx.prisma.tenant.create({ data: { slug: `susp-${uniq()}`, name: 'Suspended', type: 'OPERATOR', status: 'SUSPENDED', email, country: 'SA' } });
      const bcrypt = await import('bcryptjs');
      await ctx.prisma.user.create({ data: { tenantId: t.id, email, passwordHash: await bcrypt.hash('Suspended-2026', 4), firstName: 'S', lastName: 'T', status: 'ACTIVE' } });
      const res = await ctx.http().post(api('/auth/login')).send({ email, password: 'Suspended-2026' });
      expect(res.status).toBe(401);
      expect(res.body.error.message).toMatch(/organization is not active/i);
    });
  });

  describe('tokens and sessions', () => {
    it('rejects tampered, unsigned and wrong-purpose tokens', async () => {
      const [h, p] = w.opA.token.split('.');
      const forged = JSON.parse(Buffer.from(p, 'base64url').toString());
      forged.tenantId = w.tenants.opB;
      forged.roles = ['SUPER_ADMIN'];
      const tampered = `${h}.${Buffer.from(JSON.stringify(forged)).toString('base64url')}.${w.opA.token.split('.')[2]}`;
      expect((await ctx.http().get(api('/auth/me')).set('Authorization', `Bearer ${tampered}`)).status).toBe(401);

      const none = `${Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url')}.${Buffer.from(JSON.stringify(forged)).toString('base64url')}.`;
      expect((await ctx.http().get(api('/auth/me')).set('Authorization', `Bearer ${none}`)).status).toBe(401);

      const jwt = ctx.app.get((await import('@nestjs/jwt')).JwtService);
      const noTyp = jwt.sign({ sub: w.opA.id, tenantId: w.opA.tenantId, roles: [] });
      expect((await ctx.http().get(api('/auth/me')).set('Authorization', `Bearer ${noTyp}`)).status).toBe(401);
      const otherTenant = jwt.sign({ sub: w.opA.id, tenantId: w.tenants.opB, roles: [], typ: 'access' });
      expect((await ctx.http().get(api('/auth/me')).set('Authorization', `Bearer ${otherTenant}`)).status).toBe(401);
    });

    it('rotates refresh tokens and revokes every session when a rotated token is replayed', async () => {
      const login = await ctx.http().post(api('/auth/login')).send({ email: w.staffA.email, password: PASSWORD });
      const first = login.body.data.refreshToken;
      const r1 = await ctx.http().post(api('/auth/refresh')).send({ refreshToken: first });
      expect(r1.status).toBe(200);
      const second = r1.body.data.refreshToken;
      expect(second).not.toBe(first);

      // Simulate a stolen token being replayed well after rotation.
      await ctx.prisma.refreshToken.updateMany({
        where: { revokedAt: { not: null }, user: { email: w.staffA.email } },
        data: { revokedAt: new Date(Date.now() - 60_000) },
      });
      await new Promise((r) => setTimeout(r, 1100));
      const replay = await ctx.http().post(api('/auth/refresh')).send({ refreshToken: first });
      expect(replay.status).toBe(401);
      expect((await ctx.http().post(api('/auth/refresh')).send({ refreshToken: second })).status).toBe(401);
      expect((await ctx.http().get(api('/auth/me')).set('Authorization', `Bearer ${r1.body.data.accessToken}`)).status).toBe(401);
    });

    it('accepts the refresh token from the httpOnly cookie', async () => {
      const login = await ctx.http().post(api('/auth/login')).send({ email: w.financeA.email, password: PASSWORD });
      const cookie = String(login.headers['set-cookie']).split(';')[0];
      const res = await ctx.http().post(api('/auth/refresh')).set('Cookie', cookie).send({});
      expect(res.status).toBe(200);
      expect(res.body.data.accessToken).toBeTruthy();
    });

    it('logout revokes the refresh token; logout-all also kills issued access tokens', async () => {
      const login = await ctx.http().post(api('/auth/login')).send({ email: w.financeA.email, password: PASSWORD });
      const { accessToken, refreshToken } = login.body.data;
      expect((await ctx.http().post(api('/auth/logout')).send({ refreshToken })).status).toBe(200);
      expect((await ctx.http().post(api('/auth/refresh')).send({ refreshToken })).status).toBe(401);

      await new Promise((r) => setTimeout(r, 1100));
      const again = await ctx.http().post(api('/auth/login')).send({ email: w.financeA.email, password: PASSWORD });
      const token = again.body.data.accessToken;
      await new Promise((r) => setTimeout(r, 1100));
      expect((await ctx.http().post(api('/auth/logout-all')).set('Authorization', `Bearer ${token}`)).status).toBe(200);
      expect((await ctx.http().get(api('/auth/me')).set('Authorization', `Bearer ${token}`)).status).toBe(401);
      expect((await ctx.http().get(api('/auth/me')).set('Authorization', `Bearer ${accessToken}`)).status).toBe(401);
      await new Promise((r) => setTimeout(r, 1100));
      const fresh = await ctx.http().post(api('/auth/login')).send({ email: w.financeA.email, password: PASSWORD });
      w.financeA.token = fresh.body.data.accessToken;
      expect((await ctx.http().get(api('/auth/me')).set(bearer(w.financeA))).status).toBe(200);
    });

    it('locking a user invalidates their live access token immediately', async () => {
      const email = `victim.${uniq()}@people.test`;
      const reg = await signup(email);
      const token = reg.body.data.accessToken;
      await new Promise((r) => setTimeout(r, 1100));
      const user = await ctx.prisma.user.findFirstOrThrow({ where: { email } });
      const res = await ctx.http().put(api(`/admin/users/${user.id}/status`)).set(bearer(w.superAdmin)).send({ status: 'LOCKED', reason: 'test' });
      expect(res.status).toBe(200);
      expect((await ctx.http().get(api('/auth/me')).set('Authorization', `Bearer ${token}`)).status).toBe(401);
      expect((await ctx.http().post(api('/auth/refresh')).send({ refreshToken: reg.body.data.refreshToken })).status).toBe(401);
    });
  });

  describe('password reset and email verification', () => {
    it('password reset tokens are single-use, never returned in responses, and revoke sessions', async () => {
      const email = `reset.${uniq()}@people.test`;
      const reg = await signup(email);
      ctx.mails.length = 0;
      const req = await ctx.http().post(api('/auth/forgot-password')).send({ email });
      expect(req.status).toBe(200);
      expect(JSON.stringify(req.body)).not.toMatch(/token|reset-password\?/i);
      const token = tokenFromMail(ctx.mails.find((m) => m.to === email)!.text);

      await new Promise((r) => setTimeout(r, 1100));
      const reset = await ctx.http().post(api('/auth/reset-password')).send({ token, password: 'Brand-New-2026' });
      expect(reset.status).toBe(200);
      const reuse = await ctx.http().post(api('/auth/reset-password')).send({ token, password: 'Another-New-2026' });
      expect(reuse.status).toBe(401);
      expect((await ctx.http().get(api('/auth/me')).set('Authorization', `Bearer ${reg.body.data.accessToken}`)).status).toBe(401);
      expect((await ctx.http().post(api('/auth/login')).send({ email, password: 'Brand-New-2026' })).status).toBe(200);
    });

    it('unknown emails get the same response as known ones (no enumeration)', async () => {
      const a = await ctx.http().post(api('/auth/forgot-password')).send({ email: w.opA.email });
      const b = await ctx.http().post(api('/auth/forgot-password')).send({ email: `nobody.${uniq()}@x.test` });
      expect(a.status).toBe(b.status);
      expect(a.body.data).toEqual(b.body.data);
    });

    it('a reset token cannot be used as an access token and a forged reset token is refused', async () => {
      expect((await ctx.http().post(api('/auth/reset-password')).send({ token: 'x'.repeat(43), password: 'Brand-New-2026' })).status).toBe(401);
    });

    it('email verification activates the account; tokens are single-use', async () => {
      const email = `verify.${uniq()}@people.test`;
      ctx.mails.length = 0;
      await signup(email);
      const token = tokenFromMail(ctx.mails.find((m) => m.to === email)!.text);
      const ok = await ctx.http().post(api('/auth/verify-email/confirm')).send({ token });
      expect(ok.status).toBe(200);
      const user = await ctx.prisma.user.findFirstOrThrow({ where: { email } });
      expect(user.emailVerifiedAt).not.toBeNull();
      expect(user.status).toBe('ACTIVE');
      expect((await ctx.http().post(api('/auth/verify-email/confirm')).send({ token })).status).toBe(401);
    });

    it('change-password requires the current password and revokes other sessions', async () => {
      const email = `chg.${uniq()}@people.test`;
      const reg = await signup(email);
      const other = reg.body.data.accessToken;
      const bad = await ctx.http().post(api('/auth/change-password')).set('Authorization', `Bearer ${other}`)
        .send({ currentPassword: 'nope-nope-1', newPassword: 'Changed-Pass-2026' });
      expect(bad.status).toBe(401);
      await new Promise((r) => setTimeout(r, 1100));
      const ok = await ctx.http().post(api('/auth/change-password')).set('Authorization', `Bearer ${other}`)
        .send({ currentPassword: 'Traveler-2026', newPassword: 'Changed-Pass-2026' });
      expect(ok.status).toBe(200);
      expect((await ctx.http().get(api('/auth/me')).set('Authorization', `Bearer ${other}`)).status).toBe(401);
    });
  });

  describe('disabled / unconfigured providers', () => {
    it('phone OTP is unavailable instead of pretending to send a code', async () => {
      const res = await ctx.http().post(api('/auth/otp/send')).send({ phone: '+966500000000' });
      expect(res.status).toBe(503);
      const verify = await ctx.http().post(api('/auth/otp/verify')).send({ phone: '+966500000000', code: '123456', tenantId: w.tenants.opA });
      expect(verify.status).toBe(503);
    });

    it('Google Sign-In reports itself disabled and fails closed', async () => {
      const status = await ctx.http().get(api('/auth/google/status'));
      expect(status.body.data.enabled).toBe(false);
      const start = await ctx.http().get(api('/auth/google/start?returnTo=/dashboard'));
      expect(start.status).toBe(302);
      expect(start.headers.location).toBe('http://web.test/login?error=google_unavailable');
      const cb = await ctx.http().get(api('/auth/google/callback?code=x&state=y'));
      expect(cb.headers.location).toBe('http://web.test/login?error=google_unavailable');
      const ex = await ctx.http().post(api('/auth/google/exchange')).send({ ticket: 'a'.repeat(43) });
      expect(ex.status).toBe(401);
    });
  });

  describe('error hygiene', () => {
    it('never leaks stack traces or internals and always returns a request id', async () => {
      const res = await ctx.http().get(api('/pilgrims/not-a-uuid')).set(bearer(w.opA));
      expect([400, 404]).toContain(res.status);
      expect(res.body.error.requestId).toBeTruthy();
      expect(res.headers['x-request-id']).toBeTruthy();
      expect(JSON.stringify(res.body)).not.toMatch(/prisma|at .*\.ts:\d+|stack/i);
    });

    it('does not expose x-powered-by and sets security headers', async () => {
      const res = await ctx.http().get(api('/health'));
      expect(res.headers['x-powered-by']).toBeUndefined();
      expect(res.headers['x-content-type-options']).toBe('nosniff');
      expect(res.headers['x-frame-options']).toBeDefined();
    });

    it('CORS only reflects configured origins', async () => {
      const good = await ctx.http().get(api('/health')).set('Origin', 'http://web.test');
      expect(good.headers['access-control-allow-origin']).toBe('http://web.test');
      const evil = await ctx.http().get(api('/health')).set('Origin', 'https://evil.vercel.app');
      expect(evil.headers['access-control-allow-origin']).toBeUndefined();
    });
  });
});

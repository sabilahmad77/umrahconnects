import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { api, createTestApp, TestContext, tokenFromMail } from './app';
import { buildWorld } from './fixtures';
import { AuthService, PURPOSE } from '../src/modules/auth/auth.service';
import { RbacService } from '../src/modules/rbac/rbac.service';

const uniq = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

/** Email verification states, resend cooldown and account-settings actions (W14, W20). */
describe('account verification and settings actions', () => {
  let ctx: TestContext;
  let auth: AuthService;

  beforeAll(async () => {
    ctx = await createTestApp();
    await buildWorld(ctx);
    auth = ctx.app.get(AuthService);
  });
  afterAll(async () => ctx?.close());

  const register = async (email: string, password = 'Traveler-2026') => {
    const res = await ctx.http().post(api('/auth/register')).send({ email, password, firstName: 'Vera', lastName: 'Fication' });
    expect(res.status).toBe(201);
    return res.body.data.accessToken as string;
  };
  const latestMail = (email: string) => [...ctx.mails].reverse().find((m) => m.to === email)!;
  const confirm = (token: string) => ctx.http().post(api('/auth/verify-email/confirm')).send({ token });
  const requestVerification = (token: string) =>
    ctx.http().post(api('/auth/verify-email/request')).set('Authorization', `Bearer ${token}`).send({});
  /** Moves every verification email of this person one cooldown into the past. */
  const pastCooldown = async (email: string) => {
    const user = await ctx.prisma.user.findFirstOrThrow({ where: { email } });
    await ctx.prisma.otpCode.updateMany({ where: { userId: user.id, purpose: PURPOSE.VERIFY_EMAIL }, data: { createdAt: new Date(Date.now() - 61_000) } });
  };

  describe('email verification links', () => {
    it('distinguishes invalid, expired, replaced, confirmed and replayed links', async () => {
      const email = `states.${uniq()}@people.test`;
      const token = await register(email);
      const first = tokenFromMail(latestMail(email).text);

      const invalid = await confirm('z'.repeat(43));
      expect(invalid.status).toBe(401);
      expect(invalid.body.error.code).toBe('VERIFICATION_LINK_INVALID');

      // A newer link replaces the first one.
      await pastCooldown(email);
      expect((await requestVerification(token)).status).toBe(200);
      const second = tokenFromMail(latestMail(email).text);
      expect(second).not.toBe(first);
      const replaced = await confirm(first);
      expect(replaced.body.error.code).toBe('VERIFICATION_LINK_USED');
      expect(replaced.body.error.details).toEqual({ emailVerified: false });

      // An expired link says so (and is not consumed).
      const user = await ctx.prisma.user.findFirstOrThrow({ where: { email } });
      await ctx.prisma.otpCode.updateMany({ where: { userId: user.id, purpose: PURPOSE.VERIFY_EMAIL, usedAt: null }, data: { expiresAt: new Date(Date.now() - 1000) } });
      const expired = await confirm(second);
      expect(expired.status).toBe(401);
      expect(expired.body.error.code).toBe('VERIFICATION_LINK_EXPIRED');
      expect((await ctx.prisma.user.findUniqueOrThrow({ where: { id: user.id } })).emailVerifiedAt).toBeNull();

      // A fresh link confirms the email; the profile reflects it; replay is reported as used.
      await pastCooldown(email);
      expect((await requestVerification(token)).status).toBe(200);
      const third = tokenFromMail(latestMail(email).text);
      const ok = await confirm(third);
      expect(ok.status).toBe(200);
      expect(ok.body.data).toEqual({ message: 'Email confirmed.', emailVerified: true });
      const me = await ctx.http().get(api('/auth/me')).set('Authorization', `Bearer ${token}`);
      expect(me.body.data.emailVerified).toBe(true);
      const replay = await confirm(third);
      expect(replay.body.error).toMatchObject({ code: 'VERIFICATION_LINK_USED', details: { emailVerified: true } });
    });

    it('rate-limits resends per account with a machine-readable wait, and reports an already verified email', async () => {
      const email = `cooldown.${uniq()}@people.test`;
      const token = await register(email);
      const tooSoon = await requestVerification(token);
      expect(tooSoon.status).toBe(429);
      expect(tooSoon.body.error.code).toBe('VERIFICATION_COOLDOWN');
      expect(tooSoon.body.error.details.retryAfterSeconds).toBeGreaterThan(0);
      expect(tooSoon.body.error.details.retryAfterSeconds).toBeLessThanOrEqual(60);

      await pastCooldown(email);
      const sent = await requestVerification(token);
      expect(sent.status).toBe(200);
      expect(sent.body.data).toEqual({ delivered: true });

      await confirm(tokenFromMail(latestMail(email).text));
      const already = await requestVerification(token);
      expect(already.body.data).toEqual({ delivered: false, alreadyVerified: true });
    });
  });

  describe('change password', () => {
    it('reports wrong input with codes, then revokes every session including the current one', async () => {
      const email = `pw.${uniq()}@people.test`;
      const token = await register(email, 'Original-Pass-1');
      const change = (body: Record<string, string>, bearerToken = token) =>
        ctx.http().post(api('/auth/change-password')).set('Authorization', `Bearer ${bearerToken}`).send(body);

      const wrong = await change({ currentPassword: 'Not-The-One-1', newPassword: 'Changed-Pass-2' });
      expect(wrong.status).toBe(400);
      expect(wrong.body.error.code).toBe('CURRENT_PASSWORD_INCORRECT');
      const same = await change({ currentPassword: 'Original-Pass-1', newPassword: 'Original-Pass-1' });
      expect(same.body.error.code).toBe('PASSWORD_UNCHANGED');
      const weak = await change({ currentPassword: 'Original-Pass-1', newPassword: 'short' });
      expect(weak.status).toBe(400);

      await new Promise((r) => setTimeout(r, 1100));
      const ok = await change({ currentPassword: 'Original-Pass-1', newPassword: 'Changed-Pass-2' });
      expect(ok.status).toBe(200);
      expect(ok.body.data.sessionsRevoked).toBe(true);
      expect((await ctx.http().get(api('/auth/me')).set('Authorization', `Bearer ${token}`)).status).toBe(401);
      expect((await ctx.http().post(api('/auth/login')).send({ email, password: 'Original-Pass-1' })).status).toBe(401);
      expect((await ctx.http().post(api('/auth/login')).send({ email, password: 'Changed-Pass-2' })).status).toBe(200);
    });

    it('a Google-only account is told to set a password instead, and cannot be locked out by password guesses', async () => {
      const email = `gonly.${uniq()}@gmail.test`;
      const community = await auth.communityTenantId();
      const user = await ctx.prisma.user.create({
        data: { tenantId: community, email, firstName: 'Gia', lastName: 'Only', status: 'ACTIVE', emailVerifiedAt: new Date() },
      });
      await ctx.prisma.userIdentity.create({ data: { userId: user.id, provider: 'google', providerSubject: `sub-${uniq()}`, email, emailVerified: true } });
      await ctx.app.get(RbacService).grantSystemRole(user.id, 'PILGRIM');

      for (let i = 0; i < 12; i++) {
        expect((await ctx.http().post(api('/auth/login')).send({ email, password: `Guess-${i}-pass` })).status).toBe(401);
      }
      const after = await ctx.prisma.user.findUniqueOrThrow({ where: { id: user.id } });
      expect(after.failedLoginCount).toBe(0);
      expect(after.lockedUntil).toBeNull();

      // Google sign-in (ticket exchange) still works after the guesses.
      const session = await ctx.http().post(api('/auth/google/exchange')).send({ ticket: await auth.issueOAuthTicket(user.id) });
      expect(session.status).toBe(200);
      const res = await ctx.http().post(api('/auth/change-password')).set('Authorization', `Bearer ${session.body.data.accessToken}`)
        .send({ currentPassword: 'anything-1', newPassword: 'Brand-New-Pass-1' });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('PASSWORD_NOT_SET');

      // The supported path: a set-password link by email, worded for an account without a password.
      ctx.mails.length = 0;
      expect((await ctx.http().post(api('/auth/forgot-password')).send({ email })).status).toBe(200);
      const mail = latestMail(email);
      expect(mail.subject).toBe('Set a password for your Umrah Connect account');
      const reset = await ctx.http().post(api('/auth/reset-password')).send({ token: tokenFromMail(mail.text), password: 'Brand-New-Pass-1' });
      expect(reset.status).toBe(200);
      expect((await ctx.http().post(api('/auth/login')).send({ email, password: 'Brand-New-Pass-1' })).status).toBe(200);
    });

    it('an expired reset link says so', async () => {
      const email = `expired.${uniq()}@people.test`;
      await register(email);
      ctx.mails.length = 0;
      await ctx.http().post(api('/auth/forgot-password')).send({ email });
      const token = tokenFromMail(latestMail(email).text);
      const user = await ctx.prisma.user.findFirstOrThrow({ where: { email } });
      await ctx.prisma.otpCode.updateMany({ where: { userId: user.id, purpose: PURPOSE.RESET, usedAt: null }, data: { expiresAt: new Date(Date.now() - 1000) } });
      const res = await ctx.http().post(api('/auth/reset-password')).send({ token, password: 'Brand-New-Pass-1' });
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('RESET_LINK_EXPIRED');
    });
  });
});

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

vi.hoisted(() => {
  process.env.GOOGLE_CLIENT_ID = 'test-client.apps.googleusercontent.com';
  process.env.GOOGLE_CLIENT_SECRET = 'test-client-secret';
  process.env.GOOGLE_REDIRECT_URI = 'http://web.test/proxy-api/auth/google/callback';
});

import * as bcrypt from 'bcryptjs';
import { api, createTestApp, TestContext } from './app';
import { bearer, buildWorld, World } from './fixtures';
import { GoogleAuthService, GoogleProfile, GoogleSignInError } from '../src/modules/auth/google.service';

const uniq = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

/**
 * Google Sign-In end to end. Only Google's token endpoint is replaced (the
 * `verifyCode` step); state, PKCE, cookies, account resolution, linking rules,
 * ticket exchange and session issuance run for real.
 */
describe('Google Sign-In (provider token exchange stubbed)', () => {
  let ctx: TestContext;
  let w: World;
  let google: GoogleAuthService;
  let nextProfile: GoogleProfile | Error;
  let lastVerifier: string | undefined;

  beforeAll(async () => {
    ctx = await createTestApp();
    w = await buildWorld(ctx);
    google = ctx.app.get(GoogleAuthService);
    vi.spyOn(google, 'verifyCode').mockImplementation(async (_code: string, verifier: string) => {
      lastVerifier = verifier;
      if (nextProfile instanceof Error) throw nextProfile;
      return nextProfile;
    });
  });
  afterAll(async () => ctx?.close());

  /** Runs start → callback and returns the redirect target. */
  const signIn = async (profile: GoogleProfile | Error, opts: { returnTo?: string; intent?: string; tamperState?: boolean; dropCookie?: boolean } = {}) => {
    nextProfile = profile;
    const qs = new URLSearchParams({ returnTo: opts.returnTo ?? '/dashboard', ...(opts.intent ? { intent: opts.intent } : {}) });
    const start = await ctx.http().get(api(`/auth/google/start?${qs}`));
    expect(start.status).toBe(302);
    const location = new URL(start.headers.location);
    if (location.hostname !== 'accounts.google.com') return { start, location };
    const cookie = String(start.headers['set-cookie']).split(';')[0];
    const state = opts.tamperState ? 'forged-state' : location.searchParams.get('state')!;
    let cb = ctx.http().get(api(`/auth/google/callback?code=auth-code&state=${encodeURIComponent(state)}`));
    if (!opts.dropCookie) cb = cb.set('Cookie', cookie);
    const res = await cb;
    expect(res.status).toBe(302);
    return { start, location, callback: new URL(res.headers.location), cookie };
  };

  const exchange = async (callback: URL) => {
    const params = new URLSearchParams(callback.hash.slice(1));
    return ctx.http().post(api('/auth/google/exchange')).send({ ticket: params.get('ticket') });
  };

  it('start redirects to Google with PKCE (S256), state, nonce and a httpOnly state cookie', async () => {
    const { start, location } = await signIn({ sub: 'x', emailVerified: true });
    expect(location.origin).toBe('https://accounts.google.com');
    expect(location.searchParams.get('client_id')).toBe('test-client.apps.googleusercontent.com');
    expect(location.searchParams.get('redirect_uri')).toBe('http://web.test/proxy-api/auth/google/callback');
    expect(location.searchParams.get('code_challenge_method')).toBe('S256');
    expect(location.searchParams.get('code_challenge')).toMatch(/^[\w-]{43}$/);
    expect(location.searchParams.get('scope')).toBe('openid email profile');
    expect(location.searchParams.get('nonce')).toBeTruthy();
    expect(start.headers.location).not.toContain('test-client-secret');
    expect(String(start.headers['set-cookie'])).toMatch(/uc_g_state=.*HttpOnly/i);
  });

  it('a new verified Google user becomes a Traveler; the ticket is single-use and not in the query string', async () => {
    const email = `g.new.${uniq()}@gmail.test`;
    const { callback } = await signIn({ sub: `sub-${uniq()}`, email, emailVerified: true, givenName: 'Gina', familyName: 'Google' }, { returnTo: '/marketplace' });
    expect(callback.origin + callback.pathname).toBe('http://web.test/auth/callback');
    expect(callback.search).toBe('');
    expect(new URLSearchParams(callback.hash.slice(1)).get('returnTo')).toBe('/marketplace');
    expect(new URLSearchParams(callback.hash.slice(1)).get('outcome')).toBe('created');
    expect(lastVerifier).toMatch(/^[\w-]{64}$/);

    const res = await exchange(callback);
    expect(res.status).toBe(200);
    const me = await ctx.http().get(api('/auth/me')).set('Authorization', `Bearer ${res.body.data.accessToken}`);
    expect(me.body.data.roles).toEqual(['PILGRIM']);
    expect(me.body.data.emailVerified).toBe(true);
    expect(me.body.data.hasPassword).toBe(false);
    expect(me.body.data.identities.map((i: any) => i.provider)).toEqual(['google']);
    expect((await exchange(callback)).status).toBe(401);
  });

  it('the same Google account signs in to the same user next time', async () => {
    const sub = `sub-${uniq()}`;
    const email = `g.repeat.${uniq()}@gmail.test`;
    const first = await exchange((await signIn({ sub, email, emailVerified: true })).callback!);
    const second = await exchange((await signIn({ sub, email: `changed.${email}`, emailVerified: true })).callback!);
    const id = async (t: string) => (await ctx.http().get(api('/auth/me')).set('Authorization', `Bearer ${t}`)).body.data.sub;
    expect(await id(second.body.data.accessToken)).toBe(await id(first.body.data.accessToken));
  });

  it('links to an existing verified account without touching its password', async () => {
    const { callback } = await signIn({ sub: `sub-${uniq()}`, email: w.opA.email, emailVerified: true });
    expect(new URLSearchParams(callback!.hash.slice(1)).get('outcome')).toBe('linked');
    const res = await exchange(callback!);
    expect(res.status).toBe(200);
    const me = await ctx.http().get(api('/auth/me')).set('Authorization', `Bearer ${res.body.data.accessToken}`);
    expect(me.body.data.sub).toBe(w.opA.id);
    expect(me.body.data.roles).toContain('OPERATOR_ADMIN');
    expect(me.body.data.hasPassword).toBe(true);
  });

  it('pre-registered unverified accounts lose their password and sessions when the real owner signs in (anti pre-hijack)', async () => {
    const email = `victim.${uniq()}@gmail.test`;
    const reg = await ctx.http().post(api('/auth/register')).send({ email, password: 'Attacker-Pass-1', firstName: 'Evil', lastName: 'Twin' });
    const attackerToken = reg.body.data.accessToken;
    await new Promise((r) => setTimeout(r, 1100));
    const { callback } = await signIn({ sub: `sub-${uniq()}`, email, emailVerified: true });
    // The web tells the person their unverified account's password was removed.
    expect(new URLSearchParams(callback!.hash.slice(1)).get('outcome')).toBe('linked_password_removed');
    const res = await exchange(callback!);
    expect(res.status).toBe(200);
    expect((await ctx.http().post(api('/auth/login')).send({ email, password: 'Attacker-Pass-1' })).status).toBe(401);
    expect((await ctx.http().get(api('/auth/me')).set('Authorization', `Bearer ${attackerToken}`)).status).toBe(401);
    expect((await ctx.http().post(api('/auth/refresh')).send({ refreshToken: reg.body.data.refreshToken })).status).toBe(401);
  });

  it('refuses unverified Google emails, ambiguous accounts, platform accounts and disabled accounts', async () => {
    const unverified = await signIn({ sub: `sub-${uniq()}`, email: `u.${uniq()}@gmail.test`, emailVerified: false });
    expect(unverified.callback!.href).toBe('http://web.test/login?error=google_email_unverified');

    const email = `dup.${uniq()}@gmail.test`;
    const hash = await bcrypt.hash('Duplicate-2026', 4);
    for (const tenantId of [w.tenants.opA, w.tenants.opB]) {
      await ctx.prisma.user.create({ data: { tenantId, email, passwordHash: hash, firstName: 'D', lastName: 'U', status: 'ACTIVE', emailVerifiedAt: new Date() } });
    }
    expect((await signIn({ sub: `sub-${uniq()}`, email, emailVerified: true })).callback!.href).toBe('http://web.test/login?error=google_account_ambiguous');

    expect((await signIn({ sub: `sub-${uniq()}`, email: w.superAdmin.email, emailVerified: true })).callback!.href)
      .toBe('http://web.test/login?error=google_privileged_account');

    const locked = `locked.${uniq()}@gmail.test`;
    await ctx.prisma.user.create({ data: { tenantId: w.tenants.community, email: locked, firstName: 'L', lastName: 'K', status: 'LOCKED' } });
    expect((await signIn({ sub: `sub-${uniq()}`, email: locked, emailVerified: true })).callback!.href).toBe('http://web.test/login?error=google_account_disabled');

    const count = await ctx.prisma.userIdentity.count({ where: { email: { in: [email, w.superAdmin.email, locked] } } });
    expect(count).toBe(0);
  });

  it('rejects forged state, a missing state cookie, provider errors and open redirects', async () => {
    const profile = { sub: `sub-${uniq()}`, email: `s.${uniq()}@gmail.test`, emailVerified: true };
    expect((await signIn(profile, { tamperState: true })).callback!.href).toBe('http://web.test/login?error=google_state');
    expect((await signIn(profile, { dropCookie: true })).callback!.href).toBe('http://web.test/login?error=google_state');
    expect((await signIn(new GoogleSignInError('google_failed'))).callback!.href).toBe('http://web.test/login?error=google_failed');
    // Cancelling on Google's screen is not a failure; other provider errors are.
    const denied = await ctx.http().get(api('/auth/google/callback?error=access_denied&state=x'));
    expect(denied.headers.location).toBe('http://web.test/login?error=google_cancelled');
    const broken = await ctx.http().get(api('/auth/google/callback?error=server_error&state=x'));
    expect(broken.headers.location).toBe('http://web.test/login?error=google_failed');

    for (const evil of ['https://evil.test/x', '//evil.test', '/\\evil.test', 'javascript:alert(1)']) {
      const { callback } = await signIn({ ...profile, sub: `sub-${uniq()}` }, { returnTo: evil });
      // No destination is forced: the web sends the account to its own workspace.
      expect(new URLSearchParams(callback!.hash.slice(1)).get('returnTo')).toBeNull();
    }
  });

  it('explicit linking from a signed-in session; a Google account cannot be linked twice', async () => {
    const sub = `sub-${uniq()}`;
    const intent = await ctx.http().post(api('/auth/google/link-intent')).set(bearer(w.hotelA));
    expect(intent.status).toBe(200);
    const linked = await signIn({ sub, email: `other.${uniq()}@gmail.test`, emailVerified: true }, { intent: intent.body.data.intent });
    expect(linked.callback!.href).toBe('http://web.test/settings?linked=google');
    expect(await ctx.prisma.userIdentity.count({ where: { userId: w.hotelA.id, providerSubject: sub } })).toBe(1);

    const again = await ctx.http().post(api('/auth/google/link-intent')).set(bearer(w.transportA));
    const stolen = await signIn({ sub, email: `other.${uniq()}@gmail.test`, emailVerified: true }, { intent: again.body.data.intent });
    // Linking failures return to account settings, where the signed-in person started.
    expect(stolen.callback!.href).toBe('http://web.test/settings?linkError=google_already_linked');

    const reused = await ctx.http().get(api(`/auth/google/start?intent=${intent.body.data.intent}`));
    expect(reused.headers.location).toBe('http://web.test/settings?linkError=google_state');

    const platform = await ctx.http().post(api('/auth/google/link-intent')).set(bearer(w.superAdmin));
    expect(platform.status).toBe(403);
    expect(platform.body.error.code).toBe('GOOGLE_NOT_ALLOWED');
  });
});

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const REDIRECT_URI = 'http://web.test/proxy-api/auth/google/callback';
vi.hoisted(() => {
  process.env.GOOGLE_CLIENT_ID = 'stub-client.apps.googleusercontent.test';
  process.env.GOOGLE_CLIENT_SECRET = 'stub-client-secret-not-real';
  process.env.GOOGLE_REDIRECT_URI = 'http://web.test/proxy-api/auth/google/callback';
});

import { api, createTestApp, TestContext } from './app';
import { bearer, buildWorld, World } from './fixtures';
import { startGoogleOidcStub } from './support/google-oidc-stub.mjs';

const uniq = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

/**
 * Google Sign-In against a LOCAL STUB OpenID provider — stubbed Google, not a
 * real Google login. Unlike google.e2e-spec.ts nothing inside the API is
 * mocked: the real google-auth-library client performs the code exchange
 * (PKCE verifier, client secret, redirect URI) and verifies the ID token's
 * RS256 signature, audience, issuer, expiry and nonce. Only the provider's
 * URLs differ, via GOOGLE_OIDC_STUB_URL (ignored in production).
 */
describe('Google Sign-In end to end against a local OIDC stub (stubbed Google — not a real Google login)', () => {
  let ctx: TestContext;
  let w: World;
  let stub: Awaited<ReturnType<typeof startGoogleOidcStub>>;

  beforeAll(async () => {
    stub = await startGoogleOidcStub({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      redirectUris: [REDIRECT_URI],
    });
    process.env.GOOGLE_OIDC_STUB_URL = stub.issuer;
    ctx = await createTestApp();
    w = await buildWorld(ctx);
  });
  afterAll(async () => {
    await ctx?.close();
    await stub?.close();
    delete process.env.GOOGLE_OIDC_STUB_URL;
  });

  interface Person {
    email: string;
    verified?: boolean;
    givenName?: string;
  }

  /** start (API) → consent page (stub) → decision (stub) → callback (API); returns the web redirect. */
  const signIn = async (person: Person, opts: { decision?: 'allow' | 'deny'; returnTo?: string; intent?: string } = {}) => {
    const qs = new URLSearchParams({ ...(opts.returnTo ? { returnTo: opts.returnTo } : {}), ...(opts.intent ? { intent: opts.intent } : {}) });
    const start = await ctx.http().get(api(`/auth/google/start?${qs}`));
    expect(start.status).toBe(302);
    const authorize = new URL(start.headers.location);
    expect(authorize.origin).toBe(stub.issuer);
    const cookie = String(start.headers['set-cookie']).split(';')[0];

    const consent = await fetch(authorize);
    expect(consent.status).toBe(200);
    expect(await consent.text()).toContain('Stubbed Google — not a real Google login');

    const form = new URLSearchParams(authorize.searchParams);
    form.set('email', person.email);
    form.set('given_name', person.givenName ?? 'Stub');
    form.set('family_name', 'Traveler');
    if (person.verified !== false) form.set('email_verified', 'true');
    form.set('decision', opts.decision ?? 'allow');
    const decided = await fetch(`${stub.issuer}/o/oauth2/v2/auth/decision`, { method: 'POST', body: form, redirect: 'manual' });
    expect(decided.status).toBe(302);
    const back = new URL(decided.headers.get('location')!);
    expect(back.origin + back.pathname).toBe(REDIRECT_URI);

    const callback = await ctx.http().get(api(`/auth/google/callback${back.search}`)).set('Cookie', cookie);
    expect(callback.status).toBe(302);
    return { redirect: new URL(callback.headers.location), back, cookie };
  };

  const exchange = (redirect: URL) =>
    ctx.http().post(api('/auth/google/exchange')).send({ ticket: new URLSearchParams(redirect.hash.slice(1)).get('ticket') });

  it('reports stub mode so the sign-in page can label it', async () => {
    const status = await ctx.http().get(api('/auth/google/status'));
    expect(status.body.data).toEqual({ enabled: true, mode: 'local-stub' });
  });

  it('a new person signs in: PKCE and client secret checked by the provider, ID token verified by the API, Traveler created', async () => {
    const email = `oidc.new.${uniq()}@gmail.test`;
    const { redirect } = await signIn({ email, givenName: 'Nadia' }, { returnTo: '/marketplace' });
    expect(redirect.origin + redirect.pathname).toBe('http://web.test/auth/callback');
    expect(redirect.search).toBe('');
    const fragment = new URLSearchParams(redirect.hash.slice(1));
    expect(fragment.get('returnTo')).toBe('/marketplace');
    expect(fragment.get('outcome')).toBe('created');

    const request = stub.control.tokenRequests.at(-1)!;
    expect(request).toMatchObject({ grantType: 'authorization_code', clientSecretSent: true, redirectUri: REDIRECT_URI, verifierMatchesChallenge: true });

    const session = await exchange(redirect);
    expect(session.status).toBe(200);
    const me = await ctx.http().get(api('/auth/me')).set('Authorization', `Bearer ${session.body.data.accessToken}`);
    expect(me.body.data).toMatchObject({ email, firstName: 'Nadia', roles: ['PILGRIM'], emailVerified: true, hasPassword: false });
    expect(me.body.data.identities.map((i: { provider: string }) => i.provider)).toEqual(['google']);

    // The same Google subject signs in to the same account, as an ordinary sign-in.
    const again = await signIn({ email, givenName: 'Nadia' });
    expect(new URLSearchParams(again.redirect.hash.slice(1)).get('outcome')).toBeNull();
    const second = await exchange(again.redirect);
    const me2 = await ctx.http().get(api('/auth/me')).set('Authorization', `Bearer ${second.body.data.accessToken}`);
    expect(me2.body.data.id).toBe(me.body.data.id);
  });

  it('cancelling at the provider returns a clear cancelled state for sign-in and for linking', async () => {
    const { redirect } = await signIn({ email: `oidc.cancel.${uniq()}@gmail.test` }, { decision: 'deny' });
    expect(redirect.href).toBe('http://web.test/login?error=google_cancelled');

    const intent = await ctx.http().post(api('/auth/google/link-intent')).set(bearer(w.travelerA));
    const linking = await signIn({ email: `oidc.cancel.${uniq()}@gmail.test` }, { decision: 'deny', intent: intent.body.data.intent });
    expect(linking.redirect.href).toBe('http://web.test/settings?linkError=google_cancelled');
    expect(await ctx.prisma.userIdentity.count({ where: { userId: w.travelerA.id } })).toBe(0);
  });

  it.each([
    ['a wrong nonce', { nonce: 'replayed-nonce' }],
    ['another client as audience', { aud: 'someone-else.apps.googleusercontent.com' }],
    ['a foreign issuer', { iss: 'https://accounts.evil.test' }],
    ['an expired token', { iat: Math.floor(Date.now() / 1000) - 7200, exp: Math.floor(Date.now() / 1000) - 3600 }],
    ['a signature from an unknown key', { foreignKey: true }],
  ])('rejects an ID token with %s and creates nothing', async (_label, override) => {
    const email = `oidc.tamper.${uniq()}@gmail.test`;
    stub.control.nextIdToken = override;
    const { redirect } = await signIn({ email });
    expect(redirect.href).toBe('http://web.test/login?error=google_failed');
    expect(await ctx.prisma.user.count({ where: { email } })).toBe(0);
  });

  it('an authorization code works once: a replayed callback is refused by the provider', async () => {
    const email = `oidc.replay.${uniq()}@gmail.test`;
    const first = await signIn({ email });
    expect(first.redirect.pathname).toBe('/auth/callback');
    const replay = await ctx.http().get(api(`/auth/google/callback${first.back.search}`)).set('Cookie', first.cookie);
    expect(replay.headers.location).toBe('http://web.test/login?error=google_failed');
  });

  it('the provider refuses a PKCE verifier that does not match the challenge (harness sanity check)', async () => {
    const start = await ctx.http().get(api('/auth/google/start'));
    const authorize = new URL(start.headers.location);
    const form = new URLSearchParams(authorize.searchParams);
    form.set('email', `oidc.pkce.${uniq()}@gmail.test`);
    form.set('email_verified', 'true');
    form.set('decision', 'allow');
    const decided = await fetch(`${stub.issuer}/o/oauth2/v2/auth/decision`, { method: 'POST', body: form, redirect: 'manual' });
    const code = new URL(decided.headers.get('location')!).searchParams.get('code')!;
    const token = await fetch(`${stub.issuer}/token`, {
      method: 'POST',
      body: new URLSearchParams({
        grant_type: 'authorization_code', code, redirect_uri: REDIRECT_URI, code_verifier: 'x'.repeat(64),
        client_id: process.env.GOOGLE_CLIENT_ID!, client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      }),
    });
    expect(token.status).toBe(400);
    expect((await token.json()).error).toBe('invalid_grant');
  });

  it('refuses an unverified provider email with a specific code', async () => {
    const { redirect } = await signIn({ email: `oidc.unverified.${uniq()}@gmail.test`, verified: false });
    expect(redirect.href).toBe('http://web.test/login?error=google_email_unverified');
  });

  it('links Google from account settings and reports it there', async () => {
    const intent = await ctx.http().post(api('/auth/google/link-intent')).set(bearer(w.transportA));
    expect(intent.status).toBe(200);
    const { redirect } = await signIn({ email: `oidc.link.${uniq()}@gmail.test` }, { intent: intent.body.data.intent });
    expect(redirect.href).toBe('http://web.test/settings?linked=google');
    const me = await ctx.http().get(api('/auth/me')).set(bearer(w.transportA));
    expect(me.body.data.identities.map((i: { provider: string }) => i.provider)).toEqual(['google']);
  });
});

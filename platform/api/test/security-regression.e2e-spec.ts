import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as bcrypt from 'bcryptjs';
import { JwtService } from '@nestjs/jwt';
import { api, createTestApp, TestContext } from './app';
import { Actor, bearer, buildWorld, World } from './fixtures';
import { AccessPolicyCheck, RoutePolicy } from '../src/modules/rbac/access-policy.check';
import { RbacService } from '../src/modules/rbac/rbac.service';

/**
 * A08 security regressions, written as sweeps over the real route inventory so a
 * new route is covered the day it is added:
 *  - every platform-capability route refuses every organization identity and anonymous callers;
 *  - same-second session revocation on every revocation path;
 *  - no response of any GET route (for every identity) carries a password hash,
 *    MFA secret, token hash or one-time code — including routes that embed other
 *    users (social, groups, connections, conversations, requests);
 *  - signed download URLs: expired, wrong purpose, foreign secret, used as a bearer token.
 */

const uniq = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
const PDF = Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.alloc(128, 0x20)]);
type Method = 'get' | 'post' | 'put' | 'patch' | 'delete';

// Column names (camelCase and database spelling) and relations that hold secrets.
const SECRET_KEYS = new Set([
  'passwordHash', 'password_hash', 'password', 'mfaSecret', 'mfa_secret', 'tokenHash', 'token_hash',
  'codeHash', 'code_hash', 'refreshTokens', 'refresh_tokens', 'otpCodes', 'otp_codes', 'providerSubject',
]);
const BCRYPT = /\$2[aby]?\$\d{2}\$[./A-Za-z0-9]{20,}/;
const MFA_SECRET = 'JBSWY3DPEHPK3PXA08SWEEP';

function leaks(value: unknown, path = '$'): string[] {
  if (Array.isArray(value)) return value.flatMap((v, i) => leaks(v, `${path}[${i}]`));
  if (value && typeof value === 'object') {
    return Object.entries(value).flatMap(([k, v]) => [...(SECRET_KEYS.has(k) ? [`${path}.${k}`] : []), ...leaks(v, `${path}.${k}`)]);
  }
  if (typeof value === 'string' && (BCRYPT.test(value) || value.includes(MFA_SECRET))) return [`${path} (secret value)`];
  return [];
}

describe('A08 security regressions (sweeps over the route inventory)', () => {
  let ctx: TestContext;
  let w: World;
  let routes: RoutePolicy[];

  const call = (token: string | undefined, method: Method, path: string, body?: object) => {
    const req = ctx.http()[method](api(path));
    if (token) req.set('Authorization', `Bearer ${token}`);
    return body !== undefined ? req.send(body) : req;
  };
  const ok = async (a: Actor, method: Method, path: string, body?: object) => {
    const res = await call(a.token, method, path, body);
    if (res.status >= 300) throw new Error(`${a.email} ${method} ${path} → ${res.status} ${JSON.stringify(res.body)}`);
    return res.body?.data ?? res.body;
  };
  /** Starts at the beginning of a wall-clock second, so the next few requests share it (JWT `iat` has 1 s resolution). */
  const alignToSecond = async () => {
    while (Date.now() % 1000 > 150) await new Promise((r) => setTimeout(r, 5));
  };
  const login = async (email: string, password: string) => {
    const res = await ctx.http().post(api('/auth/login')).send({ email, password });
    expect(res.status, `login ${email}`).toBe(200);
    return res.body.data.accessToken as string;
  };
  const makeUser = async (tenantId: string, email: string, role: Parameters<RbacService['grantSystemRole']>[1], password: string) => {
    const u = await ctx.prisma.user.create({
      data: {
        tenantId, email, passwordHash: await bcrypt.hash(password, 4), mfaSecret: MFA_SECRET, mfaEnabled: true,
        firstName: 'Sweep', lastName: 'Probe', status: 'ACTIVE', emailVerifiedAt: new Date(),
      },
    });
    await ctx.app.get(RbacService).grantSystemRole(u.id, role);
    return { id: u.id, email, tenantId, token: await login(email, password), refreshToken: '' } as Actor;
  };

  beforeAll(async () => {
    ctx = await createTestApp();
    w = await buildWorld(ctx);
    routes = ctx.app.get(AccessPolicyCheck).inventory();
  });
  afterAll(async () => ctx?.close());

  // ── vertical access ───────────────────────────────────────────────────────
  it('every route that needs a platform capability refuses every organization identity (403) and anonymous callers (401)', async () => {
    const platformRoutes = routes.filter((r) => r.permissions.some((p) => p.startsWith('platform:')));
    expect(platformRoutes.length).toBeGreaterThan(25);
    const identities = [w.opA, w.staffA, w.financeA, w.hotelA, w.transportA, w.visaA, w.travelerA];
    for (const r of platformRoutes) {
      const path = r.path.replace(/:[A-Za-z]+/g, '00000000-0000-4000-8000-000000000000');
      const method = r.method.toLowerCase() as Method;
      const anon = await call(undefined, method, path, method === 'get' ? undefined : {});
      expect(anon.status, `anonymous ${r.method} ${r.path}`).toBe(401);
      for (const a of identities) {
        const res = await call(a.token, method, path, method === 'get' ? undefined : {});
        expect(res.status, `${a.email} ${r.method} ${r.path}`).toBe(403);
      }
    }
  });

  // ── session revocation in the same second ───────────────────────────────────
  describe('session revocation takes effect for tokens minted in the same second', () => {
    it('change-password: another session opened in the same second is refused at once; the new sign-in works', async () => {
      const email = `samesec.pw.${uniq()}@people.test`;
      const probe = await makeUser(w.tenants.opA, email, 'OPERATOR_STAFF', 'Same-Second-2026a');
      await alignToSecond();
      const other = await login(email, 'Same-Second-2026a');
      const res = await call(probe.token, 'post', '/auth/change-password', { currentPassword: 'Same-Second-2026a', newPassword: 'Same-Second-2026b' });
      expect(res.status).toBe(200);
      expect((await call(other, 'get', '/auth/me')).status).toBe(401);
      expect((await call(await login(email, 'Same-Second-2026b'), 'get', '/auth/me')).status).toBe(200);
    });

    it('admin lock: a token minted in the same second is refused at once', async () => {
      const email = `samesec.lock.${uniq()}@people.test`;
      await makeUser(w.tenants.opA, email, 'OPERATOR_STAFF', 'Same-Second-2026c');
      const user = await ctx.prisma.user.findFirstOrThrow({ where: { email } });
      await alignToSecond();
      const token = await login(email, 'Same-Second-2026c');
      expect((await call(w.superAdmin.token, 'put', `/admin/users/${user.id}/status`, { status: 'LOCKED', reason: 'same-second' })).status).toBe(200);
      expect((await call(token, 'get', '/auth/me')).status).toBe(401);
    });

    // KNOWN DEFECT (A08 report, D-A08-1): AdminService.revocationInstant() rounds DOWN to the
    // second, while JWT `iat` also rounds down — a token minted earlier in the same second as an
    // admin force-logout is not "older than" the cut-off and stays valid for its 15-minute life.
    // AuthService.revocationInstant() (logout-all, password change/reset) already rounds UP.
    // Fix (A03, modules/admin/admin.service.ts): round up, as AuthService does. Then turn the
    // `it.fails` below into `it` — it starts failing as a reminder the moment the fix lands.
    let afterForceLogout = 0;
    it('admin force-logout: the same-second scenario runs (setup for the pinned defect below)', async () => {
      const email = `samesec.force.${uniq()}@people.test`;
      await makeUser(w.tenants.opA, email, 'OPERATOR_STAFF', 'Same-Second-2026d');
      const user = await ctx.prisma.user.findFirstOrThrow({ where: { email } });
      await alignToSecond();
      const token = await login(email, 'Same-Second-2026d');
      const forced = await call(w.superAdmin.token, 'post', `/admin/users/${user.id}/force-logout`, {});
      expect(forced.status).toBeLessThan(300);
      afterForceLogout = (await call(token, 'get', '/auth/me')).status;
      expect([200, 401]).toContain(afterForceLogout);
    });
    it.fails('admin force-logout: a token minted in the same second is refused at once (KNOWN DEFECT D-A08-1)', () => {
      expect(afterForceLogout).toBe(401);
    });
  });

  // ── credentials never leave the API ─────────────────────────────────────────
  describe('no GET route returns credentials, for any identity', () => {
    let probeOperator: Actor;
    let probeTraveler: Actor;
    let candidates: string[];

    beforeAll(async () => {
      probeOperator = await makeUser(w.tenants.opA, `sweep.op.${uniq()}@op-a.test`, 'OPERATOR_STAFF', 'Sweep-Probe-2026x');
      probeTraveler = await makeUser(w.tenants.community, `sweep.tr.${uniq()}@people.test`, 'PILGRIM', 'Sweep-Probe-2026y');
      // Put the probes where other users' rows are embedded: feed, comments, follows,
      // connections, conversations, groups, marketplace requests, audit trails.
      const post = await ok(probeTraveler, 'post', '/social/posts', { type: 'UPDATE', content: `sweep ${uniq()}` });
      await ok(w.travelerA, 'post', `/social/posts/${post.id}/comments`, { content: 'hello' });
      await ok(probeTraveler, 'post', `/social/posts/${post.id}/comments`, { content: 'reply from the probe' });
      const account = await ok(w.travelerA, 'get', '/social/accounts/me');
      await ok(probeTraveler, 'post', `/social/accounts/${account.id}/follow`);
      await call(probeTraveler.token, 'post', '/connections/request', { recipientId: w.travelerA.id });
      const conv = await ok(probeTraveler, 'post', '/social/conversations/open', { recipientUserId: w.travelerA.id });
      await ok(probeTraveler, 'post', `/social/conversations/${conv.id}/messages`, { body: 'hi' });
      const group = await ok(w.opA, 'post', '/groups', { name: `Sweep ${uniq()}`, visibility: 'PUBLIC' });
      await ok(probeTraveler, 'post', `/groups/${group.id}/join`);
      await ok(w.opA, 'post', `/groups/${group.id}/members`, { userId: probeOperator.id }).catch(() => undefined);
      const request = await ok(probeTraveler, 'post', '/marketplace/requests', { serviceType: 'HOTEL', title: `Sweep ${uniq()}` });
      const staffRole = (await ctx.prisma.role.findFirstOrThrow({ where: { tenantId: null, name: 'OPERATOR_STAFF' } })).id;
      const kyc = await ctx.prisma.tenantKyc.findFirst({ select: { id: true } });
      candidates = [
        probeOperator.id, probeTraveler.id, w.tenants.opA, w.tenants.community, post.id, account.id, conv.id,
        group.id, request.id, staffRole, ...(kyc ? [kyc.id] : []),
      ];
    });

    it('sweeps every GET route (ids substituted from the probes) as every identity', async () => {
      const identities = [w.superAdmin, w.opA, w.staffA, w.financeA, w.hotelA, w.transportA, w.visaA, w.travelerA, probeOperator, probeTraveler];
      const gets = routes.filter((r) => r.method === 'GET' && !r.path.startsWith('/auth/google') && r.path !== '/documents/signed/:token');
      let scanned = 0;
      const found: string[] = [];
      for (const r of gets) {
        const paths = /:[A-Za-z]+/.test(r.path)
          ? candidates.map((id) => r.path.replace(/:index\b/g, '0').replace(/:[A-Za-z]+/g, id))
          : [r.path];
        for (const a of identities) {
          for (const path of paths) {
            const res = await call(a.token, 'get', path);
            if (res.status >= 400) continue;
            scanned++;
            const body = res.type?.includes('json') ? res.body : res.text;
            const hits = typeof body === 'string' ? (BCRYPT.test(body) || body.includes(MFA_SECRET) ? ['(text body)'] : []) : leaks(body);
            for (const h of hits) found.push(`${a.email} GET ${path}: ${h}`);
          }
        }
      }
      expect(found).toEqual([]);
      // The sweep really exercised the routes that return people and organizations.
      expect(scanned).toBeGreaterThan(300);
    });

    it('/auth/me and /users/me/preferences describe the caller without credentials, for every identity', async () => {
      for (const a of [w.superAdmin, w.opA, w.hotelA, w.travelerA, probeOperator, probeTraveler]) {
        for (const path of ['/auth/me', '/users/me/preferences']) {
          const res = await call(a.token, 'get', path);
          expect(res.status, `${a.email} ${path}`).toBe(200);
          expect(leaks(res.body), `${a.email} ${path}`).toEqual([]);
        }
      }
    });
  });

  // ── signed download URLs ──────────────────────────────────────────────────
  describe('signed download URLs', () => {
    let signedPath: string;
    let claims: Record<string, unknown>;
    const jwt = () => ctx.app.get(JwtService);

    beforeAll(async () => {
      // A real document: an operator's visa document version, then its signed URL.
      const pilgrim = await ok(w.opA, 'post', '/pilgrims', { firstName: 'Signed', lastName: 'Url', passportNumber: `SU${uniq()}` });
      const visa = await ok(w.opA, 'post', '/compliance/visas', { applicantName: 'Signed Url', pilgrimId: pilgrim.id });
      const doc = await ok(w.opA, 'post', `/compliance/visas/${visa.id}/documents`, { type: 'PASSPORT', name: 'Passport' });
      const up = await ctx.http().post(api(`/compliance/visas/${visa.id}/documents/${doc.id}/versions`)).set(bearer(w.opA)).attach('file', PDF, 'passport.pdf');
      expect(up.status).toBe(201);
      const url = await ok(w.opA, 'get', `/documents/visa/${doc.id}/url`);
      signedPath = String(url.url).replace('/proxy-api', '/api/v1');
      expect((await ctx.http().get(signedPath)).status).toBe(200);
      claims = jwt().decode(signedPath.split('/').pop()!) as Record<string, unknown>;
    });

    const sign = (payload: object, options: object) => jwt().sign(payload, { audience: 'umrah-connects-download', ...options });
    const fetchToken = (token: string) => ctx.http().get(api(`/documents/signed/${token}`));
    const base = () => ({ purpose: 'download', key: claims.key, name: claims.name, mime: claims.mime });

    it('an expired link is refused', async () => {
      const expired = sign({ ...base(), iat: Math.floor(Date.now() / 1000) - 600 }, { expiresIn: 60 });
      expect((await fetchToken(expired)).status).toBe(401);
    });

    it('a link signed for another purpose or audience is refused, even with the right key', async () => {
      expect((await fetchToken(sign({ ...base(), purpose: 'preview' }, { expiresIn: 60 }))).status).toBe(401);
      expect((await fetchToken(jwt().sign(base(), { audience: 'umrah-connects-api', expiresIn: 60 }))).status).toBe(401);
    });

    it('a link signed with another secret is refused', async () => {
      const forged = jwt().sign(base(), { audience: 'umrah-connects-download', expiresIn: 60, secret: 'not-the-server-secret-but-long-enough-1234' });
      expect((await fetchToken(forged)).status).toBe(401);
    });

    it('a changed claim breaks the signature', async () => {
      const [h, p, s] = signedPath.split('/').pop()!.split('.');
      const payload = JSON.parse(Buffer.from(p, 'base64url').toString());
      payload.key = String(payload.key).replace(/[^/]+$/, 'other.pdf');
      const tampered = [h, Buffer.from(JSON.stringify(payload)).toString('base64url'), s].join('.');
      expect((await fetchToken(tampered)).status).toBe(401);
    });

    it('a download link is not an API credential', async () => {
      const token = signedPath.split('/').pop()!;
      expect((await call(token, 'get', '/auth/me')).status).toBe(401);
      expect((await call(token, 'get', '/pilgrims')).status).toBe(401);
    });
  });
});

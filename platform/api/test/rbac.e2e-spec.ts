import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { api, createTestApp, TestContext, tokenFromMail } from './app';
import { Actor, bearer, buildWorld, World } from './fixtures';

const uniq = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64)]);
const PDF = Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.alloc(64)]);

const ADMIN_READS = [
  '/admin/stats', '/admin/tenants', '/admin/tenants/export', '/admin/users', '/admin/users/export', '/admin/kyc',
  '/admin/roles', '/admin/permissions', '/admin/listings', '/admin/bookings', '/admin/finance', '/admin/audit-logs',
  '/admin/settings', '/inquiries',
];

describe('role architecture, platform separation and privilege escalation', () => {
  let ctx: TestContext;
  let w: World;

  beforeAll(async () => {
    ctx = await createTestApp();
    w = await buildWorld(ctx);
  });
  afterAll(async () => ctx?.close());

  const get = (a: Actor, path: string) => ctx.http().get(api(path)).set(bearer(a));
  const perms = async (a: Actor) => (await get(a, '/rbac/my-permissions')).body.data as string[];

  describe('Super Admin is a platform role, separate from Operator', () => {
    it('every tenant role gets 403 on every platform route', async () => {
      for (const actor of [w.opA, w.opB, w.staffA, w.financeA, w.hotelA, w.transportA, w.visaA, w.travelerA]) {
        for (const path of ADMIN_READS) {
          const res = await get(actor, path);
          expect(res.status, `${actor.email} GET ${path}`).toBe(403);
        }
      }
    });

    it('platform mutations are refused for an operator admin', async () => {
      const victimTenant = w.tenants.opB;
      const victimUser = w.opB.id;
      const attempts = [
        ctx.http().put(api(`/admin/tenants/${victimTenant}/status`)).set(bearer(w.opA)).send({ status: 'SUSPENDED' }),
        ctx.http().delete(api(`/admin/tenants/${victimTenant}`)).set(bearer(w.opA)),
        ctx.http().put(api(`/admin/users/${victimUser}/status`)).set(bearer(w.opA)).send({ status: 'LOCKED' }),
        ctx.http().post(api(`/admin/users/${victimUser}/force-logout`)).set(bearer(w.opA)),
        ctx.http().post(api('/tenants')).set(bearer(w.opA)).send({ slug: `x-${uniq()}`, name: 'X', type: 'OPERATOR', email: 'x@x.test', country: 'SA' }),
        ctx.http().get(api(`/tenants/${victimTenant}`)).set(bearer(w.opA)),
      ];
      for (const res of await Promise.all(attempts)) expect(res.status).toBe(403);
      const t = await ctx.prisma.tenant.findUniqueOrThrow({ where: { id: victimTenant } });
      expect(t.status).toBe('ACTIVE');
    });

    it('Super Admin reads platform data but holds no organization capabilities', async () => {
      for (const path of ADMIN_READS) {
        expect((await get(w.superAdmin, path)).status, path).toBe(200);
      }
      const p = await perms(w.superAdmin);
      expect(p.every((x) => x.startsWith('platform:'))).toBe(true);
      for (const path of ['/pilgrims', '/bookings', '/hotels', '/finance/invoices', '/compliance/visas', '/social/feed']) {
        expect((await get(w.superAdmin, path)).status, path).toBe(403);
      }
    });

    it('unauthenticated creation of organizations is closed (AUD-008)', async () => {
      const res = await ctx.http().post(api('/tenants')).send({ slug: `anon-${uniq()}`, name: 'Anon', type: 'OPERATOR', email: 'a@a.test', country: 'SA', parentTenantId: w.tenants.opA });
      expect(res.status).toBe(401);
    });
  });

  describe('capability matrix per role', () => {
    const matrix: [keyof World, string, number][] = [
      ['opA', '/pilgrims', 200], ['opA', '/hotels', 200], ['opA', '/finance/invoices', 200], ['opA', '/compliance/visas', 200],
      ['staffA', '/pilgrims', 200], ['staffA', '/finance/summary', 403], ['staffA', '/rbac/roles', 403],
      ['financeA', '/finance/invoices', 200], ['financeA', '/finance/summary', 200], ['financeA', '/pilgrims', 403], ['financeA', '/hotels', 403],
      ['hotelA', '/hotels', 200], ['hotelA', '/pilgrims', 403], ['hotelA', '/transport/vehicles', 403], ['hotelA', '/compliance/visas', 403],
      ['transportA', '/transport/vehicles', 200], ['transportA', '/hotels', 403], ['transportA', '/pilgrims', 403],
      ['visaA', '/compliance/visas', 200], ['visaA', '/visa-requests', 200], ['visaA', '/hotels', 403], ['visaA', '/finance/summary', 403],
      ['travelerA', '/social/feed', 200], ['travelerA', '/pilgrims', 403], ['travelerA', '/bookings', 403], ['travelerA', '/groups', 403],
      ['travelerA', '/hotels', 403], ['travelerA', '/finance/invoices', 403], ['travelerA', '/tenants/me', 403],
    ];
    it.each(matrix)('%s GET %s → %i', async (who, path, status) => {
      expect((await get(w[who] as Actor, path)).status).toBe(status);
    });

    it('capabilities come from the server, not from token claims', async () => {
      expect(await perms(w.travelerA)).toEqual(['marketplace:listing:read', 'social:post:create', 'social:post:read']);
      expect(await perms(w.hotelA)).toContain('hotel:allotment:manage');
      expect(await perms(w.hotelA)).not.toContain('crm:pilgrim:read');
    });
  });

  describe('role management cannot escalate', () => {
    const roleId = async (name: string) => (await ctx.prisma.role.findFirstOrThrow({ where: { tenantId: null, name } })).id;

    it('an operator admin cannot grant SUPER_ADMIN to anyone', async () => {
      const res = await ctx.http().post(api('/rbac/assign')).set(bearer(w.opA)).send({ userId: w.opA.id, roleId: await roleId('SUPER_ADMIN') });
      expect(res.status).toBe(403);
      expect(await perms(w.opA)).not.toContain('platform:tenant:read');
    });

    it('an operator admin cannot grant roles to users of another organization', async () => {
      const res = await ctx.http().post(api('/rbac/assign')).set(bearer(w.opA)).send({ userId: w.opB.id, roleId: await roleId('OPERATOR_STAFF') });
      expect(res.status).toBe(404);
    });

    it('an operator admin cannot use another organization\'s custom role', async () => {
      const foreign = await ctx.prisma.role.create({ data: { tenantId: w.tenants.opB, name: `B-role-${uniq()}` } });
      const res = await ctx.http().post(api('/rbac/assign')).set(bearer(w.opA)).send({ userId: w.staffA.id, roleId: foreign.id });
      expect(res.status).toBe(403);
    });

    it('a hotel organization cannot hand out operator roles', async () => {
      const res = await ctx.http().post(api('/rbac/assign')).set(bearer(w.hotelA)).send({ userId: w.hotelA.id, roleId: await roleId('OPERATOR_ADMIN') });
      expect(res.status).toBe(403);
    });

    it('custom roles cannot carry platform capabilities or capabilities the creator lacks', async () => {
      const platform = await ctx.http().post(api('/rbac/roles')).set(bearer(w.opA)).send({ name: `p-${uniq()}`, permissions: ['platform:user:read'] });
      expect(platform.status).toBe(403);
      const unknown = await ctx.http().post(api('/rbac/roles')).set(bearer(w.opA)).send({ name: `u-${uniq()}`, permissions: ['core:god:mode'] });
      expect(unknown.status).toBe(400);
      const beyond = await ctx.http().post(api('/rbac/roles')).set(bearer(w.hotelA)).send({ name: `b-${uniq()}`, permissions: ['crm:pilgrim:read'] });
      expect(beyond.status).toBe(403);
      const staff = await ctx.http().post(api('/rbac/roles')).set(bearer(w.staffA)).send({ name: `s-${uniq()}`, permissions: [] });
      expect(staff.status).toBe(403);
      const ok = await ctx.http().post(api('/rbac/roles')).set(bearer(w.opA)).send({ name: `ok-${uniq()}`, permissions: ['crm:pilgrim:read'] });
      expect(ok.status).toBe(201);
    });

    it('Super Admin can grant SUPER_ADMIN only to platform accounts', async () => {
      const toOperator = await ctx.http().post(api(`/admin/users/${w.opA.id}/roles`)).set(bearer(w.superAdmin)).send({ roleId: await roleId('SUPER_ADMIN') });
      expect(toOperator.status).toBe(403);
      const hotelToOperator = await ctx.http().post(api(`/admin/users/${w.transportA.id}/roles`)).set(bearer(w.superAdmin)).send({ roleId: await roleId('HOTEL_MANAGER') });
      expect(hotelToOperator.status).toBe(403);
      const staff = await ctx.http().post(api(`/admin/users/${w.financeA.id}/roles`)).set(bearer(w.superAdmin)).send({ roleId: await roleId('OPERATOR_STAFF') });
      expect(staff.status).toBe(201);
    });

    it('a platform capability planted on a tenant role is ignored and removed on sync', async () => {
      const perm = await ctx.prisma.permission.findFirstOrThrow({ where: { namespace: 'platform', resource: 'user', action: 'read' } });
      const rogue = await ctx.prisma.role.create({ data: { tenantId: w.tenants.opA, name: `rogue-${uniq()}`, permissions: { create: { permissionId: perm.id } } } });
      await ctx.prisma.userRole.create({ data: { userId: w.staffA.id, roleId: rogue.id } });
      expect((await get(w.staffA, '/admin/users')).status).toBe(403);
      const rbac = ctx.app.get((await import('../src/modules/rbac/rbac.service')).RbacService);
      await rbac.syncCatalog();
      expect(await ctx.prisma.rolePermission.count({ where: { roleId: rogue.id } })).toBe(0);
    });
  });

  describe('organization onboarding + KYC lifecycle', () => {
    it('traveler → verified email → hotel organization (pending) → KYC → approval → active hotel manager', async () => {
      const email = `founder.${uniq()}@people.test`;
      ctx.mails.length = 0;
      const reg = await ctx.http().post(api('/auth/register')).send({ email, password: 'Founder-2026', firstName: 'F', lastName: 'H', roleInterest: 'hotel' });
      let token = reg.body.data.accessToken as string;
      const auth = () => ({ Authorization: `Bearer ${token}` });
      const org = { type: 'VENDOR_HOTEL', name: 'Zamzam View Hotel', country: 'SA' };

      // Unverified email → refused.
      expect((await ctx.http().post(api('/onboarding/organization')).set(auth()).send(org)).status).toBe(403);
      await ctx.http().post(api('/auth/verify-email/confirm')).send({ token: tokenFromMail(ctx.mails.find((m) => m.to === email)!.text) });

      // Client cannot pick a privileged or platform type.
      expect((await ctx.http().post(api('/onboarding/organization')).set(auth()).send({ ...org, type: 'PLATFORM' })).status).toBe(400);

      const created = await ctx.http().post(api('/onboarding/organization')).set(auth()).send(org);
      expect(created.status).toBe(201);
      expect(created.body.data.role).toBe('HOTEL_MANAGER');
      expect(created.body.data.organization.status).toBe('PENDING_KYC');
      // The old traveler session is revoked; the new one belongs to the new organization.
      await new Promise((r) => setTimeout(r, 50));
      token = created.body.data.tokens.accessToken;

      // Pending organization: operational routes blocked, onboarding routes allowed.
      expect((await ctx.http().get(api('/hotels')).set(auth())).status).toBe(401);
      expect((await ctx.http().get(api('/tenants/me')).set(auth())).status).toBe(200);
      expect((await ctx.http().get(api('/auth/me')).set(auth())).body.data.roles).toEqual(['HOTEL_MANAGER']);

      // KYC document upload: content-sniffed, private.
      const bad = await ctx.http().post(api('/documents/kyc')).set(auth()).attach('file', Buffer.from('<html>not a pdf</html>'.padEnd(64)), 'license.pdf');
      expect(bad.status).toBe(400);
      const up = await ctx.http().post(api('/documents/kyc')).set(auth()).attach('file', PDF, 'license.pdf');
      expect(up.status).toBe(201);
      expect(up.body.data.storageKey).toMatch(/^kyc\//);

      // Referencing another organization's storage key is refused.
      const forged = await ctx.http().post(api('/tenants/me/kyc')).set(auth()).send({ registrySource: 'MANUAL', documents: [{ storageKey: `kyc/${w.tenants.opA}/x.pdf` }] });
      expect(forged.status).toBe(403);

      const kyc = await ctx.http().post(api('/tenants/me/kyc')).set(auth()).send({ registrySource: 'MANUAL', licenseNumber: 'HTL-1', documents: [up.body.data] });
      expect(kyc.status).toBe(200);
      expect((await ctx.http().post(api('/tenants/me/kyc')).set(auth()).send({ registrySource: 'MANUAL' })).status).toBe(400);

      // Other organizations cannot read the KYC document; the reviewer can.
      const kycId = kyc.body.data.id;
      expect((await get(w.opA, `/documents/kyc/${kycId}/0/url`)).status).toBe(404);
      const reviewerUrl = await get(w.superAdmin, `/documents/kyc/${kycId}/0/url`);
      expect(reviewerUrl.status).toBe(200);
      const signedPath = String(reviewerUrl.body.data.url).replace('/proxy-api', '/api/v1');
      const file = await ctx.http().get(signedPath);
      expect(file.status).toBe(200);
      expect(file.headers['content-type']).toBe('application/pdf');
      const tampered = await ctx.http().get(signedPath.slice(0, -3) + 'abc');
      expect(tampered.status).toBe(401);

      // Operator admins cannot approve; Super Admin can.
      expect((await ctx.http().put(api(`/admin/kyc/${kycId}/approve`)).set(bearer(w.opA)).send({})).status).toBe(403);
      const approve = await ctx.http().put(api(`/admin/kyc/${kycId}/approve`)).set(bearer(w.superAdmin)).send({ notes: 'ok' });
      expect(approve.status).toBe(200);
      expect((await ctx.http().get(api('/hotels')).set(auth())).status).toBe(200);
      expect((await ctx.http().get(api('/pilgrims')).set(auth())).status).toBe(403);

      const audit = await ctx.prisma.auditLog.count({ where: { resource: 'tenant_kyc', resourceId: kycId } });
      expect(audit).toBeGreaterThan(0);
    });

    it('operators cannot move themselves into onboarding', async () => {
      const res = await ctx.http().post(api('/onboarding/organization')).set(bearer(w.opA)).send({ type: 'VENDOR_HOTEL', name: 'Sneaky', country: 'SA' });
      expect(res.status).toBe(403);
    });

    it('suspended organizations are locked out immediately', async () => {
      const email = `susp-live.${uniq()}@org.test`;
      const t = await ctx.prisma.tenant.create({ data: { slug: `live-${uniq()}`, name: 'Live', type: 'OPERATOR', status: 'ACTIVE', email, country: 'SA' } });
      const bcrypt = await import('bcryptjs');
      const u = await ctx.prisma.user.create({ data: { tenantId: t.id, email, passwordHash: await bcrypt.hash('Suspend-2026x', 4), firstName: 'S', lastName: 'L', status: 'ACTIVE' } });
      const rbac = ctx.app.get((await import('../src/modules/rbac/rbac.service')).RbacService);
      await rbac.grantSystemRole(u.id, 'OPERATOR_ADMIN');
      const login = await ctx.http().post(api('/auth/login')).send({ email, password: 'Suspend-2026x' });
      const token = login.body.data.accessToken;
      expect((await ctx.http().get(api('/pilgrims')).set('Authorization', `Bearer ${token}`)).status).toBe(200);
      expect((await ctx.http().put(api(`/admin/tenants/${t.id}/status`)).set(bearer(w.superAdmin)).send({ status: 'SUSPENDED' })).status).toBe(200);
      expect((await ctx.http().get(api('/pilgrims')).set('Authorization', `Bearer ${token}`)).status).toBe(401);
    });
  });

  describe('public media uploads', () => {
    it('accepts real images only and never serves nested private paths', async () => {
      const png = await ctx.http().post(api('/uploads')).set(bearer(w.travelerA)).attach('file', PNG, 'avatar.png');
      expect(png.status).toBe(201);
      expect(png.body.data.url).toMatch(/^\/uploads\/[\w-]+\.png$/);
      const served = await ctx.http().get(png.body.data.url);
      expect(served.status).toBe(200);

      const html = await ctx.http().post(api('/uploads')).set(bearer(w.travelerA)).attach('file', Buffer.from('<html><script>alert(1)</script></html>'.padEnd(80)), 'evil.png');
      expect(html.status).toBe(400);
      const pdf = await ctx.http().post(api('/uploads')).set(bearer(w.travelerA)).attach('file', PDF, 'doc.png');
      expect(pdf.status).toBe(400);
      expect((await ctx.http().post(api('/uploads')).attach('file', PNG, 'a.png')).status).toBe(401);

      expect((await ctx.http().get('/uploads/private/kyc/whatever.pdf')).status).toBe(404);
      expect((await ctx.http().get('/uploads/visa-documents/x/y.png')).status).toBe(404);
      expect((await ctx.http().get('/uploads/..%2f.env')).status).toBe(404);
    });
  });

  describe('capability changes take effect on the next request (W09 server half)', () => {
    const roleId = async (name: string) => (await ctx.prisma.role.findFirstOrThrow({ where: { tenantId: null, name } })).id;

    it('a role the organization admin revokes is refused with the same access token and leaves /auth/me', async () => {
      // A fresh finance account, so no other test's grants blur the result.
      const bcrypt = await import('bcryptjs');
      const email = `revocable.${uniq()}@op-a.test`;
      const account = await ctx.prisma.user.create({
        data: {
          tenantId: w.tenants.opA, email, passwordHash: await bcrypt.hash('Revocable-2026', 4),
          firstName: 'Revocable', lastName: 'Finance', status: 'ACTIVE', emailVerifiedAt: new Date(),
        },
      });
      const rbac = ctx.app.get((await import('../src/modules/rbac/rbac.service')).RbacService);
      await rbac.grantSystemRole(account.id, 'FINANCE_MANAGER');
      const login = await ctx.http().post(api('/auth/login')).send({ email, password: 'Revocable-2026' });
      const finance = { Authorization: `Bearer ${login.body.data.accessToken}` };
      const as = (path: string) => ctx.http().get(api(path)).set(finance);
      expect((await as('/pilgrims')).status).toBe(403);

      const staff = await roleId('OPERATOR_STAFF');
      const granted = await ctx.http().post(api('/rbac/assign')).set(bearer(w.opA)).send({ userId: account.id, roleId: staff });
      expect(granted.status).toBe(201);
      expect((await as('/pilgrims')).status).toBe(200);
      expect((await as('/auth/me')).body.data.permissions).toContain('crm:pilgrim:read');

      const revoked = await ctx.http().delete(api(`/rbac/assign/${account.id}/${staff}`)).set(bearer(w.opA));
      expect(revoked.status).toBe(200);
      // Same token as before: authorization is resolved from the database on every request.
      expect((await as('/pilgrims')).status).toBe(403);
      const me = (await as('/auth/me')).body.data;
      expect(me.permissions).not.toContain('crm:pilgrim:read');
      expect(me.roles).toEqual(['FINANCE_MANAGER']);
    });
  });

  describe('platform settings report what is really configured', () => {
    it('Google sign-in counts as enabled only when all three GOOGLE_* variables are set', async () => {
      const keys = ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_REDIRECT_URI'];
      const saved = keys.map((k) => process.env[k]);
      const googleSignIn = async () => (await get(w.superAdmin, '/admin/settings')).body.data.enforced.googleSignIn;
      try {
        keys.forEach((k) => delete process.env[k]);
        expect(await googleSignIn()).toBe(false);
        process.env.GOOGLE_CLIENT_ID = 'client-id-only.apps.googleusercontent.com';
        expect(await googleSignIn()).toBe(false);
        process.env.GOOGLE_CLIENT_SECRET = 'test-secret';
        expect(await googleSignIn()).toBe(false);
        process.env.GOOGLE_REDIRECT_URI = 'https://example.test/api/v1/auth/google/callback';
        expect(await googleSignIn()).toBe(true);
      } finally {
        keys.forEach((k, i) => (saved[i] === undefined ? delete process.env[k] : (process.env[k] = saved[i])));
      }
    });
  });

  describe('the platform console never returns credentials', () => {
    // Column names (camelCase and database spelling) and relations that hold secrets.
    const SECRET_KEYS = new Set([
      'passwordHash', 'password_hash', 'password', 'mfaSecret', 'mfa_secret',
      'tokenHash', 'token_hash', 'codeHash', 'code_hash', 'refreshTokens', 'otpCodes',
    ]);
    const BCRYPT = /\$2[aby]?\$\d{2}\$[./A-Za-z0-9]{20,}/;
    const MFA_SECRET = 'JBSWY3DPEHPK3PXPLEAKCHECK';

    /** Every path in a JSON body that names a secret column or carries a secret value. */
    function leaks(value: unknown, path = '$'): string[] {
      if (Array.isArray(value)) return value.flatMap((v, i) => leaks(v, `${path}[${i}]`));
      if (value && typeof value === 'object') {
        return Object.entries(value).flatMap(([k, v]) => [
          ...(SECRET_KEYS.has(k) ? [`${path}.${k}`] : []),
          ...leaks(v, `${path}.${k}`),
        ]);
      }
      if (typeof value === 'string' && (BCRYPT.test(value) || value.includes(MFA_SECRET))) return [`${path} (secret value)`];
      return [];
    }

    it('no /admin, /tenants or /rbac payload about users carries a password hash, MFA secret or token hash', async () => {
      const bcrypt = await import('bcryptjs');
      const email = `leak-probe.${uniq()}@op-a.test`;
      const probe = await ctx.prisma.user.create({
        data: {
          tenantId: w.tenants.opA, email, passwordHash: await bcrypt.hash('Leak-Probe-2026', 4),
          mfaSecret: MFA_SECRET, mfaEnabled: true, firstName: 'Leak', lastName: 'Probe', status: 'ACTIVE',
        },
      });
      // Give it a live refresh token and a one-time code so those relations exist too.
      const login = await ctx.http().post(api('/auth/login')).send({ email, password: 'Leak-Probe-2026' });
      expect([200, 401, 403]).toContain(login.status);
      const staffRole = (await ctx.prisma.role.findFirstOrThrow({ where: { tenantId: null, name: 'OPERATOR_STAFF' } })).id;

      const admin = (method: 'get' | 'put' | 'post' | 'delete', path: string, body?: object) => {
        const req = ctx.http()[method](api(path)).set(bearer(w.superAdmin));
        return body ? req.send(body) : req;
      };
      const responses: [string, Awaited<ReturnType<typeof admin>>][] = [
        ['GET /admin/users', await admin('get', '/admin/users')],
        ['GET /admin/users?search', await admin('get', `/admin/users?search=${encodeURIComponent('leak-probe')}`)],
        ['GET /admin/users?tenantId', await admin('get', `/admin/users?tenantId=${w.tenants.opA}`)],
        ['GET /admin/tenants', await admin('get', '/admin/tenants')],
        ['GET /admin/tenants/:id', await admin('get', `/admin/tenants/${w.tenants.opA}`)],
        ['GET /admin/roles', await admin('get', '/admin/roles')],
        ['GET /admin/roles/:id', await admin('get', `/admin/roles/${staffRole}`)],
        ['GET /admin/kyc', await admin('get', '/admin/kyc')],
        ['GET /admin/stats', await admin('get', '/admin/stats')],
        ['GET /admin/audit-logs', await admin('get', '/admin/audit-logs?limit=200')],
        ['PUT /admin/users/:id/status', await admin('put', `/admin/users/${probe.id}/status`, { status: 'LOCKED', reason: 'leak probe' })],
        ['PUT /admin/users/:id/status (unlock)', await admin('put', `/admin/users/${probe.id}/status`, { status: 'ACTIVE' })],
        ['POST /admin/users/:id/roles', await admin('post', `/admin/users/${probe.id}/roles`, { roleId: staffRole })],
        ['DELETE /admin/users/:id/roles/:roleId', await admin('delete', `/admin/users/${probe.id}/roles/${staffRole}`)],
        ['POST /admin/users/:id/force-logout', await admin('post', `/admin/users/${probe.id}/force-logout`)],
        ['GET /tenants/:id', await admin('get', `/tenants/${w.tenants.opA}`)],
        ['GET /tenants/me (org admin)', await get(w.opA, '/tenants/me')],
        ['GET /rbac/roles (org admin)', await get(w.opA, '/rbac/roles')],
        ['GET /rbac/my-permissions', await get(w.opA, '/rbac/my-permissions')],
      ];
      for (const [label, res] of responses) {
        expect(res.status, label).toBeLessThan(400);
        expect(leaks(res.body), label).toEqual([]);
      }

      const listed = responses[1][1].body.data.items.find((u: any) => u.id === probe.id);
      expect(listed, 'probe user is listed').toBeTruthy();
      expect(Object.keys(listed)).not.toContain('passwordHash');

      // The CSV export is a text body, so it is checked as text.
      const csv = await admin('get', '/admin/users/export');
      expect(csv.status).toBe(200);
      expect(csv.text).not.toMatch(BCRYPT);
      expect(csv.text).not.toContain(MFA_SECRET);
    });

    it('offers only the roles the server would grant', async () => {
      const users = (await ctx.http().get(api('/admin/users?limit=200')).set(bearer(w.superAdmin))).body.data.items as any[];
      const names = (id: string) => (users.find((u) => u.id === id)?.assignableRoles ?? []).map((r: any) => r.name);
      expect(names(w.opA.id)).not.toContain('SUPER_ADMIN');
      expect(names(w.hotelA.id)).not.toContain('OPERATOR_ADMIN');
      expect(names(w.hotelA.id)).toContain('FINANCE_MANAGER');
      expect(names(w.superAdmin.id)).toEqual([]);
      // Every offer is accepted by the grant endpoint.
      const offer = users.find((u) => u.id === w.transportA.id).assignableRoles.find((r: any) => r.name === 'FINANCE_MANAGER');
      const grant = await ctx.http().post(api(`/admin/users/${w.transportA.id}/roles`)).set(bearer(w.superAdmin)).send({ roleId: offer.id });
      expect(grant.status).toBe(201);
      const undo = await ctx.http().delete(api(`/admin/users/${w.transportA.id}/roles/${offer.id}`)).set(bearer(w.superAdmin));
      expect(undo.status).toBe(200);
    });
  });
});

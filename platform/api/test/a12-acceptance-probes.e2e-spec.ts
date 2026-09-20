import { createHmac } from 'crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as bcrypt from 'bcryptjs';
import { api, createTestApp, TestContext, tokenFromMail } from './app';
import { Actor, bearer, buildWorld, PASSWORD, World } from './fixtures';
import { AccessPolicyCheck, RoutePolicy } from '../src/modules/rbac/access-policy.check';
import { RbacService } from '../src/modules/rbac/rbac.service';

/**
 * A12 — independent acceptance probes.
 *
 * Written by the acceptance reviewer, who implemented none of the code under test,
 * to attack the claims the loop's reports make rather than to re-state them. The
 * probes deliberately take angles the implementers' own suites do not:
 *
 *  1. cross-organization reads driven from the QUERY STRING (filters, includes,
 *     counts, exports, reports) rather than from a path id, swept over the whole
 *     route inventory so a new leaky route is caught the day it is added;
 *  2. a blind write sweep: every mutating route, called by the wrong organization
 *     with the victim's ids substituted, followed by a full fingerprint of the
 *     victim's tables to prove nothing moved;
 *  3. capability minting: every spelling of a platform capability an organization
 *     administrator could try, plus a direct grant of the platform role id;
 *  4. invitation tokens: replay after accept/decline/revoke and claims from the
 *     wrong account, the wrong organization and an unverified account;
 *  5. money: IDOR on someone else's checkout, double capture, refund bounds;
 *  6. downloads: another organization's signed link;
 *  7. revocation inside the same second, and duplicate submits.
 *
 * Every refused mutation is followed by a re-read of the victim record.
 */

const uniq = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
const SANDBOX_SECRET = 'test-sandbox-webhook-secret';
const sign = (raw: string) => `sha256=${createHmac('sha256', SANDBOX_SECRET).update(raw).digest('hex')}`;
type Method = 'get' | 'post' | 'put' | 'patch' | 'delete';

describe('A12 acceptance probes', () => {
  let ctx: TestContext;
  let w: World;
  let routes: RoutePolicy[];

  const call = (token: string | undefined, method: Method, path: string, body?: unknown) => {
    const req = ctx.http()[method](api(path));
    if (token) req.set('Authorization', `Bearer ${token}`);
    return body !== undefined ? req.send(body as object) : req;
  };
  const ok = async (a: Actor, method: Method, path: string, body?: unknown) => {
    const res = await call(a.token, method, path, body);
    if (res.status >= 300) throw new Error(`${a.email} ${method.toUpperCase()} ${path} → ${res.status} ${JSON.stringify(res.body)}`);
    return res.body?.data ?? res.body;
  };

  beforeAll(async () => {
    ctx = await createTestApp();
    w = await buildWorld(ctx);
    routes = ctx.app.get(AccessPolicyCheck).inventory();
  });
  afterAll(async () => ctx?.close());

  // ─────────────────────────────────────────────────────────────────────────
  // Victim data in organization A, every record carrying a unique marker that
  // must never appear in a response to any other organization.
  // ─────────────────────────────────────────────────────────────────────────
  const MARK = `A12MARK${uniq().toUpperCase()}`;
  const victim: Record<string, any> = {};

  beforeAll(async () => {
    victim.pilgrim = await ok(w.opA, 'post', '/pilgrims', {
      firstName: `${MARK}Pilgrim`, lastName: 'Victim', passportNumber: `${MARK}PASS`, email: `${MARK.toLowerCase()}@victim.test`,
    });
    victim.package = await ok(w.opA, 'post', '/packages', { name: `${MARK} package`, type: 'UMRAH', priceAdult: 1234 });
    victim.booking = await ok(w.opA, 'post', '/bookings', { packageId: victim.package.id, pilgrimIds: [victim.pilgrim.id] });
    victim.invoice = await ok(w.opA, 'post', '/finance/invoices', {
      issuedToName: `${MARK} payer`, subtotal: 500, bookingId: victim.booking.id, pilgrimId: victim.pilgrim.id,
    });
    await ok(w.opA, 'put', `/finance/invoices/${victim.invoice.id}/issue`);
    victim.payment = await ok(w.opA, 'post', `/finance/invoices/${victim.invoice.id}/payments`, { amount: 100, method: 'cash' });
    victim.visa = await ok(w.opA, 'post', '/compliance/visas', {
      pilgrimId: victim.pilgrim.id, regulatorySystem: 'NUSUK_MASAR', visaType: 'UMRAH', applicantPassport: `${MARK}PASS`,
    });
    victim.group = await ok(w.opA, 'post', '/groups', { name: `${MARK} group`, capacity: 10 });
    victim.hotel = await ok(w.hotelA, 'post', '/hotels', { name: `${MARK} hotel`, city: 'MAKKAH' });
    victim.vehicle = await ok(w.transportA, 'post', '/transport/vehicles', {
      plateNumber: `${MARK}-1`, type: 'BUS', capacity: 40,
    });
    victim.listing = await ok(w.opA, 'post', '/marketplace/listings', {
      title: `${MARK} listing`, category: 'hotel_room', priceFrom: 250, pricingModel: 'PER_PERSON',
    });
  });

  /** Ids of A's rows, used as substitution material for the sweeps. */
  const victimIds = () => Object.values(victim).map((v: any) => v?.id).filter(Boolean) as string[];

  /** Everything of A that a cross-tenant read could reveal. */
  const markers = () => [MARK, ...victimIds()];

  const findMarkers = (body: unknown): string[] => {
    const text = JSON.stringify(body ?? null);
    return markers().filter((m) => text.includes(m));
  };

  /**
   * A fingerprint of every table A owns: row counts plus the mutable state of the
   * records under attack. Compared before and after each sweep.
   */
  const fingerprint = async () => {
    const t = w.tenants.opA;
    const [pilgrim, pkg, booking, invoice, payment, visa, group, listing] = await Promise.all([
      ctx.prisma.pilgrim.findUnique({ where: { id: victim.pilgrim.id } }),
      ctx.prisma.package.findUnique({ where: { id: victim.package.id } }),
      ctx.prisma.booking.findUnique({ where: { id: victim.booking.id }, include: { pilgrims: true } }),
      ctx.prisma.invoice.findUnique({ where: { id: victim.invoice.id } }),
      ctx.prisma.payment.findUnique({ where: { id: victim.payment.id } }),
      ctx.prisma.visaApplication.findUnique({ where: { id: victim.visa.id } }),
      ctx.prisma.tripGroup.findUnique({ where: { id: victim.group.id } }),
      ctx.prisma.listing.findUnique({ where: { id: victim.listing.id } }),
    ]);
    const counts = {
      pilgrims: await ctx.prisma.pilgrim.count({ where: { tenantId: t } }),
      bookings: await ctx.prisma.booking.count({ where: { tenantId: t } }),
      invoices: await ctx.prisma.invoice.count({ where: { tenantId: t } }),
      payments: await ctx.prisma.payment.count({ where: { tenantId: t } }),
      visas: await ctx.prisma.visaApplication.count({ where: { tenantId: t } }),
      hotels: await ctx.prisma.hotel.count({ where: { tenantId: w.tenants.hotelA } }),
      vehicles: await ctx.prisma.vehicle.count({ where: { tenantId: w.tenants.transportA } }),
      documents: await ctx.prisma.pilgrimDocument.count({ where: { tenantId: t } }),
    };
    return JSON.stringify({
      counts,
      pilgrim: [pilgrim?.firstNameEn, pilgrim?.lastNameEn, pilgrim?.status, pilgrim?.deletedAt],
      pkg: [pkg?.name, String(pkg?.basePriceCents), pkg?.isPublished, pkg?.deletedAt],
      booking: [booking?.status, String(booking?.totalAmountCents), String(booking?.paidAmountCents), booking?.packageId, booking?.pilgrims.length],
      invoice: [invoice?.status, String(invoice?.totalCents), String(invoice?.paidCents)],
      payment: [payment?.status, String(payment?.amountCents), payment?.currency],
      visa: [visa?.status, visa?.applicantPassport],
      group: [group?.name, group?.status],
      listing: [listing?.status, listing?.isActive, listing?.moderationStatus, String(listing?.priceCents), listing?.name],
    });
  };

  // ═════════════════════════════════════════════════════════════════════════
  // 1. Cross-organization reads through the query string
  // ═════════════════════════════════════════════════════════════════════════
  describe('cross-organization reads: filters, includes, counts, exports and reports', () => {
    /** Query strings that try to aim a list, an export or a report at organization A. */
    const hostileQueries = (ids: string[]) => {
      const t = w.tenants.opA;
      const id = ids[0];
      return [
        `tenantId=${t}`,
        `tenant_id=${t}`,
        `organizationId=${t}`,
        `orgId=${t}`,
        `tenant=${t}`,
        `tenantIds=${t}`,
        `tenantId=${t}&limit=200`,
        `filter[tenantId]=${t}`,
        `where[tenantId]=${t}`,
        `include=pilgrim,booking,invoice,payments,tenant&limit=200`,
        `select=*&limit=200`,
        `q=${MARK}&limit=200`,
        `search=${MARK}&limit=200`,
        `query=${MARK}`,
        `name=${MARK}`,
        `email=${MARK.toLowerCase()}@victim.test`,
        `passportNumber=${MARK}PASS`,
        `id=${id}`,
        `ids=${ids.join(',')}`,
        `pilgrimId=${victim.pilgrim.id}`,
        `bookingId=${victim.booking.id}`,
        `invoiceId=${victim.invoice.id}`,
        `listingId=${victim.listing.id}`,
        `hotelId=${victim.hotel.id}`,
        `vehicleId=${victim.vehicle.id}`,
        `groupId=${victim.group.id}`,
        `userId=${w.opA.id}`,
        `orderBy=tenantId&limit=200&offset=0&page=1&perPage=200&pageSize=200`,
        `status=ALL&includeInactive=true&includeAll=true&all=true&limit=200`,
        `format=csv&limit=200`,
        `from=2000-01-01&to=2100-01-01&limit=200&groupBy=tenant`,
      ];
    };

    it('no GET route hands another organization a row of organization A, however the query is shaped', async () => {
      const ids = victimIds();
      const queries = hostileQueries(ids);
      // Routes without a path parameter: everything a list/search/export/report can be.
      const listRoutes = routes.filter((r) => r.method === 'GET' && !r.path.includes(':'));
      expect(listRoutes.length).toBeGreaterThan(30);
      const attackers = [w.opB, w.hotelB, w.transportB, w.visaB, w.travelerB];
      const leaks: string[] = [];
      for (const r of listRoutes) {
        for (const a of attackers) {
          for (const q of queries) {
            const res = await call(a.token, 'get', `${r.path}?${q}`);
            if (res.status !== 200) continue;
            const found = findMarkers(res.body);
            if (found.length) leaks.push(`${a.email} GET ${r.path}?${q} → ${found.join(', ')}`);
          }
        }
      }
      expect(leaks, `cross-organization leaks:\n${leaks.join('\n')}`).toEqual([]);
    }, 600_000);

    it('exports and reports refuse an organization id that is not the caller\'s', async () => {
      const exportish = routes.filter(
        (r) => r.method === 'GET' && /export|report|stats|summary|analytics|dashboard/i.test(r.path),
      );
      expect(exportish.length).toBeGreaterThan(3);
      const leaks: string[] = [];
      for (const r of exportish) {
        const path = r.path.replace(/:[A-Za-z]+/g, victim.pilgrim.id);
        for (const a of [w.opB, w.financeA, w.travelerB, w.hotelB]) {
          for (const q of [`tenantId=${w.tenants.opA}`, `organizationId=${w.tenants.opA}`, `format=csv&tenantId=${w.tenants.opA}`]) {
            const res = await call(a.token, 'get', `${path}?${q}`);
            if (res.status !== 200) continue;
            const text = typeof res.text === 'string' ? res.text : '';
            const found = [...new Set([...findMarkers(res.body), ...markers().filter((m) => text.includes(m))])];
            // financeA belongs to organization A and legitimately sees A's money.
            if (found.length && a.tenantId !== w.tenants.opA) leaks.push(`${a.email} GET ${path}?${q} → ${found.join(', ')}`);
          }
        }
      }
      expect(leaks, `export/report leaks:\n${leaks.join('\n')}`).toEqual([]);
    }, 300_000);

    /**
     * A query parameter that is typed only as a string but used as a Prisma enum
     * filter does reach the driver, which throws — but the exception filter turns
     * that into a clean 400. Checked here because a driver error that escaped would
     * be both a 500 and a schema disclosure.
     */
    it('a hostile query value never produces a 5xx or leaks driver text', async () => {
      const hostile = ['ALL', 'ANY', "'; DROP TABLE users; --", '../../etc/passwd', '{"gt":""}', 'null'];
      const serverErrors: string[] = [];
      const listRoutes = routes.filter((r) => r.method === 'GET' && !r.path.includes(':'));
      for (const r of listRoutes) {
        for (const value of hostile) {
          for (const key of ['status', 'type', 'category', 'visibility', 'serviceType']) {
            const res = await call(w.opA.token, 'get', `${r.path}?${key}=${encodeURIComponent(value)}`);
            if (res.status >= 500) serverErrors.push(`GET ${r.path}?${key}=${value} → ${res.status}`);
            // Whatever happens, the envelope never carries a driver error or a stack.
            const text = JSON.stringify(res.body ?? {});
            expect(text, `GET ${r.path}?${key}=${value}`).not.toMatch(/prisma|PrismaClient|\bat [A-Za-z$_]+ \(|syntax error at or near|pg_|relation "/i);
          }
        }
      }
      expect(serverErrors.sort(), 'routes answering 5xx on a hostile query value').toEqual([]);
    }, 300_000);

    it('a traveler reads no other traveler\'s bookings, requests, links, messages or notifications', async () => {
      // Traveler A's own private records.
      const listing = victim.listing;
      const booking = await ok(w.travelerA, 'post', `/marketplace/listings/${listing.id}/bookings`, { partySize: 1, customerName: `${MARK} guest` });
      const request = await ok(w.travelerA, 'post', '/marketplace/requests', {
        serviceType: 'HOTEL', title: `${MARK} request`, travelers: 2,
      });
      const paths = [
        `/marketplace/bookings/${booking.id}`,
        `/marketplace/requests/${request.id}`,
        `/payments/checkout/${booking.id}`,
      ];
      const leaks: string[] = [];
      for (const p of paths) {
        const res = await call(w.travelerB.token, 'get', p);
        if (res.status === 200 && JSON.stringify(res.body).includes(MARK)) leaks.push(`traveler B GET ${p} → 200`);
      }
      // …and traveler B's own lists never carry A's rows.
      for (const p of ['/marketplace/bookings/mine?limit=200', '/marketplace/requests/mine?limit=200', '/travelers/me/links', '/travelers/me/trips', '/notifications?limit=200', '/social/conversations?limit=200']) {
        const res = await call(w.travelerB.token, 'get', p);
        if (res.status === 200 && JSON.stringify(res.body).includes(MARK)) leaks.push(`traveler B GET ${p} → contains A's marker`);
      }
      expect(leaks, leaks.join('\n')).toEqual([]);
    }, 120_000);
  });

  // ═════════════════════════════════════════════════════════════════════════
  // 2. Blind write sweep with the victim's ids
  // ═════════════════════════════════════════════════════════════════════════
  describe('cross-organization writes', () => {
    it('no mutating route lets another organization move a row of organization A', async () => {
      const before = await fingerprint();
      const ids = victimIds();
      const mutators = routes.filter((r) => r.method !== 'GET' && !/webhook/.test(r.path) && !r.path.startsWith('/auth/'));
      expect(mutators.length).toBeGreaterThan(60);
      // Bodies that try to re-point a write at A's rows as well as the path id.
      const bodies: Record<string, unknown>[] = [
        {},
        { tenantId: w.tenants.opA, organizationId: w.tenants.opA },
        {
          tenantId: w.tenants.opA, pilgrimId: victim.pilgrim.id, bookingId: victim.booking.id,
          invoiceId: victim.invoice.id, packageId: victim.package.id, listingId: victim.listing.id,
          hotelId: victim.hotel.id, vehicleId: victim.vehicle.id, groupId: victim.group.id,
          paymentId: victim.payment.id, id: victim.pilgrim.id, status: 'CANCELLED', amount: 1, name: 'A12-OVERWRITE',
        },
      ];
      const accepted: string[] = [];
      for (const r of mutators) {
        for (const id of ids.slice(0, 4)) {
          const path = r.path.replace(/:[A-Za-z]+/g, id);
          for (const body of bodies) {
            const res = await call(w.opB.token, r.method.toLowerCase() as Method, path, body);
            if (res.status < 300) accepted.push(`opB ${r.method} ${path} → ${res.status}`);
          }
        }
      }
      const after = await fingerprint();
      // The sweep can lock or log out the attacker's own account; refresh its token for the rest of the file.
      const relogin = await ctx.http().post(api('/auth/login')).send({ email: w.opB.email, password: PASSWORD });
      if (relogin.status === 200) w.opB.token = relogin.body.data.accessToken;
      expect(after, `organization A changed under the sweep. Accepted calls:\n${accepted.join('\n')}`).toBe(before);
    }, 900_000);
  });

  // ═════════════════════════════════════════════════════════════════════════
  // 3. Capability minting
  // ═════════════════════════════════════════════════════════════════════════
  describe('capability minting', () => {
    const platformKeys = [
      'platform:tenant:read',
      'platform:user:manage',
      'platform:role:manage',
      'platform:kyc:review',
      'platform:marketplace:moderate',
    ];

    it('an organization administrator cannot mint a platform capability into a custom role, in any spelling', async () => {
      const spellings: unknown[][] = [
        platformKeys,
        ['PLATFORM:TENANT:READ'],
        [' platform:tenant:read'],
        ['platform:tenant:read '],
        ['platform:tenant:read\u0000'],
        ['platform::tenant:read'],
        ['plaTform:tenant:read'],
        ['core:tenant:read', 'platform:tenant:read'],
        ['__proto__'],
        ['constructor'],
        ['toString'],
        [{ toString: () => 'platform:tenant:read' }],
        [['platform:tenant:read']],
      ];
      for (const permissions of spellings) {
        const res = await call(w.opA.token, 'post', '/rbac/roles', {
          name: `A12 role ${uniq()}`, description: 'probe', permissions,
        });
        expect([400, 403], `POST /rbac/roles ${JSON.stringify(permissions)} → ${res.status} ${JSON.stringify(res.body)}`).toContain(res.status);
      }
      // Nothing was written, and no role in A's organization holds a platform grant.
      const minted = await ctx.prisma.rolePermission.findMany({
        where: { role: { tenantId: w.tenants.opA }, permission: { namespace: 'platform' } },
      });
      expect(minted).toEqual([]);
      const perms = await ok(w.opA, 'get', '/rbac/my-permissions');
      expect((perms.permissions ?? perms).filter?.((p: string) => p.startsWith('platform:')) ?? []).toEqual([]);
    });

    it('an organization administrator cannot grant itself or anyone the platform role', async () => {
      const superRoleId = await ctx.app.get(RbacService).systemRoleId('SUPER_ADMIN');
      const targets = [w.opA.id, w.staffA.id, w.travelerA.id, w.superAdmin.id];
      for (const userId of targets) {
        const res = await call(w.opA.token, 'post', '/rbac/assign', { userId, roleId: superRoleId });
        expect([403, 404], `assign SUPER_ADMIN to ${userId} → ${res.status}`).toContain(res.status);
      }
      // …through the platform route either.
      for (const userId of targets) {
        const res = await call(w.opA.token, 'post', `/admin/users/${userId}/roles`, { roleId: superRoleId });
        expect(res.status, `/admin grant → ${res.status}`).toBe(403);
      }
      expect(await ctx.prisma.userRole.count({ where: { roleId: superRoleId, userId: { in: targets.filter((t) => t !== w.superAdmin.id) } } })).toBe(0);
      const perms = await ok(w.opA, 'get', '/rbac/my-permissions');
      const held: string[] = perms.permissions ?? perms;
      expect(held.filter((p) => p.startsWith('platform:'))).toEqual([]);
    });

    it('a platform grant written straight into the database still yields no platform capability outside the platform organization', async () => {
      // Defence in depth: even if a row were forged, resolution must ignore it.
      const role = await ctx.prisma.role.create({
        data: { tenantId: w.tenants.opA, name: `A12 forged ${uniq()}`, description: 'forged' },
      });
      const perm = await ctx.prisma.permission.findFirstOrThrow({ where: { namespace: 'platform', resource: 'tenant', action: 'read' } });
      await ctx.prisma.rolePermission.create({ data: { roleId: role.id, permissionId: perm.id } });
      await ctx.prisma.userRole.create({ data: { userId: w.opA.id, roleId: role.id } });
      try {
        const perms: string[] = (await ok(w.opA, 'get', '/rbac/my-permissions')).permissions ?? [];
        expect(perms.filter((p) => p.startsWith('platform:'))).toEqual([]);
        const res = await call(w.opA.token, 'get', '/admin/tenants');
        expect(res.status).toBe(403);
      } finally {
        await ctx.prisma.userRole.deleteMany({ where: { roleId: role.id } });
        await ctx.prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
        await ctx.prisma.role.delete({ where: { id: role.id } });
      }
    });

    it('a custom role can never carry a capability its creator does not hold', async () => {
      // Staff hold a subset; a role built by staff cannot exceed it.
      const staffPerms: string[] = (await ok(w.staffA, 'get', '/rbac/my-permissions')).permissions ?? [];
      const adminPerms: string[] = (await ok(w.opA, 'get', '/rbac/my-permissions')).permissions ?? [];
      const beyond = adminPerms.filter((p) => !staffPerms.includes(p));
      if (!staffPerms.includes('core:role:manage')) {
        const res = await call(w.staffA.token, 'post', '/rbac/roles', { name: `A12 staff ${uniq()}`, permissions: beyond.slice(0, 3) });
        expect(res.status).toBe(403);
        return;
      }
      const res = await call(w.staffA.token, 'post', '/rbac/roles', { name: `A12 staff ${uniq()}`, permissions: beyond.slice(0, 3) });
      expect([403, 400]).toContain(res.status);
    });

    it('every platform route refuses every non-platform identity, including a custom-role holder', async () => {
      const platformRoutes = routes.filter((r) => r.permissions.some((p) => p.startsWith('platform:')));
      const custom = await ok(w.opA, 'post', '/rbac/roles', {
        name: `A12 wide ${uniq()}`,
        permissions: ((await ok(w.opA, 'get', '/rbac/my-permissions')).permissions ?? []).slice(0, 40),
      });
      await ok(w.opA, 'post', '/rbac/assign', { userId: w.staffA.id, roleId: custom.id });
      const relogin = await ctx.http().post(api('/auth/login')).send({ email: w.staffA.email, password: PASSWORD });
      const wide = relogin.body.data.accessToken as string;
      const bad: string[] = [];
      for (const r of platformRoutes) {
        const path = r.path.replace(/:[A-Za-z]+/g, victim.pilgrim.id);
        for (const [who, token] of [['staff+custom', wide], ['opA', w.opA.token], ['travelerA', w.travelerA.token], ['hotelA', w.hotelA.token], ['financeA', w.financeA.token]] as const) {
          const res = await call(token, r.method.toLowerCase() as Method, path, r.method === 'GET' ? undefined : {});
          if (res.status !== 403) bad.push(`${who} ${r.method} ${r.path} → ${res.status}`);
        }
      }
      expect(bad, bad.join('\n')).toEqual([]);
    }, 300_000);
  });

  // ═════════════════════════════════════════════════════════════════════════
  // 4. Traveler ↔ pilgrim invitation tokens
  // ═════════════════════════════════════════════════════════════════════════
  describe('traveler ↔ pilgrim invitation tokens', () => {
    const invite = async (pilgrimId: string, email?: string) => {
      const before = ctx.mails.length;
      const res = await call(w.opA.token, 'post', `/pilgrims/${pilgrimId}/account-links`, email ? { email } : {});
      if (res.status >= 300) throw new Error(`invite → ${res.status} ${JSON.stringify(res.body)}`);
      const mail = ctx.mails.slice(before).at(-1)!;
      return { linkId: res.body.data.id as string, token: tokenFromMail(mail.text) };
    };
    const answer = (token: string | undefined, action: 'preview' | 'accept' | 'decline', value: string) =>
      call(token, 'post', `/travelers/me/links/${action}`, { token: value });
    const linkRow = (id: string) => ctx.prisma.pilgrimAccountLink.findUniqueOrThrow({ where: { id } });

    it('a token accepted once cannot be replayed, by the same account or another', async () => {
      const p = await ok(w.opA, 'post', '/pilgrims', {
        firstName: 'Replay', lastName: 'Probe', passportNumber: `A12R${uniq()}`, email: w.travelerA.email,
      });
      const { linkId, token } = await invite(p.id);
      expect([200, 201]).toContain((await answer(w.travelerA.token, 'accept', token)).status);
      const accepted = await linkRow(linkId);
      expect([accepted.status, accepted.userId, accepted.tokenHash]).toEqual(['ACTIVE', w.travelerA.id, null]);

      for (const who of [w.travelerA, w.travelerB]) {
        for (const action of ['preview', 'accept', 'decline'] as const) {
          const res = await answer(who.token, action, token);
          expect([403, 404], `${who.email} ${action} replay → ${res.status}`).toContain(res.status);
        }
      }
      const after = await linkRow(linkId);
      expect([after.status, after.userId, after.tokenHash]).toEqual(['ACTIVE', w.travelerA.id, null]);
    });

    it('a declined and a revoked token are both dead, and a revoked link stops access on the next request', async () => {
      const declinedPilgrim = await ok(w.opA, 'post', '/pilgrims', {
        firstName: 'Declined', lastName: 'Probe', passportNumber: `A12D${uniq()}`, email: w.travelerA.email,
      });
      const declined = await invite(declinedPilgrim.id);
      expect([200, 201]).toContain((await answer(w.travelerA.token, 'decline', declined.token)).status);
      for (const action of ['preview', 'accept'] as const) {
        expect((await answer(w.travelerA.token, action, declined.token)).status).toBe(404);
      }
      expect((await linkRow(declined.linkId)).status).toBe('DECLINED');

      const revokedPilgrim = await ok(w.opA, 'post', '/pilgrims', {
        firstName: 'Revoked', lastName: 'Probe', passportNumber: `A12V${uniq()}`, email: w.travelerA.email,
      });
      const revoked = await invite(revokedPilgrim.id);
      await ok(w.opA, 'post', `/pilgrims/${revokedPilgrim.id}/account-links/${revoked.linkId}/revoke`, { reason: 'A12 probe revoke' });
      for (const action of ['preview', 'accept', 'decline'] as const) {
        expect((await answer(w.travelerA.token, action, revoked.token)).status).toBe(404);
      }
      const row = await linkRow(revoked.linkId);
      expect(row.status).not.toBe('ACTIVE');
      expect(row.userId).toBeNull();
    });

    it('an expired token is refused and is consumed, not left usable', async () => {
      const p = await ok(w.opA, 'post', '/pilgrims', {
        firstName: 'Expired', lastName: 'Probe', passportNumber: `A12E${uniq()}`, email: w.travelerA.email,
      });
      const { linkId, token } = await invite(p.id);
      await ctx.prisma.pilgrimAccountLink.update({ where: { id: linkId }, data: { expiresAt: new Date(Date.now() - 1000) } });
      expect((await answer(w.travelerA.token, 'accept', token)).status).toBe(404);
      const row = await linkRow(linkId);
      expect([row.status, row.tokenHash, row.userId]).toEqual(['EXPIRED', null, null]);
      expect((await answer(w.travelerA.token, 'accept', token)).status).toBe(404);
    });

    it('a valid token is useless to the wrong account, an organization account and an unverified account', async () => {
      const p = await ok(w.opA, 'post', '/pilgrims', {
        firstName: 'Wrong', lastName: 'Account', passportNumber: `A12W${uniq()}`, email: w.travelerA.email,
      });
      const { linkId, token } = await invite(p.id);

      // Another traveler.
      expect((await answer(w.travelerB.token, 'accept', token)).status).toBe(403);
      // Organization identities of every kind, including the inviting organization and the platform.
      for (const a of [w.opA, w.opB, w.staffA, w.hotelA, w.transportA, w.visaA, w.financeA, w.superAdmin]) {
        const res = await answer(a.token, 'accept', token);
        expect([403, 404], `${a.email} accept → ${res.status}`).toContain(res.status);
      }
      // Anonymous.
      expect((await answer(undefined, 'accept', token)).status).toBe(401);
      // A traveler with the right address but an unverified email.
      const email = w.travelerA.email;
      const impostorEmail = `a12-unverified-${uniq()}@people.test`;
      const u = await ctx.prisma.user.create({
        data: {
          tenantId: w.tenants.community, email: impostorEmail, passwordHash: await bcrypt.hash(PASSWORD, 4),
          firstName: 'Un', lastName: 'Verified', status: 'PENDING_VERIFICATION',
        },
      });
      await ctx.app.get(RbacService).grantSystemRole(u.id, 'PILGRIM');
      const login = await ctx.http().post(api('/auth/login')).send({ email: impostorEmail, password: PASSWORD });
      if (login.status === 200) {
        expect((await answer(login.body.data.accessToken, 'accept', token)).status).toBe(403);
        // Now give that account the invited address but leave it unverified.
        await ctx.prisma.user.update({ where: { id: u.id }, data: { email: `x-${email}` } });
      }
      const row = await linkRow(linkId);
      expect([row.status, row.userId]).toEqual(['INVITED', null]);
      // The rightful owner still succeeds afterwards.
      expect([200, 201]).toContain((await answer(w.travelerA.token, 'accept', token)).status);
    });

    it('two accepts of the same token in flight produce exactly one link', async () => {
      const p = await ok(w.opA, 'post', '/pilgrims', {
        firstName: 'Race', lastName: 'Probe', passportNumber: `A12C${uniq()}`, email: w.travelerA.email,
      });
      const { linkId, token } = await invite(p.id);
      const results = await Promise.all([1, 2, 3, 4].map(() => answer(w.travelerA.token, 'accept', token)));
      expect(results.filter((r) => r.status < 300)).toHaveLength(1);
      const row = await linkRow(linkId);
      expect([row.status, row.userId]).toEqual(['ACTIVE', w.travelerA.id]);
      expect(await ctx.prisma.pilgrimAccountLink.count({ where: { pilgrimId: p.id, status: 'ACTIVE' } })).toBe(1);
    });
  });

  // ═════════════════════════════════════════════════════════════════════════
  // 5. Money
  // ═════════════════════════════════════════════════════════════════════════
  describe('money', () => {
    let listing: any;
    const book = (a: Actor) => ok(a, 'post', `/marketplace/listings/${listing.id}/bookings`, { partySize: 2, customerName: 'Guest' });
    const checkout = (a: Actor, listingBookingId: string, extra: Record<string, unknown> = {}) =>
      call(a.token, 'post', '/payments/checkout', { listingBookingId, ...extra });
    const paymentRow = (id: string) => ctx.prisma.payment.findUniqueOrThrow({ where: { id } });

    beforeAll(async () => {
      listing = await ok(w.opA, 'post', '/marketplace/listings', {
        title: `A12 money ${uniq()}`, category: 'hotel_room', priceFrom: 250, pricingModel: 'PER_PERSON',
      });
    });

    it('the amount and currency of a checkout come from the server, whatever the client sends', async () => {
      const booking = await book(w.travelerA);
      // Client-chosen money is not ignored — the request is refused outright.
      for (const extra of [
        { amount: 1 }, { amountCents: 1 }, { totalCents: 1 }, { currency: 'XXX' },
        { priceCents: 1 }, { total: 0.01 }, { feeCents: 0 }, { status: 'COMPLETED' },
      ]) {
        const res = await checkout(w.travelerA, booking.id, extra);
        expect(res.status, `checkout with ${JSON.stringify(extra)} → ${res.status}`).toBe(400);
      }
      expect(await ctx.prisma.payment.count({ where: { listingBookingId: booking.id } })).toBe(0);
      // A clean checkout is priced by the server from the booking.
      const opened = await ok(w.travelerA, 'post', '/payments/checkout', { listingBookingId: booking.id });
      const pay = await paymentRow(opened.paymentId);
      const lb = await ctx.prisma.listingBooking.findUniqueOrThrow({ where: { id: booking.id } });
      expect(Number(pay.amountCents)).toBe(Number(lb.totalAmountCents));
      expect(Number(pay.amountCents)).toBeGreaterThan(1);
      expect(pay.currency).toBe(lb.currency);
    });

    it('a traveler cannot read, complete or refund another traveler\'s checkout', async () => {
      const booking = await book(w.travelerA);
      const opened = await ok(w.travelerA, 'post', '/payments/checkout', { listingBookingId: booking.id });
      const before = await paymentRow(opened.paymentId);
      const attempts: [Method, string, unknown?][] = [
        ['get', `/payments/checkout/${opened.paymentId}`],
        ['post', `/payments/checkout/${opened.paymentId}/sandbox-complete`, { scenario: 'succeed' }],
        ['get', `/payments/${opened.paymentId}`],
        ['post', `/payments/${opened.paymentId}/refund`, { amount: 1 }],
        ['post', `/payments/intents/${opened.paymentId}/confirm`, {}],
        ['post', `/payments/intents/${opened.paymentId}/cancel`, {}],
      ];
      for (const [method, path, body] of attempts) {
        const res = await call(w.travelerB.token, method, path, body);
        expect(res.status, `travelerB ${method} ${path} → ${res.status} ${JSON.stringify(res.body)}`).toBeGreaterThanOrEqual(400);
      }
      // Another organization cannot either.
      for (const [method, path, body] of attempts) {
        const res = await call(w.opB.token, method, path, body);
        expect(res.status, `opB ${method} ${path} → ${res.status}`).toBeGreaterThanOrEqual(400);
      }
      const after = await paymentRow(opened.paymentId);
      expect([after.status, String(after.amountCents), after.currency, after.gatewayStatus])
        .toEqual([before.status, String(before.amountCents), before.currency, before.gatewayStatus]);
    });

    it('a booking cannot be captured twice, however many completions race', async () => {
      const booking = await book(w.travelerA);
      const opened = await ok(w.travelerA, 'post', '/payments/checkout', { listingBookingId: booking.id });
      const done = await Promise.all(
        [1, 2, 3, 4].map(() => call(w.travelerA.token, 'post', `/payments/checkout/${opened.paymentId}/sandbox-complete`, { scenario: 'succeed' })),
      );
      expect(done.some((r) => r.status < 300)).toBe(true);
      const pay = await paymentRow(opened.paymentId);
      const lb = await ctx.prisma.listingBooking.findUniqueOrThrow({ where: { id: booking.id } });
      expect(pay.status).toBe('COMPLETED');
      expect(lb.paymentStatus).toBe('PAID');
      const captures = await ctx.prisma.paymentTransaction.count({ where: { paymentId: pay.id, type: 'CAPTURED' } });
      expect(captures).toBe(1);

      // A replayed provider capture changes nothing further.
      const raw = JSON.stringify({ id: `evt_a12_${uniq()}`, type: 'payment.captured', data: { providerRef: pay.gatewayRef } });
      for (let i = 0; i < 3; i++) {
        await ctx.http().post(api('/payments/webhook/sandbox')).set('Content-Type', 'application/json').set('x-signature', sign(raw)).send(raw);
      }
      const lbAfter = await ctx.prisma.listingBooking.findUniqueOrThrow({ where: { id: booking.id } });
      expect(lbAfter.paymentStatus).toBe('PAID');
      expect(await ctx.prisma.payment.count({ where: { listingBookingId: booking.id, status: 'COMPLETED' } })).toBe(1);
      expect(await ctx.prisma.paymentTransaction.count({ where: { paymentId: pay.id, type: 'CAPTURED' } })).toBe(1);
    });

    it('a refund can never exceed what was captured, and never runs twice', async () => {
      const booking = await book(w.travelerA);
      const opened = await ok(w.travelerA, 'post', '/payments/checkout', { listingBookingId: booking.id });
      await ok(w.travelerA, 'post', `/payments/checkout/${opened.paymentId}/sandbox-complete`, { scenario: 'succeed' });
      const pay = await paymentRow(opened.paymentId);
      const captured = Number(pay.amountCents) / 100;

      for (const amount of [captured * 10, captured + 0.01, -1, 0]) {
        const res = await call(w.financeA.token, 'post', `/payments/${pay.id}/refund`, { amount });
        expect(res.status, `refund ${amount} → ${res.status} ${JSON.stringify(res.body)}`).toBeGreaterThanOrEqual(400);
      }
      expect(Number((await paymentRow(pay.id)).refundedCents ?? 0)).toBe(0);

      const races = await Promise.all([1, 2, 3].map(() => call(w.financeA.token, 'post', `/payments/${pay.id}/refund`, { amount: captured })));
      expect(races.filter((r) => r.status < 300).length).toBe(1);
      const settled = await paymentRow(pay.id);
      expect(Number(settled.refundedCents)).toBeLessThanOrEqual(Number(settled.amountCents));
      expect(Number(settled.refundedCents)).toBe(Number(settled.amountCents));
    });

    it('a cancelled booking cannot be paid, and a late capture is held rather than counted', async () => {
      const booking = await book(w.travelerA);
      const opened = await ok(w.travelerA, 'post', '/payments/checkout', { listingBookingId: booking.id });
      await ok(w.travelerA, 'post', `/marketplace/bookings/${booking.id}/cancel`, {});
      const lb = await ctx.prisma.listingBooking.findUniqueOrThrow({ where: { id: booking.id } });
      expect(lb.status).toBe('CANCELLED');

      // No new attempt, and the old one cannot be completed into money.
      expect((await checkout(w.travelerA, booking.id)).status).toBeGreaterThanOrEqual(400);
      const raw = JSON.stringify({ id: `evt_a12_${uniq()}`, type: 'payment.captured', data: { providerRef: (await paymentRow(opened.paymentId)).gatewayRef } });
      await ctx.http().post(api('/payments/webhook/sandbox')).set('Content-Type', 'application/json').set('x-signature', sign(raw)).send(raw);

      const after = await ctx.prisma.listingBooking.findUniqueOrThrow({ where: { id: booking.id } });
      expect(after.status).toBe('CANCELLED');
      expect(after.paymentStatus).not.toBe('PAID');
      const pay = await paymentRow(opened.paymentId);
      expect(pay.status).toBe('DISPUTED');
      expect(pay.failureReason ?? '').toMatch(/refund/i);
    });

    it('a forged or foreign-secret webhook is refused and settles nothing', async () => {
      const booking = await book(w.travelerA);
      const opened = await ok(w.travelerA, 'post', '/payments/checkout', { listingBookingId: booking.id });
      const ref = (await paymentRow(opened.paymentId)).gatewayRef!;
      const raw = JSON.stringify({ id: `evt_a12_${uniq()}`, type: 'payment.captured', data: { providerRef: ref } });
      const foreign = `sha256=${createHmac('sha256', 'not-the-secret').update(raw).digest('hex')}`;
      const deliveries = [
        { sig: undefined as string | undefined, body: raw },
        { sig: 'sha256=deadbeef', body: raw },
        { sig: foreign, body: raw },
        { sig: sign(raw), body: raw.replace(/"type":"[^"]+"/, '"type":"payment.captured","injected":true') },
        { sig: sign(''), body: '' },
      ];
      for (const d of deliveries) {
        const req = ctx.http().post(api('/payments/webhook/sandbox')).set('Content-Type', 'application/json');
        if (d.sig) req.set('x-signature', d.sig);
        const res = await req.send(d.body);
        expect(res.status, `forged delivery → ${res.status}`).toBeGreaterThanOrEqual(400);
      }
      const pay = await paymentRow(opened.paymentId);
      expect(pay.status).toBe('PENDING');
      expect((await ctx.prisma.listingBooking.findUniqueOrThrow({ where: { id: booking.id } })).paymentStatus).not.toBe('PAID');
    });
  });

  // ═════════════════════════════════════════════════════════════════════════
  // 6. Listing moderation
  // ═════════════════════════════════════════════════════════════════════════
  describe('listing moderation', () => {
    it('an owner cannot undo a platform takedown through any route it holds', async () => {
      const listing = await ok(w.opA, 'post', '/marketplace/listings', {
        title: `A12 moderated ${uniq()}`, category: 'hotel_room', priceFrom: 100, pricingModel: 'PER_PERSON',
      });
      await ok(w.opA, 'put', `/marketplace/listings/${listing.id}`, { status: 'PUBLISHED' });
      await ok(w.superAdmin, 'put', `/admin/listings/${listing.id}/take-down`, { reason: 'A12 probe takedown' });
      const down = await ctx.prisma.listing.findUniqueOrThrow({ where: { id: listing.id } });
      expect([down.moderationStatus, down.status, down.isActive]).toEqual(['TAKEN_DOWN', 'ARCHIVED', false]);

      const attempts: [Method, string, unknown][] = [
        ['put', `/marketplace/listings/${listing.id}`, { status: 'DRAFT' }],
        ['put', `/marketplace/listings/${listing.id}`, { status: 'PUBLISHED' }],
        ['put', `/marketplace/listings/${listing.id}`, { status: 'PAUSED' }],
        ['put', `/marketplace/listings/${listing.id}`, { isActive: true }],
        ['put', `/marketplace/listings/${listing.id}`, { moderationStatus: 'CLEAR', moderationReason: null }],
        ['put', `/marketplace/listings/${listing.id}`, { status: 'DRAFT', moderationStatus: 'CLEAR' }],
        ['put', `/marketplace/listings/${listing.id}`, { title: 'renamed', status: 'PUBLISHED' }],
        ['delete', `/marketplace/listings/${listing.id}`, undefined],
      ];
      for (const [method, path, body] of attempts) {
        const res = await call(w.opA.token, method, path, body);
        const row = await ctx.prisma.listing.findUniqueOrThrow({ where: { id: listing.id } });
        expect([row.moderationStatus, row.status, row.isActive], `after ${method} ${JSON.stringify(body)} (→ ${res.status})`)
          .toEqual(['TAKEN_DOWN', 'ARCHIVED', false]);
      }
      // It stays invisible to the public and unbookable.
      const publicList = await call(undefined, 'get', `/marketplace/listings?q=${encodeURIComponent(listing.name)}&limit=100`);
      expect(JSON.stringify(publicList.body)).not.toContain(listing.id);
      expect((await call(undefined, 'get', `/marketplace/listings/${listing.id}`)).status).toBe(404);
      expect((await call(w.travelerA.token, 'post', `/marketplace/listings/${listing.id}/bookings`, { partySize: 1, customerName: 'x' })).status)
        .toBeGreaterThanOrEqual(400);
      // Only the platform lifts it.
      await ok(w.superAdmin, 'put', `/admin/listings/${listing.id}/approve`, {});
      expect((await ctx.prisma.listing.findUniqueOrThrow({ where: { id: listing.id } })).moderationStatus).toBe('CLEAR');
    });
  });

  // ═════════════════════════════════════════════════════════════════════════
  // 7. Uploads and downloads
  // ═════════════════════════════════════════════════════════════════════════
  describe('uploads and downloads', () => {
    const PDF = Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.alloc(2048, 0x20)]);

    it('a signed document link issued to organization A is not obtainable by organization B', async () => {
      const app = await ok(w.opA, 'post', '/compliance/visas', {
        pilgrimId: victim.pilgrim.id, regulatorySystem: 'NUSUK_MASAR', visaType: 'UMRAH',
      });
      const doc = await ok(w.opA, 'post', `/compliance/visas/${app.id}/documents`, { type: 'PASSPORT', name: `${MARK}-doc` });
      const docId = doc.id as string;
      const version = await ctx.http()
        .post(api(`/compliance/visas/${app.id}/documents/${docId}/versions`))
        .set(bearer(w.opA))
        .attach('file', PDF, 'passport.pdf');
      expect(version.status, JSON.stringify(version.body)).toBe(201);

      // B cannot ask for a link, and cannot upload into A's application.
      for (const a of [w.opB, w.visaB, w.travelerB, w.hotelB]) {
        const res = await call(a.token, 'get', `/documents/visa/${docId}/url`);
        expect(res.status, `${a.email} → ${res.status}`).toBeGreaterThanOrEqual(400);
      }
      const intrusion = await ctx.http()
        .post(api(`/compliance/visas/${app.id}/documents/${docId}/versions`))
        .set(bearer(w.opB))
        .attach('file', PDF, 'x.pdf');
      expect(intrusion.status).toBeGreaterThanOrEqual(400);
      expect(await ctx.prisma.visaDocumentVersion.count({ where: { documentId: docId } })).toBe(1);
      expect(await ctx.prisma.visaDocument.count({ where: { applicationId: app.id } })).toBe(1);

      // A's own link works; the same link tampered with does not.
      const issued = await ok(w.opA, 'get', `/documents/visa/${docId}/url`);
      const signedPath = String(issued.url).replace('/proxy-api', '/api/v1');
      expect((await ctx.http().get(signedPath)).status).toBe(200);
      const token = signedPath.split('/').pop()!;
      const parts = token.split('.');
      const tampered = `${parts[0]}.${Buffer.from(
        JSON.stringify({ ...JSON.parse(Buffer.from(parts[1], 'base64url').toString()), key: '../../../etc/passwd' }),
      ).toString('base64url')}.${parts[2]}`;
      expect((await ctx.http().get(signedPath.replace(token, tampered))).status).toBe(401);
      expect((await ctx.http().get(signedPath.replace(token, `${token}x`))).status).toBe(401);
    });

    it('an upload of the wrong type or over the size limit is refused and stores nothing', async () => {
      const before = await ctx.prisma.mediaObject.count().catch(() => 0);
      const evil = Buffer.from('<?php system($_GET["c"]); ?>');
      const disguised = Buffer.concat([Buffer.from('GIF89a'), Buffer.from('\n<script>alert(1)</script>')]);
      const huge = Buffer.alloc(30 * 1024 * 1024, 0x41);
      const cases: [string, Buffer, string][] = [
        ['script.php', evil, 'application/x-php'],
        ['shell.php.png', evil, 'image/png'],
        ['polyglot.gif', disguised, 'image/gif'],
        ['huge.png', huge, 'image/png'],
        ['payload.svg', Buffer.from('<svg onload="alert(1)"></svg>'), 'image/svg+xml'],
      ];
      for (const [name, buf, mime] of cases) {
        const res = await ctx.http().post(api('/uploads')).set(bearer(w.opA)).attach('file', buf, { filename: name, contentType: mime });
        expect(res.status, `${name} → ${res.status} ${JSON.stringify(res.body)}`).toBeGreaterThanOrEqual(400);
      }
      expect(await ctx.prisma.mediaObject.count().catch(() => before)).toBe(before);
    }, 120_000);
  });

  // ═════════════════════════════════════════════════════════════════════════
  // 8. Sessions
  // ═════════════════════════════════════════════════════════════════════════
  describe('sessions', () => {
    /** Starts at the beginning of a wall-clock second so the next requests share it. */
    const alignToSecond = async () => {
      while (Date.now() % 1000 > 120) await new Promise((r) => setTimeout(r, 5));
    };
    const makeTraveler = async () => {
      const email = `a12-session-${uniq()}@people.test`;
      const u = await ctx.prisma.user.create({
        data: {
          tenantId: w.tenants.community, email, passwordHash: await bcrypt.hash(PASSWORD, 4),
          firstName: 'Session', lastName: 'Probe', status: 'ACTIVE', emailVerifiedAt: new Date(),
        },
      });
      await ctx.app.get(RbacService).grantSystemRole(u.id, 'PILGRIM');
      return { id: u.id, email };
    };
    const login = async (email: string, password = PASSWORD) => {
      const res = await ctx.http().post(api('/auth/login')).send({ email, password });
      expect(res.status, `login ${email} → ${res.status}`).toBe(200);
      return res.body.data.accessToken as string;
    };

    it('logout-everywhere kills a token minted in the same second', async () => {
      const u = await makeTraveler();
      await alignToSecond();
      const doomed = await login(u.email);
      const actor = await login(u.email);
      expect((await call(doomed, 'get', '/auth/me')).status).toBe(200);
      expect((await call(actor, 'post', '/auth/logout-all', {})).status).toBeLessThan(300);
      expect((await call(doomed, 'get', '/auth/me')).status).toBe(401);
      expect((await call(actor, 'get', '/auth/me')).status).toBe(401);
      expect((await call(await login(u.email), 'get', '/auth/me')).status).toBe(200);
    });

    it('a password change kills a token minted in the same second', async () => {
      const u = await makeTraveler();
      await alignToSecond();
      const doomed = await login(u.email);
      const actor = await login(u.email);
      const res = await call(actor, 'post', '/auth/change-password', { currentPassword: PASSWORD, newPassword: `${PASSWORD}-new1` });
      expect(res.status, JSON.stringify(res.body)).toBeLessThan(300);
      expect((await call(doomed, 'get', '/auth/me')).status).toBe(401);
      expect((await call(await login(u.email, `${PASSWORD}-new1`), 'get', '/auth/me')).status).toBe(200);
    });

    it('an administrative force-logout and a lock kill a token minted in the same second', async () => {
      const forced = await makeTraveler();
      await alignToSecond();
      const forcedToken = await login(forced.email);
      expect((await call(w.superAdmin.token, 'post', `/admin/users/${forced.id}/force-logout`, {})).status).toBeLessThan(300);
      expect((await call(forcedToken, 'get', '/auth/me')).status).toBe(401);

      const locked = await makeTraveler();
      await alignToSecond();
      const lockedToken = await login(locked.email);
      expect((await call(w.superAdmin.token, 'put', `/admin/users/${locked.id}/status`, { status: 'LOCKED' })).status).toBeLessThan(300);
      expect((await call(lockedToken, 'get', '/auth/me')).status).toBe(401);
      // And it cannot sign back in.
      expect((await ctx.http().post(api('/auth/login')).send({ email: locked.email, password: PASSWORD })).status).toBeGreaterThanOrEqual(400);
    });

    it('a refresh token cannot resurrect a revoked session', async () => {
      const u = await makeTraveler();
      const res = await ctx.http().post(api('/auth/login')).send({ email: u.email, password: PASSWORD });
      const refresh = res.body.data.refreshToken as string;
      expect((await call(res.body.data.accessToken, 'post', '/auth/logout-all', {})).status).toBeLessThan(300);
      const again = await ctx.http().post(api('/auth/refresh')).send({ refreshToken: refresh });
      expect(again.status, JSON.stringify(again.body)).toBeGreaterThanOrEqual(400);
    });
  });

  // ═════════════════════════════════════════════════════════════════════════
  // 8b. Reference numbers
  // ═════════════════════════════════════════════════════════════════════════
  describe('reference numbers', () => {
    /**
     * DEFECT A12-3 (open). Booking, invoice, budget-plan and visa reference numbers
     * are `<PREFIX>-<year>-<5 random digits>` (Math.random), and the unique index is
     * PLATFORM-WIDE, not per organization. The space is 100 000 values shared by every
     * organization in a year and there is no collision retry: once a few hundred
     * records exist, an ordinary create starts failing on the unique constraint.
     * Implementation: bookings.service.ts:95 / :349, finance.service.ts:221 / :952,
     * compliance.service.ts:140, marketplace-requests.service.ts:482.
     */
    it('DEFECT A12-3: references are 5 random digits in a platform-wide unique space with no retry', async () => {
      const mine = await ok(w.opA, 'post', '/bookings', { packageId: victim.package.id, pilgrimIds: [victim.pilgrim.id] });
      const row = await ctx.prisma.booking.findUniqueOrThrow({ where: { id: mine.id } });
      expect(row.bookingRef, 'reference format').toMatch(/^UC-\d{4}-\d{5}$/);

      // The index is global: another organization cannot hold the same reference.
      const pkgB = await ok(w.opB, 'post', '/packages', { name: `A12 ref ${uniq()}`, type: 'UMRAH', priceAdult: 10 });
      const theirs = await ok(w.opB, 'post', '/bookings', { packageId: pkgB.id });
      await expect(
        ctx.prisma.booking.update({ where: { id: theirs.id }, data: { bookingRef: row.bookingRef } }),
      ).rejects.toThrow();

      // And a collision is not retried — the service surfaces the constraint error.
      const collide = await ctx.http()
        .post(api('/bookings'))
        .set(bearer(w.opA))
        .send({ packageId: victim.package.id, bookingRef: row.bookingRef });
      // The reference is server-owned (a client value is ignored), so this succeeds
      // with a NEW reference — which is correct, and is why the only defence against a
      // collision is the 100 000-value space itself.
      if (collide.status < 300) {
        const made = await ctx.prisma.booking.findUniqueOrThrow({ where: { id: collide.body.data.id } });
        expect(made.bookingRef).not.toBe(row.bookingRef);
      }
    });
  });

  // ═════════════════════════════════════════════════════════════════════════
  // 9. Duplicate submits
  // ═════════════════════════════════════════════════════════════════════════
  describe('duplicate submits', () => {
    /**
     * DEFECT A12-1 (open). The duplicate-submit guard is client state in one tab
     * (apps/web/lib/single-flight.ts — its own comment says so). Records that are
     * not money have no server-side idempotency, so a determined double submit —
     * two browser tabs, a retry, any non-browser client — still creates duplicates.
     * This test CHARACTERISES the defect as it stands today: when the server gains
     * an idempotency rule for /pilgrims it must be changed back to `toBe(1)`.
     */
    it('DEFECT A12-1: five identical pilgrim submits still create five records (no server-side idempotency)', async () => {
      const passport = `A12DUP${uniq()}`;
      const body = { firstName: 'Double', lastName: 'Submit', passportNumber: passport };
      const results = await Promise.all([1, 2, 3, 4, 5].map(() => call(w.opA.token, 'post', '/pilgrims', body)));
      const created = results.filter((r) => r.status < 300);
      const stored = await ctx.prisma.pilgrim.count({ where: { tenantId: w.tenants.opA, passportNumber: passport } });
      expect(created.length).toBe(5);
      expect(stored, 'if this is now 1 the defect is fixed — restore the `toBe(1)` expectation').toBe(5);
    });

    it('a double-submitted marketplace booking and its checkout stay single', async () => {
      const listing = await ok(w.opA, 'post', '/marketplace/listings', {
        title: `A12 dup ${uniq()}`, category: 'hotel_room', priceFrom: 100, pricingModel: 'PER_PERSON',
      });
      const booking = await ok(w.travelerA, 'post', `/marketplace/listings/${listing.id}/bookings`, { partySize: 1, customerName: 'Guest' });
      const opened = await Promise.all(
        [1, 2, 3, 4].map(() => call(w.travelerA.token, 'post', '/payments/checkout', { listingBookingId: booking.id })),
      );
      const ids = new Set(opened.filter((r) => r.status < 300).map((r) => r.body.data.paymentId));
      expect(ids.size).toBe(1);
      expect(await ctx.prisma.payment.count({ where: { listingBookingId: booking.id, status: { in: ['PENDING', 'PROCESSING'] } } })).toBe(1);
    });
  });
});

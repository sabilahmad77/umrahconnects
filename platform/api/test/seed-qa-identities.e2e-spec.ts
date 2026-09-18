import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, statSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { api, createTestApp, TestContext } from './app';
import { RbacService } from '../src/modules/rbac/rbac.service';
import { assertLocalQaDatabase } from '../prisma/scripts/qa/local-guard';
import { seedQaFixtures } from '../prisma/scripts/qa/seed';
import { QA_FIXTURE, QA_IDENTITIES } from '../prisma/scripts/qa/fixtures';
import type { QaCredentialFile } from '../prisma/scripts/qa/credentials';

/**
 * D08 / AUD-028 and the Engineering 100 local QA identities: the seed refuses
 * anything that might be a real database, converges on the same state when it
 * runs again, issues working per-identity passwords into a 0600 file, and
 * leaves the domain data internally consistent.
 */
describe('local QA fixtures seed (D08)', () => {
  let ctx: TestContext;
  let dir: string;
  let credentialsPath: string;
  const read = () => JSON.parse(readFileSync(credentialsPath, 'utf8')) as QaCredentialFile;
  const qaTenants = async () => (await ctx.prisma.tenant.findMany({ where: { metadata: { path: ['fixture'], equals: QA_FIXTURE } }, select: { id: true } })).map((t) => t.id);
  const snapshot = async () => {
    const tenantId = { in: await qaTenants() };
    const p = ctx.prisma;
    return {
      tenants: tenantId.in.length,
      users: await p.user.count({ where: { email: { endsWith: '@qa.umrahconnect.test' } } }),
      pilgrims: await p.pilgrim.count({ where: { tenantId } }),
      bookings: await p.booking.count({ where: { tenantId } }),
      bookingPilgrims: await p.bookingPilgrim.count({ where: { tenantId } }),
      invoices: await p.invoice.count({ where: { tenantId } }),
      payments: await p.payment.count({ where: { tenantId } }),
      visas: await p.visaApplication.count({ where: { tenantId } }),
      hotels: await p.hotel.count({ where: { tenantId } }),
      rooms: await p.room.count({ where: { tenantId } }),
      vehicles: await p.vehicle.count({ where: { tenantId } }),
      routes: await p.transportRoute.count({ where: { tenantId } }),
      listings: await p.listing.count({ where: { vendor: { tenantId } } }),
      groups: await p.tripGroup.count({ where: { tenantId } }),
    };
  };

  beforeAll(async () => {
    ctx = await createTestApp();
    dir = mkdtempSync(join(tmpdir(), 'uc-qa-seed-'));
    credentialsPath = join(dir, 'local', 'qa-credentials.json');
  });
  afterAll(async () => {
    rmSync(dir, { recursive: true, force: true });
    await ctx?.close();
  });

  it('refuses production, remote hosts and databases that do not look local', () => {
    const local = 'postgresql://dev@127.0.0.1:5433/umrah_eng100_a07?schema=public';
    expect(assertLocalQaDatabase({ DATABASE_URL: local })).toEqual({ host: '127.0.0.1', database: 'umrah_eng100_a07' });
    expect(assertLocalQaDatabase({ DATABASE_URL: 'postgresql://dev@localhost/umrah_connects_test' }).database).toBe('umrah_connects_test');
    expect(() => assertLocalQaDatabase({ DATABASE_URL: local, NODE_ENV: 'production' })).toThrow(/production/);
    expect(() => assertLocalQaDatabase({})).toThrow(/DATABASE_URL/);
    expect(() => assertLocalQaDatabase({ DATABASE_URL: 'mysql://x@127.0.0.1/app_dev' })).toThrow(/PostgreSQL/);
    expect(() => assertLocalQaDatabase({ DATABASE_URL: 'postgresql://u:p@postgres:5432/umrah_eng100_a07' })).toThrow(/loopback/);
    expect(() => assertLocalQaDatabase({ DATABASE_URL: 'postgresql://u:p@db.example.com/umrah_connects_test' })).toThrow(/loopback/);
    // The canonical local name is also production's name: only an exact, deliberate override allows it.
    expect(() => assertLocalQaDatabase({ DATABASE_URL: 'postgresql://dev@127.0.0.1:5433/umrah_connects' })).toThrow(/does not look like/);
    expect(() => assertLocalQaDatabase({ DATABASE_URL: 'postgresql://dev@127.0.0.1:5433/umrah_connects', QA_SEED_ALLOW_DATABASE: 'umrah' })).toThrow(/does not look like/);
    expect(assertLocalQaDatabase({ DATABASE_URL: 'postgresql://dev@127.0.0.1:5433/umrah_connects', QA_SEED_ALLOW_DATABASE: 'umrah_connects' }).database).toBe('umrah_connects');
    expect(() => assertLocalQaDatabase({ DATABASE_URL: 'postgresql://dev@127.0.0.1:5433/customer_prod' })).toThrow(/does not look like/);
  });

  it('seeds, converges on the same state when run again, and keeps passwords in a 0600 file', async () => {
    const rbac = ctx.app.get(RbacService);
    const opts = { database: 'e2e', credentialsPath };
    const first = await seedQaFixtures(ctx.prisma, rbac, opts);
    expect(first.credentials).toHaveLength(QA_IDENTITIES.length);
    const before = await snapshot();
    const fileBefore = read();

    const second = await seedQaFixtures(ctx.prisma, rbac, opts);
    expect(await snapshot()).toEqual(before);
    expect(second.credentials.map((c) => c.password)).toEqual(first.credentials.map((c) => c.password));
    expect(read().identities.map((i) => i.password)).toEqual(fileBefore.identities.map((i) => i.password));

    expect(statSync(credentialsPath).mode & 0o777).toBe(0o600);
    expect(statSync(join(dir, 'local')).mode & 0o777).toBe(0o700);
    expect(before).toMatchObject({ tenants: 8, users: 15, pilgrims: 8, bookings: 3, bookingPilgrims: 5, invoices: 3, payments: 1, visas: 9, hotels: 3, rooms: 14, vehicles: 4, routes: 3, listings: 8, groups: 1 });

    const file = read();
    expect(file.fixture).toBe(QA_FIXTURE);
    for (const entry of file.identities) {
      expect(entry.email).toMatch(/@qa\.umrahconnect\.test$/);
      expect(entry.password).toMatch(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[-_.!@#%+=]).{24}$/);
    }
    expect(new Set(file.identities.map((i) => i.password)).size).toBe(file.identities.length);
  });

  it('every identity signs in with its password and holds exactly its documented role', async () => {
    const { identities } = read();
    for (const identity of identities) {
      const login = await ctx.http().post(api('/auth/login')).send({ email: identity.email, password: identity.password });
      expect(login.status, identity.email).toBe(200);
      const me = await ctx.http().get(api('/auth/me')).set('Authorization', `Bearer ${login.body.data.accessToken}`);
      expect(me.body.data.roles, identity.email).toEqual([identity.role]);
      expect(me.body.data.emailVerified, identity.email).toBe(identity.emailVerified);
      expect(me.body.data.tenant.slug, identity.email).toBe(identity.organizationSlug);
    }
    const unverified = identities.find((i) => i.key === 'travelerUnverified')!;
    expect(unverified.emailVerified).toBe(false);
  });

  it('rotates passwords on request, and resets roles and state that testing changed', async () => {
    const rbac = ctx.app.get(RbacService);
    const finance = await ctx.prisma.user.findFirstOrThrow({ where: { email: 'finance.a@qa.umrahconnect.test' } });
    await rbac.grantSystemRole(finance.id, 'OPERATOR_ADMIN');
    await ctx.prisma.user.update({ where: { id: finance.id }, data: { status: 'LOCKED', failedLoginCount: 7 } });
    const old = read().identities.find((i) => i.key === 'financeA')!.password;

    const rotated = await seedQaFixtures(ctx.prisma, rbac, { database: 'e2e', credentialsPath, rotate: true, identitiesOnly: true });
    const fresh = rotated.credentials.find((c) => c.key === 'financeA')!.password;
    expect(fresh).not.toBe(old);
    expect((await ctx.http().post(api('/auth/login')).send({ email: 'finance.a@qa.umrahconnect.test', password: old })).status).toBe(401);
    const login = await ctx.http().post(api('/auth/login')).send({ email: 'finance.a@qa.umrahconnect.test', password: fresh });
    expect(login.status).toBe(200);
    const me = await ctx.http().get(api('/auth/me')).set('Authorization', `Bearer ${login.body.data.accessToken}`);
    expect(me.body.data.roles).toEqual(['FINANCE_MANAGER']);
  });

  it('leaves the domain data internally consistent (AUD-028) and links no traveler account', async () => {
    const tenantId = { in: await qaTenants() };
    const bookings = await ctx.prisma.booking.findMany({ where: { tenantId }, include: { pilgrims: true, package: true } });
    for (const b of bookings) {
      expect(b.pilgrims.length, b.bookingRef).toBeGreaterThan(0);
      expect(b.totalAmountCents, b.bookingRef).toBe(b.package!.basePriceCents * BigInt(b.pilgrims.length));
    }
    const pilgrims = await ctx.prisma.pilgrim.findMany({ where: { tenantId }, select: { id: true, status: true } });
    const booked = new Set((await ctx.prisma.bookingPilgrim.findMany({ where: { tenantId }, select: { pilgrimId: true } })).map((r) => r.pilgrimId));
    for (const p of pilgrims) expect(booked.has(p.id), p.status).toBe(!['LEAD', 'PROSPECT'].includes(p.status));
    for (const h of await ctx.prisma.hotel.findMany({ where: { tenantId }, include: { rooms: true } })) {
      expect(h.rooms.length, h.name).toBeGreaterThan(0);
      expect(h.totalRooms, h.name).toBe(h.rooms.length);
    }
    for (const inv of await ctx.prisma.invoice.findMany({ where: { tenantId }, include: { payments: true } })) {
      const booking = bookings.find((b) => b.id === inv.bookingId)!;
      expect(inv.totalCents, inv.invoiceRef).toBe(booking.totalAmountCents);
      const paid = inv.payments.filter((p) => p.status === 'COMPLETED').reduce((sum, p) => sum + p.amountCents, 0n);
      expect(inv.paidCents, inv.invoiceRef).toBe(paid);
      expect(booking.paidAmountCents, inv.invoiceRef).toBe(paid);
    }
    for (const r of await ctx.prisma.transportRoute.findMany({ where: { tenantId }, include: { assignments: true } })) {
      expect(r.bookedSeats, r.name).toBe(r.assignments.reduce((n, a) => n + a.passengerCount, 0));
    }
    for (const v of await ctx.prisma.vendor.findMany({ where: { tenantId }, include: { listings: true } })) {
      expect(v.listings.length, v.name).toBeGreaterThan(0);
    }
    expect(await ctx.prisma.pilgrimAccountLink.count({ where: { tenantId } })).toBe(0);
    const passports = (await ctx.prisma.pilgrim.findMany({ where: { tenantId }, select: { passportNumber: true } })).map((p) => p.passportNumber);
    expect(passports.every((n) => n?.startsWith('QA-'))).toBe(true);
  });
});

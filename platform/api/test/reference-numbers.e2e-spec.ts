import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { api, createTestApp, TestContext } from './app';
import { Actor, bearer, buildWorld, World } from './fixtures';
import { bindPrincipalToDbContext, runWithDbContext } from '../src/prisma/db-context';
import { ReferenceNumberService } from '../src/modules/references/reference-number.service';

/**
 * A12-3 — human-facing reference numbers.
 *
 * `<PREFIX>-<year>-<5 digits of Math.random()>` behind a PLATFORM-WIDE unique
 * index draws from 100 000 values shared by every organization, with no retry: by
 * the birthday bound a few hundred records a year already make a collision likely,
 * and the collision fails an ordinary create. References are now counted per
 * organization and their uniqueness is scoped to it.
 */

const uniq = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
const YEAR = String(new Date().getFullYear());

describe('reference numbers are per-organization and collision-free', () => {
  let ctx: TestContext;
  let w: World;
  let references: ReferenceNumberService;

  const call = (a: Actor, method: 'get' | 'post', path: string, body?: Record<string, unknown>) => {
    const req = ctx.http()[method](api(path)).set(bearer(a));
    return body !== undefined ? req.send(body) : req;
  };
  const ok = async (a: Actor, method: 'get' | 'post', path: string, body?: Record<string, unknown>) => {
    const res = await call(a, method, path, body);
    if (res.status >= 300) throw new Error(`${a.email} ${method.toUpperCase()} ${path} → ${res.status} ${JSON.stringify(res.body)}`);
    return res.body.data;
  };
  /** Allocate as the API does: inside a request's database scope, so RLS applies. */
  const asTenant = <T>(actor: Actor, fn: () => Promise<T>) =>
    runWithDbContext({}, async () => {
      bindPrincipalToDbContext({ sub: actor.id, tenantId: actor.tenantId, tenantType: 'OPERATOR' }, w.tenants.community);
      return fn();
    });

  beforeAll(async () => {
    ctx = await createTestApp();
    w = await buildWorld(ctx);
    references = ctx.app.get(ReferenceNumberService);
  });
  afterAll(async () => {
    await ctx?.close();
  });

  it('hands out 3 000 references for one organization with no failure and no duplicate', async () => {
    const seen: string[] = [];
    await asTenant(w.opA, async () => {
      for (let i = 0; i < 3_000; i += 1) seen.push(await references.next(w.opA.tenantId, 'UC'));
    });
    expect(seen).toHaveLength(3_000);
    expect(new Set(seen).size).toBe(3_000);
    for (const ref of seen) expect(ref).toMatch(new RegExp(`^UC-${YEAR}-\\d{5,}$`));
    // Consecutive, and never back to a number already handed out.
    const numbers = seen.map((r) => Number(r.split('-')[2]));
    expect(numbers.every((n, i) => i === 0 || n === numbers[i - 1] + 1)).toBe(true);
  });

  it('concurrent allocations never hand the same number to two callers', async () => {
    const refs = await asTenant(w.opB, () =>
      Promise.all(Array.from({ length: 250 }, () => references.next(w.opB.tenantId, 'INV'))),
    );
    expect(new Set(refs).size).toBe(250);
  });

  it('concurrent real creates all succeed, each with its own reference', async () => {
    const pkg = await ok(w.opA, 'post', '/packages', { name: `Ref pkg ${uniq()}`, type: 'UMRAH', priceAdult: 1000 });
    const results = await Promise.all(
      Array.from({ length: 25 }, () => call(w.opA, 'post', '/bookings', { packageId: pkg.id })),
    );
    expect(results.map((r) => r.status)).toEqual(Array(25).fill(201));
    const refs = results.map((r) => r.body.data.bookingRef as string);
    expect(new Set(refs).size).toBe(25);
    for (const ref of refs) expect(ref).toMatch(new RegExp(`^UC-${YEAR}-\\d{5,}$`));
  });

  it('two organizations may hold the same human-facing number; one organization may not hold it twice', async () => {
    const pkg = await ok(w.opA, 'post', '/packages', { name: `Twin pkg ${uniq()}`, type: 'UMRAH', priceAdult: 100 });
    const booking = await ok(w.opA, 'post', '/bookings', { packageId: pkg.id });
    const ref: string = booking.bookingRef;

    // The same printed number in ANOTHER organization is a different booking — allowed.
    const twin = await ctx.prisma.booking.create({
      data: { tenantId: w.tenants.opB, bookingRef: ref, totalAmountCents: BigInt(0) },
    });
    expect(twin.bookingRef).toBe(ref);

    // Inside one organization the number still identifies exactly one booking.
    await expect(
      ctx.prisma.booking.create({ data: { tenantId: w.tenants.opA, bookingRef: ref, totalAmountCents: BigInt(0) } }),
    ).rejects.toThrow(/[Uu]nique constraint/);
    await ctx.prisma.booking.delete({ where: { id: twin.id } });
  });

  it('a legacy number the random generator already used is skipped, not collided with', async () => {
    // Park a booking on the number the counter is about to hand out …
    const next = await asTenant(w.visaA, () => references.next(w.visaA.tenantId, 'UC'));
    const taken = await ctx.prisma.booking.create({
      data: { tenantId: w.visaA.tenantId, bookingRef: next, totalAmountCents: BigInt(0) },
    });
    // … and the allocator moves past it instead of failing the create.
    const isTaken = async (ref: string) =>
      (await ctx.prisma.booking.count({ where: { tenantId: w.visaA.tenantId, bookingRef: ref } })) > 0;
    const after = await asTenant(w.visaA, () => references.next(w.visaA.tenantId, 'UC', isTaken));
    expect(after).not.toBe(next);
    expect(Number(after.split('-')[2])).toBeGreaterThan(Number(next.split('-')[2]));
    await ctx.prisma.booking.delete({ where: { id: taken.id } });
  });

  it("an organization's counters are its own: Row-Level Security hides and refuses another's", async () => {
    await asTenant(w.opA, () => references.next(w.opA.tenantId, 'BP'));
    const mine = await asTenant(w.opA, () => ctx.appPrisma.referenceCounter.findMany({ select: { tenantId: true } }));
    expect(mine.length).toBeGreaterThan(0);
    expect(new Set(mine.map((c) => c.tenantId))).toEqual(new Set([w.opA.tenantId]));
    // Allocating against another organization's counter is refused by the policy.
    await expect(asTenant(w.opB, () => references.next(w.opA.tenantId, 'BP'))).rejects.toThrow();
  });

  it('invoices and budget plans carry the same per-organization sequence', async () => {
    const invoice = await ok(w.financeA, 'post', '/finance/invoices', {
      issuedToName: 'Reference Test', subtotal: 100, currency: 'SAR',
    });
    expect(invoice.invoiceRef).toMatch(new RegExp(`^INV-${YEAR}-\\d{5,}$`));
    const plan = await ok(w.financeA, 'post', '/finance/budget-plans', {
      clientName: `Plan ${uniq()}`, destination: 'Makkah', travelers: 2, totalBudget: 5_000,
    });
    expect(plan.planRef).toMatch(new RegExp(`^BP-${YEAR}-\\d{5,}$`));
  });
});

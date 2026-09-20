import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { api, createTestApp, TestContext } from './app';
import { Actor, bearer, buildWorld, World } from './fixtures';

/**
 * F2 — a platform takedown is a moderation decision the owner cannot undo.
 * Before: takedown only set status ARCHIVED, so the owner moved the listing back
 * to DRAFT and republished it. Now the decision lives in moderation_status, only
 * platform:marketplace:moderate changes it, the owner sees it with the reason,
 * and no public route shows a taken-down listing.
 */

type Method = 'get' | 'post' | 'put' | 'delete';
const uniq = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

describe('F2: platform takedown of marketplace listings', () => {
  let ctx: TestContext;
  let w: World;
  const tag = uniq();

  const call = (a: Actor | null, method: Method, path: string, body?: Record<string, unknown>) => {
    let req = ctx.http()[method](api(path));
    if (a) req = req.set(bearer(a));
    return body !== undefined ? req.send(body) : req;
  };
  const ok = async (a: Actor | null, method: Method, path: string, body?: Record<string, unknown>) => {
    const res = await call(a, method, path, body);
    if (res.status >= 300) throw new Error(`${a?.email ?? 'anon'} ${method.toUpperCase()} ${path} → ${res.status} ${JSON.stringify(res.body)}`);
    return res.body?.data ?? res.body;
  };
  const row = (id: string) => ctx.prisma.listing.findUniqueOrThrow({ where: { id } });
  const publicSearch = async (q: string) => (await ok(null, 'get', `/marketplace/listings?search=${encodeURIComponent(q)}`)).items as any[];

  let listing: any;
  let vendorId: string;

  beforeAll(async () => {
    ctx = await createTestApp();
    w = await buildWorld(ctx);
    const vendor = await ok(w.hotelB, 'post', '/marketplace/vendors', { name: `Moderated hotel ${tag}`, type: 'HOTEL' });
    vendorId = vendor.id;
    listing = await ok(w.hotelB, 'post', '/marketplace/listings', {
      title: `Moderated room ${tag}`, category: 'hotel_room', priceFrom: 300, pricingModel: 'PER_PERSON', vendorId,
    });
  });
  afterAll(async () => ctx?.close());

  it('only a platform moderator can take a listing down, and only with a reason', async () => {
    expect((await publicSearch(`Moderated room ${tag}`)).map((l) => l.id)).toEqual([listing.id]);
    for (const a of [w.hotelB, w.hotelA, w.opA, w.travelerA, w.financeA]) {
      expect((await call(a, 'put', `/admin/listings/${listing.id}/take-down`, { reason: 'nope' })).status, a.email).toBe(403);
      expect((await call(a, 'delete', `/admin/listings/${listing.id}`)).status, a.email).toBe(403);
    }
    expect((await call(w.superAdmin, 'put', `/admin/listings/${listing.id}/take-down`, {})).status).toBe(400);
    expect((await call(w.superAdmin, 'put', `/admin/listings/${listing.id}/take-down`, { reason: 'x' })).status).toBe(400);

    const down = await ok(w.superAdmin, 'put', `/admin/listings/${listing.id}/take-down`, { reason: 'Photos show a different property' });
    expect([down.status, down.isActive, down.moderationStatus, down.moderationReason]).toEqual([
      'ARCHIVED', false, 'TAKEN_DOWN', 'Photos show a different property',
    ]);
    const stored = await row(listing.id);
    expect([stored.moderatedBy, stored.moderatedAt !== null]).toEqual([w.superAdmin.id, true]);
    const audit = await ctx.prisma.auditLog.findFirst({ where: { resource: 'listing', resourceId: listing.id, action: 'SOFT_DELETE' } });
    expect(audit?.metadata).toMatchObject({ moderation: 'taken_down', reason: 'Photos show a different property' });
  });

  it('public routes never show it: detail, search, vendor page, bookings, inquiries and quotes', async () => {
    expect((await call(null, 'get', `/marketplace/listings/${listing.id}`)).status).toBe(404);
    expect(await publicSearch(`Moderated room ${tag}`)).toEqual([]);
    const vendorPage = await ok(null, 'get', `/marketplace/vendors/${vendorId}`);
    expect(vendorPage.listings.map((l: any) => l.id)).not.toContain(listing.id);
    expect((await call(w.travelerA, 'post', `/marketplace/listings/${listing.id}/bookings`, { partySize: 1 })).status).toBe(404);
    expect((await call(null, 'post', `/marketplace/listings/${listing.id}/inquiries`, { message: 'Hello', email: 'a@b.test' })).status).toBe(404);
    expect((await call(w.opA, 'post', '/marketplace/quotes', { listingId: listing.id })).status).toBe(404);
  });

  it('the owner sees the takedown and its reason, not who decided', async () => {
    const mine = await ok(w.hotelB, 'get', '/marketplace/listings/mine');
    const seen = mine.items.find((l: any) => l.id === listing.id);
    expect([seen.moderationStatus, seen.moderationReason]).toEqual(['TAKEN_DOWN', 'Photos show a different property']);
    expect(seen).not.toHaveProperty('moderatedBy');
    const one = await ok(w.hotelB, 'get', `/marketplace/listings/mine/${listing.id}`);
    expect(one.moderationStatus).toBe('TAKEN_DOWN');
    const note = await ctx.prisma.notification.findFirst({ where: { tenantId: w.tenants.hotelB, data: { path: ['listingId'], equals: listing.id } } });
    expect([note?.type, note?.body]).toEqual(['SYSTEM', 'Photos show a different property']);
  });

  it('owner bypass attempts are refused and change nothing', async () => {
    for (const status of ['DRAFT', 'PUBLISHED', 'PAUSED']) {
      const res = await call(w.hotelB, 'put', `/marketplace/listings/${listing.id}`, { status });
      expect(res.status, status).toBe(403);
      expect(res.body.error.message).toBe(
        'This listing was taken down by the platform: Photos show a different property. Only the platform can restore it — contact support to have it reviewed.',
      );
    }
    // The moderation fields are not part of the owner's input at all.
    for (const body of [{ moderationStatus: 'CLEAR' }, { moderationReason: '' }, { isActive: true }]) {
      expect((await call(w.hotelB, 'put', `/marketplace/listings/${listing.id}`, body)).status, JSON.stringify(body)).toBe(400);
    }
    // Archiving again (the owner's delete) keeps the takedown.
    expect((await ok(w.hotelB, 'delete', `/marketplace/listings/${listing.id}`)).moderationStatus).toBe('TAKEN_DOWN');
    // A same-status write is not a way around it either.
    expect((await ok(w.hotelB, 'put', `/marketplace/listings/${listing.id}`, { status: 'ARCHIVED' })).moderationStatus).toBe('TAKEN_DOWN');
    // The owner may correct the content meanwhile; it stays down.
    const edited = await ok(w.hotelB, 'put', `/marketplace/listings/${listing.id}`, { description: 'Corrected photos' });
    expect([edited.description, edited.status, edited.moderationStatus]).toEqual(['Corrected photos', 'ARCHIVED', 'TAKEN_DOWN']);

    const after = await row(listing.id);
    expect([after.status, after.isActive, after.moderationStatus]).toEqual(['ARCHIVED', false, 'TAKEN_DOWN']);
    expect(await publicSearch(`Moderated room ${tag}`)).toEqual([]);
  });

  it('a taken-down listing cannot be booked through an accepted marketplace offer either', async () => {
    const req = await ok(w.travelerB, 'post', '/marketplace/requests', { serviceType: 'HOTEL', title: `Stay ${tag}`, travelers: 1 });
    const offer = await ok(w.hotelB, 'post', `/marketplace/requests/${req.id}/offers`, { priceCents: 10_000 });
    await ok(w.travelerB, 'post', `/marketplace/requests/${req.id}/offers/${offer.id}/accept`, {});
    const res = await call(w.travelerB, 'post', `/marketplace/requests/${req.id}/offers/${offer.id}/convert-to-booking`, { listingId: listing.id });
    expect(res.status).toBe(404);
    expect(await ctx.prisma.listingBooking.count({ where: { listingId: listing.id } })).toBe(0);
  });

  it('only a platform restore lifts it; the owner then manages the listing normally again', async () => {
    expect((await call(w.hotelB, 'put', `/admin/listings/${listing.id}/approve`, {})).status).toBe(403);
    const restored = await ok(w.superAdmin, 'put', `/admin/listings/${listing.id}/approve`, {});
    expect([restored.status, restored.isActive, restored.moderationStatus, restored.moderationReason]).toEqual(['PUBLISHED', true, 'CLEAR', null]);
    expect((await publicSearch(`Moderated room ${tag}`)).map((l) => l.id)).toEqual([listing.id]);
    expect((await ok(w.hotelB, 'put', `/marketplace/listings/${listing.id}`, { status: 'PAUSED' })).status).toBe('PAUSED');
  });

  it('the moderator can list taken-down listings; the legacy DELETE takes down with a default reason', async () => {
    const other = await ok(w.hotelB, 'post', '/marketplace/listings', { title: `Legacy removal ${tag}`, category: 'hotel_room', priceFrom: 100, vendorId });
    const removed = await ok(w.superAdmin, 'delete', `/admin/listings/${other.id}`);
    expect([removed.moderationStatus, removed.moderationReason]).toEqual(['TAKEN_DOWN', 'Removed by the platform.']);
    const listed = await ok(w.superAdmin, 'get', '/admin/listings?status=TAKEN_DOWN&limit=200');
    expect(listed.items.map((l: any) => l.id)).toContain(other.id);
    expect(listed.items.every((l: any) => l.moderationStatus === 'TAKEN_DOWN')).toBe(true);
    expect((await call(w.hotelB, 'put', `/marketplace/listings/${other.id}`, { status: 'DRAFT' })).status).toBe(403);
  });
});

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { api, createTestApp, TestContext } from './app';
import { Actor, bearer, buildWorld, World } from './fixtures';

/**
 * Listing lifecycle end to end: seller profile, draft with uploaded images,
 * publish, catalogue search/filter/sort/pagination, price edits in cents,
 * unpublish, ownership, archive/restore, quotes, and request conversion.
 */

type Method = 'get' | 'post' | 'put' | 'delete';
const uniq = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(120, 3)]);

describe('marketplace listings lifecycle', () => {
  let ctx: TestContext;
  let w: World;
  let root: string;
  const previousDir = process.env.STORAGE_LOCAL_DIR;
  const tag = uniq();

  const call = (a: Actor | null, method: Method, path: string, body?: Record<string, unknown>) => {
    let req = ctx.http()[method](api(path));
    if (a) req = req.set(bearer(a));
    return body !== undefined ? req.send(body) : req;
  };
  const ok = async (a: Actor | null, method: Method, path: string, body?: Record<string, unknown>) => {
    const res = await call(a, method, path, body);
    if (res.status >= 300) throw new Error(`${a?.email ?? 'anon'} ${method.toUpperCase()} ${path} → ${res.status} ${JSON.stringify(res.body)}`);
    // /marketplace/requests answers without the { success, data } envelope.
    return res.body && typeof res.body === 'object' && 'success' in res.body ? res.body.data : res.body;
  };
  const image = async (a: Actor) => {
    const res = await ctx.http().post(api('/uploads')).set(bearer(a)).attach('file', Buffer.concat([PNG, Buffer.from(uniq())]), 'room.png');
    expect(res.status).toBe(201);
    return res.body.data.url as string;
  };
  const search = (q: Record<string, string | number>) =>
    ok(null, 'get', `/marketplace/listings?${new URLSearchParams(Object.entries(q).map(([k, v]) => [k, String(v)]))}`);

  beforeAll(async () => {
    root = mkdtempSync(join(tmpdir(), 'uc-listings-e2e-'));
    process.env.STORAGE_LOCAL_DIR = root;
    ctx = await createTestApp();
    w = await buildWorld(ctx);
  });
  afterAll(async () => {
    await ctx?.close();
    if (previousDir === undefined) delete process.env.STORAGE_LOCAL_DIR;
    else process.env.STORAGE_LOCAL_DIR = previousDir;
    rmSync(root, { recursive: true, force: true });
  });

  let vendor: any;
  let listing: any;
  let images: string[];

  it('a new provider has no seller profile until it creates one; reads never create records', async () => {
    const before = await ctx.prisma.vendor.count({ where: { tenantId: w.tenants.transportA } });
    expect(await ok(w.transportA, 'get', '/marketplace/vendors/mine')).toBeNull();
    expect(await ok(w.transportA, 'get', '/marketplace/vendors/mine/all')).toEqual([]);
    expect(await ok(w.transportA, 'get', '/marketplace/listings/mine')).toMatchObject({ items: [], total: 0 });
    expect(await ok(w.transportA, 'get', '/marketplace/bookings')).toEqual([]);
    expect(await ok(w.travelerA, 'get', '/marketplace/listings/mine')).toMatchObject({ items: [] });
    expect(await ctx.prisma.vendor.count({ where: { tenantId: w.tenants.transportA } })).toBe(before);
    expect(await ctx.prisma.vendor.count({ where: { tenantId: w.tenants.community } })).toBe(0);

    vendor = await ok(w.transportA, 'post', '/marketplace/vendors', {
      name: `Coach Co ${tag}`, type: 'TRANSPORT', city: 'Jeddah', email: 'desk@coach.test', country: 'sa',
    });
    expect([vendor.type, vendor.country, vendor.email]).toEqual(['VENDOR_TRANSPORT', 'SA', 'desk@coach.test']);
    expect((await ok(w.transportA, 'get', '/marketplace/vendors/mine')).id).toBe(vendor.id);
    const edited = await ok(w.transportA, 'put', `/marketplace/vendors/${vendor.id}`, { description: 'Licensed coaches' });
    expect(edited.description).toBe('Licensed coaches');
    expect((await call(w.transportB, 'put', `/marketplace/vendors/${vendor.id}`, { name: 'Hijack' })).status).toBe(404);
  });

  it('creates a draft with two uploaded images; drafts are private', async () => {
    images = [await image(w.transportA), await image(w.transportA)];
    listing = await ok(w.transportA, 'post', '/marketplace/listings', {
      title: `Airport coach ${tag}`, category: 'transport_service', vendorId: vendor.id, priceCents: 45_000,
      pricingModel: 'PER_GROUP', city: 'Jeddah', imageUrls: images, status: 'DRAFT',
      attributes: { vehicleType: 'coach', seats: 45 },
    });
    expect([listing.status, listing.isActive, listing.priceCents, listing.city]).toEqual(['DRAFT', true, 45_000, 'Jeddah']);
    expect(listing.imageUrls).toEqual(images);
    expect((await call(null, 'get', `/marketplace/listings/${listing.id}`)).status).toBe(404);
    expect(JSON.stringify(await search({ search: tag }))).not.toContain(listing.id);
    const mine = await ok(w.transportA, 'get', `/marketplace/listings/mine/${listing.id}`);
    expect([mine.status, mine._count.bookings]).toEqual(['DRAFT', 0]);
    expect((await ok(w.transportA, 'get', '/marketplace/listings/mine?status=DRAFT')).items.map((l: any) => l.id)).toContain(listing.id);
  });

  it('refuses missing required fields, unknown categories, foreign and nested data', async () => {
    const base = { title: `Bad ${tag}`, category: 'transport_service' };
    expect((await call(w.transportA, 'post', '/marketplace/listings', { category: 'transport_service' })).status).toBe(400);
    expect((await call(w.transportA, 'post', '/marketplace/listings', { ...base, category: 'spaceship' })).status).toBe(400);
    expect((await call(w.transportA, 'post', '/marketplace/listings', { ...base, priceCents: 12.5 })).status).toBe(400);
    expect((await call(w.transportA, 'post', '/marketplace/listings', { ...base, imageUrls: ['https://tracker.example.com/p.gif'] })).status).toBe(400);
    expect((await call(w.transportA, 'post', '/marketplace/listings', { ...base, imageUrls: [await image(w.transportB)] })).status).toBe(400);
    expect((await call(w.transportA, 'post', '/marketplace/listings', { ...base, attributes: { includes: { hotel: true } } })).status).toBe(400);
    expect((await call(w.transportA, 'post', '/marketplace/listings', { ...base, status: 'ARCHIVED' })).status).toBe(400);
    expect((await call(w.travelerA, 'post', '/marketplace/listings', base)).status).toBe(403);
    expect((await call(w.staffA, 'post', '/marketplace/listings', base)).status).toBe(403);
  });

  it('publishing puts it in the catalogue with the real seller and images', async () => {
    const published = await ok(w.transportA, 'put', `/marketplace/listings/${listing.id}`, { status: 'PUBLISHED' });
    expect([published.status, published.isActive]).toEqual(['PUBLISHED', true]);

    const detail = await ok(null, 'get', `/marketplace/listings/${listing.id}`);
    expect(detail.vendor.name).toBe(vendor.name);
    expect(detail.imageUrls).toEqual(images);
    for (const k of ['isActive', '_count', 'tenantId']) expect(detail).not.toHaveProperty(k);
    expect(JSON.stringify(detail)).not.toContain('desk@coach.test');
    expect(JSON.stringify(detail)).not.toContain(w.tenants.transportA);

    expect((await search({ search: tag })).items.map((l: any) => l.id)).toEqual([listing.id]);
    expect((await search({ search: `coach co ${tag}` })).items.map((l: any) => l.id)).toEqual([listing.id]);
    expect((await search({ search: tag, category: 'transport_service', city: 'jed' })).total).toBe(1);
    expect((await search({ search: tag, category: 'hotel_room' })).total).toBe(0);
    expect((await search({ search: tag, minPriceCents: 45_000, maxPriceCents: 45_000, currency: 'SAR' })).total).toBe(1);
    expect((await search({ search: tag, minPriceCents: 45_001 })).total).toBe(0);
    expect((await call(null, 'get', '/marketplace/listings?minPriceCents=10&maxPriceCents=5')).status).toBe(400);
    expect((await call(null, 'get', '/marketplace/listings?sort=random')).status).toBe(400);
  });

  it('sorts and paginates on the server', async () => {
    const extra = [];
    for (const [i, cents] of [10_000, 90_000].entries()) {
      extra.push(await ok(w.transportA, 'post', '/marketplace/listings', {
        title: `Airport coach ${tag} extra ${i}`, category: 'transport_service', vendorId: vendor.id, priceCents: cents,
      }));
    }
    const asc = await search({ search: tag, sort: 'price_asc' });
    expect(asc.items.map((l: any) => l.priceCents)).toEqual([10_000, 45_000, 90_000]);
    const desc = await search({ search: tag, sort: 'price_desc', limit: 1, page: 2 });
    expect([desc.items.length, desc.items[0].priceCents, desc.total, desc.totalPages, desc.page]).toEqual([1, 45_000, 3, 3, 2]);
    const clamped = await search({ search: tag, limit: 100 });
    expect(clamped.limit).toBe(50);
    for (const l of extra) await ok(w.transportA, 'delete', `/marketplace/listings/${l.id}`);
    expect((await search({ search: tag })).total).toBe(1);
  });

  it('price edits are cents on the wire and exact', async () => {
    const edited = await ok(w.transportA, 'put', `/marketplace/listings/${listing.id}`, { priceCents: 125_050 });
    expect(edited.priceCents).toBe(125_050);
    expect((await ok(null, 'get', `/marketplace/listings/${listing.id}`)).priceCents).toBe(125_050);
    const legacy = await ok(w.transportA, 'put', `/marketplace/listings/${listing.id}`, { priceFrom: 1250.55 });
    expect(legacy.priceCents).toBe(125_055);
    expect((await call(w.transportA, 'put', `/marketplace/listings/${listing.id}`, { priceFrom: 1.001 })).status).toBe(400);
  });

  it('images can be reordered and removed; the first is the cover', async () => {
    const third = await image(w.transportA);
    const reordered = await ok(w.transportA, 'put', `/marketplace/listings/${listing.id}`, { imageUrls: [third, images[1], images[0]] });
    expect(reordered.imageUrls).toEqual([third, images[1], images[0]]);
    const removed = await ok(w.transportA, 'put', `/marketplace/listings/${listing.id}`, { imageUrls: [images[1], images[0]] });
    expect(removed.imageUrls).toEqual([images[1], images[0]]);
    expect((await call(w.transportA, 'put', `/marketplace/listings/${listing.id}`, { imageUrls: [images[0], images[0]] })).status).toBe(400);
    images = removed.imageUrls;
  });

  it('another provider cannot read, edit, archive or restore it; the record stays unchanged', async () => {
    const before = await ctx.prisma.listing.findUniqueOrThrow({ where: { id: listing.id } });
    for (const [method, path, body] of [
      ['get', `/marketplace/listings/mine/${listing.id}`, undefined],
      ['put', `/marketplace/listings/${listing.id}`, { priceCents: 1 }],
      ['put', `/marketplace/listings/${listing.id}`, { status: 'PAUSED' }],
      ['delete', `/marketplace/listings/${listing.id}`, undefined],
    ] as [Method, string, Record<string, unknown> | undefined][]) {
      expect((await call(w.transportB, method, path, body)).status, `${method} ${path}`).toBe(404);
      expect((await call(w.hotelB, method, path, body)).status, `${method} ${path}`).toBe(404);
    }
    expect((await call(w.travelerB, 'put', `/marketplace/listings/${listing.id}`, { priceCents: 1 })).status).toBe(403);
    const after = await ctx.prisma.listing.findUniqueOrThrow({ where: { id: listing.id } });
    expect(after).toEqual(before);
  });

  it('unpublishing hides it everywhere public; lifecycle rules hold', async () => {
    const paused = await ok(w.transportA, 'put', `/marketplace/listings/${listing.id}`, { status: 'PAUSED' });
    expect(paused.status).toBe('PAUSED');
    expect((await call(null, 'get', `/marketplace/listings/${listing.id}`)).status).toBe(404);
    expect((await search({ search: tag })).total).toBe(0);
    expect(JSON.stringify(await ok(null, 'get', `/marketplace/vendors/${vendor.id}`))).not.toContain(listing.id);
    expect((await call(w.travelerA, 'post', `/marketplace/listings/${listing.id}/inquiries`, { message: 'Hello?' })).status).toBe(404);
    expect((await call(w.travelerA, 'post', `/marketplace/listings/${listing.id}/bookings`, { partySize: 1 })).status).toBe(404);

    await ok(w.transportA, 'delete', `/marketplace/listings/${listing.id}`);
    const archived = await ctx.prisma.listing.findUniqueOrThrow({ where: { id: listing.id } });
    expect([archived.status, archived.isActive]).toEqual(['ARCHIVED', false]);
    expect((await call(w.transportA, 'put', `/marketplace/listings/${listing.id}`, { status: 'PUBLISHED' })).status).toBe(400);
    expect((await ok(w.transportA, 'put', `/marketplace/listings/${listing.id}`, { status: 'DRAFT' })).status).toBe('DRAFT');
    expect((await ok(w.transportA, 'put', `/marketplace/listings/${listing.id}`, { status: 'PUBLISHED' })).isActive).toBe(true);
    expect((await search({ search: tag })).total).toBe(1);
  });

  describe('quotes', () => {
    let quote: any;

    it('an operator asks the seller for a quote; only the seller answers, only the requester accepts', async () => {
      expect((await call(w.transportA, 'post', '/marketplace/quotes', { listingId: listing.id })).status).toBe(403);
      quote = await ok(w.opA, 'post', '/marketplace/quotes', {
        listingId: listing.id, requestedPax: 30, startDate: '2026-12-01', endDate: '2026-12-03', requirements: 'Two airport runs',
      });
      expect(quote.status).toBe('PENDING');
      expect(quote.requirements).toEqual({ text: 'Two airport runs', pax: 30, startDate: '2026-12-01', endDate: '2026-12-03' });

      const incoming = await ok(w.transportA, 'get', '/marketplace/quotes/incoming');
      expect(incoming.find((q: any) => q.id === quote.id)?.requesterName).toBe('fx-operator-a');
      expect(JSON.stringify(await ok(w.transportB, 'get', '/marketplace/quotes/incoming'))).not.toContain(quote.id);

      expect((await call(w.transportB, 'put', `/marketplace/quotes/${quote.id}`, { offeredPriceCents: 1 })).status).toBe(404);
      expect((await call(w.opA, 'put', `/marketplace/quotes/${quote.id}`, { offeredPriceCents: 1 })).status).toBe(404);
      expect((await call(w.transportA, 'put', `/marketplace/quotes/${quote.id}`, {})).status).toBe(400);
      expect((await call(w.opA, 'put', `/marketplace/quotes/${quote.id}/accept`)).status).toBe(409);

      const offered = await ok(w.transportA, 'put', `/marketplace/quotes/${quote.id}`, { offeredPriceCents: 380_000 });
      expect([offered.status, offered.offeredPriceCents]).toEqual(['OFFERED', 380_000]);
      expect((await call(w.transportA, 'put', `/marketplace/quotes/${quote.id}/accept`)).status).toBe(404);
      const accepted = await ok(w.opA, 'put', `/marketplace/quotes/${quote.id}/accept`);
      expect(accepted.status).toBe('ACCEPTED');
      expect((await call(w.opA, 'put', `/marketplace/quotes/${quote.id}/reject`)).status).toBe(409);
    });

    it('the requester can decline an open quote', async () => {
      const q = await ok(w.opA, 'post', '/marketplace/quotes', { listingId: listing.id });
      expect((await ok(w.opA, 'put', `/marketplace/quotes/${q.id}/reject`)).status).toBe('REJECTED');
      expect((await call(w.transportA, 'put', `/marketplace/quotes/${q.id}`, { offeredPriceCents: 100 })).status).toBe(409);
    });
  });

  describe('request conversion', () => {
    it('offers show the real seller; converting without a listing never publishes the offer', async () => {
      const req = await ok(w.travelerA, 'post', '/marketplace/requests', { serviceType: 'HOTEL', title: `Stay ${tag}`, travelers: 2 });
      const hotelVendor = await ok(w.hotelA, 'post', '/marketplace/vendors', { name: `Hotel seller ${tag}`, type: 'HOTEL' });
      const offer = await ok(w.hotelA, 'post', `/marketplace/requests/${req.id}/offers`, { priceCents: 150_000, vendorId: hotelVendor.id, title: `Private offer ${tag}` });
      const seen = await ok(w.travelerA, 'get', `/marketplace/requests/${req.id}`);
      expect(seen.offers[0].seller).toEqual({ name: hotelVendor.name, vendorId: hotelVendor.id, verified: false });

      await ok(w.travelerA, 'post', `/marketplace/requests/${req.id}/offers/${offer.id}/accept`, {});
      const booking = await ok(w.travelerA, 'post', `/marketplace/requests/${req.id}/offers/${offer.id}/convert-to-booking`, {});
      const row = await ctx.prisma.listingBooking.findUniqueOrThrow({ where: { id: booking.id }, include: { listing: true } });
      expect([row.listing.status, row.listing.isActive, Number(row.totalAmountCents)]).toEqual(['ARCHIVED', false, 150_000]);
      expect((await search({ search: `Private offer ${tag}` })).total).toBe(0);
    });

    it('the offering transport provider converts with its own vehicle; others cannot', async () => {
      const req = await ok(w.travelerB, 'post', '/marketplace/requests', { serviceType: 'TRANSPORT', title: `Transfer ${tag}`, travelers: 3 });
      const offer = await ok(w.transportA, 'post', `/marketplace/requests/${req.id}/offers`, { priceCents: 30_000 });
      await ok(w.travelerB, 'post', `/marketplace/requests/${req.id}/offers/${offer.id}/accept`, {});
      const vehicleA = await ok(w.transportA, 'post', '/transport/vehicles', { type: 'BUS', plateNumber: `T-${uniq()}`, capacity: 40 });
      const vehicleB = await ok(w.transportB, 'post', '/transport/vehicles', { type: 'BUS', plateNumber: `U-${uniq()}`, capacity: 40 });
      const path = `/marketplace/requests/${req.id}/offers/${offer.id}/convert-to-booking`;
      expect((await call(w.transportB, 'post', path, { vehicleId: vehicleB.id })).status).toBe(404);
      expect((await call(w.transportA, 'post', path, { vehicleId: vehicleB.id })).status).toBe(404);
      const assignment = await ok(w.transportA, 'post', path, { vehicleId: vehicleA.id });
      expect(assignment.vehicleId).toBe(vehicleA.id);
      expect((await call(w.travelerB, 'post', path, { vehicleId: vehicleA.id })).status).toBe(409);
    });
  });
});

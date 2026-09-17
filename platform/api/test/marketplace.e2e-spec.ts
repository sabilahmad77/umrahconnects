import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { api, createTestApp, TestContext } from './app';
import { Actor, bearer, buildWorld, World } from './fixtures';

/**
 * Red-team marketplace suite: a hotel organization sells to travelers; other
 * providers and other travelers try to tamper with prices, statuses, listings,
 * bookings, inquiries, requests and offers.
 */

const uniq = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
const day = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);
const SECRET_EMAIL = 'private-desk@hotel-a.test';
const SECRET_PHONE = '+966511112222';
const SECRET_ADDRESS = 'Hidden street 7, back office';
const SECRET_KYC = 'kyc/secret/commercial-register.pdf';

type Method = 'get' | 'post' | 'put' | 'patch' | 'delete';

describe('red team: marketplace', () => {
  let ctx: TestContext;
  let w: World;
  let vendor: any;
  let listing: any;
  let listingB: any;

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
  const expectNoSecrets = (payload: unknown, label: string) => {
    const text = JSON.stringify(payload);
    for (const s of [SECRET_EMAIL, SECRET_PHONE, SECRET_ADDRESS, SECRET_KYC, 'kycDocuments', w.tenants.hotelA]) {
      expect(text, `${label} leaks ${s}`).not.toContain(s);
    }
  };

  beforeAll(async () => {
    ctx = await createTestApp();
    w = await buildWorld(ctx);

    vendor = await ok(w.hotelA, 'post', '/marketplace/vendors', {
      name: `Zamzam Suites ${uniq()}`, type: 'HOTEL', email: SECRET_EMAIL, phone: SECRET_PHONE, city: 'Makkah',
    });
    expect(vendor.type).toBe('VENDOR_HOTEL');
    // Private vendor data that must never reach a public route.
    await ctx.prisma.vendor.update({
      where: { id: vendor.id },
      data: { address: SECRET_ADDRESS, kycDocuments: [{ storageKey: SECRET_KYC }], verifiedAt: new Date() },
    });

    listing = await ok(w.hotelA, 'post', '/marketplace/listings', {
      title: `Haram view room ${uniq()}`, category: 'hotel_room', priceFrom: 250, unit: 'per_person', vendorId: vendor.id, maxCapacity: 4,
    });
    listingB = await ok(w.hotelB, 'post', '/marketplace/listings', { title: `B room ${uniq()}`, category: 'hotel_room', priceFrom: 100 });
  });
  afterAll(async () => ctx?.close());

  it('the listing is live; only a platform moderator can (re)approve it', async () => {
    expect(listing.status).toBe('PUBLISHED');
    expect(listing.isActive).toBe(true);
    expect(listing.priceCents).toBe(25_000);
    expect((await call(w.hotelA, 'put', `/admin/listings/${listing.id}/approve`, {})).status).toBe(403);
    const approved = await ok(w.superAdmin, 'put', `/admin/listings/${listing.id}/approve`, {});
    expect(approved.status).toBe('PUBLISHED');
  });

  it('vendor records cannot be created by travelers or staff without the manage capability', async () => {
    expect((await call(w.travelerA, 'post', '/marketplace/vendors', { name: 'Fake', type: 'HOTEL' })).status).toBe(403);
    expect((await call(w.staffA, 'post', '/marketplace/vendors', { name: 'Fake', type: 'HOTEL' })).status).toBe(403);
    expect(await ctx.prisma.vendor.count({ where: { name: 'Fake' } })).toBe(0);
    // A listing cannot be attached to another organization's vendor.
    expect((await call(w.hotelB, 'post', '/marketplace/listings', { title: 'Hijack', category: 'hotel_room', priceFrom: 1, vendorId: vendor.id })).status).toBe(404);
    expect(await ctx.prisma.listing.count({ where: { vendorId: vendor.id } })).toBe(1);
  });

  it('public listing and vendor routes never expose contact details, address or KYC', async () => {
    expectNoSecrets(await ok(null, 'get', `/marketplace/listings/${listing.id}`), 'listing detail');
    expectNoSecrets(await ok(null, 'get', '/marketplace/listings?limit=100'), 'listing search');
    expectNoSecrets(await ok(null, 'get', `/marketplace/vendors/${vendor.id}`), 'vendor detail');
    expectNoSecrets(await ok(null, 'get', '/marketplace/vendors'), 'vendor directory');
    const detail = await ok(null, 'get', `/marketplace/vendors/${vendor.id}`);
    expect(detail.verified).toBe(true);
    for (const k of ['email', 'phone', 'address', 'kycDocuments', 'tenantId', 'verifiedBy']) expect(detail, k).not.toHaveProperty(k);
  });

  describe('listing bookings', () => {
    let booking: any;

    it('the server computes the price and the initial status; client values are refused', async () => {
      const path = `/marketplace/listings/${listing.id}/bookings`;
      const base = { partySize: 2, startDate: day(5), endDate: day(7), customerName: 'Traveler A' };
      expect((await call(w.travelerA, 'post', path, { ...base, totalAmountCents: 1 })).status).toBe(400);
      expect((await call(w.travelerA, 'post', path, { ...base, status: 'CONFIRMED' })).status).toBe(400);
      expect((await call(w.travelerA, 'post', path, { ...base, paymentStatus: 'PAID' })).status).toBe(400);
      expect((await call(w.travelerA, 'post', path, { ...base, customerUserId: w.travelerB.id })).status).toBe(400);
      expect((await call(w.travelerA, 'post', path, { ...base, partySize: 5 })).status).toBe(400);
      expect((await call(w.travelerA, 'post', path, { ...base, startDate: day(-10) })).status).toBe(400);
      expect((await call(null, 'post', path, base)).status).toBe(401);

      booking = await ok(w.travelerA, 'post', path, { ...base, totalAmountCents: 50_000 });
      const row = await ctx.prisma.listingBooking.findUniqueOrThrow({ where: { id: booking.id } });
      expect(Number(row.totalAmountCents)).toBe(50_000);
      expect(row.status).toBe('PENDING');
      expect(row.paymentStatus).toBe('UNPAID');
      expect(row.customerUserId).toBe(w.travelerA.id);
    });

    it('another provider cannot manage the listing, its bookings or its inquiries', async () => {
      const inquiry = await ok(w.travelerA, 'post', `/marketplace/listings/${listing.id}/inquiries`, { message: 'Is breakfast included?' });
      for (const [method, path, body] of [
        ['put', `/marketplace/listings/${listing.id}`, { title: 'Hacked', priceFrom: 1 }],
        ['delete', `/marketplace/listings/${listing.id}`, undefined],
        ['get', `/marketplace/listings/${listing.id}/inquiries`, undefined],
        ['get', `/marketplace/listings/${listing.id}/bookings`, undefined],
        ['put', `/marketplace/bookings/${booking.id}`, { status: 'CANCELLED' }],
        ['put', `/marketplace/inquiries/${inquiry.id}`, { response: 'go away', status: 'CLOSED' }],
      ] as [Method, string, Record<string, unknown> | undefined][]) {
        const res = await call(w.hotelB, method, path, body);
        expect(res.status, `${method} ${path}`).toBe(404);
      }
      expect(JSON.stringify(await ok(w.hotelB, 'get', '/marketplace/bookings'))).not.toContain(booking.id);
      expect(JSON.stringify(await ok(w.hotelB, 'get', '/marketplace/inquiries'))).not.toContain(inquiry.id);
      expect(JSON.stringify(await ok(w.travelerB, 'get', '/marketplace/bookings/mine'))).not.toContain(booking.id);

      const l = await ctx.prisma.listing.findUniqueOrThrow({ where: { id: listing.id } });
      expect([l.name, Number(l.priceCents), l.status, l.isActive]).toEqual([listing.name, 25_000, 'PUBLISHED', true]);
      const b = await ctx.prisma.listingBooking.findUniqueOrThrow({ where: { id: booking.id } });
      expect(b.status).toBe('PENDING');
      const i = await ctx.prisma.listingInquiry.findUniqueOrThrow({ where: { id: inquiry.id } });
      expect([i.status, i.response]).toEqual(['NEW', null]);

      // The owner can read and answer them.
      expect(JSON.stringify(await ok(w.hotelA, 'get', `/marketplace/listings/${listing.id}/inquiries`))).toContain(inquiry.id);
      await ok(w.hotelA, 'put', `/marketplace/inquiries/${inquiry.id}`, { response: 'Yes' });
    });

    it('even the owning provider cannot set payment fields or jump to PAID', async () => {
      const path = `/marketplace/bookings/${booking.id}`;
      expect((await call(w.hotelA, 'put', path, { paymentStatus: 'PAID' })).status).toBe(400);
      expect((await call(w.hotelA, 'put', path, { totalAmountCents: 1 })).status).toBe(400);
      expect((await call(w.hotelA, 'put', path, { status: 'PAID' })).status).toBe(400);
      expect((await call(w.hotelA, 'put', path, { status: 'REFUNDED' })).status).toBe(400);
      expect((await call(w.hotelA, 'put', path, { status: 'COMPLETED' })).status).toBe(400);
      const b = await ctx.prisma.listingBooking.findUniqueOrThrow({ where: { id: booking.id } });
      expect([b.status, b.paymentStatus, Number(b.totalAmountCents)]).toEqual(['PENDING', 'UNPAID', 50_000]);
      const confirmed = await ok(w.hotelA, 'put', path, { status: 'CONFIRMED' });
      expect(confirmed.status).toBe('CONFIRMED');
    });
  });

  describe('service requests and offers', () => {
    let request: any;
    let ownRequest: any;
    let offer: any;
    const openIds = async (a: Actor) => ((await ok(a, 'get', '/marketplace/requests/open?limit=50')).items as any[]).map((r) => r.id);

    beforeAll(async () => {
      request = await ok(w.travelerA, 'post', '/marketplace/requests', {
        serviceType: 'HOTEL', title: `Family stay ${uniq()}`, travelers: 3, dateFrom: day(20), dateTo: day(25), budgetMaxCents: 300_000,
      });
      ownRequest = await ok(w.hotelA, 'post', '/marketplace/requests', { serviceType: 'HOTEL', title: `Hotel A overflow ${uniq()}` });
    });

    it('providers browse open requests; travelers cannot; nobody sees their own organization\'s requests', async () => {
      expect(await openIds(w.hotelA)).toContain(request.id);
      expect(await openIds(w.hotelB)).toContain(request.id);
      expect(await openIds(w.hotelA)).not.toContain(ownRequest.id);
      expect(await openIds(w.hotelB)).toContain(ownRequest.id);
      expect(await openIds(w.transportA)).not.toContain(request.id); // other service type
      expect((await call(w.travelerB, 'get', '/marketplace/requests/open')).status).toBe(403);
      expect((await call(w.travelerB, 'post', `/marketplace/requests/${request.id}/offers`, { priceCents: 1 })).status).toBe(403);
    });

    it('a provider offers; it cannot offer on its own organization\'s request or with a foreign vendor', async () => {
      const vendorB = await ok(w.hotelB, 'get', '/marketplace/vendors/mine');
      expect((await call(w.hotelA, 'post', `/marketplace/requests/${request.id}/offers`, { priceCents: 1000, vendorId: vendorB.id })).status).toBe(404);
      expect((await call(w.hotelA, 'post', `/marketplace/requests/${ownRequest.id}/offers`, { priceCents: 1000 })).status).toBe(403);
      expect((await call(w.hotelA, 'post', `/marketplace/requests/${request.id}/offers`, { priceCents: 0 })).status).toBe(400);
      offer = await ok(w.hotelA, 'post', `/marketplace/requests/${request.id}/offers`, { priceCents: 240_000, vendorId: vendor.id, title: 'Suite for 3' });
      expect(offer.priceCents).toBe(240_000);
      expect((await ctx.prisma.marketplaceRequest.findUniqueOrThrow({ where: { id: request.id } })).status).toBe('IN_NEGOTIATION');
    });

    it('other providers never see someone else\'s offers', async () => {
      const seen = await ok(w.hotelB, 'get', `/marketplace/requests/${request.id}`);
      expect(seen.offers).toEqual([]);
      const open = (await ok(w.hotelB, 'get', '/marketplace/requests/open?limit=50')).items.find((r: any) => r.id === request.id);
      expect(open.offers).toEqual([]);
      expect(JSON.stringify(await ok(w.hotelB, 'get', '/marketplace/requests/offers/mine'))).not.toContain(offer.id);
      expect(JSON.stringify(seen)).not.toContain(offer.id);
    });

    it('only the requester can read the request with its offers, accept, reject or convert', async () => {
      for (const a of [w.travelerB, w.hotelB, w.hotelA]) {
        for (const [method, path] of [
          ['post', `/marketplace/requests/${request.id}/offers/${offer.id}/accept`],
          ['post', `/marketplace/requests/${request.id}/offers/${offer.id}/reject`],
          ['post', `/marketplace/requests/${request.id}/offers/${offer.id}/convert-to-booking`],
          ['post', `/marketplace/requests/${request.id}/close`],
        ] as [Method, string][]) {
          const res = await call(a, method, path, {});
          expect(res.status, `${a.email} ${path}`).toBe(404);
        }
      }
      expect((await call(w.travelerB, 'get', `/marketplace/requests/${request.id}`)).status).toBe(404);
      const r = await ctx.prisma.marketplaceRequest.findUniqueOrThrow({ where: { id: request.id } });
      expect([r.status, r.acceptedOfferId]).toEqual(['IN_NEGOTIATION', null]);
      expect((await ctx.prisma.requestOffer.findUniqueOrThrow({ where: { id: offer.id } })).status).toBe('PENDING');

      const mine = await ok(w.travelerA, 'get', `/marketplace/requests/${request.id}`);
      expect(mine.offers.map((o: any) => o.id)).toEqual([offer.id]);
    });

    it('the requester accepts and converts exactly once, into the provider\'s own listing', async () => {
      // Conversion before acceptance is refused.
      expect((await call(w.travelerA, 'post', `/marketplace/requests/${request.id}/offers/${offer.id}/convert-to-booking`, {})).status).toBe(400);
      const accepted = await ok(w.travelerA, 'post', `/marketplace/requests/${request.id}/offers/${offer.id}/accept`, {});
      expect(accepted.status).toBe('ACCEPTED');

      // A listing of another provider cannot be used as the booking target.
      const foreign = await call(w.travelerA, 'post', `/marketplace/requests/${request.id}/offers/${offer.id}/convert-to-booking`, { listingId: listingB.id });
      expect(foreign.status).toBe(404);
      expect((await call(w.travelerB, 'post', `/marketplace/requests/${request.id}/offers/${offer.id}/convert-to-booking`, {})).status).toBe(404);

      const converted = await ok(w.travelerA, 'post', `/marketplace/requests/${request.id}/offers/${offer.id}/convert-to-booking`, { listingId: listing.id });
      const lb = await ctx.prisma.listingBooking.findUniqueOrThrow({ where: { id: converted.id }, include: { listing: { include: { vendor: true } } } });
      expect(lb.customerUserId).toBe(w.travelerA.id);
      expect(lb.listing.vendor.tenantId).toBe(w.tenants.hotelA);
      expect(Number(lb.totalAmountCents)).toBe(240_000);
      expect(lb.paymentStatus).toBe('UNPAID');

      const again = await call(w.travelerA, 'post', `/marketplace/requests/${request.id}/offers/${offer.id}/convert-to-booking`, { listingId: listing.id });
      expect(again.status).toBe(409);
      const parallel = await Promise.all([1, 2, 3].map(() =>
        call(w.travelerA, 'post', `/marketplace/requests/${request.id}/offers/${offer.id}/convert-to-booking`, {})));
      for (const res of parallel) expect(res.status).toBe(409);
      expect(await ctx.prisma.listingBooking.count({ where: { customerUserId: w.travelerA.id, totalAmountCents: 240_000n } })).toBe(1);

      // Once fulfilled, a provider without an offer no longer sees the request; the offering provider still does.
      expect((await call(w.hotelB, 'get', `/marketplace/requests/${request.id}`)).status).toBe(404);
      const forProvider = await ok(w.hotelA, 'get', `/marketplace/requests/${request.id}`);
      expect(forProvider.offers.map((o: any) => o.id)).toEqual([offer.id]);
      expect(await openIds(w.hotelB)).not.toContain(request.id);
      expect((await call(w.hotelB, 'post', `/marketplace/requests/${request.id}/offers`, { priceCents: 1000 })).status).toBe(400);
    });
  });
});

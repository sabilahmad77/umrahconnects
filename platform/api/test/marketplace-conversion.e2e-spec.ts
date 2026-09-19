import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { api, createTestApp, TestContext } from './app';
import { Actor, bearer, buildWorld, World } from './fixtures';

/**
 * F14 — converting an accepted marketplace offer creates the booking through the
 * same availability rules the provider's own workflow enforces. Before: a
 * TRANSPORT conversion wrote a trip with any passenger count, onto a vehicle
 * already on the road at that time, past a route's seats, without updating the
 * seat counters; a HOTEL conversion booked any listing of the provider, taken
 * down or not, for any party size. The conversion still runs in the audited
 * marketplace.offer-conversion system scope.
 */

type Method = 'get' | 'post' | 'put' | 'delete';
const uniq = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
const at = (days: number, hour: number) => {
  const d = new Date(Date.now() + days * 86_400_000);
  d.setUTCHours(hour, 0, 0, 0);
  return d.toISOString();
};

describe('F14: offer conversion uses the hotel / transport availability checks', () => {
  let ctx: TestContext;
  let w: World;

  const call = (a: Actor, method: Method, path: string, body?: Record<string, unknown>) => {
    const req = ctx.http()[method](api(path)).set(bearer(a));
    return body !== undefined ? req.send(body) : req;
  };
  const ok = async (a: Actor, method: Method, path: string, body?: Record<string, unknown>) => {
    const res = await call(a, method, path, body);
    if (res.status >= 300) throw new Error(`${a.email} ${method.toUpperCase()} ${path} → ${res.status} ${JSON.stringify(res.body)}`);
    return res.body?.data ?? res.body;
  };
  /** A traveler's request with an accepted offer from `provider`; returns the conversion path. */
  const accepted = async (serviceType: string, travelers: number, provider: Actor, extra: Record<string, unknown> = {}) => {
    const req = await ok(w.travelerA, 'post', '/marketplace/requests', { serviceType, title: `F14 ${serviceType} ${uniq()}`, travelers, ...extra });
    const offer = await ok(provider, 'post', `/marketplace/requests/${req.id}/offers`, { priceCents: 20_000 });
    await ok(w.travelerA, 'post', `/marketplace/requests/${req.id}/offers/${offer.id}/accept`, {});
    return { req, path: `/marketplace/requests/${req.id}/offers/${offer.id}/convert-to-booking` };
  };

  beforeAll(async () => {
    ctx = await createTestApp();
    w = await buildWorld(ctx);
  });
  afterAll(async () => ctx?.close());

  describe('transport', () => {
    let van: any;
    let bus: any;
    let route: any;

    beforeAll(async () => {
      van = await ok(w.transportA, 'post', '/transport/vehicles', { type: 'VAN', plateNumber: `F14V-${uniq()}`, capacity: 4 });
      bus = await ok(w.transportA, 'post', '/transport/vehicles', { type: 'BUS', plateNumber: `F14B-${uniq()}`, capacity: 12 });
      route = await ok(w.transportA, 'post', '/transport/routes', {
        name: `F14 JED → MAK ${uniq()}`, originCity: 'JEDDAH', destCity: 'MAKKAH', totalSeats: 5, durationMins: 90, vehicleId: bus.id,
      });
    });

    it('refuses more passengers than the vehicle seats; nothing is written and the offer stays convertible', async () => {
      const { req, path } = await accepted('TRANSPORT', 6, w.transportA);
      const res = await call(w.transportA, 'post', path, { vehicleId: van.id, scheduledAt: at(10, 8) });
      expect(res.status).toBe(409);
      expect(res.body.error.message).toBe('Passenger count 6 exceeds the vehicle capacity of 4');
      expect(await ctx.prisma.transportAssignment.count({ where: { vehicleId: van.id } })).toBe(0);
      const fresh = await ctx.prisma.marketplaceRequest.findUniqueOrThrow({ where: { id: req.id } });
      expect((fresh.requirements as any)?._conversion).toBeUndefined();
      // The provider can still convert it with a vehicle that fits.
      const trip = await ok(w.transportA, 'post', path, { vehicleId: bus.id, scheduledAt: at(10, 8) });
      expect([trip.vehicleId, trip.passengerCount, trip.status]).toEqual([bus.id, 6, 'CONFIRMED']);
    });

    it('refuses a vehicle that is already on another trip at that time, and counts the seats it books', async () => {
      const first = await accepted('TRANSPORT', 3, w.transportA);
      await ok(w.transportA, 'post', first.path, { vehicleId: van.id, scheduledAt: at(12, 9) });
      expect((await ctx.prisma.vehicle.findUniqueOrThrow({ where: { id: van.id } })).bookedSeats).toBe(3);

      const clash = await accepted('TRANSPORT', 1, w.transportA);
      const res = await call(w.transportA, 'post', clash.path, { vehicleId: van.id, scheduledAt: at(12, 9) });
      expect(res.status).toBe(409);
      expect(res.body.error.message).toMatch(/already has a trip at/);
      // Two hours later the van is free again.
      expect((await ok(w.transportA, 'post', clash.path, { vehicleId: van.id, scheduledAt: at(12, 11) })).passengerCount).toBe(1);
      expect((await ctx.prisma.vehicle.findUniqueOrThrow({ where: { id: van.id } })).bookedSeats).toBe(4);
    });

    it('refuses more seats than the route has left and marks the route full when it sells out', async () => {
      const a = await accepted('TRANSPORT', 4, w.transportA);
      await ok(w.transportA, 'post', a.path, { vehicleId: bus.id, routeId: route.id, scheduledAt: at(14, 7) });
      const b = await accepted('TRANSPORT', 2, w.transportA);
      const res = await call(w.transportA, 'post', b.path, { vehicleId: bus.id, routeId: route.id, scheduledAt: at(14, 7) });
      expect([res.status, res.body.error.message]).toEqual([409, `Only 1 seat(s) left on route ${route.name}`]);
      const c = await accepted('TRANSPORT', 1, w.transportA);
      await ok(w.transportA, 'post', c.path, { vehicleId: bus.id, routeId: route.id, scheduledAt: at(14, 7) });
      const full = await ctx.prisma.transportRoute.findUniqueOrThrow({ where: { id: route.id } });
      expect([full.bookedSeats, full.status]).toEqual([5, 'FULLY_BOOKED']);
    });

    it('refuses a vehicle under maintenance', async () => {
      const car = await ok(w.transportA, 'post', '/transport/vehicles', { type: 'PRIVATE_CAR', plateNumber: `F14C-${uniq()}`, capacity: 4 });
      await ok(w.transportA, 'put', `/transport/vehicles/${car.id}`, { status: 'UNDER_MAINTENANCE' });
      const { path } = await accepted('TRANSPORT', 2, w.transportA);
      const res = await call(w.transportA, 'post', path, { vehicleId: car.id, scheduledAt: at(16, 10) });
      expect([res.status, res.body.error.message]).toEqual([409, `Vehicle ${car.plateNumber} is under maintenance`]);
    });
  });

  describe('hotel (marketplace listing booking)', () => {
    let vendorId: string;
    const listingFor = async (title: string, maxCapacity?: number, status?: string) =>
      ok(w.hotelA, 'post', '/marketplace/listings', {
        title, category: 'hotel_room', priceFrom: 200, pricingModel: 'PER_GROUP', vendorId,
        ...(maxCapacity ? { maxCapacity } : {}), ...(status ? { status } : {}),
      });

    beforeAll(async () => {
      vendorId = (await ok(w.hotelA, 'post', '/marketplace/vendors', { name: `F14 hotel ${uniq()}`, type: 'HOTEL' })).id;
    });

    it('refuses a party larger than the chosen listing holds', async () => {
      const small = await listingFor(`F14 double ${uniq()}`, 2);
      const { path } = await accepted('HOTEL', 3, w.hotelA);
      const res = await call(w.travelerA, 'post', path, { listingId: small.id });
      expect([res.status, res.body.error.message]).toEqual([400, 'This listing takes at most 2 people; the request is for 3']);
      expect(await ctx.prisma.listingBooking.count({ where: { listingId: small.id } })).toBe(0);
    });

    it('refuses a listing that is not live (draft, unpublished); a live one books', async () => {
      const draft = await listingFor(`F14 draft ${uniq()}`, undefined, 'DRAFT');
      const live = await listingFor(`F14 live ${uniq()}`, 4);
      const { path } = await accepted('HOTEL', 2, w.hotelA);
      expect((await call(w.travelerA, 'post', path, { listingId: draft.id })).status).toBe(404);
      await ok(w.hotelA, 'put', `/marketplace/listings/${live.id}`, { status: 'PAUSED' });
      expect((await call(w.travelerA, 'post', path, { listingId: live.id })).status).toBe(404);
      await ok(w.hotelA, 'put', `/marketplace/listings/${live.id}`, { status: 'PUBLISHED' });
      const booking = await ok(w.travelerA, 'post', path, { listingId: live.id });
      expect([booking.listingId, booking.partySize, booking.totalAmountCents]).toEqual([live.id, 2, 20_000]);
    });

    it('refuses a request whose dates are reversed', async () => {
      expect((await call(w.travelerA, 'post', '/marketplace/requests', {
        serviceType: 'HOTEL', title: 'Backwards', dateFrom: '2027-03-10', dateTo: '2027-03-01',
      })).status).toBe(400);
    });
  });
});

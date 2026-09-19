import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { api, createTestApp, TestContext } from './app';
import { Actor, bearer, buildWorld, World } from './fixtures';

/**
 * F13 — hotel bookings, trips and visa applications have no payment linked to
 * them (invoices link to operator bookings only), so their stored payment status
 * could never change. Before: every screen showed them "Unpaid" forever and the
 * dashboards reported 0 collected and everything outstanding. Now the field is
 * neither accepted nor returned, and the dashboards report what was booked —
 * money is recorded as Finance invoices.
 */

type Method = 'get' | 'post' | 'put';
const uniq = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
const day = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

describe('F13: no payment status where no payment is linked', () => {
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
  const noPaymentStatus = (label: string, value: unknown) => expect(JSON.stringify(value), label).not.toContain('paymentStatus');

  beforeAll(async () => {
    ctx = await createTestApp();
    w = await buildWorld(ctx);
  });
  afterAll(async () => ctx?.close());

  it('hotel bookings: never accepted, never returned; the dashboard reports the booked value', async () => {
    const hotel = await ok(w.hotelA, 'post', '/hotels', { name: `F13 Hotel ${uniq()}`, city: 'Makkah', starRating: 4 });
    const booking = await ok(w.hotelA, 'post', '/hotels/bookings', { hotelId: hotel.id, guestName: 'Guest', checkIn: day(3), checkOut: day(5), amount: 800 });
    noPaymentStatus('create', booking);
    expect((await call(w.hotelA, 'put', `/hotels/bookings/${booking.id}`, { paymentStatus: 'PAID' })).status).toBe(400);
    noPaymentStatus('read', await ok(w.hotelA, 'get', `/hotels/bookings/${booking.id}`));
    noPaymentStatus('list', await ok(w.hotelA, 'get', '/hotels/bookings'));
    noPaymentStatus('hotel', await ok(w.hotelA, 'get', `/hotels/${hotel.id}`));

    const stats = await ok(w.hotelA, 'get', '/hotels/stats');
    expect(stats).not.toHaveProperty('revenue');
    const open = await ctx.prisma.hotelBooking.aggregate({
      where: { tenantId: w.tenants.hotelA, currency: 'SAR', status: { not: 'CANCELLED' } }, _sum: { totalAmountCents: true }, _count: { _all: true },
    });
    expect(stats.bookedValue).toEqual({ amountCents: Number(open._sum.totalAmountCents ?? 0), count: open._count._all, currency: 'SAR' });
  });

  it('trips: never accepted, never returned; the dashboard reports the booked value', async () => {
    const vehicle = await ok(w.transportA, 'post', '/transport/vehicles', { type: 'VAN', plateNumber: `F13-${uniq()}`, capacity: 6 });
    const trip = await ok(w.transportA, 'post', '/transport/assignments', { vehicleId: vehicle.id, scheduledAt: `${day(4)}T08:00:00.000Z`, passengerCount: 2, price: 300 });
    noPaymentStatus('create', trip);
    expect((await call(w.transportA, 'put', `/transport/assignments/${trip.id}`, { paymentStatus: 'PAID' })).status).toBe(400);
    noPaymentStatus('read', await ok(w.transportA, 'get', `/transport/assignments/${trip.id}`));
    noPaymentStatus('list', await ok(w.transportA, 'get', '/transport/assignments'));

    const stats = await ok(w.transportA, 'get', '/transport/stats');
    expect(stats).not.toHaveProperty('revenue');
    noPaymentStatus('stats', stats);
    const open = await ctx.prisma.transportAssignment.aggregate({
      where: { tenantId: w.tenants.transportA, currency: 'SAR', status: { not: 'CANCELLED' } }, _sum: { priceCents: true }, _count: { _all: true },
    });
    expect(stats.bookedValue).toEqual({ amountCents: Number(open._sum.priceCents ?? 0), count: open._count._all, currency: 'SAR' });
  });

  it('visa applications: never accepted, never returned; the dashboard reports the booked value', async () => {
    const visa = await ok(w.visaA, 'post', '/compliance/visas', { applicantName: 'F13 Applicant', visaType: 'UMRAH', price: 250 });
    noPaymentStatus('create', visa);
    expect((await call(w.visaA, 'put', `/compliance/visas/${visa.id}`, { paymentStatus: 'PAID' })).status).toBe(400);
    noPaymentStatus('read', await ok(w.visaA, 'get', `/compliance/visas/${visa.id}`));
    noPaymentStatus('list', await ok(w.visaA, 'get', '/compliance/visas'));

    const stats = await ok(w.visaA, 'get', '/compliance/visas/dashboard-stats');
    expect(stats).not.toHaveProperty('revenueCollected');
    expect(stats).not.toHaveProperty('pendingPayment');
    expect(stats.bookedValue.currency).toBe('SAR');
    expect(stats.bookedValue.amountCents).toBeGreaterThanOrEqual(25_000);
  });

  it('trips and visa applications created from marketplace offers carry no payment status either', async () => {
    const vehicle = await ok(w.transportB, 'post', '/transport/vehicles', { type: 'BUS', plateNumber: `F13B-${uniq()}`, capacity: 20 });
    const req = await ok(w.travelerA, 'post', '/marketplace/requests', { serviceType: 'TRANSPORT', title: `F13 ride ${uniq()}`, travelers: 2 });
    const offer = await ok(w.transportB, 'post', `/marketplace/requests/${req.id}/offers`, { priceCents: 9_000 });
    await ok(w.travelerA, 'post', `/marketplace/requests/${req.id}/offers/${offer.id}/accept`, {});
    noPaymentStatus('trip', await ok(w.transportB, 'post', `/marketplace/requests/${req.id}/offers/${offer.id}/convert-to-booking`, { vehicleId: vehicle.id }));

    const vreq = await ok(w.travelerA, 'post', '/marketplace/requests', { serviceType: 'VISA', title: `F13 visa ${uniq()}` });
    const voffer = await ok(w.visaB, 'post', `/marketplace/requests/${vreq.id}/offers`, { priceCents: 12_000 });
    await ok(w.travelerA, 'post', `/marketplace/requests/${vreq.id}/offers/${voffer.id}/accept`, {});
    noPaymentStatus('visa', await ok(w.travelerA, 'post', `/marketplace/requests/${vreq.id}/offers/${voffer.id}/convert-to-booking`, {}));
  });
});

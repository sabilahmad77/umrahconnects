import { createHmac } from 'crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { api, createTestApp, TestContext } from './app';
import { Actor, bearer, buildWorld, World } from './fixtures';

/**
 * Red-team payments suite (sandbox gateway): intents, capture, refunds,
 * signed webhooks and traveler checkout.
 */

const uniq = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
const day = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);
const SECRET = 'test-sandbox-webhook-secret';
const sign = (raw: string, secret = SECRET) => `sha256=${createHmac('sha256', secret).update(raw).digest('hex')}`;

type Method = 'get' | 'post' | 'put' | 'patch' | 'delete';

describe('red team: payments', () => {
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
  const webhook = (provider: string, raw: string, signature?: string) => {
    let req = ctx.http().post(api(`/payments/webhook/${provider}`)).set('Content-Type', 'application/json');
    if (signature !== undefined) req = req.set('x-signature', signature);
    return req.send(raw);
  };
  const invoiceRow = (id: string) => ctx.prisma.invoice.findUniqueOrThrow({ where: { id } });

  beforeAll(async () => {
    ctx = await createTestApp();
    w = await buildWorld(ctx);
  });
  afterAll(async () => ctx?.close());

  describe('organization intents', () => {
    let inv: any;
    let pay: any;
    const key = `idem-${uniq()}`;

    beforeAll(async () => {
      inv = await ok(w.opA, 'post', '/finance/invoices', { issuedToName: 'Payer', subtotal: 1000, currency: 'SAR' });
    });

    it('validates the target, amount and currency on the server', async () => {
      const intent = (body: Record<string, unknown>) => call(w.opA, 'post', '/payments/intents', body);
      expect((await intent({ invoiceId: inv.id })).status).toBe(400); // DRAFT
      await ok(w.opA, 'put', `/finance/invoices/${inv.id}/issue`);
      expect((await intent({ amount: 10 })).status).toBe(400); // no invoice / booking
      expect((await intent({ invoiceId: inv.id, amount: 1000.01 })).status).toBe(400);
      expect((await intent({ invoiceId: inv.id, amountCents: 100_001 })).status).toBe(400);
      expect((await intent({ invoiceId: inv.id, amount: 10, currency: 'USD' })).status).toBe(400);
      expect((await intent({ invoiceId: inv.id, amount: 10, provider: 'stripe' })).status).toBe(400);
      expect((await intent({ invoiceId: inv.id, amount: -5 })).status).toBe(400);
      expect((await intent({ invoiceId: inv.id, amount: 10, status: 'COMPLETED' })).status).toBe(400);
      expect(await ctx.prisma.payment.count({ where: { invoiceId: inv.id } })).toBe(0);

      pay = await ok(w.opA, 'post', '/payments/intents', { invoiceId: inv.id, amount: 300, idempotencyKey: key });
      expect([pay.status, pay.amountCents, pay.gateway, pay.idempotentReplay]).toEqual(['PENDING', 30_000, 'sandbox', false]);
      expect(pay).not.toHaveProperty('gatewayResponse');

      const replay = await ok(w.opA, 'post', '/payments/intents', { invoiceId: inv.id, amount: 999, idempotencyKey: key });
      expect([replay.id, replay.amountCents, replay.idempotentReplay]).toEqual([pay.id, 30_000, true]);
      expect(await ctx.prisma.payment.count({ where: { invoiceId: inv.id } })).toBe(1);
    });

    it('capability and tenant checks', async () => {
      expect((await call(w.staffA, 'post', '/payments/intents', { invoiceId: inv.id, amount: 1 })).status).toBe(403);
      expect((await call(w.staffA, 'post', `/payments/intents/${pay.id}/confirm`, {})).status).toBe(403);
      expect((await call(w.travelerA, 'post', '/payments/intents', { invoiceId: inv.id, amount: 1 })).status).toBe(403);
      for (const [method, path, body] of [
        ['post', `/payments/intents/${pay.id}/confirm`, {}],
        ['get', `/payments/${pay.id}`, undefined],
        ['get', `/payments/${pay.id}/transactions`, undefined],
        ['post', `/payments/${pay.id}/refund`, { amount: 1 }],
        ['post', '/payments/intents', { invoiceId: inv.id, amount: 1 }],
      ] as [Method, string, Record<string, unknown> | undefined][]) {
        expect((await call(w.opB, method, path, body)).status, `${method} ${path}`).toBe(404);
      }
      // Another organization replaying the key gets a conflict, not the payment.
      const invB = await ok(w.opB, 'post', '/finance/invoices', { issuedToName: 'B', subtotal: 10 });
      await ok(w.opB, 'put', `/finance/invoices/${invB.id}/issue`);
      const stolen = await call(w.opB, 'post', '/payments/intents', { invoiceId: invB.id, idempotencyKey: key });
      expect(stolen.status).toBe(409);
      expect(JSON.stringify(stolen.body)).not.toContain(pay.id);
      expect((await ctx.prisma.payment.findUniqueOrThrow({ where: { id: pay.id } })).status).toBe('PENDING');
    });

    it('capture reconciles the invoice; refunds need finance:payment:refund and are capped', async () => {
      const captured = await ok(w.opA, 'post', `/payments/intents/${pay.id}/confirm`, {});
      expect(captured.status).toBe('COMPLETED');
      expect((await call(w.opA, 'post', `/payments/intents/${pay.id}/confirm`, {})).status).toBe(400);
      let row = await invoiceRow(inv.id);
      expect([row.status, Number(row.paidCents)]).toEqual(['PARTIALLY_PAID', 30_000]);

      expect((await call(w.staffA, 'post', `/payments/${pay.id}/refund`, { amount: 1 })).status).toBe(403);
      expect((await call(w.financeA, 'post', `/payments/${pay.id}/refund`, { amount: 300.01 })).status).toBe(400);
      const partial = await ok(w.financeA, 'post', `/payments/${pay.id}/refund`, { amount: 100, reason: 'goodwill' });
      expect([partial.status, partial.refundedCents]).toEqual(['PARTIALLY_REFUNDED', 10_000]);
      expect((await call(w.financeA, 'post', `/payments/${pay.id}/refund`, { amount: 200.01 })).status).toBe(400);
      row = await invoiceRow(inv.id);
      expect(Number(row.paidCents)).toBe(20_000);
      const rest = await ok(w.financeA, 'post', `/payments/${pay.id}/refund`, {});
      expect([rest.status, rest.refundedCents]).toEqual(['REFUNDED', 30_000]);
      expect((await call(w.financeA, 'post', `/payments/${pay.id}/refund`, { amount: 1 })).status).toBe(400);
      row = await invoiceRow(inv.id);
      expect([row.status, Number(row.paidCents)]).toEqual(['ISSUED', 0]);
      // Gateway payments are not editable through the manual finance routes.
      expect((await call(w.financeA, 'put', `/finance/payments/${pay.id}`, { status: 'COMPLETED' })).status).toBe(400);
      expect((await call(w.financeA, 'post', `/finance/payments/${pay.id}/refund`, { amount: 1 })).status).toBe(400);
    });

    it('a declined capture fails the payment without touching the invoice', async () => {
      const p = await ok(w.opA, 'post', '/payments/intents', { invoiceId: inv.id, amount: 50 });
      const failed = await ok(w.opA, 'post', `/payments/intents/${p.id}/confirm`, { scenario: 'decline_at_capture' });
      expect(failed.status).toBe('FAILED');
      expect((await call(w.opA, 'post', `/payments/intents/${p.id}/confirm`, {})).status).toBe(400);
      expect(Number((await invoiceRow(inv.id)).paidCents)).toBe(0);
    });

    describe('signed webhooks', () => {
      let p: any;
      let ref: string;
      beforeAll(async () => {
        p = await ok(w.opA, 'post', '/payments/intents', { invoiceId: inv.id, amount: 200 });
        ref = (await ctx.prisma.payment.findUniqueOrThrow({ where: { id: p.id } })).gatewayRef!;
      });

      it('rejects unsigned, mis-signed and tampered deliveries and unknown endpoints', async () => {
        const raw = JSON.stringify({ id: `evt_${uniq()}`, type: 'payment.captured', data: { providerRef: ref } });
        expect((await webhook('sandbox', raw)).status).toBe(400);
        expect((await webhook('sandbox', raw, 'sha256=deadbeef')).status).toBe(400);
        expect((await webhook('sandbox', raw, sign(raw, 'wrong-secret'))).status).toBe(400);
        const tampered = raw.replace('payment.captured', 'payment.refunded');
        expect((await webhook('sandbox', tampered, sign(raw))).status).toBe(400);
        const pretty = JSON.stringify(JSON.parse(raw), null, 2); // same JSON, different bytes
        expect((await webhook('sandbox', pretty, sign(raw))).status).toBe(400);
        const noId = JSON.stringify({ type: 'payment.captured', data: { providerRef: ref } });
        expect((await webhook('sandbox', noId, sign(noId))).status).toBe(400);
        expect((await webhook('paypal', raw, sign(raw))).status).toBe(404);
        expect((await webhook('stripe', raw, sign(raw))).status).toBe(404); // not configured in tests
        expect((await ctx.prisma.payment.findUniqueOrThrow({ where: { id: p.id } })).status).toBe('PENDING');
        expect(await ctx.prisma.paymentWebhookEvent.count({ where: { paymentId: p.id } })).toBe(0);
      });

      it('a valid capture settles once; replays are acknowledged without double counting', async () => {
        const eventId = `evt_${uniq()}`;
        // data.amountCents is not trusted: the sandbox verifier ignores it, the server amount is used.
        const raw = JSON.stringify({ id: eventId, type: 'payment.captured', data: { providerRef: ref, amountCents: 1 } });
        const first = await webhook('sandbox', raw, sign(raw));
        expect(first.status).toBe(200);
        expect(first.body.data).toMatchObject({ received: true, duplicate: false, result: 'captured' });
        const pay2 = await ctx.prisma.payment.findUniqueOrThrow({ where: { id: p.id } });
        expect([pay2.status, Number(pay2.amountCents)]).toEqual(['COMPLETED', 20_000]);
        expect(Number((await invoiceRow(inv.id)).paidCents)).toBe(20_000);

        const replay = await webhook('sandbox', raw, sign(raw));
        expect(replay.status).toBe(200);
        expect(replay.body.data).toMatchObject({ duplicate: true, eventId, result: 'captured' });

        const other = JSON.stringify({ id: `evt_${uniq()}`, type: 'payment.captured', data: { providerRef: ref } });
        expect((await webhook('sandbox', other, sign(other))).body.data.duplicate).toBe(false);
        const late = JSON.stringify({ id: `evt_${uniq()}`, type: 'payment.failed', data: { providerRef: ref } });
        expect((await webhook('sandbox', late, sign(late))).body.data.result).toBe('ignored: already captured');

        const row = await invoiceRow(inv.id);
        expect([row.status, Number(row.paidCents)]).toEqual(['PARTIALLY_PAID', 20_000]);
        expect((await ctx.prisma.payment.findUniqueOrThrow({ where: { id: p.id } })).status).toBe('COMPLETED');
        expect(await ctx.prisma.paymentTransaction.count({ where: { paymentId: p.id, type: 'CAPTURED' } })).toBe(1);
        expect(await ctx.prisma.paymentWebhookEvent.count({ where: { provider: 'sandbox', eventId } })).toBe(1);
      });

      it('an event for an unknown payment is recorded but changes nothing', async () => {
        const raw = JSON.stringify({ id: `evt_${uniq()}`, type: 'payment.captured', data: { providerRef: 'sbx_pi_unknown' } });
        const res = await webhook('sandbox', raw, sign(raw));
        expect(res.status).toBe(200);
        expect(res.body.data.result).toBe('no matching payment');
      });
    });
  });

  describe('traveler checkout', () => {
    let listing: any;
    let booking: any;
    let checkout: any;

    beforeAll(async () => {
      listing = await ok(w.hotelA, 'post', '/marketplace/listings', { title: `Checkout room ${uniq()}`, category: 'hotel_room', priceFrom: 175 });
      booking = await ok(w.travelerA, 'post', `/marketplace/listings/${listing.id}/bookings`, { partySize: 2, startDate: day(3) });
    });

    it('only the customer can open a checkout, and the amount is the booking total', async () => {
      expect((await call(w.travelerB, 'post', '/payments/checkout', { listingBookingId: booking.id })).status).toBe(404);
      expect((await call(w.hotelB, 'post', '/payments/checkout', { listingBookingId: booking.id })).status).toBe(404);
      expect((await call(w.travelerA, 'post', '/payments/checkout', { listingBookingId: booking.id, amountCents: 1 })).status).toBe(400);
      checkout = await ok(w.travelerA, 'post', '/payments/checkout', { listingBookingId: booking.id });
      expect([checkout.amountCents, checkout.currency, checkout.provider, checkout.status]).toEqual([35_000, 'SAR', 'sandbox', 'PENDING']);
      const row = await ctx.prisma.payment.findUniqueOrThrow({ where: { id: checkout.paymentId } });
      expect([row.tenantId, row.payerUserId, row.listingBookingId]).toEqual([w.tenants.hotelA, w.travelerA.id, booking.id]);
    });

    it('other users cannot read or complete the checkout', async () => {
      for (const a of [w.travelerB, w.hotelB]) {
        expect((await call(a, 'get', `/payments/checkout/${checkout.paymentId}`)).status).toBe(404);
        expect((await call(a, 'post', `/payments/checkout/${checkout.paymentId}/sandbox-complete`, {})).status).toBe(404);
      }
      expect((await call(w.opA, 'get', `/payments/${checkout.paymentId}`)).status).toBe(404);
      expect((await ctx.prisma.payment.findUniqueOrThrow({ where: { id: checkout.paymentId } })).status).toBe('PENDING');
      const lb = await ctx.prisma.listingBooking.findUniqueOrThrow({ where: { id: booking.id } });
      expect([lb.status, lb.paymentStatus]).toEqual(['PENDING', 'UNPAID']);
    });

    it('the customer completes it; the booking becomes PAID and CONFIRMED; no second charge', async () => {
      const done = await ok(w.travelerA, 'post', `/payments/checkout/${checkout.paymentId}/sandbox-complete`, {});
      expect(done.status).toBe('COMPLETED');
      const lb = await ctx.prisma.listingBooking.findUniqueOrThrow({ where: { id: booking.id } });
      expect([lb.status, lb.paymentStatus]).toEqual(['CONFIRMED', 'PAID']);
      const status = await ok(w.travelerA, 'get', `/payments/checkout/${checkout.paymentId}`);
      expect(status.status).toBe('COMPLETED');
      expect((await call(w.travelerA, 'post', '/payments/checkout', { listingBookingId: booking.id })).status).toBe(400);
      expect((await call(w.travelerA, 'post', `/payments/checkout/${checkout.paymentId}/sandbox-complete`, {})).status).toBe(400);
      // The provider organization sees the payment; the traveler cannot refund it.
      expect((await ok(w.hotelA, 'get', `/payments/${checkout.paymentId}`)).status).toBe('COMPLETED');
      expect((await call(w.travelerA, 'post', `/payments/${checkout.paymentId}/refund`, {})).status).toBe(403);
      expect(await ctx.prisma.payment.count({ where: { listingBookingId: booking.id, status: 'COMPLETED' } })).toBe(1);
    });

    it('a new checkout supersedes an open one instead of charging twice', async () => {
      const b2 = await ok(w.travelerA, 'post', `/marketplace/listings/${listing.id}/bookings`, { partySize: 1 });
      const c1 = await ok(w.travelerA, 'post', '/payments/checkout', { listingBookingId: b2.id });
      const c2 = await ok(w.travelerA, 'post', '/payments/checkout', { listingBookingId: b2.id });
      expect(c2.paymentId).not.toBe(c1.paymentId);
      expect((await ctx.prisma.payment.findUniqueOrThrow({ where: { id: c1.paymentId } })).status).toBe('FAILED');
      expect((await call(w.travelerA, 'post', `/payments/checkout/${c1.paymentId}/sandbox-complete`, {})).status).toBe(400);
      await ok(w.travelerA, 'post', `/payments/checkout/${c2.paymentId}/sandbox-complete`, {});
      const settled = await ctx.prisma.payment.findMany({ where: { listingBookingId: b2.id, status: 'COMPLETED' } });
      expect(settled.map((p) => Number(p.amountCents))).toEqual([17_500]);
    });
  });
});

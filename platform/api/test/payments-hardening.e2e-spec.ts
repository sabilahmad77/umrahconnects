import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

// Stripe webhook verification runs fully offline with a test signing secret; no
// test in this file reaches Stripe (payments are created in the database and
// every event carries what the server needs).
vi.hoisted(() => {
  process.env.STRIPE_SECRET_KEY = 'sk_test_offline_only_never_called';
  process.env.STRIPE_WEBHOOK_SECRET = 'whsec_offline_hardening_secret';
});

import Stripe from 'stripe';
import { api, createTestApp, TestContext } from './app';
import { Actor, bearer, buildWorld, World } from './fixtures';

/**
 * Money-integrity suite for W16 / XT-R09: forged and replayed webhooks,
 * out-of-order provider events, client-side amount manipulation, payable-state
 * rules, concurrency (double submits, parallel refunds) and server-owned
 * booking money.
 */

const uniq = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
const day = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);
const SECRET = 'whsec_offline_hardening_secret';
type Method = 'get' | 'post' | 'put' | 'delete';

describe('payments hardening: webhooks, ordering, manipulation, concurrency', () => {
  let ctx: TestContext;
  let w: World;

  const call = (a: Actor, method: Method, path: string, body?: Record<string, unknown>) => {
    const req = ctx.http()[method](api(path)).set(bearer(a));
    return body !== undefined ? req.send(body) : req;
  };
  const ok = async (a: Actor, method: Method, path: string, body?: Record<string, unknown>) => {
    const res = await call(a, method, path, body);
    if (res.status >= 300) throw new Error(`${a.email} ${method} ${path} → ${res.status} ${JSON.stringify(res.body)}`);
    return res.body?.data ?? res.body;
  };
  const deliver = (event: Record<string, unknown>, secret = SECRET, mutate?: (raw: string) => string) => {
    const payload = JSON.stringify(event);
    const header = Stripe.webhooks.generateTestHeaderString({ payload, secret });
    return ctx
      .http()
      .post(api('/payments/webhook/stripe'))
      .set('Content-Type', 'application/json')
      .set('stripe-signature', header)
      .send(mutate ? mutate(payload) : payload);
  };
  const evt = (type: string, object: Record<string, unknown>, id = `evt_${uniq()}`) => ({
    id, object: 'event', type, livemode: false, created: Math.floor(Date.now() / 1000), api_version: '2024-06-20',
    data: { object },
  });
  const succeeded = (pi: string, amount: number, reference?: string) =>
    evt('payment_intent.succeeded', {
      id: pi, object: 'payment_intent', status: 'succeeded', amount, amount_received: amount, currency: 'sar',
      ...(reference ? { metadata: { reference } } : {}),
    });
  const paymentRow = (id: string) => ctx.prisma.payment.findUniqueOrThrow({ where: { id } });
  const invoiceRow = (id: string) => ctx.prisma.invoice.findUniqueOrThrow({ where: { id } });

  /** An issued invoice of opA with an open Stripe attempt for `amountCents`. */
  const stripeAttempt = async (amountCents: number, invoiceTotal = amountCents) => {
    const inv = await ok(w.opA, 'post', '/finance/invoices', { issuedToName: `Hardening ${uniq()}`, subtotal: invoiceTotal / 100 });
    await ok(w.opA, 'put', `/finance/invoices/${inv.id}/issue`);
    const piId = `pi_${uniq()}`;
    const payment = await ctx.prisma.payment.create({
      data: {
        tenantId: w.tenants.opA, invoiceId: inv.id, amountCents: BigInt(amountCents), currency: 'SAR',
        gateway: 'stripe', gatewayRef: piId, idempotencyKey: `stripe-${uniq()}`, status: 'PENDING',
      },
    });
    return { inv, piId, payment };
  };

  beforeAll(async () => {
    ctx = await createTestApp();
    w = await buildWorld(ctx);
  });
  afterAll(async () => ctx?.close());

  describe('webhook authenticity and replays', () => {
    it('forged, tampered and foreign-secret deliveries are refused and change nothing', async () => {
      const { piId, payment, inv } = await stripeAttempt(10_000);
      const event = succeeded(piId, 10_000);
      expect((await deliver(event, 'whsec_attacker')).status).toBe(400);
      expect((await deliver(event, SECRET, (raw) => raw.replace('"amount":10000', '"amount":10001'))).status).toBe(400);
      const unsigned = await ctx.http().post(api('/payments/webhook/stripe')).set('Content-Type', 'application/json').send(JSON.stringify(event));
      expect(unsigned.status).toBe(400);
      expect((await paymentRow(payment.id)).status).toBe('PENDING');
      expect(Number((await invoiceRow(inv.id)).paidCents)).toBe(0);
      expect(await ctx.prisma.paymentWebhookEvent.count({ where: { eventId: event.id } })).toBe(0);
    });

    it('a body that is not JSON cannot be verified and is refused', async () => {
      const res = await ctx.http().post(api('/payments/webhook/stripe')).set('Content-Type', 'text/plain').set('stripe-signature', 't=1,v1=x').send('hello');
      expect(res.status).toBe(400);
    });

    it('a replayed refund event is applied once', async () => {
      const { piId, payment, inv } = await stripeAttempt(25_000);
      expect((await deliver(succeeded(piId, 25_000))).body.data.result).toBe('captured');
      const refund = evt('charge.refunded', { id: `ch_${uniq()}`, payment_intent: piId, amount_refunded: 5_000, amount_captured: 25_000, captured: true, currency: 'sar' });
      expect((await deliver(refund)).body.data.result).toBe('refund synced');
      const replay = await deliver(refund);
      expect(replay.body.data).toMatchObject({ duplicate: true, result: 'refund synced' });
      const p = await paymentRow(payment.id);
      expect([p.status, Number(p.refundedCents)]).toEqual(['PARTIALLY_REFUNDED', 5_000]);
      expect(Number((await invoiceRow(inv.id)).paidCents)).toBe(20_000);
      expect(await ctx.prisma.paymentTransaction.count({ where: { paymentId: payment.id, type: 'REFUND_SYNCED' } })).toBe(1);
      // A later cumulative total that is not higher changes nothing either.
      const stale = evt('charge.refunded', { id: `ch_${uniq()}`, payment_intent: piId, amount_refunded: 5_000, amount_captured: 25_000, captured: true, currency: 'sar' });
      expect((await deliver(stale)).body.data.result).toBe('ignored: already reflected');
    });

    it('an event whose reference names another payment is ignored', async () => {
      const { piId, payment } = await stripeAttempt(10_000);
      const res = await deliver(succeeded(piId, 10_000, 'someone-elses-reference'));
      expect(res.body.data.result).toBe('ignored: reference mismatch');
      expect((await paymentRow(payment.id)).status).toBe('PENDING');
      const good = await deliver(succeeded(piId, 10_000, payment.idempotencyKey));
      expect(good.body.data.result).toBe('captured');
    });
  });

  describe('out-of-order provider events', () => {
    it('a declined attempt keeps the intent payable; a later success settles it', async () => {
      const { piId, payment, inv } = await stripeAttempt(30_000);
      const declined = await deliver(evt('payment_intent.payment_failed', { id: piId, last_payment_error: { code: 'card_declined', decline_code: 'insufficient_funds' } }));
      expect(declined.body.data.result).toBe('attempt declined: insufficient_funds');
      let p = await paymentRow(payment.id);
      expect([p.status, p.failureReason]).toEqual(['PENDING', 'insufficient_funds']);
      // Still reserved: a second attempt for the same balance is refused.
      expect((await call(w.opA, 'post', '/payments/intents', { invoiceId: inv.id })).status).toBe(400);

      expect((await deliver(succeeded(piId, 30_000))).body.data.result).toBe('captured');
      p = await paymentRow(payment.id);
      expect([p.status, p.failureReason]).toEqual(['COMPLETED', null]);
      expect([(await invoiceRow(inv.id)).status, Number((await invoiceRow(inv.id)).paidCents)]).toEqual(['PAID', 30_000]);
    });

    it('late failure, processing and cancellation events never undo a capture', async () => {
      const { piId, payment, inv } = await stripeAttempt(12_000);
      await deliver(evt('payment_intent.processing', { id: piId }));
      expect((await paymentRow(payment.id)).status).toBe('PROCESSING');
      expect((await deliver(succeeded(piId, 12_000))).body.data.result).toBe('captured');
      expect((await deliver(evt('payment_intent.payment_failed', { id: piId, last_payment_error: { code: 'card_declined' } }))).body.data.result).toBe('ignored: already captured');
      expect((await deliver(evt('payment_intent.canceled', { id: piId, cancellation_reason: 'abandoned' }))).body.data.result).toBe('ignored: already captured');
      expect((await deliver(evt('payment_intent.processing', { id: piId }))).body.data.result).toBe('ignored: already COMPLETED');
      expect((await paymentRow(payment.id)).status).toBe('COMPLETED');
      expect(Number((await invoiceRow(inv.id)).paidCents)).toBe(12_000);
      expect(await ctx.prisma.paymentTransaction.count({ where: { paymentId: payment.id, type: 'CAPTURED' } })).toBe(1);
    });

    it('a refund that arrives before its capture records the capture first, exactly once', async () => {
      const { piId, payment, inv } = await stripeAttempt(25_000);
      const refund = evt('charge.refunded', { id: `ch_${uniq()}`, payment_intent: piId, amount_refunded: 5_000, amount_captured: 25_000, captured: true, currency: 'sar' });
      expect((await deliver(refund)).body.data.result).toBe('refund synced');
      let p = await paymentRow(payment.id);
      expect([p.status, Number(p.refundedCents), p.paidAt !== null]).toEqual(['PARTIALLY_REFUNDED', 5_000, true]);
      expect([(await invoiceRow(inv.id)).status, Number((await invoiceRow(inv.id)).paidCents)]).toEqual(['PARTIALLY_PAID', 20_000]);

      // The capture event arrives late: nothing is counted twice.
      expect((await deliver(succeeded(piId, 25_000))).body.data.result).toBe('already settled');
      p = await paymentRow(payment.id);
      expect([p.status, Number(p.refundedCents)]).toEqual(['PARTIALLY_REFUNDED', 5_000]);
      expect(Number((await invoiceRow(inv.id)).paidCents)).toBe(20_000);
      expect(await ctx.prisma.paymentTransaction.count({ where: { paymentId: payment.id, type: 'CAPTURED' } })).toBe(1);
    });

    it('a released authorisation is not mistaken for captured money', async () => {
      const { piId, payment } = await stripeAttempt(9_000);
      const released = evt('charge.refunded', { id: `ch_${uniq()}`, payment_intent: piId, amount_refunded: 9_000, captured: false, currency: 'sar' });
      expect((await deliver(released)).body.data.result).toBe('ignored: authorisation released, nothing was captured');
      expect((await paymentRow(payment.id)).status).toBe('PENDING');
    });

    it('a refund proving a different captured amount holds the payment instead of settling it', async () => {
      const { piId, payment, inv } = await stripeAttempt(25_000);
      const refund = evt('charge.refunded', { id: `ch_${uniq()}`, payment_intent: piId, amount_refunded: 100, amount_captured: 100, captured: true, currency: 'sar' });
      expect((await deliver(refund)).body.data.result).toBe('refund recorded on held payment');
      const p = await paymentRow(payment.id);
      expect([p.status, p.gatewayStatus]).toEqual(['DISPUTED', 'AMOUNT_MISMATCH']);
      expect(Number((await invoiceRow(inv.id)).paidCents)).toBe(0);
    });

    it('a dispute holds the payment; a late capture event cannot lift the hold; closing it settles the books', async () => {
      const a = await stripeAttempt(40_000);
      await deliver(succeeded(a.piId, 40_000));
      expect((await deliver(evt('charge.dispute.created', { id: `dp_${uniq()}`, payment_intent: a.piId }))).body.data.result).toBe('disputed');
      expect((await deliver(succeeded(a.piId, 40_000))).body.data.result).toBe('ignored: payment is on hold');
      expect((await paymentRow(a.payment.id)).status).toBe('DISPUTED');
      // Money under an open dispute still counts until the dispute is lost.
      expect(Number((await invoiceRow(a.inv.id)).paidCents)).toBe(40_000);
      expect((await call(w.financeA, 'post', `/payments/${a.payment.id}/refund`, {})).status).toBe(400);
      expect((await deliver(evt('charge.dispute.closed', { id: `dp_${uniq()}`, payment_intent: a.piId, status: 'lost' }))).body.data.result).toBe('dispute lost');
      expect([(await invoiceRow(a.inv.id)).status, Number((await invoiceRow(a.inv.id)).paidCents)]).toEqual(['ISSUED', 0]);

      const b = await stripeAttempt(15_000);
      await deliver(succeeded(b.piId, 15_000));
      await deliver(evt('charge.dispute.created', { id: `dp_${uniq()}`, payment_intent: b.piId }));
      expect((await deliver(evt('charge.dispute.closed', { id: `dp_${uniq()}`, payment_intent: b.piId, status: 'won' }))).body.data.result).toBe('dispute won');
      expect((await paymentRow(b.payment.id)).status).toBe('COMPLETED');
      expect(Number((await invoiceRow(b.inv.id)).paidCents)).toBe(15_000);
    });
  });

  describe('amounts come from the server', () => {
    let listing: any;
    beforeAll(async () => {
      listing = await ok(w.hotelA, 'post', '/marketplace/listings', { title: `Hardening room ${uniq()}`, category: 'hotel_room', priceFrom: 120 });
    });

    it('checkout, confirm and refund refuse client-chosen amounts, currencies and states', async () => {
      const booking = await ok(w.travelerA, 'post', `/marketplace/listings/${listing.id}/bookings`, { partySize: 1, startDate: day(5) });
      for (const extra of [{ amount: 1 }, { amountCents: 100 }, { currency: 'USD' }, { status: 'COMPLETED' }, { provider: 'sandbox' }]) {
        expect((await call(w.travelerA, 'post', '/payments/checkout', { listingBookingId: booking.id, ...extra })).status, JSON.stringify(extra)).toBe(400);
      }
      const checkout = await ok(w.travelerA, 'post', '/payments/checkout', { listingBookingId: booking.id });
      expect([checkout.amountCents, checkout.currency]).toEqual([12_000, 'SAR']);
      expect(checkout).not.toHaveProperty('gatewayResponse');
      expect((await call(w.travelerA, 'post', `/payments/checkout/${checkout.paymentId}/sandbox-complete`, { amountCents: 1 })).status).toBe(400);
      expect((await call(w.travelerA, 'post', `/payments/checkout/${checkout.paymentId}/sandbox-complete`, { scenario: 'pay_less' })).status).toBe(400);

      const inv = await ok(w.opA, 'post', '/finance/invoices', { issuedToName: 'Manipulation', subtotal: 500 });
      await ok(w.opA, 'put', `/finance/invoices/${inv.id}/issue`);
      const bad = [{ amount: 10.005 }, { amountCents: 10.5 }, { amount: 0 }, { amount: '1e3' }, { amountCents: -1 }];
      for (const body of bad) {
        expect((await call(w.opA, 'post', '/payments/intents', { invoiceId: inv.id, ...body })).status, JSON.stringify(body)).toBe(400);
      }
      const pay = await ok(w.opA, 'post', '/payments/intents', { invoiceId: inv.id, amount: 200 });
      expect((await call(w.opA, 'post', `/payments/intents/${pay.id}/confirm`, { amountCents: 1 })).status).toBe(400);
      await ok(w.opA, 'post', `/payments/intents/${pay.id}/confirm`, {});
      for (const body of [{ amount: 0.001 }, { amount: -1 }, { amount: 200.01 }]) {
        expect((await call(w.financeA, 'post', `/payments/${pay.id}/refund`, body)).status, JSON.stringify(body)).toBe(400);
      }
      expect(Number((await paymentRow(pay.id)).refundedCents)).toBe(0);
    });

    it('draft, void and paid invoices refuse card and manual payments', async () => {
      const draft = await ok(w.opA, 'post', '/finance/invoices', { issuedToName: 'Draft', subtotal: 100 });
      expect((await call(w.opA, 'post', '/payments/intents', { invoiceId: draft.id })).status).toBe(400);
      expect((await call(w.opA, 'post', `/finance/invoices/${draft.id}/payments`, { amount: 10, method: 'cash' })).status).toBe(400);

      const voided = await ok(w.opA, 'post', '/finance/invoices', { issuedToName: 'Void', subtotal: 100 });
      await ok(w.opA, 'put', `/finance/invoices/${voided.id}/issue`);
      await ok(w.opA, 'put', `/finance/invoices/${voided.id}/void`);
      expect((await call(w.opA, 'post', '/payments/intents', { invoiceId: voided.id })).status).toBe(400);
      expect((await call(w.opA, 'post', `/finance/invoices/${voided.id}/payments`, { amount: 10, method: 'cash' })).status).toBe(400);

      const paid = await ok(w.opA, 'post', '/finance/invoices', { issuedToName: 'Paid', subtotal: 100 });
      await ok(w.opA, 'put', `/finance/invoices/${paid.id}/issue`);
      await ok(w.opA, 'post', `/finance/invoices/${paid.id}/payments`, { amount: 100, method: 'bank_transfer' });
      expect((await invoiceRow(paid.id)).status).toBe('PAID');
      expect((await call(w.opA, 'post', '/payments/intents', { invoiceId: paid.id })).status).toBe(400);
      expect((await call(w.opA, 'post', `/finance/invoices/${paid.id}/payments`, { amount: 1, method: 'cash' })).status).toBe(400);
      expect(await ctx.prisma.payment.count({ where: { invoiceId: { in: [draft.id, voided.id] } } })).toBe(0);
    });

    it('issued invoices keep their amounts; only drafts are cancelled by DELETE', async () => {
      const inv = await ok(w.opA, 'post', '/finance/invoices', { issuedToName: 'Frozen', subtotal: 300 });
      await ok(w.opA, 'put', `/finance/invoices/${inv.id}`, { subtotal: 350 });
      expect(Number((await invoiceRow(inv.id)).totalCents)).toBe(35_000);
      await ok(w.opA, 'put', `/finance/invoices/${inv.id}/issue`);
      expect((await call(w.opA, 'put', `/finance/invoices/${inv.id}`, { subtotal: 1 })).status).toBe(400);
      expect((await call(w.opA, 'put', `/finance/invoices/${inv.id}`, { currency: 'USD' })).status).toBe(400);
      expect((await call(w.opA, 'delete', `/finance/invoices/${inv.id}`)).status).toBe(400);
      expect(Number((await invoiceRow(inv.id)).totalCents)).toBe(35_000);
      const draft = await ok(w.opA, 'post', '/finance/invoices', { issuedToName: 'Scrap', subtotal: 10 });
      expect((await ok(w.opA, 'delete', `/finance/invoices/${draft.id}`)).status).toBe('CANCELLED');
    });
  });

  describe('open attempts: resume, cancel, concurrency', () => {
    it('staff can resume or cancel an open attempt; cancelling releases the reserved balance', async () => {
      const inv = await ok(w.opA, 'post', '/finance/invoices', { issuedToName: 'Resume', subtotal: 800 });
      await ok(w.opA, 'put', `/finance/invoices/${inv.id}/issue`);
      const first = await ok(w.opA, 'post', '/payments/intents', { invoiceId: inv.id });
      expect((await call(w.opA, 'post', '/payments/intents', { invoiceId: inv.id })).status).toBe(400);

      const resumed = await ok(w.opA, 'post', `/payments/intents/${first.id}/resume`, {});
      expect([resumed.id, resumed.status]).toEqual([first.id, 'PENDING']);
      for (const [actor, code] of [[w.staffA, 403], [w.travelerA, 403], [w.opB, 404]] as [Actor, number][]) {
        expect((await call(actor, 'post', `/payments/intents/${first.id}/resume`, {})).status).toBe(code);
        expect((await call(actor, 'post', `/payments/intents/${first.id}/cancel`, {})).status).toBe(code);
      }

      const cancelled = await ok(w.opA, 'post', `/payments/intents/${first.id}/cancel`, {});
      expect([cancelled.status, cancelled.failureReason]).toEqual(['FAILED', 'cancelled by staff']);
      expect((await call(w.opA, 'post', `/payments/intents/${first.id}/cancel`, {})).status).toBe(400);
      expect((await call(w.opA, 'post', `/payments/intents/${first.id}/confirm`, {})).status).toBe(400);
      const second = await ok(w.opA, 'post', '/payments/intents', { invoiceId: inv.id });
      expect(second.amountCents).toBe(80_000);
    });

    it('manual payments are not managed through the gateway routes', async () => {
      const inv = await ok(w.opA, 'post', '/finance/invoices', { issuedToName: 'Manual', subtotal: 50 });
      await ok(w.opA, 'put', `/finance/invoices/${inv.id}/issue`);
      const manual = await ok(w.opA, 'post', `/finance/invoices/${inv.id}/payments`, { amount: 20, method: 'cash' });
      expect((await call(w.financeA, 'post', `/payments/${manual.id}/refund`, {})).status).toBe(400);
      expect((await call(w.opA, 'post', `/payments/intents/${manual.id}/cancel`, {})).status).toBe(400);
      expect((await paymentRow(manual.id)).status).toBe('COMPLETED');
    });

    it('parallel attempts on one balance: exactly one is opened', async () => {
      const inv = await ok(w.opA, 'post', '/finance/invoices', { issuedToName: 'Race', subtotal: 1000 });
      await ok(w.opA, 'put', `/finance/invoices/${inv.id}/issue`);
      const results = await Promise.all([1, 2, 3, 4].map(() => call(w.opA, 'post', '/payments/intents', { invoiceId: inv.id })));
      expect(results.map((r) => r.status).sort()).toEqual([201, 400, 400, 400]);
      expect(await ctx.prisma.payment.count({ where: { invoiceId: inv.id } })).toBe(1);
    });

    it('a double-submitted manual payment is recorded once', async () => {
      const inv = await ok(w.opA, 'post', '/finance/invoices', { issuedToName: 'Double', subtotal: 1000 });
      await ok(w.opA, 'put', `/finance/invoices/${inv.id}/issue`);
      const key = `manual-${uniq()}`;
      const body = { amount: 400, method: 'cash', idempotencyKey: key };
      const [a, b] = await Promise.all([1, 2].map(() => ok(w.opA, 'post', `/finance/invoices/${inv.id}/payments`, body)));
      expect(a.id).toBe(b.id);
      expect([a.idempotentReplay, b.idempotentReplay].sort()).toEqual([false, true]);
      // Without a key, parallel recordings can never exceed the balance.
      const results = await Promise.all([1, 2, 3].map(() => call(w.opA, 'post', `/finance/invoices/${inv.id}/payments`, { amount: 400, method: 'cash' })));
      expect(results.filter((r) => r.status === 201)).toHaveLength(1);
      const row = await invoiceRow(inv.id);
      expect([row.status, Number(row.paidCents)]).toEqual(['PARTIALLY_PAID', 80_000]);
      const other = await ok(w.opA, 'post', '/finance/invoices', { issuedToName: 'Other', subtotal: 10 });
      await ok(w.opA, 'put', `/finance/invoices/${other.id}/issue`);
      expect((await call(w.opA, 'post', `/finance/invoices/${other.id}/payments`, body)).status).toBe(409);
    });

    it('parallel refunds never return more than was paid', async () => {
      const inv = await ok(w.opA, 'post', '/finance/invoices', { issuedToName: 'Refund race', subtotal: 250 });
      await ok(w.opA, 'put', `/finance/invoices/${inv.id}/issue`);
      const pay = await ok(w.opA, 'post', '/payments/intents', { invoiceId: inv.id });
      await ok(w.opA, 'post', `/payments/intents/${pay.id}/confirm`, {});
      const results = await Promise.all([1, 2, 3].map(() => call(w.financeA, 'post', `/payments/${pay.id}/refund`, { amount: 100 })));
      expect(results.filter((r) => r.status === 201)).toHaveLength(2);
      const p = await paymentRow(pay.id);
      expect([p.status, Number(p.refundedCents)]).toEqual(['PARTIALLY_REFUNDED', 20_000]);
      expect(Number((await invoiceRow(inv.id)).paidCents)).toBe(5_000);
      expect(await ctx.prisma.paymentTransaction.count({ where: { paymentId: pay.id, type: 'REFUNDED' } })).toBe(2);
    });
  });

  describe('operator booking money is server-owned', () => {
    it('deposit, invoice, payments and refunds keep the booking and its invoice in step', async () => {
      const pkg = await ok(w.opA, 'post', '/packages', { name: `Money ${uniq()}`, type: 'UMRAH', priceAdult: 1000 });
      expect((await call(w.opA, 'post', '/bookings', { packageId: pkg.id, paxAdult: 2, status: 'FULLY_PAID' })).status).toBe(400);
      const booking = await ok(w.opA, 'post', '/bookings', { packageId: pkg.id, paxAdult: 2, depositAmount: 500 });
      expect([booking.status, booking.totalAmountCents, booking.paidAmountCents]).toEqual(['PARTIALLY_PAID', 200_000, 50_000]);

      // Nobody types a paid amount or a paid status in.
      expect((await call(w.opA, 'put', `/bookings/${booking.id}/payment`, { paidAmount: 2000 })).status).toBe(400);
      expect((await call(w.opA, 'put', `/bookings/${booking.id}/status`, { status: 'FULLY_PAID' })).status).toBe(400);
      expect((await call(w.opA, 'put', `/bookings/${booking.id}/status`, { status: 'PAID' })).status).toBe(400);
      expect((await call(w.opA, 'put', `/bookings/${booking.id}/status`, { status: 'COMPLETED' })).status).toBe(400);
      expect((await call(w.opA, 'put', `/bookings/${booking.id}/status`, { status: 'CANCELLED' })).status).toBe(400);
      // Billing and cancelling are separate capabilities.
      expect((await call(w.staffA, 'post', `/bookings/${booking.id}/generate-invoice`)).status).toBe(403);
      expect((await call(w.staffA, 'post', `/bookings/${booking.id}/cancel`, {})).status).toBe(403);

      const inv = await ok(w.opA, 'post', `/bookings/${booking.id}/generate-invoice`);
      expect([inv.status, inv.totalCents, inv.paidCents]).toEqual(['DRAFT', 200_000, 50_000]);
      const carried = await ctx.prisma.payment.findMany({ where: { invoiceId: inv.id } });
      expect(carried.map((p) => [p.gateway, Number(p.amountCents), p.status])).toEqual([['booking_deposit', 50_000, 'COMPLETED']]);
      expect((await ok(w.opA, 'post', `/bookings/${booking.id}/generate-invoice`)).id).toBe(inv.id);

      const issued = await ok(w.opA, 'put', `/finance/invoices/${inv.id}/issue`);
      expect(issued.status).toBe('PARTIALLY_PAID');
      // The card attempt can only collect what is still open.
      expect((await call(w.opA, 'post', '/payments/intents', { invoiceId: inv.id, amount: 1500.01 })).status).toBe(400);
      const card = await ok(w.opA, 'post', '/payments/intents', { invoiceId: inv.id });
      expect(card.amountCents).toBe(150_000);
      await ok(w.opA, 'post', `/payments/intents/${card.id}/confirm`, {});
      let b = await ctx.prisma.booking.findUniqueOrThrow({ where: { id: booking.id } });
      expect([b.status, Number(b.paidAmountCents)]).toEqual(['FULLY_PAID', 200_000]);
      expect((await invoiceRow(inv.id)).status).toBe('PAID');

      await ok(w.financeA, 'post', `/payments/${card.id}/refund`, { amount: 300 });
      b = await ctx.prisma.booking.findUniqueOrThrow({ where: { id: booking.id } });
      expect([b.status, Number(b.paidAmountCents)]).toEqual(['PARTIALLY_PAID', 170_000]);
      const row = await invoiceRow(inv.id);
      expect([row.status, Number(row.paidCents)]).toEqual(['PARTIALLY_PAID', 170_000]);
    });

    it('lifecycle moves follow the booking workflow', async () => {
      const pkg = await ok(w.opA, 'post', '/packages', { name: `Flow ${uniq()}`, type: 'UMRAH', priceAdult: 10 });
      const b = await ok(w.opA, 'post', '/bookings', { packageId: pkg.id, departureDate: day(30), returnDate: day(40) });
      expect((await call(w.opA, 'put', `/bookings/${b.id}`, { returnDate: day(20) })).status).toBe(400);
      expect((await call(w.opA, 'post', '/bookings', { packageId: pkg.id, departureDate: day(30), returnDate: day(10) })).status).toBe(400);
      expect((await ok(w.opA, 'put', `/bookings/${b.id}/status`, { status: 'CONFIRMED' })).status).toBe('CONFIRMED');
      expect((await ok(w.opA, 'put', `/bookings/${b.id}/status`, { status: 'VISA_PROCESSING' })).status).toBe('VISA_PROCESSING');
      expect((await call(w.opA, 'put', `/bookings/${b.id}/status`, { status: 'DRAFT' })).status).toBe(400);
      expect((await ok(w.opA, 'post', `/bookings/${b.id}/cancel`, { reason: 'client withdrew' })).status).toBe('CANCELLED');
      expect((await call(w.opA, 'post', `/bookings/${b.id}/generate-invoice`)).status).toBe(400);
      expect((await call(w.opA, 'put', `/bookings/${b.id}/status`, { status: 'CONFIRMED' })).status).toBe(400);
    });
  });
});

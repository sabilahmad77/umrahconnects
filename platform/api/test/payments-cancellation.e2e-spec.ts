import { createHmac } from 'crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { api, createTestApp, TestContext } from './app';
import { Actor, bearer, buildWorld, World } from './fixtures';
import { PaymentsService } from '../src/modules/payments/payments.service';

/**
 * F1 — cancelling a booking or an invoice closes its open payment attempts, and a
 * capture that still arrives afterwards (webhook, read reconciliation, sandbox
 * completion) never revives or pays the cancelled record: the money is held,
 * uncounted, until it is refunded. Also F6 (provider configuration detail) and
 * F18 (empty webhook bodies).
 */

const uniq = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
const SECRET = 'test-sandbox-webhook-secret';
const sign = (raw: string) => `sha256=${createHmac('sha256', SECRET).update(raw).digest('hex')}`;
type Method = 'get' | 'post' | 'put' | 'delete';

describe('F1: cancellation closes open payment attempts; late captures are held for refund', () => {
  let ctx: TestContext;
  let w: World;
  let sandbox: any;

  const call = (a: Actor, method: Method, path: string, body?: Record<string, unknown>) => {
    const req = ctx.http()[method](api(path)).set(bearer(a));
    return body !== undefined ? req.send(body) : req;
  };
  const ok = async (a: Actor, method: Method, path: string, body?: Record<string, unknown>) => {
    const res = await call(a, method, path, body);
    if (res.status >= 300) throw new Error(`${a.email} ${method.toUpperCase()} ${path} → ${res.status} ${JSON.stringify(res.body)}`);
    return res.body?.data ?? res.body;
  };
  /** A signed sandbox provider event — the provider reporting a capture. */
  const captured = (providerRef: string, eventId = `evt_${uniq()}`) => {
    const raw = JSON.stringify({ id: eventId, type: 'payment.captured', data: { providerRef } });
    return ctx.http().post(api('/payments/webhook/sandbox')).set('Content-Type', 'application/json').set('x-signature', sign(raw)).send(raw);
  };
  const payment = (id: string) => ctx.prisma.payment.findUniqueOrThrow({ where: { id } });
  const listingBooking = (id: string) => ctx.prisma.listingBooking.findUniqueOrThrow({ where: { id } });
  const ledger = async (paymentId: string) =>
    (await ctx.prisma.paymentTransaction.findMany({ where: { paymentId }, orderBy: { createdAt: 'asc' } })).map((t) => [t.type, t.status]);

  /** A listing of opA (an operator: it can refund) booked by travelerA. */
  let listing: any;
  const book = async () => ok(w.travelerA, 'post', `/marketplace/listings/${listing.id}/bookings`, { partySize: 2, customerName: 'Guest' });
  const checkout = async (bookingId: string) => ok(w.travelerA, 'post', '/payments/checkout', { listingBookingId: bookingId });

  beforeAll(async () => {
    ctx = await createTestApp();
    w = await buildWorld(ctx);
    sandbox = (ctx.app.get(PaymentsService) as any).providers.get('sandbox');
    listing = await ok(w.opA, 'post', '/marketplace/listings', { title: `F1 room ${uniq()}`, category: 'hotel_room', priceFrom: 250, pricingModel: 'PER_PERSON' });
  });
  afterAll(async () => ctx?.close());

  describe('traveler cancellation', () => {
    let booking: any;
    let attempt: any;

    it('closes an old open checkout attempt at the provider and cancels the booking', async () => {
      booking = await book();
      const opened = await checkout(booking.id);
      expect(opened.status).toBe('PENDING');
      // The defect: an attempt older than a day no longer blocked the cancellation and stayed payable.
      await ctx.prisma.payment.update({ where: { id: opened.paymentId }, data: { createdAt: new Date(Date.now() - 3 * 86_400_000) } });

      const cancelledAtProvider: string[] = [];
      const cancel = sandbox.cancel.bind(sandbox);
      sandbox.cancel = async (ref: string) => {
        cancelledAtProvider.push(ref);
        return cancel(ref);
      };
      try {
        const res = await ok(w.travelerA, 'post', `/marketplace/bookings/${booking.id}/cancel`);
        expect([res.status, res.paymentStatus]).toEqual(['CANCELLED', 'UNPAID']);
      } finally {
        sandbox.cancel = cancel;
      }
      attempt = await payment(opened.paymentId);
      expect(cancelledAtProvider).toEqual([attempt.gatewayRef]);
      expect([attempt.status, attempt.gatewayStatus, attempt.failureReason]).toEqual(['FAILED', 'CANCELLED', 'booking cancelled by the customer']);
      expect(await ledger(attempt.id)).toEqual([['INTENT_CREATED', 'REQUIRES_CONFIRMATION'], ['CANCELLED', 'FAILED']]);
      const audit = await ctx.prisma.auditLog.findFirst({ where: { resource: 'payment', resourceId: attempt.id, action: 'PAYMENT_FAIL' } });
      expect(audit?.actorId).toBe(w.travelerA.id);
    });

    it('a capture forced through afterwards is held for a refund; the booking stays cancelled and unpaid', async () => {
      const eventId = `evt_${uniq()}`;
      const res = await captured(attempt.gatewayRef, eventId);
      expect(res.status).toBe(200);
      expect(res.body.data.result).toBe('held: captured after the booking was cancelled');

      const held = await payment(attempt.id);
      expect([held.status, held.gatewayStatus, held.failureReason]).toEqual([
        'DISPUTED', 'CAPTURED_AFTER_CANCEL', 'captured after the booking was cancelled; refund required',
      ]);
      expect(held.paidAt).not.toBeNull();
      const b = await listingBooking(booking.id);
      expect([b.status, b.paymentStatus]).toEqual(['CANCELLED', 'UNPAID']);
      expect(await ledger(attempt.id)).toEqual([
        ['INTENT_CREATED', 'REQUIRES_CONFIRMATION'], ['CANCELLED', 'FAILED'], ['WEBHOOK_RECEIVED', 'payment.captured'],
        ['CAPTURED', 'HELD'], ['REFUND_REQUIRED', 'REFUND_REQUIRED'],
      ]);
      const audit = await ctx.prisma.auditLog.findFirst({ where: { resource: 'payment', resourceId: attempt.id, action: 'UPDATE' } });
      expect(audit?.metadata).toMatchObject({ hold: 'CAPTURED_AFTER_CANCEL' });

      // Nothing is counted twice: a replay is a duplicate, a second capture event changes nothing.
      expect((await captured(attempt.gatewayRef, eventId)).body.data).toMatchObject({ duplicate: true });
      expect((await captured(attempt.gatewayRef)).body.data.result).toBe('ignored: payment is on hold');
      expect(await ctx.prisma.paymentTransaction.count({ where: { paymentId: attempt.id, type: 'CAPTURED' } })).toBe(1);
      expect((await listingBooking(booking.id)).paymentStatus).toBe('UNPAID');
      // No money counts as received for the booking.
      const counted = await ctx.prisma.payment.count({
        where: { listingBookingId: booking.id, status: { in: ['COMPLETED', 'PARTIALLY_REFUNDED'] } },
      });
      expect(counted).toBe(0);
    });

    it('the traveler cannot pay the cancelled booking again, nor complete the held payment', async () => {
      expect((await call(w.travelerA, 'post', '/payments/checkout', { listingBookingId: booking.id })).status).toBe(400);
      expect((await call(w.travelerA, 'post', `/payments/checkout/${attempt.id}/sandbox-complete`, {})).status).toBe(400);
      const view = await ok(w.travelerA, 'get', `/payments/checkout/${attempt.id}`);
      expect([view.status, view.providerStatus, view.bookingStatus, view.bookingPaymentStatus]).toEqual(['DISPUTED', 'CAPTURED_AFTER_CANCEL', 'CANCELLED', 'UNPAID']);
    });

    it('the provider refunds the held money; the booking is untouched by the refund', async () => {
      const refunded = await ok(w.opA, 'post', `/payments/${attempt.id}/refund`, { reason: 'booking was cancelled' });
      expect([refunded.status, refunded.refundedCents, refunded.gatewayStatus]).toEqual(['REFUNDED', 50_000, 'CAPTURED_AFTER_CANCEL']);
      const b = await listingBooking(booking.id);
      expect([b.status, b.paymentStatus]).toEqual(['CANCELLED', 'UNPAID']);
      expect((await call(w.opA, 'post', `/payments/${attempt.id}/refund`, {})).status).toBe(400);
    });

    it('a capture reported on read (reconciliation) of a never-closed attempt is held too', async () => {
      // A booking cancelled before this fix could still carry an open attempt.
      const b = await book();
      const opened = await checkout(b.id);
      await ctx.prisma.listingBooking.update({ where: { id: b.id }, data: { status: 'CANCELLED' } });
      sandbox.retrieve = async (providerRef: string) => ({ providerRef, status: 'CAPTURED', providerStatus: 'succeeded', raw: {} });
      try {
        const view = await ok(w.travelerA, 'get', `/payments/checkout/${opened.paymentId}`);
        expect([view.status, view.providerStatus, view.bookingStatus, view.bookingPaymentStatus]).toEqual(['DISPUTED', 'CAPTURED_AFTER_CANCEL', 'CANCELLED', 'UNPAID']);
      } finally {
        delete sandbox.retrieve;
      }
    });

    it('a sandbox completion of a never-closed attempt on a cancelled booking is held too', async () => {
      const b = await book();
      const opened = await checkout(b.id);
      await ctx.prisma.listingBooking.update({ where: { id: b.id }, data: { status: 'CANCELLED' } });
      const done = await ok(w.travelerA, 'post', `/payments/checkout/${opened.paymentId}/sandbox-complete`, {});
      expect([done.status, done.providerStatus, done.bookingStatus, done.bookingPaymentStatus]).toEqual(['DISPUTED', 'CAPTURED_AFTER_CANCEL', 'CANCELLED', 'UNPAID']);
    });

    it('a recent attempt no longer blocks the cancellation: it is closed like any other', async () => {
      const b = await book();
      const opened = await checkout(b.id);
      expect((await ok(w.travelerA, 'post', `/marketplace/bookings/${b.id}/cancel`)).status).toBe('CANCELLED');
      expect((await payment(opened.paymentId)).status).toBe('FAILED');
    });

    it('an attempt the provider can no longer cancel (just paid) stops the cancellation; the payment is recorded', async () => {
      const b = await book();
      const opened = await checkout(b.id);
      const cancel = sandbox.cancel;
      sandbox.cancel = async (providerRef: string) => ({
        cancelled: false,
        state: { providerRef, status: 'CAPTURED', providerStatus: 'succeeded', raw: {} },
      });
      try {
        const res = await call(w.travelerA, 'post', `/marketplace/bookings/${b.id}/cancel`);
        expect(res.status).toBe(409);
        expect(res.body.error.message).toMatch(/being processed or has just been completed/);
      } finally {
        sandbox.cancel = cancel;
      }
      const row = await listingBooking(b.id);
      expect([row.status, row.paymentStatus]).toEqual(['CONFIRMED', 'PAID']);
      expect((await payment(opened.paymentId)).status).toBe('COMPLETED');
    });

    it('a booking with held money cannot be cancelled by the traveler (the provider settles it)', async () => {
      const b = await book();
      await ctx.prisma.payment.create({
        data: {
          tenantId: w.tenants.opA, listingBookingId: b.id, amountCents: 50_000n, currency: 'SAR', gateway: 'sandbox',
          idempotencyKey: `held_${uniq()}`, status: 'DISPUTED', gatewayStatus: 'AMOUNT_MISMATCH', paidAt: new Date(),
        },
      });
      const res = await call(w.travelerA, 'post', `/marketplace/bookings/${b.id}/cancel`);
      expect([res.status, res.body.error.message]).toEqual([409, 'A payment is recorded for this booking. Contact the provider to cancel and arrange a refund.']);
      expect((await listingBooking(b.id)).status).toBe('PENDING');
    });
  });

  describe('provider cancellation of a marketplace booking', () => {
    it('closes the open attempt; a late capture is held and the booking is not revived', async () => {
      const b = await book();
      const opened = await checkout(b.id);
      expect((await ok(w.opA, 'put', `/marketplace/bookings/${b.id}`, { status: 'CANCELLED' })).status).toBe('CANCELLED');
      const attempt = await payment(opened.paymentId);
      expect([attempt.status, attempt.failureReason]).toEqual(['FAILED', 'booking cancelled by the provider']);
      expect((await captured(attempt.gatewayRef!)).body.data.result).toBe('held: captured after the booking was cancelled');
      expect(await listingBooking(b.id)).toMatchObject({ status: 'CANCELLED', paymentStatus: 'UNPAID' });
      // The provider cannot move the cancelled booking anywhere either.
      expect((await call(w.opA, 'put', `/marketplace/bookings/${b.id}`, { status: 'CONFIRMED' })).status).toBe(400);
    });
  });

  describe('operator booking and invoice cancellation', () => {
    const operatorBookingWithInvoice = async () => {
      const pkg = await ok(w.opA, 'post', '/packages', { name: `F1 pkg ${uniq()}`, type: 'UMRAH', priceAdult: 1000 });
      const booking = await ok(w.opA, 'post', '/bookings', { packageId: pkg.id, paxAdult: 1 });
      const inv = await ok(w.opA, 'post', `/bookings/${booking.id}/generate-invoice`);
      await ok(w.opA, 'put', `/finance/invoices/${inv.id}/issue`);
      const card = await ok(w.opA, 'post', '/payments/intents', { invoiceId: inv.id });
      return { booking, inv, card };
    };

    it('cancelling an operator booking closes the card attempt on its invoice; a late capture is held', async () => {
      const { booking, inv, card } = await operatorBookingWithInvoice();
      expect((await ok(w.opA, 'post', `/bookings/${booking.id}/cancel`, { reason: 'client withdrew' })).status).toBe('CANCELLED');
      const attempt = await payment(card.id);
      expect([attempt.status, attempt.failureReason]).toEqual(['FAILED', 'booking cancelled']);
      expect((await call(w.opA, 'post', '/payments/intents', { invoiceId: inv.id })).status).toBe(400);

      expect((await captured(attempt.gatewayRef!)).body.data.result).toBe('held: captured after the booking was cancelled');
      const b = await ctx.prisma.booking.findUniqueOrThrow({ where: { id: booking.id } });
      expect([b.status, Number(b.paidAmountCents)]).toEqual(['CANCELLED', 0]);
      const i = await ctx.prisma.invoice.findUniqueOrThrow({ where: { id: inv.id } });
      expect([i.status, Number(i.paidCents)]).toEqual(['ISSUED', 0]);
    });

    it('voiding an invoice closes its card attempt; a late capture is held and the invoice stays void and unpaid', async () => {
      const inv = await ok(w.opA, 'post', '/finance/invoices', { issuedToName: `F1 void ${uniq()}`, subtotal: 300 });
      await ok(w.opA, 'put', `/finance/invoices/${inv.id}/issue`);
      const card = await ok(w.opA, 'post', '/payments/intents', { invoiceId: inv.id });
      expect((await ok(w.opA, 'put', `/finance/invoices/${inv.id}/void`)).status).toBe('VOID');
      const attempt = await payment(card.id);
      expect([attempt.status, attempt.failureReason]).toEqual(['FAILED', 'invoice voided']);
      expect((await captured(attempt.gatewayRef!)).body.data.result).toBe('held: captured after the invoice was voided');
      const i = await ctx.prisma.invoice.findUniqueOrThrow({ where: { id: inv.id } });
      expect([i.status, Number(i.paidCents)]).toEqual(['VOID', 0]);
      // Finance refunds the held money through the provider.
      expect((await ok(w.financeA, 'post', `/payments/${card.id}/refund`, {})).status).toBe('REFUNDED');
      expect(Number((await ctx.prisma.invoice.findUniqueOrThrow({ where: { id: inv.id } })).paidCents)).toBe(0);
    });
  });
});

describe('F6 / F18: provider configuration detail and webhook bodies', () => {
  let ctx: TestContext;
  let w: World;
  beforeAll(async () => {
    ctx = await createTestApp();
    w = await buildWorld(ctx);
  });
  afterAll(async () => ctx?.close());

  const providers = async (a: Actor) => {
    const res = await ctx.http().get(api('/payments/providers')).set(bearer(a));
    expect(res.status).toBe(200);
    return res.body.data;
  };

  it('only payment administrators see which settings are missing; everyone sees configured or not', async () => {
    for (const a of [w.travelerA, w.staffA, w.hotelA, w.visaA]) {
      const data = await providers(a);
      const stripe = data.providers.find((p: any) => p.name === 'stripe');
      expect(stripe.configured, a.email).toBe(false);
      expect(stripe, a.email).not.toHaveProperty('missing');
      expect(JSON.stringify(data), a.email).not.toMatch(/STRIPE_/);
    }
    for (const a of [w.financeA, w.opA, w.superAdmin]) {
      const stripe = (await providers(a)).providers.find((p: any) => p.name === 'stripe');
      expect(stripe.missing, a.email).toEqual(expect.arrayContaining(['STRIPE_SECRET_KEY']));
    }
  });

  it('an unconfigured provider never names its missing settings in an error', async () => {
    // A Stripe payment on a deployment where Stripe is not configured: its refund reaches the provider check.
    const pay = await ctx.prisma.payment.create({
      data: {
        tenantId: w.tenants.opA, amountCents: 1_000n, currency: 'SAR', gateway: 'stripe', gatewayRef: `pi_${uniq()}`,
        idempotencyKey: `f6_${uniq()}`, status: 'COMPLETED', paidAt: new Date(),
      },
    });
    const res = await ctx.http().post(api(`/payments/${pay.id}/refund`)).set(bearer(w.opA)).send({});
    expect(res.status).toBe(503);
    expect(res.body.error.message).toBe('Payment provider "stripe" is not configured on this deployment');
    expect(JSON.stringify(res.body)).not.toMatch(/STRIPE_|Missing/);
  });

  it('an empty webhook body is refused with 400 for every provider, never 200', async () => {
    for (const provider of ['sandbox', 'stripe', 'nope']) {
      const variants = [
        ctx.http().post(api(`/payments/webhook/${provider}`)),
        ctx.http().post(api(`/payments/webhook/${provider}`)).set('Content-Type', 'application/json').send(''),
        ctx.http().post(api(`/payments/webhook/${provider}`)).set('Content-Type', 'application/json').set('x-signature', 'sha256=00').send(''),
        ctx.http().post(api(`/payments/webhook/${provider}`)).set('Content-Type', 'text/plain').send(''),
      ];
      for (const req of variants) {
        const res = await req;
        expect(res.status, `${provider} ${JSON.stringify(res.body)}`).toBe(400);
        expect(res.body.success).toBe(false);
      }
    }
  });
});

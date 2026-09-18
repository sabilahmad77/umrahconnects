import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

// The whole Stripe code path of the API — PaymentsService → StripeProvider →
// official SDK — against stripe/stripe-mock (Stripe's OpenAPI-driven mock).
// stripe-mock — NOT Stripe: it validates every request against Stripe's API
// specification and answers with fixtures, so it proves request shapes,
// idempotency headers and response mapping, not real payment behaviour.
// Skipped unless STRIPE_MOCK_URL is set (see docs/control-tower/LOCAL_TEST_GUIDE.md).
vi.hoisted(() => {
  if (process.env.STRIPE_MOCK_URL) {
    process.env.PAYMENT_PROVIDER = 'stripe';
    process.env.STRIPE_SECRET_KEY = 'sk_test_123';
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_stripe_mock';
    process.env.STRIPE_PUBLISHABLE_KEY = 'pk_test_stripe_mock';
  }
});

import Stripe from 'stripe';
import { api, createTestApp, TestContext } from './app';
import { Actor, bearer, buildWorld, World } from './fixtures';
import { PaymentsService } from '../src/modules/payments/payments.service';

const mockUrl = process.env.STRIPE_MOCK_URL;
const uniq = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
type Method = 'get' | 'post' | 'put';

describe.skipIf(!mockUrl)('payments over the Stripe code path (stripe-mock — not Stripe)', () => {
  let ctx: TestContext;
  let w: World;
  const requests: { method: string; path: string; idempotencyKey?: string }[] = [];

  const call = (a: Actor, method: Method, path: string, body?: Record<string, unknown>) => {
    const req = ctx.http()[method](api(path)).set(bearer(a));
    return body !== undefined ? req.send(body) : req;
  };
  const ok = async (a: Actor, method: Method, path: string, body?: Record<string, unknown>) => {
    const res = await call(a, method, path, body);
    if (res.status >= 300) throw new Error(`${a.email} ${method} ${path} → ${res.status} ${JSON.stringify(res.body)}`);
    return res.body?.data ?? res.body;
  };

  beforeAll(async () => {
    ctx = await createTestApp();
    w = await buildWorld(ctx);
    const u = new URL(mockUrl!);
    const client = new Stripe('sk_test_123', {
      host: u.hostname,
      port: Number(u.port),
      protocol: u.protocol.replace(':', '') as 'http' | 'https',
      maxNetworkRetries: 0,
    });
    client.on('request', (e: any) => requests.push({ method: e.method, path: e.path, idempotencyKey: e.idempotency_key }));
    // Point the service's Stripe provider at stripe-mock (test-only wiring).
    (ctx.app.get(PaymentsService).stripe as any).client = client;
  });
  afterAll(async () => ctx?.close());

  it('reports Stripe as the active, configured provider with its publishable key', async () => {
    const status = await ok(w.travelerA, 'get', '/payments/providers');
    expect(status.active).toBe('stripe');
    expect(status.providers.find((p: any) => p.name === 'stripe')).toMatchObject({
      configured: true, publishableKey: 'pk_test_stripe_mock', testMode: true,
    });
    expect(status.providers.map((p: any) => p.name)).toContain('stripe');
  });

  it('staff invoice payment: intent with the server amount, resume, cancel', async () => {
    const inv = await ok(w.opA, 'post', '/finance/invoices', { issuedToName: `Mock ${uniq()}`, subtotal: 123.45 });
    await ok(w.opA, 'put', `/finance/invoices/${inv.id}/issue`);
    const intent = await ok(w.opA, 'post', '/payments/intents', { invoiceId: inv.id });
    expect([intent.gateway, intent.amountCents, intent.status]).toEqual(['stripe', 12_345, 'PENDING']);
    expect(intent.gatewayRef).toMatch(/^pi_/);
    expect(intent.clientSecret).toMatch(/_secret_/);
    expect(intent).not.toHaveProperty('gatewayResponse');
    const create = requests.find((r) => r.method === 'POST' && r.path === '/v1/payment_intents');
    expect(create?.idempotencyKey).toBe(`pi:${intent.idempotencyKey}`);
    const row = await ctx.prisma.payment.findUniqueOrThrow({ where: { id: intent.id } });
    expect(JSON.stringify(row.gatewayResponse)).not.toContain('secret');

    const resumed = await ok(w.opA, 'post', `/payments/intents/${intent.id}/resume`, {});
    expect([resumed.id, resumed.status]).toEqual([intent.id, 'PENDING']);
    expect(resumed.clientSecret).toMatch(/_secret_/);
    const read = await ok(w.opA, 'get', `/payments/${intent.id}`);
    expect(read).not.toHaveProperty('clientSecret');

    const cancelled = await ok(w.opA, 'post', `/payments/intents/${intent.id}/cancel`, {});
    expect(cancelled.status).toBe('FAILED');
    const cancel = requests.find((r) => r.path === `/v1/payment_intents/${intent.gatewayRef}/cancel`);
    expect(cancel?.idempotencyKey).toBe(`cancel:${intent.gatewayRef}`);
  });

  it('traveler checkout: customer, PaymentIntent and client secret; re-entry resumes it', async () => {
    const listing = await ok(w.hotelA, 'post', '/marketplace/listings', { title: `Mock room ${uniq()}`, category: 'hotel_room', priceFrom: 99.5 });
    const booking = await ok(w.travelerA, 'post', `/marketplace/listings/${listing.id}/bookings`, { partySize: 2 });
    const c1 = await ok(w.travelerA, 'post', '/payments/checkout', { listingBookingId: booking.id });
    expect([c1.provider, c1.amountCents, c1.currency, c1.status, c1.resumed]).toEqual(['stripe', 19_900, 'SAR', 'PENDING', false]);
    expect(c1.clientSecret).toMatch(/_secret_/);
    expect(c1.publishableKey).toBe('pk_test_stripe_mock');
    expect(requests.some((r) => r.path === '/v1/customers')).toBe(true);

    const c2 = await ok(w.travelerA, 'post', '/payments/checkout', { listingBookingId: booking.id });
    expect([c2.paymentId, c2.resumed]).toEqual([c1.paymentId, true]);
    expect(c2.clientSecret).toMatch(/_secret_/);
    const status = await ok(w.travelerA, 'get', `/payments/checkout/${c1.paymentId}`);
    expect(status).not.toHaveProperty('clientSecret');
    expect([status.status, status.bookingPaymentStatus]).toEqual(['PENDING', 'UNPAID']);
    // The sandbox completion route never applies to a Stripe checkout.
    expect((await call(w.travelerA, 'post', `/payments/checkout/${c1.paymentId}/sandbox-complete`, {})).status).toBe(400);
  });

  it('a provider rejection is a 503 for the caller, and nothing is stored', async () => {
    const service = ctx.app.get(PaymentsService);
    const good = (service.stripe as any).client;
    const u = new URL(mockUrl!);
    // stripe-mock refuses this key the way Stripe refuses a revoked one.
    (service.stripe as any).client = new Stripe('sk_test_revoked_key', {
      host: u.hostname, port: Number(u.port), protocol: u.protocol.replace(':', '') as 'http' | 'https', maxNetworkRetries: 0,
    });
    try {
      const inv = await ok(w.opA, 'post', '/finance/invoices', { issuedToName: `Down ${uniq()}`, subtotal: 10 });
      await ok(w.opA, 'put', `/finance/invoices/${inv.id}/issue`);
      const res = await call(w.opA, 'post', '/payments/intents', { invoiceId: inv.id });
      expect(res.status).toBe(503);
      expect(res.body.error.message).toBe('The payment provider could not be reached. Try again.');
      expect(await ctx.prisma.payment.count({ where: { invoiceId: inv.id } })).toBe(0);
    } finally {
      (service.stripe as any).client = good;
    }
  });

  it('refunds go through the SDK with an idempotency key', async () => {
    const inv = await ok(w.opA, 'post', '/finance/invoices', { issuedToName: `Refund ${uniq()}`, subtotal: 50 });
    await ok(w.opA, 'put', `/finance/invoices/${inv.id}/issue`);
    const payment = await ctx.prisma.payment.create({
      data: {
        tenantId: w.tenants.opA, invoiceId: inv.id, amountCents: BigInt(5_000), currency: 'SAR', gateway: 'stripe',
        gatewayRef: `pi_${uniq()}`, idempotencyKey: `mock-${uniq()}`, status: 'COMPLETED', paidAt: new Date(),
      },
    });
    await ctx.prisma.invoice.update({ where: { id: inv.id }, data: { paidCents: BigInt(5_000), status: 'PAID' } });
    const refunded = await ok(w.financeA, 'post', `/payments/${payment.id}/refund`, { amount: 20, reason: 'mock' });
    expect(refunded.refundedCents).toBeGreaterThan(0);
    const refund = requests.find((r) => r.path === '/v1/refunds');
    expect(refund?.idempotencyKey).toBe(`refund:${payment.id}:0:2000`);
  });
});

import { describe, expect, it } from 'vitest';
import Stripe from 'stripe';
import { StripeProvider } from '../../src/modules/payments/providers/stripe.provider';

const url = process.env.STRIPE_MOCK_URL; // e.g. http://127.0.0.1:12111

describe.skipIf(!url)('StripeProvider against stripe-mock (official Stripe API mock)', () => {
  const u = new URL(url ?? 'http://127.0.0.1:12111');
  const client = new Stripe('sk_test_mock', { host: u.hostname, port: Number(u.port), protocol: u.protocol.replace(':', '') as 'http' | 'https' });
  const provider = new StripeProvider({ secretKey: 'sk_test_mock', webhookSecret: 'whsec_mock', publishableKey: 'pk_test_mock' }, client);

  it('creates a PaymentIntent with the server amount/currency and returns a client secret', async () => {
    const intent = await provider.createIntent({
      amountCents: BigInt(125_00), currency: 'SAR', reference: `ref_${Date.now()}`,
      metadata: { invoiceId: 'inv_1', description: 'Umrah Connect payment' },
    });
    expect(intent.providerRef).toMatch(/^pi_/);
    expect(intent.clientSecret).toBeTruthy();
    expect(['REQUIRES_CONFIRMATION', 'AUTHORIZED', 'CAPTURED', 'FAILED']).toContain(intent.status);
    expect(intent.raw).not.toHaveProperty('client_secret');
  });

  it('reconciles an intent server-side (retrieve / capture) and maps the status', async () => {
    const res = await provider.confirm('pi_123');
    expect(['CAPTURED', 'PENDING', 'FAILED']).toContain(res.status);
    expect(res.providerRef).toMatch(/^pi_/);
  });

  it('creates refunds, customers and cancels intents through the SDK', async () => {
    const refund = await provider.refund('pi_123', BigInt(500), `refund_${Date.now()}`);
    expect(refund.providerRef).toMatch(/^re_/);
    expect(typeof refund.refundedCents).toBe('bigint');
    const customer = await provider.ensureCustomer({ email: 'traveler@example.com', name: 'Traveler', reference: `user_${Date.now()}` });
    expect(customer).toMatch(/^cus_/);
    await expect(provider.cancel('pi_123')).resolves.toBeUndefined();
  });

  it('reports configuration and test mode honestly', () => {
    expect(provider.isConfigured()).toBe(true);
    expect(provider.testMode).toBe(true);
    expect(new StripeProvider({}).missingConfig()).toEqual(['STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET']);
  });
});

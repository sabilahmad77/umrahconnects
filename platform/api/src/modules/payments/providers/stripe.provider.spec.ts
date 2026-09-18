import Stripe from 'stripe';
import { describe, expect, it, vi } from 'vitest';
import { StripeProvider } from './stripe.provider';

const SECRET = 'whsec_test_red_team_secret';
const now = () => Math.floor(Date.now() / 1000);

const event = (type: string, object: Record<string, unknown>, id = 'evt_test_1') =>
  JSON.stringify({ id, object: 'event', type, livemode: false, created: now(), api_version: '2024-06-20', data: { object } });

const header = (payload: string, secret = SECRET, timestamp?: number) =>
  Stripe.webhooks.generateTestHeaderString({ payload, secret, ...(timestamp ? { timestamp } : {}) });

const provider = (client?: unknown) =>
  new StripeProvider({ secretKey: 'sk_test_123', webhookSecret: SECRET, publishableKey: 'pk_test_123' }, client as Stripe);

describe('StripeProvider.verifyWebhook (no network)', () => {
  const succeeded = event('payment_intent.succeeded', {
    id: 'pi_123', object: 'payment_intent', amount_received: 12_345, currency: 'sar', status: 'succeeded',
  });

  it('accepts a valid signature and normalises payment_intent.succeeded', () => {
    const v = provider().verifyWebhook(succeeded, header(succeeded));
    expect(v.valid).toBe(true);
    expect(v).toMatchObject({
      eventId: 'evt_test_1', type: 'payment.captured', providerRef: 'pi_123', amountCents: 12_345n, currency: 'SAR', livemode: false,
    });
    // Only a summary of the event is kept.
    expect(v.raw).toEqual({ id: 'evt_test_1', type: 'payment_intent.succeeded', livemode: false, created: expect.any(Number), object: { id: 'pi_123', status: 'succeeded' } });
  });

  it('normalises failure, refund and dispute events', () => {
    // A declined attempt is not terminal: the same PaymentIntent can still be paid.
    const failed = event('payment_intent.payment_failed', { id: 'pi_9', metadata: { reference: 'ref_9' }, last_payment_error: { code: 'card_declined', decline_code: 'insufficient_funds' } }, 'evt_f');
    expect(provider().verifyWebhook(failed, header(failed))).toMatchObject({ valid: true, type: 'payment.attempt_failed', providerRef: 'pi_9', failureReason: 'insufficient_funds', reference: 'ref_9' });
    const canceled = event('payment_intent.canceled', { id: 'pi_9', cancellation_reason: 'abandoned' }, 'evt_c');
    expect(provider().verifyWebhook(canceled, header(canceled))).toMatchObject({ valid: true, type: 'payment.failed', providerRef: 'pi_9', failureReason: 'abandoned' });
    const processing = event('payment_intent.processing', { id: 'pi_9' }, 'evt_p');
    expect(provider().verifyWebhook(processing, header(processing))).toMatchObject({ valid: true, type: 'payment.processing', providerRef: 'pi_9' });
    const refunded = event('charge.refunded', { id: 'ch_1', payment_intent: 'pi_9', amount_refunded: 500, amount_captured: 12_345, captured: true, currency: 'sar' }, 'evt_r');
    expect(provider().verifyWebhook(refunded, header(refunded))).toMatchObject({ valid: true, type: 'payment.refunded', providerRef: 'pi_9', amountCents: 500n, capturedCents: 12_345n, currency: 'SAR' });
    const released = event('charge.refunded', { id: 'ch_2', payment_intent: { id: 'pi_8' }, amount_refunded: 900, captured: false, currency: 'sar' }, 'evt_r2');
    expect(provider().verifyWebhook(released, header(released))).toMatchObject({ type: 'payment.refunded', providerRef: 'pi_8', capturedCents: undefined });
    const closed = event('charge.dispute.closed', { id: 'dp_1', payment_intent: 'pi_9', status: 'won' }, 'evt_dc');
    expect(provider().verifyWebhook(closed, header(closed))).toMatchObject({ valid: true, type: 'payment.dispute_closed', providerRef: 'pi_9', disputeStatus: 'won' });
    const disputed = event('charge.dispute.created', { id: 'dp_1', payment_intent: 'pi_9' }, 'evt_d');
    expect(provider().verifyWebhook(disputed, header(disputed))).toMatchObject({ valid: true, type: 'payment.disputed', providerRef: 'pi_9' });
    const other = event('customer.created', { id: 'cus_1' }, 'evt_o');
    expect(provider().verifyWebhook(other, header(other))).toMatchObject({ valid: true, type: 'stripe.customer.created', providerRef: undefined });
  });

  it('rejects a tampered payload', () => {
    const sig = header(succeeded);
    const tampered = succeeded.replace('12345', '99999999');
    expect(tampered).not.toBe(succeeded);
    const v = provider().verifyWebhook(tampered, sig);
    expect(v.valid).toBe(false);
    expect(v.providerRef).toBeUndefined();
    expect(v.amountCents).toBeUndefined();
  });

  it('rejects a signature made with another secret', () => {
    expect(provider().verifyWebhook(succeeded, header(succeeded, 'whsec_attacker')).valid).toBe(false);
  });

  it('rejects a stale timestamp (> 300 s) even with a correct signature', () => {
    expect(provider().verifyWebhook(succeeded, header(succeeded, SECRET, now() - 301)).valid).toBe(false);
    expect(provider().verifyWebhook(succeeded, header(succeeded, SECRET, now() - 200)).valid).toBe(true);
  });

  it('rejects a missing or garbage header, and refuses to verify without a secret', () => {
    expect(provider().verifyWebhook(succeeded, undefined)).toMatchObject({ valid: false, reason: 'missing signature header' });
    expect(provider().verifyWebhook(succeeded, '').valid).toBe(false);
    expect(provider().verifyWebhook(succeeded, 't=1,v1=abc').valid).toBe(false);
    const unconfigured = new StripeProvider({ secretKey: 'sk_test_123' });
    expect(unconfigured.isConfigured()).toBe(false);
    expect(unconfigured.missingConfig()).toEqual(['STRIPE_WEBHOOK_SECRET']);
    expect(unconfigured.verifyWebhook(succeeded, header(succeeded)).valid).toBe(false);
  });
});

describe('StripeProvider with a mocked client (no network)', () => {
  const intent = (status: string, extra: Record<string, unknown> = {}) => ({
    id: 'pi_mock', status, amount: 25_000, amount_received: status === 'succeeded' ? 25_000 : 0, currency: 'sar',
    livemode: false, client_secret: 'pi_mock_secret', last_payment_error: null, cancellation_reason: null, ...extra,
  });
  const mockClient = (retrieveStatus = 'succeeded', extra: Record<string, unknown> = {}) => ({
    paymentIntents: {
      create: vi.fn(async () => intent('requires_payment_method')),
      retrieve: vi.fn(async () => intent(retrieveStatus, extra)),
      capture: vi.fn(async () => intent('succeeded')),
      cancel: vi.fn(async () => intent('canceled')),
    },
    refunds: { create: vi.fn(async () => ({ id: 're_1', status: 'succeeded', amount: 700, currency: 'sar' })) },
  });

  it('createIntent sends the server amount, currency and an idempotency key', async () => {
    const client = mockClient();
    const res = await provider(client).createIntent({
      amountCents: 25_000n, currency: 'SAR', reference: 'intent_abc',
      metadata: { tenantId: 't1', stripeCustomerId: 'cus_1', description: 'Room', invoiceId: undefined },
    });
    expect(client.paymentIntents.create).toHaveBeenCalledTimes(1);
    const [params, opts] = client.paymentIntents.create.mock.calls[0] as unknown as [any, any];
    expect(params).toMatchObject({ amount: 25_000, currency: 'sar', customer: 'cus_1', description: 'Room' });
    expect(params.metadata).toEqual({ reference: 'intent_abc', tenantId: 't1' });
    expect(opts).toEqual({ idempotencyKey: 'pi:intent_abc' });
    expect(res).toMatchObject({ providerRef: 'pi_mock', status: 'REQUIRES_CONFIRMATION', clientSecret: 'pi_mock_secret' });
  });

  it('confirm maps succeeded → CAPTURED with the received amount', async () => {
    const client = mockClient('succeeded');
    const res = await provider(client).confirm('pi_mock');
    expect(res).toMatchObject({ status: 'CAPTURED', amountCents: 25_000n, currency: 'SAR', providerRef: 'pi_mock' });
    expect(client.paymentIntents.capture).not.toHaveBeenCalled();
  });

  it('confirm maps processing → PROCESSING, an unpaid intent → PENDING and canceled → FAILED', async () => {
    expect((await provider(mockClient('processing')).confirm('pi_mock')).status).toBe('PROCESSING');
    const open = await provider(mockClient('requires_payment_method')).confirm('pi_mock');
    expect(open).toMatchObject({ status: 'PENDING', providerStatus: 'requires_payment_method', clientSecret: 'pi_mock_secret' });
    expect(open.lastError).toBeUndefined();
    expect(open.raw).not.toHaveProperty('client_secret');
    const canceled = await provider(mockClient('canceled', { cancellation_reason: 'abandoned' })).confirm('pi_mock');
    expect(canceled).toMatchObject({ status: 'FAILED', failureReason: 'abandoned' });
    expect(canceled.amountCents).toBeUndefined();
  });

  it('confirm captures a requires_capture intent with an idempotency key', async () => {
    const client = mockClient('requires_capture');
    const res = await provider(client).confirm('pi_mock');
    expect(client.paymentIntents.capture).toHaveBeenCalledWith('pi_mock', {}, { idempotencyKey: 'capture:pi_mock' });
    expect(res).toMatchObject({ status: 'CAPTURED', amountCents: 25_000n });
  });

  it('refund and cancel carry idempotency keys; a failed refund throws', async () => {
    const client = mockClient();
    const p = provider(client);
    const r = await p.refund('pi_mock', 700n, 'pay1:0:700');
    expect(client.refunds.create).toHaveBeenCalledWith({ payment_intent: 'pi_mock', amount: 700 }, { idempotencyKey: 'refund:pay1:0:700' });
    expect(r).toMatchObject({ providerRef: 're_1', refundedCents: 700n });
    await p.cancel('pi_mock');
    expect(client.paymentIntents.cancel).toHaveBeenCalledWith('pi_mock', {}, { idempotencyKey: 'cancel:pi_mock' });

    client.refunds.create.mockResolvedValueOnce({ id: 're_2', status: 'failed', amount: 700, currency: 'sar' });
    await expect(p.refund('pi_mock', 700n)).rejects.toThrow(/failed/);
  });

  it('a declined attempt stays payable and reports its decline code', async () => {
    const declined = await provider(
      mockClient('requires_payment_method', { last_payment_error: { code: 'card_declined', decline_code: 'generic_decline' } }),
    ).retrieve('pi_mock');
    expect(declined).toMatchObject({ status: 'PENDING', lastError: 'generic_decline', clientSecret: 'pi_mock_secret' });
    const auth = await provider(mockClient('requires_action')).retrieve('pi_mock');
    expect(auth).toMatchObject({ status: 'PENDING', providerStatus: 'requires_action' });
  });

  it('retrieve never captures; confirm captures only a requires_capture intent', async () => {
    const client = mockClient('requires_capture');
    expect((await provider(client).retrieve('pi_mock')).status).toBe('PROCESSING');
    expect(client.paymentIntents.capture).not.toHaveBeenCalled();
  });

  it('cancel reports a refusal with the current state instead of pretending', async () => {
    const client = mockClient('succeeded');
    client.paymentIntents.cancel.mockRejectedValueOnce(new Error('payment_intent_unexpected_state'));
    const res = await provider(client).cancel('pi_mock');
    expect(res.cancelled).toBe(false);
    expect(res.state).toMatchObject({ status: 'CAPTURED', amountCents: 25_000n });

    const gone = mockClient('canceled');
    gone.paymentIntents.cancel.mockRejectedValueOnce(new Error('already canceled'));
    expect((await provider(gone).cancel('pi_mock')).cancelled).toBe(true);

    const offline = mockClient();
    offline.paymentIntents.cancel.mockRejectedValueOnce(new Error('network down'));
    offline.paymentIntents.retrieve.mockRejectedValueOnce(new Error('network down'));
    await expect(provider(offline).cancel('pi_mock')).rejects.toThrow(/network down/);
  });

  it('status mapping helper', () => {
    expect(StripeProvider.mapIntentStatus('succeeded')).toBe('CAPTURED');
    expect(StripeProvider.mapIntentStatus('requires_capture')).toBe('AUTHORIZED');
    expect(StripeProvider.mapIntentStatus('canceled')).toBe('FAILED');
    expect(StripeProvider.mapIntentStatus('processing')).toBe('REQUIRES_CONFIRMATION');
  });
});

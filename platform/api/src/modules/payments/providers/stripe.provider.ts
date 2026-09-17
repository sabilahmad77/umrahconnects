import Stripe from 'stripe';
import {
  PaymentProvider, CreateIntentInput, IntentResult, CaptureResult, RefundResult, WebhookVerification,
} from './payment-provider';

/**
 * Stripe adapter (official SDK, PaymentIntents).
 *
 * - The amount always comes from the server (invoice / booking balance).
 * - The browser confirms the PaymentIntent with Stripe.js using `clientSecret`;
 *   the API never marks a payment paid because the browser says so. Truth comes
 *   from `payment_intent.succeeded` webhooks (signature-verified) or from a
 *   server-side retrieve of the PaymentIntent.
 * - Every mutating call carries an idempotency key.
 */
export class StripeProvider implements PaymentProvider {
  readonly name = 'stripe';
  private client?: Stripe;

  constructor(
    private readonly cfg: { secretKey?: string; webhookSecret?: string; publishableKey?: string },
    client?: Stripe,
  ) {
    this.client = client;
  }

  isConfigured() {
    return this.missingConfig().length === 0;
  }

  missingConfig(): string[] {
    const missing: string[] = [];
    if (!this.cfg.secretKey) missing.push('STRIPE_SECRET_KEY');
    if (!this.cfg.webhookSecret) missing.push('STRIPE_WEBHOOK_SECRET');
    return missing;
  }

  get publishableKey() {
    return this.cfg.publishableKey;
  }

  get testMode() {
    return (this.cfg.secretKey ?? '').startsWith('sk_test_');
  }

  private stripe(): Stripe {
    if (!this.client) {
      if (!this.cfg.secretKey) throw new Error('STRIPE_SECRET_KEY is not configured');
      this.client = new Stripe(this.cfg.secretKey, {
        maxNetworkRetries: 2,
        timeout: 20_000,
        appInfo: { name: 'Umrah Connect API' },
      });
    }
    return this.client;
  }

  static mapIntentStatus(status: Stripe.PaymentIntent.Status): IntentResult['status'] {
    switch (status) {
      case 'succeeded':
        return 'CAPTURED';
      case 'requires_capture':
        return 'AUTHORIZED';
      case 'canceled':
        return 'FAILED';
      default:
        return 'REQUIRES_CONFIRMATION';
    }
  }

  private static summary(pi: Stripe.PaymentIntent): Record<string, unknown> {
    return {
      id: pi.id,
      status: pi.status,
      amount: pi.amount,
      amount_received: pi.amount_received,
      currency: pi.currency,
      livemode: pi.livemode,
      last_payment_error: pi.last_payment_error?.code ?? null,
    };
  }

  async createIntent(input: CreateIntentInput): Promise<IntentResult> {
    const meta = input.metadata ?? {};
    const pi = await this.stripe().paymentIntents.create(
      {
        amount: Number(input.amountCents),
        currency: input.currency.toLowerCase(),
        automatic_payment_methods: { enabled: true },
        customer: typeof meta.stripeCustomerId === 'string' ? meta.stripeCustomerId : undefined,
        description: typeof meta.description === 'string' ? meta.description : undefined,
        metadata: {
          reference: input.reference,
          ...Object.fromEntries(
            Object.entries(meta)
              .filter(([k, v]) => k !== 'stripeCustomerId' && k !== 'description' && v != null)
              .map(([k, v]) => [k, String(v).slice(0, 500)]),
          ),
        },
      },
      { idempotencyKey: `pi:${input.reference}` },
    );
    return {
      providerRef: pi.id,
      status: StripeProvider.mapIntentStatus(pi.status),
      clientSecret: pi.client_secret ?? undefined,
      raw: StripeProvider.summary(pi),
    };
  }

  /**
   * Server-side reconciliation. Stripe payments are confirmed in the browser;
   * this reads the authoritative state and captures a manual-capture intent.
   */
  async confirm(providerRef: string): Promise<CaptureResult> {
    let pi = await this.stripe().paymentIntents.retrieve(providerRef);
    if (pi.status === 'requires_capture') {
      pi = await this.stripe().paymentIntents.capture(providerRef, {}, { idempotencyKey: `capture:${providerRef}` });
    }
    if (pi.status === 'succeeded') {
      return {
        providerRef: pi.id,
        status: 'CAPTURED',
        amountCents: BigInt(pi.amount_received),
        currency: pi.currency.toUpperCase(),
        raw: StripeProvider.summary(pi),
      };
    }
    if (pi.status === 'canceled') {
      return { providerRef: pi.id, status: 'FAILED', failureReason: pi.cancellation_reason ?? 'canceled', raw: StripeProvider.summary(pi) };
    }
    return { providerRef: pi.id, status: 'PENDING', raw: StripeProvider.summary(pi) };
  }

  async refund(providerRef: string, amountCents: bigint, reference?: string): Promise<RefundResult> {
    const refund = await this.stripe().refunds.create(
      { payment_intent: providerRef, amount: Number(amountCents) },
      { idempotencyKey: `refund:${reference ?? `${providerRef}:${amountCents}`}` },
    );
    if (refund.status === 'failed' || refund.status === 'canceled') {
      throw new Error(`Stripe refund ${refund.status}`);
    }
    return {
      providerRef: refund.id,
      refundedCents: BigInt(refund.amount),
      raw: { id: refund.id, status: refund.status, amount: refund.amount, currency: refund.currency },
    };
  }

  /** Cancels an unpaid PaymentIntent so it can no longer be confirmed. */
  async cancel(providerRef: string): Promise<void> {
    await this.stripe().paymentIntents.cancel(providerRef, {}, { idempotencyKey: `cancel:${providerRef}` });
  }

  async ensureCustomer(input: { email?: string | null; name?: string; reference: string }): Promise<string> {
    const customer = await this.stripe().customers.create(
      { email: input.email ?? undefined, name: input.name, metadata: { reference: input.reference } },
      { idempotencyKey: `customer:${input.reference}` },
    );
    return customer.id;
  }

  verifyWebhook(rawBody: string, signature: string | undefined): WebhookVerification {
    const empty = { eventId: '', type: '', raw: {} };
    if (!this.cfg.webhookSecret) return { valid: false, reason: 'stripe webhook secret not configured', ...empty };
    if (!signature) return { valid: false, reason: 'missing signature header', ...empty };
    let event: Stripe.Event;
    try {
      // HMAC over the exact raw bytes; stale timestamps (> 5 min) are rejected.
      event = Stripe.webhooks.constructEvent(rawBody, signature, this.cfg.webhookSecret, 300);
    } catch {
      return { valid: false, reason: 'signature verification failed', ...empty };
    }

    const obj: any = event.data.object;
    let type = `stripe.${event.type}`;
    let providerRef: string | undefined;
    let amountCents: bigint | undefined;
    let currency: string | undefined;
    switch (event.type) {
      case 'payment_intent.succeeded':
        type = 'payment.captured';
        providerRef = obj.id;
        amountCents = BigInt(obj.amount_received ?? 0);
        currency = obj.currency;
        break;
      case 'payment_intent.payment_failed':
      case 'payment_intent.canceled':
        type = 'payment.failed';
        providerRef = obj.id;
        break;
      case 'charge.refunded':
        type = 'payment.refunded';
        providerRef = typeof obj.payment_intent === 'string' ? obj.payment_intent : obj.payment_intent?.id;
        amountCents = BigInt(obj.amount_refunded ?? 0);
        currency = obj.currency;
        break;
      case 'charge.dispute.created':
        type = 'payment.disputed';
        providerRef = typeof obj.payment_intent === 'string' ? obj.payment_intent : undefined;
        break;
      default:
        break;
    }
    return {
      valid: true,
      eventId: event.id,
      type,
      providerRef,
      amountCents,
      currency: currency?.toUpperCase(),
      livemode: event.livemode,
      failureReason: obj?.last_payment_error?.code ?? obj?.cancellation_reason ?? undefined,
      raw: { id: event.id, type: event.type, livemode: event.livemode, created: event.created, object: { id: obj?.id, status: obj?.status } },
    };
  }
}

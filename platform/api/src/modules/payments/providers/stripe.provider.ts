import Stripe from 'stripe';
import {
  CancelResult,
  CaptureResult,
  CreateIntentInput,
  IntentResult,
  PaymentProvider,
  RefundResult,
  WebhookVerification,
} from './payment-provider';

/**
 * Stripe adapter (official SDK, PaymentIntents).
 *
 * - The amount always comes from the server (invoice / booking balance).
 * - The browser confirms the PaymentIntent with Stripe.js using `clientSecret`;
 *   the API never marks a payment paid because the browser says so. Truth comes
 *   from `payment_intent.succeeded` webhooks (signature-verified) or from a
 *   server-side retrieve of the PaymentIntent.
 * - A declined attempt leaves the PaymentIntent in `requires_payment_method`
 *   and Stripe expects the same intent to be retried
 *   (docs.stripe.com/payments/paymentintents/lifecycle), so a decline is
 *   reported as PENDING with `lastError`, never as a terminal failure.
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

  /** What is kept of a PaymentIntent: no client secret, no customer or card data. */
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

  /** The decline code of the last failed attempt, or its error code. */
  private static lastError(pi: Stripe.PaymentIntent): string | undefined {
    const err = pi.last_payment_error;
    if (!err) return undefined;
    return err.decline_code ?? err.code ?? err.type ?? 'payment_failed';
  }

  /** Maps a PaymentIntent onto the provider-neutral state. */
  static state(pi: Stripe.PaymentIntent): CaptureResult {
    const base = { providerRef: pi.id, providerStatus: pi.status, raw: StripeProvider.summary(pi) };
    switch (pi.status) {
      case 'succeeded':
        return {
          ...base,
          status: 'CAPTURED',
          amountCents: BigInt(pi.amount_received),
          currency: pi.currency.toUpperCase(),
        };
      case 'canceled':
        return { ...base, status: 'FAILED', failureReason: pi.cancellation_reason ?? 'canceled' };
      case 'processing':
      case 'requires_capture':
        // requires_capture only happens with manual capture, which is never requested here.
        return { ...base, status: 'PROCESSING' };
      default:
        // requires_payment_method | requires_confirmation | requires_action:
        // the payer can still complete this intent.
        return {
          ...base,
          status: 'PENDING',
          lastError: StripeProvider.lastError(pi),
          clientSecret: pi.client_secret ?? undefined,
        };
    }
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

  /** Server-side read of the authoritative state. Never changes anything at Stripe. */
  async retrieve(providerRef: string): Promise<CaptureResult> {
    return StripeProvider.state(await this.stripe().paymentIntents.retrieve(providerRef));
  }

  /**
   * Server-side reconciliation. Stripe payments are confirmed in the browser;
   * this reads the authoritative state and captures a manual-capture intent.
   */
  async confirm(providerRef: string): Promise<CaptureResult> {
    let pi = await this.stripe().paymentIntents.retrieve(providerRef);
    if (pi.status === 'requires_capture') {
      pi = await this.stripe().paymentIntents.capture(
        providerRef,
        {},
        { idempotencyKey: `capture:${providerRef}` },
      );
    }
    return StripeProvider.state(pi);
  }

  async refund(
    providerRef: string,
    amountCents: bigint,
    reference?: string,
  ): Promise<RefundResult> {
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
      raw: {
        id: refund.id,
        status: refund.status,
        amount: refund.amount,
        currency: refund.currency,
      },
    };
  }

  /**
   * Cancels an unpaid PaymentIntent so it can no longer be confirmed. Stripe
   * refuses once the intent is processing or has succeeded; the current state
   * is returned instead so the caller reconciles rather than guesses.
   */
  async cancel(providerRef: string): Promise<CancelResult> {
    try {
      await this.stripe().paymentIntents.cancel(
        providerRef,
        {},
        { idempotencyKey: `cancel:${providerRef}` },
      );
      return { cancelled: true };
    } catch (err) {
      const state = await this.retrieve(providerRef).catch(() => undefined);
      if (!state) throw err;
      return { cancelled: state.status === 'FAILED', state };
    }
  }

  async ensureCustomer(input: {
    email?: string | null;
    name?: string;
    reference: string;
  }): Promise<string> {
    const customer = await this.stripe().customers.create(
      {
        email: input.email ?? undefined,
        name: input.name,
        metadata: { reference: input.reference },
      },
      { idempotencyKey: `customer:${input.reference}` },
    );
    return customer.id;
  }

  verifyWebhook(rawBody: string, signature: string | undefined): WebhookVerification {
    const empty = { eventId: '', type: '', raw: {} };
    if (!this.cfg.webhookSecret) {
      return { valid: false, reason: 'stripe webhook secret not configured', ...empty };
    }
    if (!signature) return { valid: false, reason: 'missing signature header', ...empty };
    let event: Stripe.Event;
    try {
      // HMAC over the exact raw bytes; stale timestamps (> 5 min) are rejected.
      event = Stripe.webhooks.constructEvent(rawBody, signature, this.cfg.webhookSecret, 300);
    } catch {
      return { valid: false, reason: 'signature verification failed', ...empty };
    }

    const obj: any = event.data.object;
    const intentId = (v: unknown): string | undefined =>
      typeof v === 'string' ? v : typeof (v as any)?.id === 'string' ? (v as any).id : undefined;
    const out: Omit<WebhookVerification, 'valid' | 'eventId' | 'raw'> = {
      type: `stripe.${event.type}`,
    };
    switch (event.type) {
      case 'payment_intent.succeeded':
        Object.assign(out, {
          type: 'payment.captured',
          providerRef: obj.id,
          amountCents: BigInt(obj.amount_received ?? 0),
          currency: obj.currency,
          reference: obj.metadata?.reference,
        });
        break;
      case 'payment_intent.processing':
        Object.assign(out, {
          type: 'payment.processing',
          providerRef: obj.id,
          reference: obj.metadata?.reference,
        });
        break;
      case 'payment_intent.payment_failed':
        // A declined attempt: the intent returns to requires_payment_method and
        // may still succeed with another payment method.
        Object.assign(out, {
          type: 'payment.attempt_failed',
          providerRef: obj.id,
          failureReason:
            obj.last_payment_error?.decline_code ??
            obj.last_payment_error?.code ??
            'payment_failed',
          reference: obj.metadata?.reference,
        });
        break;
      case 'payment_intent.canceled':
        Object.assign(out, {
          type: 'payment.failed',
          providerRef: obj.id,
          failureReason: obj.cancellation_reason ?? 'canceled',
          reference: obj.metadata?.reference,
        });
        break;
      case 'charge.refunded':
        // amount_refunded is cumulative for the charge, so a replay or a
        // reordering can never double count.
        Object.assign(out, {
          type: 'payment.refunded',
          providerRef: intentId(obj.payment_intent),
          amountCents: BigInt(obj.amount_refunded ?? 0),
          capturedCents: obj.captured ? BigInt(obj.amount_captured ?? 0) : undefined,
          currency: obj.currency,
        });
        break;
      case 'charge.dispute.created':
        Object.assign(out, { type: 'payment.disputed', providerRef: intentId(obj.payment_intent) });
        break;
      case 'charge.dispute.closed':
        Object.assign(out, {
          type: 'payment.dispute_closed',
          providerRef: intentId(obj.payment_intent),
          disputeStatus: obj.status,
        });
        break;
      default:
        break;
    }
    return {
      valid: true,
      eventId: event.id,
      ...out,
      providerRef: out.providerRef,
      currency: typeof out.currency === 'string' ? out.currency.toUpperCase() : undefined,
      reference: typeof out.reference === 'string' ? out.reference : undefined,
      livemode: event.livemode,
      raw: {
        id: event.id,
        type: event.type,
        livemode: event.livemode,
        created: event.created,
        object: { id: obj?.id, status: obj?.status },
      },
    };
  }
}

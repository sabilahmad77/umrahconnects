import {
  PaymentProvider, CreateIntentInput, IntentResult, CaptureResult, RefundResult, WebhookVerification,
} from './payment-provider';

/**
 * Stripe adapter. Deliberately not wired to the SDK yet — the account keys
 * are a human-supplied item. Everything above this class (intents, states,
 * transactions, refunds, webhook handling) is provider-agnostic, so enabling
 * Stripe is: add the dependency, fill in these five methods, set
 * PAYMENT_PROVIDER=stripe. No call site changes.
 *
 * It reports its own configuration honestly so the API can answer 503 with
 * the exact missing variables rather than pretending a payment succeeded.
 */
export class StripeProvider implements PaymentProvider {
  readonly name = 'stripe';

  constructor(private readonly cfg: { secretKey?: string; webhookSecret?: string }) {}

  isConfigured() { return this.missingConfig().length === 0; }

  missingConfig(): string[] {
    const missing: string[] = [];
    if (!this.cfg.secretKey) missing.push('STRIPE_SECRET_KEY');
    if (!this.cfg.webhookSecret) missing.push('STRIPE_WEBHOOK_SECRET');
    return missing;
  }

  private notEnabled(): never {
    throw new Error(
      'Stripe provider is selected but its client is not enabled in this build. ' +
      'Supply STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET and implement StripeProvider.',
    );
  }

  async createIntent(_input: CreateIntentInput): Promise<IntentResult> { this.notEnabled(); }
  async confirm(_ref: string): Promise<CaptureResult> { this.notEnabled(); }
  async refund(_ref: string, _amountCents: bigint): Promise<RefundResult> { this.notEnabled(); }
  verifyWebhook(_rawBody: string, _signature?: string): WebhookVerification {
    return { valid: false, reason: 'stripe provider not enabled', eventId: '', type: '', raw: {} };
  }
}

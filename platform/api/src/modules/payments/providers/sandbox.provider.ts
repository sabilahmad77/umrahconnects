import { createHmac, randomBytes, timingSafeEqual } from 'crypto';
import {
  PaymentProvider, CreateIntentInput, IntentResult, CaptureResult, RefundResult, WebhookVerification,
} from './payment-provider';

/**
 * A complete, self-contained gateway for development and tests.
 *
 * It behaves like a real provider — intents, two-step confirmation, refunds,
 * HMAC-signed webhooks — without any external account, so the whole payment
 * path is exercisable before anyone supplies live credentials. Outcomes are
 * driven by an explicit `scenario` so failures can be tested deterministically
 * instead of hoping for one.
 */
export class SandboxProvider implements PaymentProvider {
  readonly name = 'sandbox';

  constructor(private readonly webhookSecret: string) {}

  isConfigured() { return true; }
  missingConfig(): string[] { return []; }

  private ref(prefix: string) {
    return `${prefix}_${randomBytes(10).toString('hex')}`;
  }

  async createIntent(input: CreateIntentInput): Promise<IntentResult> {
    const providerRef = this.ref('sbx_pi');
    if (input.scenario === 'decline_at_intent') {
      return { providerRef, status: 'FAILED', raw: { scenario: input.scenario, reason: 'card_declined' } };
    }
    return {
      providerRef,
      status: 'REQUIRES_CONFIRMATION',
      clientSecret: `${providerRef}_secret_${randomBytes(6).toString('hex')}`,
      raw: {
        amountCents: input.amountCents.toString(),
        currency: input.currency,
        reference: input.reference,
        scenario: input.scenario ?? 'succeed',
      },
    };
  }

  async confirm(providerRef: string, scenario?: string): Promise<CaptureResult> {
    if (scenario === 'decline_at_capture') {
      return {
        providerRef,
        status: 'FAILED',
        failureReason: 'insufficient_funds',
        raw: { scenario },
      };
    }
    return { providerRef, status: 'CAPTURED', raw: { scenario: scenario ?? 'succeed' } };
  }

  async refund(providerRef: string, amountCents: bigint): Promise<RefundResult> {
    return {
      providerRef: this.ref('sbx_re'),
      refundedCents: amountCents,
      raw: { original: providerRef, amountCents: amountCents.toString() },
    };
  }

  /** Signature format: sha256=<hex hmac of the raw body>. */
  sign(rawBody: string) {
    return `sha256=${createHmac('sha256', this.webhookSecret).update(rawBody).digest('hex')}`;
  }

  verifyWebhook(rawBody: string, signature: string | undefined): WebhookVerification {
    let parsed: any = {};
    try { parsed = JSON.parse(rawBody || '{}'); } catch {
      return { valid: false, reason: 'body is not valid JSON', eventId: '', type: '', raw: {} };
    }
    const base = {
      eventId: String(parsed.id ?? ''),
      type: String(parsed.type ?? ''),
      providerRef: parsed.data?.providerRef ? String(parsed.data.providerRef) : undefined,
      raw: parsed,
    };
    if (!signature) return { valid: false, reason: 'missing signature header', ...base };

    const expected = Buffer.from(this.sign(rawBody));
    const got = Buffer.from(signature);
    // Length check first: timingSafeEqual throws on a length mismatch.
    const valid = expected.length === got.length && timingSafeEqual(expected, got);
    if (!valid) return { valid: false, reason: 'signature mismatch', ...base };
    if (!base.eventId) return { valid: false, reason: 'event id missing', ...base };
    return { valid: true, ...base };
  }
}

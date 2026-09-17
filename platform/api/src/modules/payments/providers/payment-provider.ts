/** One shape every payment gateway is adapted to. */
export interface CreateIntentInput {
  amountCents: bigint;
  currency: string;
  /** Stable internal reference; also used as the provider idempotency key. */
  reference: string;
  /** Sandbox only: makes outcomes deterministic in tests. */
  scenario?: string;
  metadata?: Record<string, unknown>;
}

export interface IntentResult {
  providerRef: string;
  status: 'REQUIRES_CONFIRMATION' | 'AUTHORIZED' | 'CAPTURED' | 'FAILED';
  clientSecret?: string;
  raw: Record<string, unknown>;
}

export interface CaptureResult {
  providerRef: string;
  /** PENDING: the customer has not completed the payment yet (e.g. Stripe.js still pending). */
  status: 'CAPTURED' | 'FAILED' | 'PENDING';
  /** Amount the provider reports as received — checked against the payment record. */
  amountCents?: bigint;
  currency?: string;
  failureReason?: string;
  raw: Record<string, unknown>;
}

export interface RefundResult {
  providerRef: string;
  refundedCents: bigint;
  raw: Record<string, unknown>;
}

export interface WebhookVerification {
  valid: boolean;
  reason?: string;
  eventId: string;
  /** Normalised: payment.captured | payment.failed | payment.refunded | payment.disputed | <provider-specific> */
  type: string;
  providerRef?: string;
  amountCents?: bigint;
  currency?: string;
  livemode?: boolean;
  failureReason?: string;
  raw: Record<string, unknown>;
}

export interface PaymentProvider {
  readonly name: string;
  /** False when credentials are absent — the caller turns this into a 503. */
  isConfigured(): boolean;
  missingConfig(): string[];
  createIntent(input: CreateIntentInput): Promise<IntentResult>;
  confirm(providerRef: string, scenario?: string): Promise<CaptureResult>;
  refund(providerRef: string, amountCents: bigint, reference?: string): Promise<RefundResult>;
  /** Verify a webhook signature and normalise the event. */
  verifyWebhook(rawBody: string, signature: string | undefined): WebhookVerification;
}

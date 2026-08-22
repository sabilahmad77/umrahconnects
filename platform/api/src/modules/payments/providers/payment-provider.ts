/** One shape every payment gateway is adapted to. */
export interface CreateIntentInput {
  amountCents: bigint;
  currency: string;
  reference: string;
  /** Sandbox uses this to make outcomes deterministic in tests. */
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
  status: 'CAPTURED' | 'FAILED';
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
  type: string;
  providerRef?: string;
  raw: Record<string, unknown>;
}

export interface PaymentProvider {
  readonly name: string;
  /** False when credentials are absent — the caller turns this into a 503. */
  isConfigured(): boolean;
  missingConfig(): string[];
  createIntent(input: CreateIntentInput): Promise<IntentResult>;
  confirm(providerRef: string, scenario?: string): Promise<CaptureResult>;
  refund(providerRef: string, amountCents: bigint): Promise<RefundResult>;
  /** Verify a webhook signature and normalise the event. */
  verifyWebhook(rawBody: string, signature: string | undefined): WebhookVerification;
}

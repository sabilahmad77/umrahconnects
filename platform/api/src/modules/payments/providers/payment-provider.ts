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

/**
 * The provider's current view of one payment.
 *
 * - `PENDING`: waiting for the payer. Either nothing was attempted yet, an
 *   attempt was declined and the same intent can be retried (`lastError` is
 *   set), or an authentication step such as 3-D Secure is in progress.
 * - `PROCESSING`: submitted; the provider has not decided yet (asynchronous
 *   payment methods).
 * - `CAPTURED`: the money was received.
 * - `FAILED`: the intent can never succeed any more (cancelled).
 */
export interface CaptureResult {
  providerRef: string;
  status: 'CAPTURED' | 'FAILED' | 'PENDING' | 'PROCESSING';
  /** The provider's own status word, e.g. `requires_action`. */
  providerStatus?: string;
  /** Amount the provider reports as received — checked against the payment record. */
  amountCents?: bigint;
  currency?: string;
  /** Why the intent can no longer succeed (FAILED only). */
  failureReason?: string;
  /** Error code of the last declined attempt while the intent stays retryable. */
  lastError?: string;
  /**
   * Client secret of an intent that can still be paid. Handed only to the
   * caller that owns the payment so its browser can continue; never stored.
   */
  clientSecret?: string;
  raw: Record<string, unknown>;
}

export interface CancelResult {
  /** False when the provider refused because the payment already progressed. */
  cancelled: boolean;
  /** The provider's state after the attempt (always set when `cancelled` is false). */
  state?: CaptureResult;
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
  /**
   * Normalised: payment.captured | payment.processing | payment.attempt_failed |
   * payment.failed | payment.refunded | payment.disputed | <provider-specific>
   */
  type: string;
  providerRef?: string;
  /** captured: amount received · refunded: cumulative amount refunded on the charge. */
  amountCents?: bigint;
  /** refunded only: amount the refunded charge had captured (proves the capture happened). */
  capturedCents?: bigint;
  currency?: string;
  livemode?: boolean;
  failureReason?: string;
  /** Our reference echoed back by the provider (intent metadata), when it carries one. */
  reference?: string;
  /** dispute_closed only: the provider's outcome, e.g. `won` or `lost`. */
  disputeStatus?: string;
  raw: Record<string, unknown>;
}

export interface PaymentProvider {
  readonly name: string;
  /** False when credentials are absent — the caller turns this into a 503. */
  isConfigured(): boolean;
  missingConfig(): string[];
  createIntent(input: CreateIntentInput): Promise<IntentResult>;
  /** Reconcile, capturing an authorised intent where the provider requires it. */
  confirm(providerRef: string, scenario?: string): Promise<CaptureResult>;
  /**
   * Read-only reconciliation. Optional: a provider without it (the sandbox)
   * only changes state through an explicit `confirm`.
   */
  retrieve?(providerRef: string): Promise<CaptureResult>;
  /** Invalidate an intent so it can no longer be paid. */
  cancel(providerRef: string): Promise<CancelResult>;
  refund(providerRef: string, amountCents: bigint, reference?: string): Promise<RefundResult>;
  /** Verify a webhook signature and normalise the event. */
  verifyWebhook(rawBody: string, signature: string | undefined): WebhookVerification;
}

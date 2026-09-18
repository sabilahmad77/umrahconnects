/**
 * The checkout state machine shared by the traveler booking checkout and the
 * staff invoice card payment.
 *
 * One rule shapes everything here: the page never decides that money moved. A
 * browser result from Stripe.js only ever leads to "verifying" — asking the
 * server — and only the server's payment status can move the page to
 * "succeeded". A reload or a return from a 3-D Secure / bank redirect starts
 * from the server's status too, so the page always shows the server's truth.
 */

export type ServerPaymentStatus =
  | 'PENDING'
  | 'PROCESSING'
  | 'AUTHORIZED'
  | 'COMPLETED'
  | 'FAILED'
  | 'REFUNDED'
  | 'PARTIALLY_REFUNDED'
  | 'DISPUTED';

/** What the server says about one payment attempt, in either flow. */
export interface PaymentView {
  paymentId: string;
  status: ServerPaymentStatus | string;
  amountCents: number;
  currency: string;
  /** stripe | sandbox */
  provider: string;
  providerStatus?: string | null;
  /** Decline code of the last attempt while the attempt stays open, or why it failed. */
  failureReason?: string | null;
  /** Only in a response to the payer's own start/resume request; never stored. */
  clientSecret?: string;
  publishableKey?: string | null;
  bookingPaymentStatus?: string;
  bookingStatus?: string;
}

export type CheckoutPhase =
  /** Nothing started yet. */
  | 'idle'
  /** Opening (or resuming) the attempt on the server. */
  | 'starting'
  /** The payment form is shown and waits for the payer. */
  | 'collecting'
  /** The payment form was submitted to the provider. */
  | 'submitting'
  /** Submitted: waiting for the server to report the outcome. */
  | 'verifying'
  /** The provider accepted the payment but has not finished it (asynchronous methods). */
  | 'processing'
  /** The bank asked for verification (3-D Secure); finishing it continues the same attempt. */
  | 'action_required'
  /** The last attempt was declined; the same form can be used again. */
  | 'declined'
  /** The server recorded the payment. */
  | 'succeeded'
  /** The server recorded the payment and part or all of it was refunded since. */
  | 'refunded'
  /** This attempt can no longer be paid; a new one can be started. */
  | 'failed'
  /** The provider reported a problem that needs review; nothing to do here. */
  | 'on_hold'
  /** No usable payment provider on this deployment. */
  | 'unavailable'
  /** A request failed; the message says what to do. */
  | 'error';

export interface CheckoutState {
  phase: CheckoutPhase;
  view?: PaymentView;
  message?: string;
  /** Status reads since the last submit (bounded — see `nextPollDelay`). */
  polls: number;
  /** A submit (or a return from a redirect) is waiting for the server's outcome. */
  awaitingOutcome: boolean;
  /** Polling stopped before the server reported an outcome. */
  gaveUp: boolean;
}

export type ConfirmOutcome =
  /** Ask the server; nothing is known yet (the only path after a successful browser confirmation). */
  | { kind: 'verify'; message?: string }
  /** The provider rejected the details; show why and keep the form. */
  | { kind: 'retry'; message: string };

export type CheckoutEvent =
  | { type: 'START' }
  | { type: 'STARTED'; view: PaymentView }
  | { type: 'START_FAILED'; message: string; unavailable?: boolean }
  | { type: 'SUBMIT' }
  | { type: 'CONFIRM_RESULT'; outcome: ConfirmOutcome }
  /** A status read that should be treated as the answer to a submit or a return from a redirect. */
  | { type: 'AWAIT_OUTCOME' }
  | { type: 'SERVER'; view: PaymentView }
  | { type: 'SERVER_ERROR'; message: string }
  | { type: 'GIVE_UP' }
  | { type: 'LOAD_ERROR'; message: string }
  | { type: 'RESET' };

export const initialCheckoutState: CheckoutState = { phase: 'idle', polls: 0, awaitingOutcome: false, gaveUp: false };

/** How many "still PENDING" reads after a submit before concluding the payment did not go through. */
export const PENDING_READS_BEFORE_RETRY = 6;

const DECLINE_MESSAGES: Record<string, string> = {
  insufficient_funds: 'The card has insufficient funds. Try another card.',
  expired_card: 'The card has expired. Try another card.',
  incorrect_cvc: 'The security code is incorrect. Check it and try again.',
  invalid_cvc: 'The security code is incorrect. Check it and try again.',
  incorrect_number: 'The card number is incorrect. Check it and try again.',
  processing_error: 'The card could not be processed. Try again in a moment.',
  authentication_required: 'Your bank needs you to verify this payment. Try again and complete the verification.',
  card_velocity_exceeded: 'The card has reached its limit. Try another card.',
};

/** A plain-language reason for a declined attempt. Fraud-related codes are not disclosed. */
export function declineMessage(code?: string | null): string {
  if (!code) return 'The payment was declined. Try another card or payment method.';
  return DECLINE_MESSAGES[code] ?? 'The payment was declined. Try another card or payment method.';
}

/** Map the server's truth onto what the page shows. */
export function phaseFromServer(view: PaymentView): CheckoutPhase {
  switch (view.status) {
    case 'COMPLETED':
      return 'succeeded';
    case 'PARTIALLY_REFUNDED':
    case 'REFUNDED':
      return 'refunded';
    case 'PROCESSING':
    case 'AUTHORIZED':
      return 'processing';
    case 'DISPUTED':
      return 'on_hold';
    case 'FAILED':
      return 'failed';
    case 'PENDING':
      if (view.providerStatus === 'requires_action') return 'action_required';
      if (view.failureReason) return 'declined';
      return 'collecting';
    default:
      return 'error';
  }
}

/** Phases in which the payment form is on screen. */
export const FORM_PHASES: CheckoutPhase[] = ['collecting', 'submitting', 'declined', 'action_required'];
/** Phases that finish the flow: nothing more to poll. */
export const FINAL_PHASES: CheckoutPhase[] = ['succeeded', 'refunded', 'failed', 'on_hold'];

/**
 * Turn a Stripe.js `confirmPayment` result into the next step. Only the error's
 * type, code and message are read — never card details.
 */
export function interpretConfirmResult(result: {
  error?: { type?: string; code?: string; decline_code?: string; message?: string } | null;
}): ConfirmOutcome {
  const error = result.error;
  if (!error) return { kind: 'verify' };
  if (error.type === 'card_error' || error.type === 'validation_error') {
    const message =
      error.message || (error.type === 'card_error' ? declineMessage(error.decline_code ?? error.code) : '');
    return { kind: 'retry', message: message || 'Check the payment details and try again.' };
  }
  if (error.code === 'payment_intent_unexpected_state') {
    // Typically already paid or processing (a second tab). The server knows.
    return { kind: 'verify', message: 'This payment was already submitted. Checking its status…' };
  }
  return {
    kind: 'verify',
    message: 'The payment provider did not answer clearly. Checking the payment status before anything else…',
  };
}

export function checkoutReducer(state: CheckoutState, event: CheckoutEvent): CheckoutState {
  switch (event.type) {
    case 'START':
      return { ...initialCheckoutState, phase: 'starting' };
    case 'STARTED': {
      const phase = phaseFromServer(event.view);
      return {
        ...state,
        phase,
        view: event.view,
        polls: 0,
        awaitingOutcome: false,
        gaveUp: false,
        message:
          phase === 'declined'
            ? `Your last attempt was declined: ${declineMessage(event.view.failureReason)}`
            : phase === 'action_required'
              ? 'Your bank asked to verify this payment. Continue to finish the verification.'
              : undefined,
      };
    }
    case 'START_FAILED':
      return { ...state, phase: event.unavailable ? 'unavailable' : 'error', message: event.message };
    case 'SUBMIT':
      if (!FORM_PHASES.includes(state.phase) || state.phase === 'submitting') return state;
      return { ...state, phase: 'submitting', message: undefined, gaveUp: false };
    case 'CONFIRM_RESULT':
      if (event.outcome.kind === 'retry') {
        return { ...state, phase: 'declined', message: event.outcome.message, awaitingOutcome: false };
      }
      return { ...state, phase: 'verifying', message: event.outcome.message, polls: 0, awaitingOutcome: true };
    case 'AWAIT_OUTCOME':
      return { ...state, phase: 'verifying', polls: 0, awaitingOutcome: true, gaveUp: false };
    case 'SERVER': {
      const view = { ...event.view, clientSecret: event.view.clientSecret ?? state.view?.clientSecret };
      const phase = phaseFromServer(view);
      const polls = state.polls + 1;
      if (phase === 'collecting' && state.awaitingOutcome) {
        // Right after a submit the server may not have heard from the provider yet.
        if (polls < PENDING_READS_BEFORE_RETRY) return { ...state, view, polls, phase: 'verifying' };
        return {
          ...state,
          view,
          polls,
          phase: 'collecting',
          awaitingOutcome: false,
          message: 'The payment was not completed. No money was taken; you can try again.',
        };
      }
      if (phase === 'collecting' && state.phase === 'submitting') return { ...state, view };
      const message =
        phase === 'declined'
          ? declineMessage(view.failureReason)
          : phase === 'failed'
            ? view.failureReason && view.failureReason !== 'superseded by a new checkout'
              ? `This attempt did not go through (${declineMessage(view.failureReason)}). No money was taken.`
              : 'This attempt can no longer be paid. Start a new payment.'
            : phase === 'action_required'
              ? 'Your bank asked to verify this payment. Finish the verification to continue.'
              : phase === 'processing'
                ? 'The payment provider is still processing this payment. This page updates when it finishes.'
                : undefined;
      return {
        ...state,
        view,
        polls,
        phase,
        message,
        awaitingOutcome: phase === 'processing' || phase === 'action_required' ? state.awaitingOutcome : false,
      };
    }
    case 'SERVER_ERROR':
      return { ...state, message: event.message };
    case 'GIVE_UP':
      return {
        ...state,
        gaveUp: true,
        message:
          'The payment is still being confirmed. It is safe to leave this page: the booking updates once the provider confirms, and paying again is not needed.',
      };
    case 'LOAD_ERROR':
      return { ...state, phase: 'error', message: event.message };
    case 'RESET':
      return initialCheckoutState;
    default:
      return state;
  }
}

/** Delay before the next status read, or null when the page should stop asking. */
export function nextPollDelay(state: CheckoutState): number | null {
  if (state.gaveUp) return null;
  const waiting =
    state.phase === 'verifying' ||
    state.phase === 'processing' ||
    (state.phase === 'action_required' && state.awaitingOutcome);
  if (!waiting) return null;
  const schedule = [1_000, 1_500, 2_000, 3_000, 4_000, 5_000, 8_000, 10_000];
  if (state.polls >= 30) return null;
  return schedule[Math.min(state.polls, schedule.length - 1)];
}

// ── return URLs (3-D Secure and redirect-based methods) ──────────────────

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Query parameters Stripe appends to `return_url`. The client secret must not linger in the address bar. */
const PROVIDER_RETURN_PARAMS = ['payment_intent', 'payment_intent_client_secret', 'redirect_status'];

/** `return_url` for confirmPayment: the current page, carrying only our payment id. */
export function returnUrlFor(href: string, param: string, paymentId: string): string {
  const url = new URL(href);
  for (const key of PROVIDER_RETURN_PARAMS) url.searchParams.delete(key);
  url.searchParams.set(param, paymentId);
  url.hash = '';
  return url.toString();
}

/** Our payment id from a return URL (validated), and whether provider params were present. */
export function readReturn(search: string, param: string): { paymentId?: string; redirected: boolean } {
  const params = new URLSearchParams(search);
  const id = params.get(param);
  return {
    paymentId: id && UUID.test(id) ? id : undefined,
    redirected: PROVIDER_RETURN_PARAMS.some((key) => params.has(key)),
  };
}

/** The search string without the provider's return parameters (keeps ours). */
export function withoutProviderParams(search: string): string {
  const params = new URLSearchParams(search);
  for (const key of PROVIDER_RETURN_PARAMS) params.delete(key);
  const out = params.toString();
  return out ? `?${out}` : '';
}

/** The search string with our payment parameter removed as well (the flow is over). */
export function withoutPaymentParam(search: string, param: string): string {
  const params = new URLSearchParams(withoutProviderParams(search));
  params.delete(param);
  const out = params.toString();
  return out ? `?${out}` : '';
}

// ── providers ──────────────────────────────────────────────────────────

export interface ProviderStatusLike {
  active: string;
  providers: { name: string; configured: boolean; publishableKey?: string | null; sandbox?: boolean; testMode?: boolean }[];
}

/**
 * Which payment path this deployment offers. The sandbox exists only on
 * development servers (the API never registers it in production), so the page
 * can offer it whenever the server reports it as the active provider.
 */
export function paymentPath(status?: ProviderStatusLike | null):
  | { kind: 'stripe'; publishableKey: string; testMode: boolean }
  | { kind: 'sandbox' }
  | { kind: 'unavailable'; reason: string } {
  if (!status) return { kind: 'unavailable', reason: 'Checking the payment provider…' };
  const active = status.providers.find((p) => p.name === status.active);
  if (!active) return { kind: 'unavailable', reason: 'Online payments are not enabled on this deployment.' };
  if (!active.configured) {
    return { kind: 'unavailable', reason: 'Card payments are not set up on this deployment yet.' };
  }
  if (active.name === 'sandbox') return { kind: 'sandbox' };
  if (active.name === 'stripe') {
    if (!active.publishableKey) {
      return { kind: 'unavailable', reason: 'Card payments are not set up on this deployment yet.' };
    }
    return { kind: 'stripe', publishableKey: active.publishableKey, testMode: !!active.testMode };
  }
  return { kind: 'unavailable', reason: 'This payment provider is not supported by this page.' };
}

import { describe, expect, it } from 'vitest';
import {
  checkoutReducer,
  CheckoutState,
  declineMessage,
  initialCheckoutState,
  interpretConfirmResult,
  nextPollDelay,
  PaymentView,
  paymentPath,
  PENDING_READS_BEFORE_RETRY,
  phaseFromServer,
  readReturn,
  returnUrlFor,
  withoutPaymentParam,
  withoutProviderParams,
} from '../components/finance/checkout-machine';
import { amountProblem, centsToInput, formatAmount, parseMajorToCents } from '../components/finance/money';

const ID = '3f8c2d4e-1a2b-4c3d-8e9f-0a1b2c3d4e5f';
const view = (over: Partial<PaymentView> = {}): PaymentView => ({
  paymentId: ID, status: 'PENDING', amountCents: 35_000, currency: 'SAR', provider: 'stripe', ...over,
});
const run = (events: Parameters<typeof checkoutReducer>[1][], from: CheckoutState = initialCheckoutState) =>
  events.reduce(checkoutReducer, from);

describe('the page never decides that money moved', () => {
  it('a successful browser confirmation only leads to verifying', () => {
    const s = run([{ type: 'START' }, { type: 'STARTED', view: view() }, { type: 'SUBMIT' }, { type: 'CONFIRM_RESULT', outcome: interpretConfirmResult({}) }]);
    expect(s.phase).toBe('verifying');
    expect(s.awaitingOutcome).toBe(true);
  });

  it('succeeded is reached only from a server COMPLETED status', () => {
    const verifying = run([{ type: 'STARTED', view: view() }, { type: 'SUBMIT' }, { type: 'CONFIRM_RESULT', outcome: { kind: 'verify' } }]);
    expect(run([{ type: 'SERVER', view: view({ status: 'PENDING' }) }], verifying).phase).toBe('verifying');
    expect(run([{ type: 'SERVER', view: view({ status: 'COMPLETED' }) }], verifying).phase).toBe('succeeded');
    for (const status of ['PENDING', 'PROCESSING', 'FAILED', 'DISPUTED', 'AUTHORIZED']) {
      expect(run([{ type: 'SERVER', view: view({ status }) }], verifying).phase).not.toBe('succeeded');
    }
  });

  it('a submit that the server never sees completed falls back to the form after a bounded wait', () => {
    let s = run([{ type: 'STARTED', view: view() }, { type: 'SUBMIT' }, { type: 'CONFIRM_RESULT', outcome: { kind: 'verify' } }]);
    for (let i = 0; i < PENDING_READS_BEFORE_RETRY - 1; i++) s = checkoutReducer(s, { type: 'SERVER', view: view() });
    expect(s.phase).toBe('verifying');
    s = checkoutReducer(s, { type: 'SERVER', view: view() });
    expect([s.phase, s.awaitingOutcome]).toEqual(['collecting', false]);
    expect(s.message).toMatch(/No money was taken/);
  });

  it('maps every server status to a phase', () => {
    expect(phaseFromServer(view({ status: 'COMPLETED' }))).toBe('succeeded');
    expect(phaseFromServer(view({ status: 'PARTIALLY_REFUNDED' }))).toBe('refunded');
    expect(phaseFromServer(view({ status: 'REFUNDED' }))).toBe('refunded');
    expect(phaseFromServer(view({ status: 'PROCESSING' }))).toBe('processing');
    expect(phaseFromServer(view({ status: 'DISPUTED' }))).toBe('on_hold');
    expect(phaseFromServer(view({ status: 'FAILED' }))).toBe('failed');
    expect(phaseFromServer(view({ status: 'PENDING' }))).toBe('collecting');
    expect(phaseFromServer(view({ status: 'PENDING', failureReason: 'card_declined' }))).toBe('declined');
    expect(phaseFromServer(view({ status: 'PENDING', providerStatus: 'requires_action' }))).toBe('action_required');
    expect(phaseFromServer(view({ status: 'SOMETHING_NEW' }))).toBe('error');
  });
});

describe('declines, retries and duplicate submits', () => {
  it('a card error keeps the form with the provider message', () => {
    const outcome = interpretConfirmResult({ error: { type: 'card_error', code: 'card_declined', message: 'Your card was declined.' } });
    expect(outcome).toEqual({ kind: 'retry', message: 'Your card was declined.' });
    const s = run([{ type: 'STARTED', view: view() }, { type: 'SUBMIT' }, { type: 'CONFIRM_RESULT', outcome }]);
    expect([s.phase, s.message]).toEqual(['declined', 'Your card was declined.']);
    // The same form can be submitted again.
    expect(checkoutReducer(s, { type: 'SUBMIT' }).phase).toBe('submitting');
  });

  it('a validation error is a retry; an already-submitted intent is verified, not re-paid', () => {
    expect(interpretConfirmResult({ error: { type: 'validation_error', message: 'Your card number is incomplete.' } }).kind).toBe('retry');
    expect(interpretConfirmResult({ error: { type: 'invalid_request_error', code: 'payment_intent_unexpected_state' } }).kind).toBe('verify');
    expect(interpretConfirmResult({ error: { type: 'api_connection_error' } }).kind).toBe('verify');
    expect(interpretConfirmResult({ error: { type: 'card_error', decline_code: 'insufficient_funds' } })).toEqual({
      kind: 'retry', message: declineMessage('insufficient_funds'),
    });
  });

  it('a second submit while one is in flight is ignored', () => {
    const submitting = run([{ type: 'STARTED', view: view() }, { type: 'SUBMIT' }]);
    expect(checkoutReducer(submitting, { type: 'SUBMIT' })).toBe(submitting);
    expect(checkoutReducer(initialCheckoutState, { type: 'SUBMIT' })).toBe(initialCheckoutState);
    const done = run([{ type: 'STARTED', view: view({ status: 'COMPLETED' }) }]);
    expect(checkoutReducer(done, { type: 'SUBMIT' })).toBe(done);
  });

  it('a server-recorded decline and a failed sandbox attempt explain themselves without card details', () => {
    const declined = run([{ type: 'STARTED', view: view({ failureReason: 'insufficient_funds' }) }]);
    expect(declined.phase).toBe('declined');
    expect(declined.message).toMatch(/insufficient funds/);
    const failed = run([{ type: 'STARTED', view: view() }, { type: 'SUBMIT' }, { type: 'SERVER', view: view({ status: 'FAILED', failureReason: 'insufficient_funds', provider: 'sandbox' }) }]);
    expect(failed.phase).toBe('failed');
    expect(failed.message).toMatch(/No money was taken/);
    expect(declineMessage('stolen_card')).not.toMatch(/stolen/i);
  });

  it('keeps the client secret it was given when a status read omits it', () => {
    const s = run([{ type: 'STARTED', view: view({ clientSecret: 'pi_1_secret_x' }) }, { type: 'SERVER', view: view() }]);
    expect(s.view?.clientSecret).toBe('pi_1_secret_x');
  });
});

describe('polling is bounded and stops at an outcome', () => {
  it('polls with backoff only while waiting for the server', () => {
    const verifying = run([{ type: 'STARTED', view: view() }, { type: 'SUBMIT' }, { type: 'CONFIRM_RESULT', outcome: { kind: 'verify' } }]);
    expect(nextPollDelay(verifying)).toBe(1_000);
    expect(nextPollDelay({ ...verifying, polls: 20 })).toBe(10_000);
    expect(nextPollDelay({ ...verifying, polls: 30 })).toBeNull();
    expect(nextPollDelay(checkoutReducer(verifying, { type: 'GIVE_UP' }))).toBeNull();
    for (const status of ['COMPLETED', 'FAILED', 'DISPUTED', 'REFUNDED']) {
      expect(nextPollDelay(checkoutReducer(verifying, { type: 'SERVER', view: view({ status }) }))).toBeNull();
    }
    expect(nextPollDelay(checkoutReducer(verifying, { type: 'SERVER', view: view({ status: 'PROCESSING' }) }))).not.toBeNull();
    expect(nextPollDelay(run([{ type: 'STARTED', view: view() }]))).toBeNull();
  });

  it('a return from a bank redirect waits for the server outcome', () => {
    const s = run([{ type: 'STARTED', view: view() }, { type: 'AWAIT_OUTCOME' }]);
    expect([s.phase, s.awaitingOutcome]).toEqual(['verifying', true]);
    expect(checkoutReducer(s, { type: 'SERVER', view: view({ status: 'COMPLETED' }) }).phase).toBe('succeeded');
  });
});

describe('return URLs never keep the client secret', () => {
  it('builds a return URL carrying only our payment id', () => {
    const url = returnUrlFor('https://app.test/my-bookings?tab=1&payment_intent=pi_1&payment_intent_client_secret=pi_1_secret_x#top', 'checkout', ID);
    expect(url).toBe(`https://app.test/my-bookings?tab=1&checkout=${ID}`);
  });

  it('reads and validates the payment id, then strips provider parameters', () => {
    const search = `?checkout=${ID}&payment_intent=pi_1&payment_intent_client_secret=pi_1_secret_x&redirect_status=succeeded`;
    expect(readReturn(search, 'checkout')).toEqual({ paymentId: ID, redirected: true });
    expect(readReturn('?checkout=not-a-uuid', 'checkout').paymentId).toBeUndefined();
    expect(withoutProviderParams(search)).toBe(`?checkout=${ID}`);
    expect(withoutPaymentParam(search, 'checkout')).toBe('');
    expect(withoutPaymentParam(`?page=2&payment=${ID}`, 'payment')).toBe('?page=2');
  });
});

describe('payment path offered by the deployment', () => {
  it('uses Stripe only with a publishable key, the sandbox only when the server runs it', () => {
    expect(paymentPath({ active: 'stripe', providers: [{ name: 'stripe', configured: true, publishableKey: 'pk_test_1', testMode: true }] })).toEqual({ kind: 'stripe', publishableKey: 'pk_test_1', testMode: true });
    expect(paymentPath({ active: 'stripe', providers: [{ name: 'stripe', configured: true, publishableKey: null }] }).kind).toBe('unavailable');
    expect(paymentPath({ active: 'stripe', providers: [{ name: 'stripe', configured: false }] }).kind).toBe('unavailable');
    expect(paymentPath({ active: 'none', providers: [{ name: 'stripe', configured: false }] }).kind).toBe('unavailable');
    expect(paymentPath({ active: 'sandbox', providers: [{ name: 'sandbox', configured: true, sandbox: true }] })).toEqual({ kind: 'sandbox' });
    expect(paymentPath(undefined).kind).toBe('unavailable');
  });
});

describe('money units', () => {
  it('parses typed major units into cents exactly', () => {
    expect(parseMajorToCents('0.29')).toBe(29);
    expect(parseMajorToCents('1234.5')).toBe(123_450);
    expect(parseMajorToCents(' 100 ')).toBe(10_000);
    for (const bad of ['', '-1', '1.234', '1e3', 'abc', '1,000', '.5']) expect(parseMajorToCents(bad)).toBeNull();
  });

  it('formats cents with two decimals and bounds typed amounts', () => {
    expect(formatAmount(123_450, 'SAR')).toBe('SAR 1,234.50');
    expect(formatAmount(Number.NaN)).toBe('—');
    expect(centsToInput(17_550)).toBe('175.50');
    expect(amountProblem('100', 10_000)).toBeNull();
    expect(amountProblem('100.01', 10_000)).toMatch(/cannot be more than SAR 100.00/);
    expect(amountProblem('0', 10_000)).toMatch(/greater than zero/);
    expect(amountProblem('ten', 10_000)).toMatch(/Enter an amount/);
  });
});

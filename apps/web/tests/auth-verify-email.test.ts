import { describe, expect, it } from 'vitest';
import { CONFIRM_TEXT, confirmFailureState, resendFailure, resendResult, waitText } from '../lib/email-verification';

const apiError = (status: number, code?: string, details?: Record<string, unknown>, headers: Record<string, string> = {}) => ({
  response: { status, headers, data: { success: false, error: { code, message: 'server text', details } } },
});

describe('email verification link states', () => {
  it('maps every server link code to its own state', () => {
    expect(confirmFailureState(apiError(401, 'VERIFICATION_LINK_USED', { emailVerified: true }))).toEqual({ kind: 'already-confirmed' });
    expect(confirmFailureState(apiError(401, 'VERIFICATION_LINK_USED', { emailVerified: false }))).toEqual({ kind: 'used' });
    expect(confirmFailureState(apiError(401, 'VERIFICATION_LINK_EXPIRED'))).toEqual({ kind: 'expired' });
    expect(confirmFailureState(apiError(401, 'VERIFICATION_LINK_INVALID'))).toEqual({ kind: 'invalid' });
    // A token too short for the DTO is rejected with 400 before the service runs.
    expect(confirmFailureState(apiError(400, 'BAD_REQUEST'))).toEqual({ kind: 'invalid' });
  });

  it('keeps server outages and network failures apart from bad links', () => {
    expect(confirmFailureState(apiError(503, 'SERVICE_UNAVAILABLE'))).toEqual({ kind: 'unavailable', message: 'server text' });
    expect(confirmFailureState({ request: {} })).toEqual({ kind: 'unavailable', message: 'We could not reach Umrah Connect. Check your connection and try again.' });
  });

  it('has distinct wording for every state', () => {
    const bodies = Object.values(CONFIRM_TEXT).map((t) => t.body);
    expect(new Set(bodies).size).toBe(bodies.length);
    expect(CONFIRM_TEXT['already-confirmed'].tone).toBe('info');
    expect(CONFIRM_TEXT.expired.tone).toBe('error');
  });
});

describe('resending the verification email', () => {
  it('reads the outcome of a successful request', () => {
    expect(resendResult({ delivered: true })).toEqual({ kind: 'sent' });
    expect(resendResult({ delivered: false })).toEqual({ kind: 'not-delivered' });
    expect(resendResult({ delivered: false, alreadyVerified: true })).toEqual({ kind: 'already-verified' });
  });

  it('turns the per-account cooldown or the route throttle into a wait', () => {
    expect(resendFailure(apiError(429, 'VERIFICATION_COOLDOWN', { retryAfterSeconds: 42 }))).toEqual({ kind: 'cooldown', seconds: 42 });
    expect(resendFailure(apiError(429, 'TOO_MANY_REQUESTS', undefined, { 'retry-after': '120' }))).toEqual({ kind: 'cooldown', seconds: 120 });
    expect(resendFailure(apiError(429, 'TOO_MANY_REQUESTS'))).toEqual({ kind: 'cooldown', seconds: 60 });
    expect(resendFailure(apiError(503, 'SERVICE_UNAVAILABLE'))).toEqual({ kind: 'unavailable', message: 'server text' });
  });

  it('describes the wait in plain words', () => {
    expect(waitText(1)).toBe('in 1 second');
    expect(waitText(42)).toBe('in 42 seconds');
    expect(waitText(61)).toBe('in about 2 minutes');
    expect(waitText(0)).toBe('now');
  });
});

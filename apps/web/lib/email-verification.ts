import { apiErrorMessage } from './api-error';

/**
 * Email verification (XT-R07): what a confirm or resend attempt means for the
 * person, from the API's stable error codes (platform/api auth.service.ts
 * `redeemLink` and `sendVerificationEmail`).
 */

export type ConfirmState =
  | { kind: 'confirmed' }
  | { kind: 'already-confirmed' }
  | { kind: 'used' }
  | { kind: 'expired' }
  | { kind: 'invalid' }
  | { kind: 'unavailable'; message: string };

type ApiFailure = {
  request?: unknown;
  response?: { status?: number; headers?: Record<string, unknown>; data?: { error?: { code?: string; details?: Record<string, unknown> } } };
};

export function confirmFailureState(error: unknown): ConfirmState {
  const failure = error as ApiFailure;
  const code = failure?.response?.data?.error?.code;
  if (code === 'VERIFICATION_LINK_USED') {
    return failure.response?.data?.error?.details?.emailVerified === true ? { kind: 'already-confirmed' } : { kind: 'used' };
  }
  if (code === 'VERIFICATION_LINK_EXPIRED') return { kind: 'expired' };
  if (code === 'VERIFICATION_LINK_INVALID' || failure?.response?.status === 400) return { kind: 'invalid' };
  return {
    kind: 'unavailable',
    message: failure?.response
      ? apiErrorMessage(error, 'Your email could not be confirmed right now. Try again.')
      : 'We could not reach Umrah Connect. Check your connection and try again.',
  };
}

export const CONFIRM_TEXT: Record<Exclude<ConfirmState['kind'], 'unavailable'>, { tone: 'info' | 'error'; title: string; body: string }> = {
  confirmed: { tone: 'info', title: 'Email confirmed', body: 'Thank you — your email address is confirmed.' },
  'already-confirmed': {
    tone: 'info',
    title: 'Already confirmed',
    body: 'This link has already been used and your email address is confirmed. There is nothing else to do.',
  },
  used: {
    tone: 'error',
    title: 'This link was already used or replaced',
    body: 'A newer verification email may have been sent. Use the most recent link, or request a new one.',
  },
  expired: { tone: 'error', title: 'This link has expired', body: 'Verification links work for 24 hours. Request a new one.' },
  invalid: {
    tone: 'error',
    title: 'This link is not valid',
    body: 'Check that you opened the complete link from the email, or request a new one.',
  },
};

export type ResendResult =
  | { kind: 'sent' }
  | { kind: 'not-delivered' }
  | { kind: 'already-verified' }
  | { kind: 'cooldown'; seconds: number }
  | { kind: 'unavailable'; message: string };

/** Result of `POST /auth/verify-email/request`. */
export function resendResult(data: { delivered?: boolean; alreadyVerified?: boolean } | undefined): ResendResult {
  if (data?.alreadyVerified) return { kind: 'already-verified' };
  return data?.delivered === true ? { kind: 'sent' } : { kind: 'not-delivered' };
}

/** A failed resend: the per-account cooldown or the route throttle (both 429) carry the wait. */
export function resendFailure(error: unknown): ResendResult {
  const failure = error as ApiFailure;
  if (failure?.response?.status === 429) {
    const fromBody = Number(failure.response.data?.error?.details?.retryAfterSeconds);
    const fromHeader = Number(failure.response.headers?.['retry-after']);
    const seconds = Number.isFinite(fromBody) && fromBody > 0 ? fromBody : Number.isFinite(fromHeader) && fromHeader > 0 ? fromHeader : 60;
    return { kind: 'cooldown', seconds: Math.ceil(seconds) };
  }
  return { kind: 'unavailable', message: apiErrorMessage(error, 'The verification email could not be requested. Try again.') };
}

export function waitText(seconds: number): string {
  if (seconds <= 0) return 'now';
  if (seconds < 60) return `in ${seconds} second${seconds === 1 ? '' : 's'}`;
  const minutes = Math.ceil(seconds / 60);
  return `in about ${minutes} minute${minutes === 1 ? '' : 's'}`;
}

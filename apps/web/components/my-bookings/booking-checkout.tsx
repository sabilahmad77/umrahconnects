'use client';

import { useEffect, useRef } from 'react';
import { LoadingState, QueryFailure } from '@/components/ui/system';
import { checkoutApi, usePaymentFlow, usePaymentProviders } from '@/hooks/use-payments';
import {
  interpretConfirmResult,
  paymentPath,
  returnUrlFor,
} from '@/components/finance/checkout-machine';
import { PaymentFlowPanel } from '@/components/finance/payment-flow-panel';

export const CHECKOUT_PARAM = 'checkout';

/**
 * Traveler checkout for one marketplace booking (XT-R09).
 *
 * Opening it asks the server to open — or resume — the booking's payment
 * attempt; the amount is always the server's outstanding balance. Stripe runs
 * through the Payment Element; a development deployment offers the labelled
 * sandbox instead. The booking shows as paid only when the server says so.
 *
 * The attempt id rides in the address bar (`?checkout=`), so a reload or the
 * return from a bank page picks the same attempt up again from the server.
 */
export function BookingCheckout({
  listingBookingId,
  resumePaymentId,
  redirected = false,
  onOutcome,
}: {
  listingBookingId?: string;
  /** Load this attempt instead of starting one (reload, return from a bank page). */
  resumePaymentId?: string;
  /** The page was reached through a provider redirect: wait for the server's outcome. */
  redirected?: boolean;
  /** Called when the server reports an outcome, e.g. to refresh the bookings list. */
  onOutcome: () => void;
}) {
  const providers = usePaymentProviders();
  const path = paymentPath(providers.data);
  // The booking is known up front, or — after a reload / bank redirect — from the loaded attempt.
  const bookingRef = useRef<string | undefined>(listingBookingId);
  const flow = usePaymentFlow(
    checkoutApi(() => bookingRef.current),
    { onOutcome: () => onOutcome() },
  );
  const { state } = flow;
  bookingRef.current = listingBookingId ?? state.view?.listingBookingId ?? undefined;

  const started = useRef(false);
  useEffect(() => {
    if (started.current || providers.isLoading) return;
    if (resumePaymentId) {
      started.current = true;
      // Only a return from the provider waits for an outcome; a plain reload just shows the status.
      void flow.load(resumePaymentId, redirected);
      return;
    }
    if (!listingBookingId || providers.error) return;
    started.current = true;
    if (path.kind === 'unavailable') {
      flow.send({ type: 'START_FAILED', message: path.reason, unavailable: true });
      return;
    }
    void flow.start();
  }, [
    providers.isLoading,
    providers.error,
    resumePaymentId,
    redirected,
    listingBookingId,
    path,
    flow,
  ]);

  // Keep the attempt id (never the client secret) in the address bar so a reload resumes it.
  const paymentId = state.view?.paymentId;
  useEffect(() => {
    if (!paymentId) return;
    const next = returnUrlFor(window.location.href, CHECKOUT_PARAM, paymentId);
    if (next !== window.location.href) window.history.replaceState(window.history.state, '', next);
  }, [paymentId]);

  if (providers.error && !resumePaymentId) {
    return <QueryFailure error={providers.error} onRetry={() => void providers.refetch()} />;
  }
  if (providers.isLoading) return <LoadingState label="Checking the payment provider…" />;

  return (
    <PaymentFlowPanel
      state={state}
      path={path}
      returnUrl={
        paymentId && typeof window !== 'undefined'
          ? returnUrlFor(window.location.href, CHECKOUT_PARAM, paymentId)
          : undefined
      }
      subject="booking"
      onStripeSubmit={() => flow.send({ type: 'SUBMIT' })}
      onStripeResult={(result) =>
        flow.send({ type: 'CONFIRM_RESULT', outcome: interpretConfirmResult(result) })
      }
      onLoadError={(message) => flow.send({ type: 'LOAD_ERROR', message })}
      onSandbox={(scenario) => void flow.sandbox(scenario)}
      onRefresh={() => void flow.refresh()}
      // "Try again" re-enters checkout for the same booking: the server resumes or reopens the attempt.
      onStartOver={() => {
        if (bookingRef.current) void flow.start();
      }}
    />
  );
}

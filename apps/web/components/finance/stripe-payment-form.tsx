'use client';

import { useMemo, useRef, useState } from 'react';
import { Elements, PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js';
import { loadStripe, type Stripe } from '@stripe/stripe-js';
import { Alert, Button, LoadingState } from '@/components/ui/system';

/**
 * Stripe Payment Element for one PaymentIntent (docs.stripe.com/payments/payment-element).
 *
 * Card details go from the Stripe iframe straight to Stripe; this component
 * never sees them and never stores or logs anything about the card. What it
 * reports back is the confirmation result's error type, code and message only.
 */

// loadStripe is called once per publishable key, outside render, as Stripe recommends.
const stripeByKey = new Map<string, Promise<Stripe | null>>();
function stripeFor(publishableKey: string) {
  let promise = stripeByKey.get(publishableKey);
  if (!promise) {
    promise = loadStripe(publishableKey);
    stripeByKey.set(publishableKey, promise);
  }
  return promise;
}

export interface ConfirmResult {
  error?: { type?: string; code?: string; decline_code?: string; message?: string };
}

interface Props {
  publishableKey: string;
  clientSecret: string;
  /** Where Stripe sends the payer back after a bank page (3-D Secure, redirect methods). */
  returnUrl: string;
  amountLabel: string;
  submitting: boolean;
  onSubmit: () => void;
  onResult: (result: ConfirmResult) => void;
  onLoadError: (message: string) => void;
}

export default function StripePaymentForm(props: Props) {
  const stripe = useMemo(() => stripeFor(props.publishableKey), [props.publishableKey]);
  return (
    // A new client secret means a new PaymentIntent: Elements options cannot change after mount.
    <Elements
      key={props.clientSecret}
      stripe={stripe}
      options={{
        clientSecret: props.clientSecret,
        appearance: {
          theme: 'stripe',
          variables: {
            colorPrimary: '#0F3D37',
            borderRadius: '8px',
            fontFamily: 'Inter, system-ui, sans-serif',
          },
        },
      }}
    >
      <PaymentForm {...props} />
    </Elements>
  );
}

function PaymentForm({
  returnUrl,
  amountLabel,
  submitting,
  onSubmit,
  onResult,
  onLoadError,
}: Props) {
  const stripe = useStripe();
  const elements = useElements();
  const [ready, setReady] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  // Guards the gap between a click and the next render, so a double click cannot confirm twice.
  const inFlight = useRef(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!stripe || !elements || !ready || inFlight.current || submitting) return;
    inFlight.current = true;
    onSubmit();
    try {
      const result = await stripe.confirmPayment({
        elements,
        confirmParams: { return_url: returnUrl },
        redirect: 'if_required',
      });
      const error = result.error;
      onResult(
        error
          ? {
              error: {
                type: error.type,
                code: error.code,
                decline_code: error.decline_code,
                message: error.message,
              },
            }
          : {},
      );
    } catch {
      onResult({ error: { type: 'api_connection_error' } });
    } finally {
      inFlight.current = false;
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4" aria-busy={submitting || undefined}>
      {!ready && !loadFailed && <LoadingState label="Loading the secure payment form…" />}
      <PaymentElement
        options={{ layout: 'tabs' }}
        onReady={() => setReady(true)}
        onLoadError={() => {
          setLoadFailed(true);
          onLoadError(
            'The secure payment form could not load. Check your connection and try again.',
          );
        }}
      />
      {loadFailed ? (
        <Alert title="Payment form unavailable">
          The secure payment form could not load, so nothing was charged. Close this and try again
          later.
        </Alert>
      ) : (
        <Button
          type="submit"
          busy={submitting}
          disabled={!stripe || !elements || !ready || submitting}
        >
          Pay {amountLabel}
        </Button>
      )}
      <p className="text-xs text-gray-600">
        Card details are sent directly to Stripe. The booking or invoice shows as paid only after
        our server confirms the payment with Stripe.
      </p>
    </form>
  );
}

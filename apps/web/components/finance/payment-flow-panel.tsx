'use client';

import dynamic from 'next/dynamic';
import { FlaskConical, ShieldCheck } from 'lucide-react';
import { Alert, Button, LoadingState } from '@/components/ui/system';
import { CheckoutState, FORM_PHASES, paymentPath } from './checkout-machine';
import { formatAmount } from './money';
import type { ConfirmResult } from './stripe-payment-form';

// Stripe.js is loaded only when a card form is actually shown.
const StripePaymentForm = dynamic(() => import('./stripe-payment-form'), {
  ssr: false,
  loading: () => <LoadingState label="Loading the secure payment form…" />,
});

export type PaymentPath = ReturnType<typeof paymentPath>;

interface Props {
  state: CheckoutState;
  path: PaymentPath;
  returnUrl?: string;
  /** What is being paid, e.g. "booking" or "invoice", for messages. */
  subject: string;
  onStripeSubmit: () => void;
  onStripeResult: (result: ConfirmResult) => void;
  onLoadError: (message: string) => void;
  onSandbox: (scenario: 'succeed' | 'decline_at_capture') => void;
  onRefresh: () => void;
  onStartOver: () => void;
}

/**
 * Renders one payment attempt from the checkout state: the form while it can
 * be paid, and otherwise exactly what the server reported. Shared by the
 * traveler booking checkout and the staff invoice card payment.
 */
export function PaymentFlowPanel(props: Props) {
  const { state, path, subject } = props;
  const view = state.view;
  const amount = view ? formatAmount(view.amountCents, view.currency) : '';

  if (state.phase === 'idle' || state.phase === 'starting') {
    return <LoadingState label="Preparing the payment…" />;
  }
  if (state.phase === 'unavailable') {
    return (
      <Alert tone="info" title="Card payments are not available">
        {state.message ?? 'Online payment is not set up on this deployment.'} No payment was
        started.
      </Alert>
    );
  }
  if (state.phase === 'error') {
    return (
      <Alert title="The payment could not continue">
        <p>{state.message}</p>
        <Button variant="secondary" className="mt-3" onClick={props.onStartOver}>
          Try again
        </Button>
      </Alert>
    );
  }

  const status = (
    <StatusLine
      state={state}
      amount={amount}
      subject={subject}
      onRefresh={props.onRefresh}
      onStartOver={props.onStartOver}
    />
  );
  if (!FORM_PHASES.includes(state.phase) || !view) return status;

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-700">
        Amount due: <span className="font-semibold text-gray-900">{amount}</span>
        <span className="text-gray-600"> — calculated by the server from the {subject}.</span>
      </p>
      {state.message && (
        <Alert
          tone={state.phase === 'action_required' ? 'info' : 'error'}
          title={
            state.phase === 'action_required' ? 'Verification needed' : 'Payment not completed'
          }
        >
          {state.message}
        </Alert>
      )}
      {path.kind === 'stripe' ? (
        view.clientSecret && props.returnUrl ? (
          <>
            {path.testMode && (
              <p className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-700">
                <ShieldCheck aria-hidden="true" className="h-3.5 w-3.5" /> Stripe test mode — use
                Stripe test cards only.
              </p>
            )}
            <StripePaymentForm
              publishableKey={path.publishableKey}
              clientSecret={view.clientSecret}
              returnUrl={props.returnUrl}
              amountLabel={amount}
              submitting={state.phase === 'submitting'}
              onSubmit={props.onStripeSubmit}
              onResult={props.onStripeResult}
              onLoadError={props.onLoadError}
            />
          </>
        ) : (
          <Alert tone="info" title="Continue this payment">
            <p>The secure form for this payment needs to be reopened.</p>
            <Button variant="secondary" className="mt-3" onClick={props.onStartOver}>
              Reopen the payment form
            </Button>
          </Alert>
        )
      ) : path.kind === 'sandbox' ? (
        <SandboxPaymentForm
          amountLabel={amount}
          busy={state.phase === 'submitting'}
          onComplete={props.onSandbox}
        />
      ) : (
        <Alert tone="info" title="Card payments are not available">
          {path.reason}
        </Alert>
      )}
    </div>
  );
}

function StatusLine({
  state,
  amount,
  subject,
  onRefresh,
  onStartOver,
}: {
  state: CheckoutState;
  amount: string;
  subject: string;
  onRefresh: () => void;
  onStartOver: () => void;
}) {
  switch (state.phase) {
    case 'verifying':
      return state.gaveUp ? (
        <Alert tone="info" title="Still confirming">
          <p>{state.message}</p>
          <Button variant="secondary" className="mt-3" onClick={onRefresh}>
            Check again
          </Button>
        </Alert>
      ) : (
        <div role="status" className="space-y-2">
          <LoadingState label="Confirming the payment with the payment provider…" />
          {state.message && <p className="text-center text-xs text-gray-600">{state.message}</p>}
        </div>
      );
    case 'processing':
      return (
        <Alert tone="info" title="Payment processing">
          <p>{state.message}</p>
          <Button variant="secondary" className="mt-3" onClick={onRefresh}>
            Check again
          </Button>
        </Alert>
      );
    case 'succeeded':
      return (
        <Alert tone="info" title="Payment confirmed">
          The server recorded {amount} for this {subject}.
        </Alert>
      );
    case 'refunded':
      return (
        <Alert tone="info" title="Payment refunded">
          This payment was refunded in full or in part. The {subject} shows the current balance.
        </Alert>
      );
    case 'on_hold':
      return (
        <Alert tone="info" title="Payment on hold">
          The payment provider reported a problem with this payment, so it is held for review. Do
          not pay again; the organization will contact you.
        </Alert>
      );
    case 'failed':
      return (
        <Alert title="Payment not completed">
          <p>{state.message ?? 'This attempt can no longer be paid. No money was taken.'}</p>
          <Button variant="secondary" className="mt-3" onClick={onStartOver}>
            Try again
          </Button>
        </Alert>
      );
    default:
      return null;
  }
}

/**
 * The development sandbox path. The API registers the sandbox gateway only
 * outside production (and refuses the completion route there), so this panel
 * can only appear on a development deployment — never as a fake success.
 */
export function SandboxPaymentForm({
  amountLabel,
  busy,
  onComplete,
}: {
  amountLabel: string;
  busy: boolean;
  onComplete: (scenario: 'succeed' | 'decline_at_capture') => void;
}) {
  return (
    <div className="border-gold-200 bg-gold-50 text-gold-800 space-y-3 rounded-lg border p-4 text-sm">
      <p className="inline-flex items-center gap-2 font-semibold">
        <FlaskConical aria-hidden="true" className="h-4 w-4" /> Development sandbox — no real card
        is charged
      </p>
      <p>
        This deployment runs the built-in sandbox payment gateway. Production servers refuse it, so
        this panel never appears there. The server records the outcome exactly as it would for a
        real provider.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button busy={busy} onClick={() => onComplete('succeed')}>
          Complete test payment of {amountLabel}
        </Button>
        <Button
          variant="secondary"
          disabled={busy}
          onClick={() => onComplete('decline_at_capture')}
        >
          Simulate a declined card
        </Button>
      </div>
    </div>
  );
}

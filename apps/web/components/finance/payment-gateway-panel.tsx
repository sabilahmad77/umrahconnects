'use client';

import { useEffect, useRef, useState } from 'react';
import { CreditCard } from 'lucide-react';
import { toast } from 'sonner';
import { apiErrorMessage } from '@/lib/api-error';
import { useCapabilities } from '@/hooks/use-capabilities';
import {
  invoicePaymentApi,
  useCancelPaymentIntent,
  usePaymentFlow,
  usePaymentProviders,
} from '@/hooks/use-payments';
import { Alert, Button, Input, LoadingState } from '@/components/ui/system';
import { ConfirmDialog, type ConfirmSpec } from '@/components/ui/confirm-dialog';
import {
  interpretConfirmResult,
  paymentPath,
  readReturn,
  returnUrlFor,
  withoutPaymentParam,
  withoutProviderParams,
} from './checkout-machine';
import { amountProblem, centsToInput, formatAmount, parseMajorToCents } from './money';
import { PaymentFlowPanel, type PaymentPath } from './payment-flow-panel';

export const PAYMENT_PARAM = 'payment';
const OPEN_ATTEMPT = ['PENDING', 'PROCESSING', 'AUTHORIZED'];
const PROVIDER_GATEWAYS = ['sandbox', 'stripe'];
const PAYABLE_INVOICE = ['ISSUED', 'SENT', 'PARTIALLY_PAID', 'OVERDUE'];

type Active =
  | { mode: 'new'; amountCents: number; idempotencyKey: string }
  | { mode: 'resume'; paymentId: string }
  | { mode: 'load'; paymentId: string; redirected: boolean };

/**
 * Card payment on an invoice (XT-R09 staff flow): the server caps the amount at
 * the outstanding balance, Stripe runs through the Payment Element (or the
 * labelled development sandbox), and the invoice updates only from the server.
 * Open attempts can be continued or cancelled instead of stacking new ones.
 */
export function PaymentGatewayPanel({
  invoice,
  onChanged,
}: {
  invoice: any;
  onChanged: () => void;
}) {
  const { ready, can } = useCapabilities();
  const providers = usePaymentProviders();
  const path = paymentPath(providers.data);
  const cancelAttempt = useCancelPaymentIntent();
  const [active, setActive] = useState<Active | null>(null);
  const [amount, setAmount] = useState('');
  const [amountError, setAmountError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<ConfirmSpec | null>(null);

  const currency = invoice.currency ?? 'SAR';
  const outstanding = Math.max(0, Number(invoice.totalCents ?? 0) - Number(invoice.paidCents ?? 0));
  const attempts: any[] = (Array.isArray(invoice.payments) ? invoice.payments : []).filter(
    (p: any) =>
      PROVIDER_GATEWAYS.includes(String(p.gateway)) && OPEN_ATTEMPT.includes(String(p.status)),
  );
  const reserved = attempts.reduce((sum, p) => sum + Number(p.amountCents ?? 0), 0);
  const available = Math.max(0, outstanding - reserved);
  const canCollect = can('finance:payment:process');

  // A reload or a return from a bank page reopens the attempt named in the address bar.
  useEffect(() => {
    const { paymentId, redirected } = readReturn(window.location.search, PAYMENT_PARAM);
    const cleaned = withoutProviderParams(window.location.search);
    if (cleaned !== window.location.search) {
      window.history.replaceState(
        window.history.state,
        '',
        `${window.location.pathname}${cleaned}`,
      );
    }
    if (paymentId) setActive({ mode: 'load', paymentId, redirected });
  }, []);

  useEffect(() => {
    if (!active) setAmount(available > 0 ? centsToInput(available) : '');
  }, [available, active]);

  const close = () => {
    setActive(null);
    const next = withoutPaymentParam(window.location.search, PAYMENT_PARAM);
    window.history.replaceState(window.history.state, '', `${window.location.pathname}${next}`);
    onChanged();
  };

  const begin = (event: React.FormEvent) => {
    event.preventDefault();
    const problem = amountProblem(amount, available, currency);
    setAmountError(problem);
    if (problem) return;
    // One idempotency key per attempt: a double submit or a retried request returns the same attempt.
    setActive({
      mode: 'new',
      amountCents: parseMajorToCents(amount)!,
      idempotencyKey: crypto.randomUUID(),
    });
  };

  const askCancel = (attempt: any) =>
    setConfirm({
      title: 'Cancel this payment attempt?',
      body: `The ${formatAmount(attempt.amountCents, attempt.currency ?? currency)} attempt is cancelled at the payment provider so it can no longer be paid, and its amount becomes available again.`,
      cta: 'Cancel attempt',
      tone: 'danger',
      onConfirm: async () => {
        try {
          await cancelAttempt.mutateAsync(attempt.id);
          toast.success('Payment attempt cancelled');
        } catch (error) {
          toast.error(apiErrorMessage(error, 'The attempt could not be cancelled.'));
        } finally {
          onChanged();
        }
      },
    });

  return (
    <section
      className="space-y-4 rounded-xl border border-gray-200 bg-white p-5"
      aria-labelledby="card-payment-title"
    >
      <h2
        id="card-payment-title"
        className="inline-flex items-center gap-2 text-sm font-bold text-gray-900"
      >
        <CreditCard aria-hidden="true" className="h-4 w-4" /> Card payment
      </h2>

      {!ready || providers.isLoading ? (
        <LoadingState label="Checking payment options…" />
      ) : !canCollect ? (
        <Alert tone="info" title="View only">
          Your account can see this invoice but cannot collect payments. Ask your workspace
          administrator for payment processing access.
        </Alert>
      ) : active ? (
        <InvoicePaymentFlow
          key={JSON.stringify(active)}
          invoiceId={invoice.id}
          active={active}
          path={path}
          onOutcome={onChanged}
          onClose={close}
        />
      ) : !PAYABLE_INVOICE.includes(String(invoice.status)) ? (
        <Alert tone="info" title="This invoice cannot take payments">
          {invoice.status === 'DRAFT'
            ? 'Issue the invoice before collecting a payment.'
            : invoice.status === 'PAID'
              ? 'The invoice is paid in full.'
              : `The invoice is ${String(invoice.status).toLowerCase()}.`}
        </Alert>
      ) : path.kind === 'unavailable' ? (
        <Alert tone="info" title="Card payments are not available">
          {path.reason} Record cash or bank transfers below instead.
        </Alert>
      ) : available <= 0 ? (
        <Alert tone="info" title="Nothing left to collect by card">
          {reserved > 0
            ? 'Open card attempts already cover the outstanding balance. Continue or cancel one below.'
            : 'The outstanding balance is zero.'}
        </Alert>
      ) : (
        <form onSubmit={begin} className="space-y-3" noValidate>
          <label
            className="block space-y-1 text-sm font-medium text-gray-700"
            htmlFor="card-amount"
          >
            Amount to charge ({currency})
          </label>
          <div className="flex flex-wrap items-start gap-2">
            <Input
              id="card-amount"
              inputMode="decimal"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              aria-invalid={!!amountError}
              aria-describedby="card-amount-help"
              className="w-40"
            />
            <Button type="submit">Continue to secure payment</Button>
          </div>
          <p id="card-amount-help" className="text-xs text-gray-600">
            Up to {formatAmount(available, currency)}
            {reserved > 0 ? ` (${formatAmount(reserved, currency)} is held by open attempts)` : ''}.
            The server checks the amount again.
          </p>
          {amountError && (
            <p role="alert" className="text-sm text-red-700">
              {amountError}
            </p>
          )}
        </form>
      )}

      {canCollect && attempts.length > 0 && !active && (
        <div className="space-y-2 border-t border-gray-100 pt-4">
          <p className="text-xs font-semibold text-gray-700">Open card attempts</p>
          <ul className="space-y-2">
            {attempts.map((attempt) => (
              <li
                key={attempt.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-gray-50 px-3 py-2 text-sm"
              >
                <span>
                  {formatAmount(attempt.amountCents, attempt.currency ?? currency)} ·{' '}
                  {String(attempt.status).toLowerCase()} · {attempt.gateway}
                  {attempt.createdAt ? ` · ${new Date(attempt.createdAt).toLocaleString()}` : ''}
                </span>
                <span className="flex gap-2">
                  <Button
                    variant="secondary"
                    onClick={() => setActive({ mode: 'resume', paymentId: attempt.id })}
                  >
                    Continue
                  </Button>
                  <Button
                    variant="quiet"
                    busy={cancelAttempt.isPending}
                    onClick={() => askCancel(attempt)}
                  >
                    Cancel attempt
                  </Button>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {confirm && <ConfirmDialog spec={confirm} onClose={() => setConfirm(null)} />}
    </section>
  );
}

function InvoicePaymentFlow({
  invoiceId,
  active,
  path,
  onOutcome,
  onClose,
}: {
  invoiceId: string;
  active: Active;
  path: PaymentPath;
  onOutcome: () => void;
  onClose: () => void;
}) {
  const flow = usePaymentFlow(
    invoicePaymentApi({
      invoiceId,
      amountCents: active.mode === 'new' ? active.amountCents : undefined,
      idempotencyKey: active.mode === 'new' ? active.idempotencyKey : undefined,
      resumeId: active.mode === 'resume' ? active.paymentId : undefined,
    }),
    { onOutcome },
  );
  const { state } = flow;
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    if (active.mode === 'load') void flow.load(active.paymentId, active.redirected);
    else void flow.start();
  }, [active, flow]);

  const paymentId = state.view?.paymentId;
  useEffect(() => {
    if (!paymentId) return;
    const next = returnUrlFor(window.location.href, PAYMENT_PARAM, paymentId);
    if (next !== window.location.href) window.history.replaceState(window.history.state, '', next);
  }, [paymentId]);

  return (
    <div className="space-y-3">
      <PaymentFlowPanel
        state={state}
        path={path}
        returnUrl={
          paymentId ? returnUrlFor(window.location.href, PAYMENT_PARAM, paymentId) : undefined
        }
        subject="invoice"
        onStripeSubmit={() => flow.send({ type: 'SUBMIT' })}
        onStripeResult={(result) =>
          flow.send({ type: 'CONFIRM_RESULT', outcome: interpretConfirmResult(result) })
        }
        onLoadError={(message) => flow.send({ type: 'LOAD_ERROR', message })}
        onSandbox={(scenario) => void flow.sandbox(scenario)}
        onRefresh={() => void flow.refresh()}
        onStartOver={onClose}
      />
      {state.phase !== 'submitting' && (
        <Button variant="quiet" onClick={onClose}>
          {['succeeded', 'refunded', 'failed', 'on_hold'].includes(state.phase)
            ? 'Done'
            : 'Close — the attempt stays open'}
        </Button>
      )}
    </div>
  );
}

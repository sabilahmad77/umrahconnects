'use client';

import { useState } from 'react';
import {
  CreditCard, Loader2, ShieldCheck, AlertTriangle, RotateCcw, Receipt, FlaskConical,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import {
  usePaymentProviders, useCreatePaymentIntent, useConfirmPaymentIntent,
  useRefundPayment, usePayment,
} from '@/hooks/use-payments';
import { ConfirmDialog, type ConfirmSpec } from '@/components/ui/confirm-dialog';

const apiError = (e: any) =>
  e?.response?.data?.error?.message ?? e?.response?.data?.message ?? 'Action failed';

const money = (cents: number, currency = 'SAR') =>
  `${currency} ${(Number(cents) / 100).toLocaleString(undefined, { minimumFractionDigits: 2 })}`;

/**
 * Gateway payments for one invoice. Sits alongside manual recording rather
 * than replacing it: cash and bank transfers are still recorded by hand,
 * while card payments go through the provider abstraction.
 */
export function PaymentGatewayPanel({
  invoiceId, currency, outstandingCents, onChanged,
}: {
  invoiceId: string;
  currency: string;
  outstandingCents: number;
  onChanged: () => void;
}) {
  const { data: status } = usePaymentProviders();
  const createIntent = useCreatePaymentIntent();
  const confirmIntent = useConfirmPaymentIntent();
  const refund = useRefundPayment();

  const [amount, setAmount] = useState('');
  const [scenario, setScenario] = useState('succeed');
  const [lastPaymentId, setLastPaymentId] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<ConfirmSpec | null>(null);
  const { data: lastPayment } = usePayment(lastPaymentId ?? undefined);

  const active = status?.providers.find((p) => p.name === status.active);
  const usable = !!active?.configured;
  const busy = createIntent.isPending || confirmIntent.isPending;

  const take = async () => {
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) { toast.error('Enter an amount greater than zero'); return; }
    try {
      const intent: any = await createIntent.mutateAsync({
        amount: value, currency, invoiceId,
        scenario: active?.sandbox ? scenario : undefined,
      });
      setLastPaymentId(intent.id);
      if (intent.status === 'FAILED') {
        toast.error(`Declined at authorisation: ${intent.failureReason ?? 'card declined'}`);
        onChanged();
        return;
      }
      const captured: any = await confirmIntent.mutateAsync({
        id: intent.id, scenario: active?.sandbox ? scenario : undefined,
      });
      if (captured.status === 'COMPLETED') {
        toast.success(`Captured ${money(captured.amountCents, currency)}`);
        setAmount('');
      } else {
        toast.error(`Payment ${captured.status}: ${captured.failureReason ?? ''}`);
      }
      onChanged();
    } catch (e: any) {
      toast.error(apiError(e));
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-5 space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h3 className="text-sm font-bold text-gray-900 inline-flex items-center gap-2">
          <CreditCard className="h-4 w-4 text-gray-500" /> Take a card payment
        </h3>
        {active && (
          <span className={cn(
            'inline-flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-full font-medium',
            active.sandbox ? 'bg-gold-50 text-gold-800' : usable ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600',
          )}>
            {active.sandbox ? <FlaskConical className="h-3 w-3" /> : <ShieldCheck className="h-3 w-3" />}
            {active.name}{active.sandbox ? ' (sandbox)' : ''}
          </span>
        )}
      </div>

      {/* Never let a sandbox capture read as a real one. */}
      {active?.sandbox && (
        <p className="text-[11px] text-gold-800 bg-gold-50 border border-gold-200 rounded-xl p-2.5">
          The sandbox gateway settles instantly and moves no real money. Set PAYMENT_PROVIDER to a live
          provider and supply its keys to take real card payments.
        </p>
      )}
      {active && !usable && (
        <p className="text-[11px] text-red-700 bg-red-50 border border-red-200 rounded-xl p-2.5 inline-flex items-start gap-2">
          <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
          <span>
            <span className="font-semibold">{active.name}</span> is selected but not configured.
            Missing: {active.missing.join(', ')}.
          </span>
        </p>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <label className="block">
          <span className="block text-xs font-semibold text-gray-600 mb-1">Amount ({currency})</span>
          <input
            type="number"
            min="0.01"
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            aria-label="Payment amount"
            placeholder={(outstandingCents / 100).toFixed(2)}
            className="w-full text-sm px-3 py-2.5 border border-gray-200 rounded-lg outline-none"
          />
          <span className="text-[11px] text-gray-500 mt-1 block">
            Outstanding {money(outstandingCents, currency)}
          </span>
        </label>

        {active?.sandbox && (
          <label className="block">
            <span className="block text-xs font-semibold text-gray-600 mb-1">Sandbox outcome</span>
            <select
              value={scenario}
              onChange={(e) => setScenario(e.target.value)}
              aria-label="Sandbox outcome"
              className="w-full text-sm px-3 py-2.5 border border-gray-200 rounded-lg outline-none bg-white"
            >
              <option value="succeed">Succeeds</option>
              <option value="decline_at_intent">Declines at authorisation</option>
              <option value="decline_at_capture">Declines at capture</option>
            </select>
          </label>
        )}

        <div className="flex items-end">
          <button
            onClick={take}
            disabled={busy || !usable || outstandingCents <= 0}
            className="w-full inline-flex items-center justify-center gap-2 text-sm px-4 py-2.5 bg-brand-500 text-white rounded-lg hover:bg-brand-600 disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CreditCard className="h-3.5 w-3.5" />}
            {outstandingCents <= 0 ? 'Nothing outstanding' : 'Authorise & capture'}
          </button>
        </div>
      </div>

      {/* The gateway trail for the payment just taken */}
      {lastPayment && (
        <div className="rounded-xl border border-gray-100 bg-gray-50 p-3">
          <div className="flex items-center justify-between gap-3 flex-wrap mb-2">
            <p className="text-xs font-semibold text-gray-700 inline-flex items-center gap-1.5">
              <Receipt className="h-3.5 w-3.5" />
              {money(lastPayment.amountCents, lastPayment.currency)} · {lastPayment.status}
              {Number(lastPayment.refundedCents) > 0 &&
                ` · ${money(lastPayment.refundedCents, lastPayment.currency)} refunded`}
            </p>
            {lastPayment.status === 'COMPLETED' || lastPayment.status === 'PARTIALLY_REFUNDED' ? (
              <button
                onClick={() => setConfirm({
                  title: 'Refund this payment?',
                  body: `The full remaining amount is returned through ${lastPayment.gateway} and the invoice balance is adjusted.`,
                  cta: 'Refund',
                  tone: 'danger',
                  reasonLabel: 'Reason for the refund',
                  reasonPlaceholder: 'Duplicate charge',
                  onConfirm: async (reason) => {
                    try {
                      await refund.mutateAsync({ id: lastPayment.id, reason });
                      toast.success('Refund processed');
                      onChanged();
                    } catch (e: any) { toast.error(apiError(e)); }
                  },
                })}
                className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border border-red-200 text-red-600 hover:bg-red-50"
              >
                <RotateCcw className="h-3.5 w-3.5" /> Refund
              </button>
            ) : null}
          </div>
          <ol className="space-y-1">
            {(lastPayment.transactions ?? []).map((t: any) => (
              <li key={t.id} className="text-[11px] text-gray-600 flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-brand-400 shrink-0" />
                <span className="font-mono">{t.type}</span>
                <span className="text-gray-500">
                  {new Date(t.createdAt).toLocaleTimeString()}
                  {t.providerRef ? ` · ${t.providerRef}` : ''}
                  {t.message ? ` · ${t.message}` : ''}
                </span>
              </li>
            ))}
          </ol>
        </div>
      )}

      {confirm && <ConfirmDialog spec={confirm} onClose={() => setConfirm(null)} />}
    </div>
  );
}

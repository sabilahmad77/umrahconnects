'use client';

import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { apiErrorMessage } from '@/lib/api-error';
import { Alert, Button, Dialog, Input } from '@/components/ui/system';
import { useRefundPayment as useGatewayRefund } from '@/hooks/use-payments';
import { useRefundPayment as useManualRefund } from '@/hooks/use-finance';
import {
  amountProblem,
  centsToInput,
  centsToMajor,
  formatAmount,
  parseMajorToCents,
} from './money';

const PROVIDER_GATEWAYS = ['sandbox', 'stripe'];

export const isGatewayPayment = (p: { gateway?: string | null }) =>
  PROVIDER_GATEWAYS.includes(String(p?.gateway ?? '').toLowerCase());

/** Captured money that can still be returned. */
export const refundableCents = (p: {
  amountCents?: number;
  refundedCents?: number;
  status?: string;
}) =>
  ['COMPLETED', 'PARTIALLY_REFUNDED'].includes(String(p.status))
    ? Math.max(0, Number(p.amountCents ?? 0) - Number(p.refundedCents ?? 0))
    : 0;

/**
 * Refund all or part of one payment. Card payments are refunded through their
 * provider (POST /payments/:id/refund); manual ones are recorded as refunded
 * (POST /finance/payments/:id/refund). The server re-checks the refundable
 * balance, so a stale screen can never refund more than was paid.
 */
export function RefundDialog({
  payment,
  onClose,
  onDone,
}: {
  payment: any;
  onClose: () => void;
  onDone: () => void;
}) {
  const gateway = isGatewayPayment(payment);
  const gatewayRefund = useGatewayRefund();
  const manualRefund = useManualRefund();
  const refundable = refundableCents(payment);
  const currency = payment.currency ?? 'SAR';
  const [amount, setAmount] = useState(centsToInput(refundable));
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (inFlight.current) return;
    const problem = amountProblem(amount, refundable, currency);
    if (problem) return setError(problem);
    if (reason.trim().length < 3)
      return setError('Give a short reason for the refund (at least 3 characters).');
    inFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      const body = {
        id: payment.id,
        amount: centsToMajor(parseMajorToCents(amount)!),
        reason: reason.trim(),
      };
      await (gateway ? gatewayRefund.mutateAsync(body) : manualRefund.mutateAsync(body));
      toast.success(gateway ? `Refund sent through ${payment.gateway}` : 'Refund recorded');
      onDone();
      onClose();
    } catch (e) {
      setError(apiErrorMessage(e, 'The refund could not be completed. Nothing was changed.'));
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
      title="Refund payment"
      description={
        gateway
          ? `The money goes back through ${payment.gateway} to the card that paid.`
          : 'Records money you returned outside the system (cash or bank transfer).'
      }
    >
      <form onSubmit={submit} className="space-y-4" noValidate>
        <p className="text-sm text-gray-700">
          Refundable: <span className="font-semibold">{formatAmount(refundable, currency)}</span> of{' '}
          {formatAmount(payment.amountCents, currency)}
        </p>
        <label className="block space-y-1 text-sm font-medium text-gray-700">
          <span>Amount ({currency})</span>
          <Input
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            aria-invalid={!!error}
          />
        </label>
        <label className="block space-y-1 text-sm font-medium text-gray-700">
          <span>Reason</span>
          <Input
            value={reason}
            maxLength={500}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Duplicate charge"
          />
        </label>
        {error && <Alert title="Refund not completed">{error}</Alert>}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" disabled={busy} onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="danger" busy={busy}>
            Refund
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

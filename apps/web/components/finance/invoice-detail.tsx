'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Building2,
  Calendar,
  CreditCard,
  Edit3,
  ListChecks,
  Receipt,
  User,
  Wallet,
} from 'lucide-react';
import { toast } from 'sonner';
import { apiErrorMessage } from '@/lib/api-error';
import { cn } from '@/lib/utils';
import { useCapabilities } from '@/hooks/use-capabilities';
import {
  useDeleteInvoice,
  useInvoice,
  useInvoiceTransition,
  useRecordPayment,
  useUpdateInvoice,
} from '@/hooks/use-finance';
import {
  Alert,
  Button,
  Input,
  LoadingState,
  QueryFailure,
  Select,
  Textarea,
} from '@/components/ui/system';
import { ConfirmDialog, type ConfirmSpec } from '@/components/ui/confirm-dialog';
import { PaymentGatewayPanel } from './payment-gateway-panel';
import { RefundDialog, isGatewayPayment, refundableCents } from './refund-dialog';
import { amountProblem, centsToInput, formatAmount, parseMajorToCents } from './money';

// Mirrors INVOICE_TRANSITIONS in the finance service. PAID and PARTIALLY_PAID are
// derived from recorded payments and are refused as manual moves, so they are
// never offered here.
const INVOICE_TRANSITIONS: Record<string, string[]> = {
  DRAFT: ['ISSUED', 'SENT', 'CANCELLED', 'VOID'],
  ISSUED: ['DRAFT', 'SENT', 'OVERDUE', 'CANCELLED', 'VOID'],
  SENT: ['DRAFT', 'ISSUED', 'OVERDUE', 'CANCELLED', 'VOID'],
  OVERDUE: ['ISSUED', 'SENT', 'CANCELLED', 'VOID'],
  PARTIALLY_PAID: ['OVERDUE', 'CANCELLED', 'VOID'],
  PAID: [],
  CANCELLED: [],
  VOID: [],
};

/** Lifecycle actions offered in the header, in order, with the words staff use. */
const ACTIONS: {
  status: 'ISSUED' | 'SENT' | 'OVERDUE' | 'VOID';
  label: string;
  confirm?: string;
}[] = [
  { status: 'ISSUED', label: 'Issue invoice' },
  {
    status: 'SENT',
    label: 'Mark as sent',
    confirm:
      'Mark this invoice as sent to the customer? Send it to them yourself; the system does not email it.',
  },
  { status: 'OVERDUE', label: 'Mark overdue' },
  {
    status: 'VOID',
    label: 'Void invoice',
    confirm:
      'Void this invoice? A void invoice takes no payments and cannot be reopened. Refund any money already received separately.',
  },
];

const MANUAL_METHODS = [
  { value: 'bank_transfer', label: 'Bank transfer' },
  { value: 'cash', label: 'Cash' },
  { value: 'card_terminal', label: 'Card (terminal)' },
  { value: 'cheque', label: 'Cheque' },
];

type TabKey = 'overview' | 'payments' | 'edit';

export function InvoiceDetail({ id }: { id: string }) {
  const router = useRouter();
  const { can } = useCapabilities();
  const { data: inv, isLoading, error, refetch } = useInvoice(id);
  const transition = useInvoiceTransition();
  const cancelDraft = useDeleteInvoice();
  const [tab, setTab] = useState<TabKey>(() =>
    typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('payment')
      ? 'payments'
      : 'overview',
  );
  const [confirm, setConfirm] = useState<ConfirmSpec | null>(null);

  if (error) return <QueryFailure error={error} onRetry={() => void refetch()} />;
  if (isLoading || !inv) return <LoadingState label="Loading invoice…" />;

  const currency = inv.currency ?? 'SAR';
  const canEdit = can('finance:invoice:create');
  const canApprove = can('finance:invoice:approve');
  const allowed = INVOICE_TRANSITIONS[String(inv.status)] ?? [];
  const actions = canApprove ? ACTIONS.filter((a) => allowed.includes(a.status)) : [];

  const move = (status: (typeof ACTIONS)[number]['status'], label: string) => async () => {
    try {
      const updated = await transition.mutateAsync({ id: inv.id, status });
      toast.success(
        `${label}: ${String(updated?.status ?? status)
          .replace(/_/g, ' ')
          .toLowerCase()}`,
      );
      void refetch();
    } catch (e) {
      toast.error(apiErrorMessage(e, 'The invoice could not be updated.'));
    }
  };

  const askMove = (action: (typeof ACTIONS)[number]) => {
    if (!action.confirm) return void move(action.status, action.label)();
    setConfirm({
      title: `${action.label}?`,
      body: action.confirm,
      cta: action.label,
      tone: action.status === 'VOID' ? 'danger' : 'default',
      onConfirm: move(action.status, action.label),
    });
  };

  const askCancelDraft = () =>
    setConfirm({
      title: 'Cancel this draft?',
      body: 'The draft is cancelled and leaves the list of open invoices. It was never issued to the customer.',
      cta: 'Cancel draft',
      tone: 'danger',
      onConfirm: async () => {
        try {
          await cancelDraft.mutateAsync(inv.id);
          toast.success('Draft cancelled');
          router.push('/finance');
        } catch (e) {
          toast.error(apiErrorMessage(e, 'The draft could not be cancelled.'));
        }
      },
    });

  return (
    <div className="space-y-5 pb-10">
      <div className="flex flex-wrap items-center gap-3">
        <Button
          variant="quiet"
          aria-label="Back to invoices"
          onClick={() => router.push('/finance')}
        >
          <ArrowLeft aria-hidden="true" className="h-4 w-4 text-gray-600" />
        </Button>
        <div className="bg-brand-50 flex h-12 w-12 items-center justify-center rounded-xl">
          <Receipt aria-hidden="true" className="text-brand-600 h-6 w-6" />
        </div>
        <div className="min-w-0 flex-1 basis-[calc(100%_-_140px)] sm:basis-auto">
          <h1 className="text-2xl font-bold text-gray-900">
            {inv.invoiceRef ?? inv.id.slice(0, 8)}
          </h1>
          <p className="text-sm text-gray-600">
            {formatAmount(inv.totalCents, currency)} · {inv.issuedToName}
          </p>
        </div>
        <StatusBadge status={inv.status} />
      </div>

      {(actions.length > 0 || (canEdit && inv.status === 'DRAFT')) && (
        <div className="flex flex-wrap gap-2" aria-label="Invoice actions">
          {actions.map((a) => (
            <Button
              key={a.status}
              variant={
                a.status === 'VOID' ? 'danger' : a.status === 'ISSUED' ? 'primary' : 'secondary'
              }
              busy={transition.isPending && transition.variables?.status === a.status}
              disabled={transition.isPending}
              onClick={() => askMove(a)}
            >
              {a.label}
            </Button>
          ))}
          {canEdit && inv.status === 'DRAFT' && (
            <Button variant="quiet" disabled={cancelDraft.isPending} onClick={askCancelDraft}>
              Cancel draft
            </Button>
          )}
        </div>
      )}

      <div
        role="tablist"
        aria-label="Invoice sections"
        className="flex gap-1 overflow-x-auto rounded-xl border border-gray-200 bg-white p-1.5"
      >
        {(['overview', 'payments', 'edit'] as TabKey[])
          .filter((t) => t !== 'edit' || canEdit)
          .map((t) => (
            <Button
              key={t}
              role="tab"
              aria-selected={tab === t}
              variant="quiet"
              onClick={() => setTab(t)}
              className={cn(
                'rounded-xl px-3 py-2 text-sm font-medium capitalize',
                tab === t
                  ? 'border-brand-100 bg-brand-50 text-brand-700 border'
                  : 'text-gray-600 hover:bg-gray-50',
              )}
            >
              {t}
            </Button>
          ))}
      </div>

      {tab === 'overview' && <Overview inv={inv} />}
      {tab === 'payments' && <PaymentsTab inv={inv} refetch={() => void refetch()} />}
      {tab === 'edit' && canEdit && <EditTab inv={inv} refetch={() => void refetch()} />}
      {confirm && <ConfirmDialog spec={confirm} onClose={() => setConfirm(null)} />}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const color =
    status === 'PAID'
      ? 'bg-green-50 text-green-700'
      : status === 'SENT' || status === 'ISSUED'
        ? 'bg-blue-50 text-blue-700'
        : status === 'PARTIALLY_PAID'
          ? 'bg-yellow-50 text-yellow-800'
          : status === 'OVERDUE'
            ? 'bg-red-50 text-red-700'
            : 'bg-gray-100 text-gray-700';
  return (
    <span
      data-testid="invoice-status"
      className={cn('rounded-full px-2 py-1 text-xs font-medium', color)}
    >
      {(status ?? '—').replace(/_/g, ' ')}
    </span>
  );
}

/**
 * issuedToAddress is a JSONB column: older rows hold a plain string, seeded
 * ones hold { line1, city, country, ... }. Rendering the object directly
 * threw "Objects are not valid as a React child", so flatten whatever arrives
 * (the customer's email is shown on its own line).
 */
function formatAddress(address: unknown): string {
  if (!address) return '';
  if (typeof address === 'string') return address;
  if (typeof address === 'object') {
    return Object.entries(address as Record<string, unknown>)
      .filter(([k, v]) => k !== 'email' && (typeof v === 'string' || typeof v === 'number'))
      .map(([, v]) => v)
      .join(', ');
  }
  return String(address);
}

function Overview({ inv }: { inv: any }) {
  const currency = inv.currency ?? 'SAR';
  const totalCents = Number(inv.totalCents ?? 0);
  const paidCents = Number(inv.paidCents ?? 0);
  const outstandingCents = Math.max(0, totalCents - paidCents);
  const overpaidCents = Math.max(0, paidCents - totalCents);
  const date = (v?: string | null) => (v ? new Date(v).toLocaleDateString() : '—');

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <div className="space-y-3 rounded-xl border border-gray-200 bg-white p-5 lg:col-span-2">
        <h2 className="inline-flex items-center gap-2 text-sm font-bold text-gray-900">
          <ListChecks aria-hidden="true" className="h-4 w-4" /> Invoice details
        </h2>
        <dl className="grid grid-cols-2 gap-3 text-sm">
          <Field label="Invoice #" value={inv.invoiceRef ?? '—'} />
          <Field label="Status" value={(inv.status ?? '—').replace(/_/g, ' ')} />
          <Field label="Type" value={inv.type ?? '—'} />
          <Field label="Currency" value={currency} />
          <Field label="Issue date" value={date(inv.issuedAt)} />
          <Field label="Due date" value={date(inv.dueAt)} />
          <Field label="Created" value={date(inv.createdAt)} />
          <Field label="Paid on" value={date(inv.paidAt)} />
        </dl>

        <div className="border-t border-gray-100 pt-3">
          <p className="mb-2 inline-flex items-center gap-1 text-xs font-semibold text-gray-600">
            <Wallet aria-hidden="true" className="h-3.5 w-3.5" /> Amounts (calculated by the server)
          </p>
          <dl className="grid grid-cols-2 gap-y-2 text-sm">
            <dt className="text-gray-600">Subtotal</dt>
            <dd className="text-right font-medium text-gray-900">
              {formatAmount(inv.subtotalCents, currency)}
            </dd>
            <dt className="text-gray-600">Tax</dt>
            <dd className="text-right font-medium text-gray-900">
              {formatAmount(inv.taxCents, currency)}
            </dd>
            {Number(inv.discountCents) > 0 && (
              <>
                <dt className="text-gray-600">Discount</dt>
                <dd className="text-right font-medium text-gray-900">
                  -{formatAmount(inv.discountCents, currency)}
                </dd>
              </>
            )}
            <dt className="border-t border-gray-100 pt-1 font-semibold text-gray-700">Total</dt>
            <dd className="border-t border-gray-100 pt-1 text-right font-bold text-gray-900">
              {formatAmount(totalCents, currency)}
            </dd>
            <dt className="text-green-800">Paid</dt>
            <dd className="text-right font-medium text-green-800" data-testid="invoice-paid">
              {formatAmount(paidCents, currency)}
            </dd>
            <dt className="font-semibold text-gray-700">Outstanding</dt>
            <dd
              className={cn(
                'text-right font-bold',
                outstandingCents > 0 ? 'text-red-700' : 'text-gray-600',
              )}
              data-testid="invoice-outstanding"
            >
              {formatAmount(outstandingCents, currency)}
            </dd>
          </dl>
          {overpaidCents > 0 && (
            <div className="mt-3">
              <Alert title="Overpaid">
                {formatAmount(overpaidCents, currency)} more than the total was received. Refund the
                difference from the payments tab.
              </Alert>
            </div>
          )}
        </div>

        {inv.notes && (
          <div className="border-t border-gray-100 pt-3">
            <p className="mb-1 text-xs font-semibold text-gray-600">Notes</p>
            <p className="whitespace-pre-wrap text-sm text-gray-700">{inv.notes}</p>
          </div>
        )}
      </div>

      <div className="space-y-3">
        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <p className="mb-2 inline-flex items-center gap-1 text-xs font-semibold text-gray-600">
            <User aria-hidden="true" className="h-3.5 w-3.5" /> Customer
          </p>
          <div className="space-y-1.5 text-sm">
            <p className="font-medium text-gray-900">{inv.issuedToName ?? '—'}</p>
            {inv.issuedToEmail && <p className="text-xs text-gray-600">{inv.issuedToEmail}</p>}
            {formatAddress(inv.issuedToAddress) && (
              <p className="whitespace-pre-wrap text-xs text-gray-600">
                {formatAddress(inv.issuedToAddress)}
              </p>
            )}
          </div>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <p className="mb-2 inline-flex items-center gap-1 text-xs font-semibold text-gray-600">
            <Building2 aria-hidden="true" className="h-3.5 w-3.5" /> Booking
          </p>
          {inv.bookingId ? (
            <Link
              href={`/bookings/${inv.bookingId}`}
              className="text-brand-600 text-xs hover:underline"
            >
              Open the linked booking →
            </Link>
          ) : (
            <p className="text-xs text-gray-600">No booking linked</p>
          )}
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <p className="mb-2 inline-flex items-center gap-1 text-xs font-semibold text-gray-600">
            <Calendar aria-hidden="true" className="h-3.5 w-3.5" /> Key dates
          </p>
          <ul className="space-y-1.5 text-xs text-gray-700">
            <li>Issued: {date(inv.issuedAt)}</li>
            <li>Due: {date(inv.dueAt)}</li>
            <li>Paid: {date(inv.paidAt)}</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

function PaymentsTab({ inv, refetch }: { inv: any; refetch: () => void }) {
  const { can } = useCapabilities();
  const canCollect = can('finance:payment:process');
  const canRefund = can('finance:payment:refund');
  const payments: any[] = Array.isArray(inv.payments) ? inv.payments : [];
  const currency = inv.currency ?? 'SAR';
  const outstandingCents = Math.max(0, Number(inv.totalCents ?? 0) - Number(inv.paidCents ?? 0));
  const [refunding, setRefunding] = useState<any | null>(null);

  return (
    <div className="space-y-4">
      <PaymentGatewayPanel invoice={inv} onChanged={refetch} />
      <RecordPaymentForm
        inv={inv}
        canCollect={canCollect}
        outstandingCents={outstandingCents}
        onRecorded={refetch}
      />

      <div className="rounded-xl border border-gray-200 bg-white">
        <div className="border-b border-gray-200 p-4">
          <h2 className="inline-flex items-center gap-2 text-sm font-bold text-gray-900">
            <CreditCard aria-hidden="true" className="h-4 w-4" /> Payments ({payments.length})
          </h2>
        </div>
        {payments.length === 0 ? (
          <div className="py-10 text-center text-sm text-gray-600">No payments recorded yet.</div>
        ) : (
          <div
            role="region"
            aria-label="Invoice payments"
            tabIndex={0}
            className="max-w-full overflow-x-auto"
          >
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs font-semibold text-gray-600">
                  <th className="px-5 py-3">Date</th>
                  <th className="px-5 py-3">Method</th>
                  <th className="hidden px-5 py-3 md:table-cell">Reference</th>
                  <th className="px-5 py-3 text-right">Amount</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {payments.map((p: any) => {
                  const at = p.paidAt ?? p.createdAt;
                  const refundable = refundableCents(p);
                  return (
                    <tr key={p.id} className="hover:bg-gray-50/60">
                      <td className="px-5 py-3.5 text-sm text-gray-700">
                        {at ? new Date(at).toLocaleString() : '—'}
                      </td>
                      <td className="px-5 py-3.5 text-sm capitalize text-gray-700">
                        {String(p.gateway ?? '—').replace(/_/g, ' ')}
                        {isGatewayPayment(p) && (
                          <span className="ml-1 text-xs text-gray-600">(card)</span>
                        )}
                      </td>
                      <td className="hidden max-w-[200px] truncate px-5 py-3.5 font-mono text-xs text-gray-600 md:table-cell">
                        {p.gatewayRef ?? '—'}
                      </td>
                      <td className="px-5 py-3.5 text-right text-sm font-semibold text-gray-900">
                        {formatAmount(p.amountCents, p.currency ?? currency)}
                        {Number(p.refundedCents) > 0 && (
                          <span className="block text-xs font-normal text-red-700">
                            −{formatAmount(p.refundedCents, p.currency ?? currency)} refunded
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-3.5">
                        <span
                          className={cn(
                            'rounded-full px-2 py-1 text-xs font-medium',
                            p.status === 'COMPLETED'
                              ? 'bg-green-50 text-green-700'
                              : ['PENDING', 'PROCESSING'].includes(p.status)
                                ? 'bg-yellow-50 text-yellow-800'
                                : p.status === 'FAILED' || p.status === 'DISPUTED'
                                  ? 'bg-red-50 text-red-700'
                                  : 'bg-gray-100 text-gray-700',
                          )}
                        >
                          {String(p.status).replace(/_/g, ' ')}
                        </span>
                        {p.status === 'FAILED' && p.failureReason && (
                          <span className="block text-xs text-gray-600">
                            {String(p.failureReason).replace(/_/g, ' ')}
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        {canRefund && refundable > 0 && (
                          <Button
                            variant="quiet"
                            onClick={() => setRefunding(p)}
                            aria-label={`Refund payment of ${formatAmount(p.amountCents, p.currency ?? currency)}`}
                          >
                            Refund
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {!canRefund && payments.some((p) => refundableCents(p) > 0) && (
          <p className="border-t border-gray-100 px-5 py-3 text-xs text-gray-600">
            Refunds need the refund permission. Ask your workspace administrator.
          </p>
        )}
      </div>
      {refunding && (
        <RefundDialog payment={refunding} onClose={() => setRefunding(null)} onDone={refetch} />
      )}
    </div>
  );
}

/** Cash, bank transfers and card-terminal payments taken outside the system. */
function RecordPaymentForm({
  inv,
  canCollect,
  outstandingCents,
  onRecorded,
}: {
  inv: any;
  canCollect: boolean;
  outstandingCents: number;
  onRecorded: () => void;
}) {
  const record = useRecordPayment();
  const currency = inv.currency ?? 'SAR';
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('bank_transfer');
  const [reference, setReference] = useState('');
  const [paidOn, setPaidOn] = useState(() => new Date().toISOString().slice(0, 10));
  const [error, setError] = useState<string | null>(null);
  // One key per recording: a double click or a retried request is recorded once.
  const key = useRef<string>(crypto.randomUUID());
  const open =
    ['ISSUED', 'SENT', 'PARTIALLY_PAID', 'OVERDUE'].includes(String(inv.status)) &&
    outstandingCents > 0;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (record.isPending) return;
    const value = amount.trim() === '' ? centsToInput(outstandingCents) : amount;
    const problem = amountProblem(value, outstandingCents, currency);
    if (problem) return setError(problem);
    if (paidOn > new Date().toISOString().slice(0, 10))
      return setError('The payment date cannot be in the future.');
    setError(null);
    try {
      const saved = await record.mutateAsync({
        id: inv.id,
        amountCents: parseMajorToCents(value)!,
        method,
        referenceNumber: reference.trim() || undefined,
        paidAt: new Date(`${paidOn}T12:00:00`).toISOString(),
        idempotencyKey: key.current,
      });
      toast.success(
        saved?.idempotentReplay ? 'This payment was already recorded' : 'Payment recorded',
      );
      key.current = crypto.randomUUID();
      setAmount('');
      setReference('');
      onRecorded();
    } catch (e) {
      setError(apiErrorMessage(e, 'The payment could not be recorded.'));
    }
  };

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-bold text-gray-900">
          Record a payment received outside the system
        </h2>
        <span className="text-xs text-gray-600">
          Outstanding:{' '}
          <span className="font-semibold text-gray-900">
            {formatAmount(outstandingCents, currency)}
          </span>
        </span>
      </div>
      {!canCollect ? (
        <p className="text-sm text-gray-600">
          Your account can view payments but cannot record them.
        </p>
      ) : !open ? (
        <p className="text-sm text-gray-600">
          {inv.status === 'DRAFT'
            ? 'Issue this invoice before recording a payment.'
            : outstandingCents <= 0
              ? 'Nothing is outstanding on this invoice.'
              : `This invoice is ${String(inv.status).toLowerCase()} and cannot take payments.`}
        </p>
      ) : (
        <form onSubmit={submit} className="grid grid-cols-1 gap-3 sm:grid-cols-5" noValidate>
          <label className="block text-xs font-semibold text-gray-600">
            Amount ({currency})
            <Input
              inputMode="decimal"
              value={amount}
              placeholder={centsToInput(outstandingCents)}
              onChange={(e) => setAmount(e.target.value)}
              className="mt-1"
            />
          </label>
          <label className="block text-xs font-semibold text-gray-600">
            Method
            <Select value={method} onChange={(e) => setMethod(e.target.value)} className="mt-1">
              {MANUAL_METHODS.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </Select>
          </label>
          <label className="block text-xs font-semibold text-gray-600">
            Received on
            <Input
              type="date"
              value={paidOn}
              max={new Date().toISOString().slice(0, 10)}
              onChange={(e) => setPaidOn(e.target.value)}
              className="mt-1"
            />
          </label>
          <label className="block text-xs font-semibold text-gray-600">
            Reference
            <Input
              value={reference}
              maxLength={200}
              placeholder="e.g. TXN-1234"
              onChange={(e) => setReference(e.target.value)}
              className="mt-1"
            />
          </label>
          <div className="flex items-end">
            <Button type="submit" busy={record.isPending} className="w-full">
              Record payment
            </Button>
          </div>
          {error && (
            <p role="alert" className="text-sm text-red-700 sm:col-span-5">
              {error}
            </p>
          )}
        </form>
      )}
    </div>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-semibold text-gray-600">{label}</dt>
      <dd className="text-sm font-medium text-gray-900">{value ?? '—'}</dd>
    </div>
  );
}

/**
 * What an editor may change. While DRAFT the billed amounts can still be
 * corrected; once issued they are fixed (void and issue a new invoice), so only
 * the due date, notes and contact details stay editable.
 */
function EditTab({ inv, refetch }: { inv: any; refetch: () => void }) {
  const update = useUpdateInvoice();
  const draft = inv.status === 'DRAFT';
  const closed = ['PAID', 'VOID', 'CANCELLED'].includes(String(inv.status));
  const [form, setForm] = useState({
    issuedToName: inv.issuedToName ?? '',
    email: inv.issuedToEmail ?? '',
    subtotal: centsToInput(Number(inv.subtotalCents ?? 0)),
    tax: centsToInput(Number(inv.taxCents ?? 0)),
    dueDate: inv.dueAt ? String(inv.dueAt).slice(0, 10) : '',
    notes: inv.notes ?? '',
  });
  const [error, setError] = useState<string | null>(null);
  const set =
    (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm((f) => ({ ...f, [k]: e.target.value }));

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (update.isPending) return;
    const body: Record<string, unknown> = {
      id: inv.id,
      notes: form.notes,
      dueDate: form.dueDate || null,
    };
    if (!form.issuedToName.trim()) return setError('The customer name is required.');
    body.issuedToName = form.issuedToName.trim();
    if (form.email.trim()) {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim()))
        return setError('Enter a valid email address.');
      body.counterpartyEmail = form.email.trim();
    }
    if (draft) {
      const subtotal = parseMajorToCents(form.subtotal);
      const tax = parseMajorToCents(form.tax || '0');
      if (subtotal === null || subtotal <= 0)
        return setError('The subtotal must be greater than zero.');
      if (tax === null) return setError('Enter the tax as an amount such as 15 or 15.50.');
      body.subtotalCents = subtotal;
      body.taxCents = tax;
    }
    setError(null);
    try {
      await update.mutateAsync(body as any);
      toast.success('Invoice saved');
      refetch();
    } catch (e) {
      setError(apiErrorMessage(e, 'The invoice could not be saved.'));
    }
  };

  if (closed) {
    return (
      <Alert tone="info" title="This invoice is closed">
        A {String(inv.status).toLowerCase()} invoice cannot be edited.
      </Alert>
    );
  }
  return (
    <form
      onSubmit={save}
      className="max-w-3xl space-y-3 rounded-xl border border-gray-200 bg-white p-5"
      noValidate
    >
      <h2 className="inline-flex items-center gap-2 text-sm font-bold text-gray-900">
        <Edit3 aria-hidden="true" className="h-4 w-4" /> Edit invoice
      </h2>
      {!draft && (
        <p className="text-xs text-gray-600">
          Amounts are fixed once an invoice is issued. To change them, void this invoice and issue a
          new one.
        </p>
      )}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <FormField label="Customer name">
          <Input value={form.issuedToName} maxLength={200} onChange={set('issuedToName')} />
        </FormField>
        <FormField label="Customer email">
          <Input type="email" value={form.email} maxLength={255} onChange={set('email')} />
        </FormField>
        <FormField label={`Subtotal (${inv.currency ?? 'SAR'})`}>
          <Input
            inputMode="decimal"
            value={form.subtotal}
            disabled={!draft}
            onChange={set('subtotal')}
          />
        </FormField>
        <FormField label={`Tax (${inv.currency ?? 'SAR'})`}>
          <Input inputMode="decimal" value={form.tax} disabled={!draft} onChange={set('tax')} />
        </FormField>
        <FormField label="Due date">
          <Input type="date" value={form.dueDate} onChange={set('dueDate')} />
        </FormField>
        <FormField label="Notes" full>
          <Textarea value={form.notes} maxLength={5000} onChange={set('notes')} rows={3} />
        </FormField>
      </div>
      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
      <div className="flex justify-end">
        <Button type="submit" busy={update.isPending}>
          Save invoice
        </Button>
      </div>
    </form>
  );
}

function FormField({
  label,
  children,
  full = false,
}: {
  label: string;
  children: React.ReactNode;
  full?: boolean;
}) {
  return (
    <label className={cn('block', full && 'sm:col-span-2')}>
      <span className="mb-1 block text-xs font-semibold text-gray-600">{label}</span>
      {children}
    </label>
  );
}

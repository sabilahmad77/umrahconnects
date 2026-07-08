'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft, Loader2, AlertCircle, Save, Edit3, Trash2,
  ListChecks, Calendar, Wallet, CheckCircle2, XCircle, CreditCard,
  Receipt, User, Building2, Plus,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useInvoice, useUpdateInvoice, useDeleteInvoice, useMarkInvoicePaid } from '@/hooks/use-finance';

const INVOICE_STATUSES = ['DRAFT', 'SENT', 'PAID', 'OVERDUE', 'CANCELLED', 'VOID'];

type TabKey = 'overview' | 'payments' | 'edit';

export function InvoiceDetail({ id }: { id: string }) {
  const router = useRouter();
  const { data: inv, isLoading, error, refetch } = useInvoice(id);
  const [tab, setTab] = useState<TabKey>('overview');

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20 text-gray-400 text-sm">
        <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading invoice…
      </div>
    );
  }
  if (error || !inv) {
    return (
      <div className="py-20 text-center bg-white rounded-2xl border border-gray-100">
        <AlertCircle className="h-10 w-10 mx-auto mb-3 text-red-400 opacity-60" />
        <p className="text-sm text-red-500">Invoice not found</p>
        <Link href="/finance" className="text-xs text-brand-500 hover:underline mt-3 inline-block">← Back to finance</Link>
      </div>
    );
  }

  const invoiceNumber = inv.invoiceNumber ?? inv.invoiceRef ?? (inv.id ? inv.id.slice(0, 8) : '—');
  const currency = inv.currency ?? 'SAR';
  const totalCents = Number(inv.totalAmountCents ?? inv.totalCents ?? 0);

  return (
    <div className="space-y-5 pb-10">
      <div className="flex items-center gap-3 flex-wrap">
        <button onClick={() => router.push('/finance')} className="p-2 rounded-xl border border-gray-200 hover:bg-gray-50">
          <ArrowLeft className="h-4 w-4 text-gray-500" />
        </button>
        <div className="w-12 h-12 rounded-xl bg-brand-50 flex items-center justify-center">
          <Receipt className="h-6 w-6 text-brand-600" />
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-bold text-gray-900 truncate">{invoiceNumber}</h1>
          <p className="text-sm text-gray-500">
            {formatMoney(totalCents, currency)}
            {inv.issuedToName || inv.customerName ? ` · ${inv.issuedToName ?? inv.customerName}` : ''}
          </p>
        </div>
        <StatusBadge status={inv.status} />
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 p-1.5 flex gap-1 overflow-x-auto">
        {(['overview', 'payments', 'edit'] as TabKey[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              'capitalize px-3 py-2 rounded-xl text-sm font-medium transition-colors',
              tab === t ? 'bg-brand-50 text-brand-700 border border-brand-100' : 'text-gray-500 hover:bg-gray-50',
            )}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === 'overview' && <Overview inv={inv} />}
      {tab === 'payments' && <PaymentsTab inv={inv} />}
      {tab === 'edit' && <EditTab inv={inv} refetch={refetch} />}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const color =
    status === 'PAID' ? 'bg-green-50 text-green-700' :
    status === 'SENT' || status === 'ISSUED' ? 'bg-blue-50 text-blue-700' :
    status === 'PARTIALLY_PAID' ? 'bg-yellow-50 text-yellow-700' :
    status === 'DRAFT' ? 'bg-gray-100 text-gray-600' :
    status === 'OVERDUE' ? 'bg-red-50 text-red-600' :
    status === 'CANCELLED' || status === 'VOID' ? 'bg-gray-100 text-gray-500' :
    'bg-gray-100 text-gray-500';
  return <span className={cn('text-[11px] font-medium px-2 py-1 rounded-full', color)}>{(status ?? '—').replace(/_/g, ' ')}</span>;
}

function Overview({ inv }: { inv: any }) {
  const currency = inv.currency ?? 'SAR';
  const subtotalCents = Number(inv.subtotalCents ?? 0);
  const taxCents = Number(inv.taxCents ?? 0);
  const discountCents = Number(inv.discountCents ?? 0);
  const totalCents = Number(inv.totalAmountCents ?? inv.totalCents ?? 0);
  const paidCents = Number(inv.paidAmountCents ?? inv.paidCents ?? 0);
  const outstandingCents = Math.max(0, totalCents - paidCents);

  const issueDate = inv.issueDate ?? inv.issuedAt;
  const dueDate = inv.dueDate ?? inv.dueAt;
  const customerName = inv.customerName ?? inv.issuedToName ?? '—';
  const customerEmail = inv.customerEmail ?? inv.issuedToEmail ?? null;
  const bookingRef = inv.bookingRef ?? inv.booking?.code ?? inv.bookingId ?? null;
  const packageName = inv.package?.name ?? inv.booking?.package?.name ?? null;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <div className="bg-white rounded-2xl border border-gray-100 p-5 lg:col-span-2 space-y-3">
        <h3 className="text-sm font-bold text-gray-900 inline-flex items-center gap-2">
          <ListChecks className="h-4 w-4" /> Invoice details
        </h3>
        <dl className="grid grid-cols-2 gap-3 text-sm">
          <Field label="Invoice #" value={inv.invoiceNumber ?? inv.invoiceRef ?? '—'} />
          <Field label="Status" value={(inv.status ?? '—').replace(/_/g, ' ')} />
          <Field label="Type" value={inv.type ?? '—'} />
          <Field label="Currency" value={currency} />
          <Field label="Issue date" value={issueDate ? new Date(issueDate).toLocaleDateString() : '—'} />
          <Field label="Due date" value={dueDate ? new Date(dueDate).toLocaleDateString() : '—'} />
          <Field label="Created" value={inv.createdAt ? new Date(inv.createdAt).toLocaleDateString() : '—'} />
          <Field label="Paid on" value={inv.paidAt ? new Date(inv.paidAt).toLocaleDateString() : '—'} />
        </dl>

        <div className="pt-3 border-t border-gray-50">
          <p className="text-xs font-semibold text-gray-600 mb-2 inline-flex items-center gap-1">
            <Wallet className="h-3.5 w-3.5" /> Amounts
          </p>
          <dl className="grid grid-cols-2 gap-y-2 text-sm">
            <dt className="text-gray-500">Subtotal</dt>
            <dd className="text-right text-gray-900 font-medium">{formatMoney(subtotalCents, currency)}</dd>

            <dt className="text-gray-500">Tax</dt>
            <dd className="text-right text-gray-900 font-medium">{formatMoney(taxCents, currency)}</dd>

            {discountCents > 0 && (
              <>
                <dt className="text-gray-500">Discount</dt>
                <dd className="text-right text-gray-900 font-medium">-{formatMoney(discountCents, currency)}</dd>
              </>
            )}

            <dt className="text-gray-700 font-semibold pt-1 border-t border-gray-50">Total</dt>
            <dd className="text-right text-gray-900 font-bold pt-1 border-t border-gray-50">{formatMoney(totalCents, currency)}</dd>

            <dt className="text-green-700">Paid</dt>
            <dd className="text-right text-green-700 font-medium">{formatMoney(paidCents, currency)}</dd>

            <dt className="text-gray-700 font-semibold">Outstanding</dt>
            <dd className={cn('text-right font-bold', outstandingCents > 0 ? 'text-red-600' : 'text-gray-400')}>
              {formatMoney(outstandingCents, currency)}
            </dd>
          </dl>
        </div>

        {inv.notes && (
          <div className="pt-3 border-t border-gray-50">
            <p className="text-xs font-semibold text-gray-600 mb-1">Notes</p>
            <p className="text-sm text-gray-700 whitespace-pre-wrap">{inv.notes}</p>
          </div>
        )}
      </div>

      <div className="space-y-3">
        <div className="bg-white rounded-2xl border border-gray-100 p-5">
          <p className="text-xs font-semibold text-gray-500 mb-2 inline-flex items-center gap-1">
            <User className="h-3.5 w-3.5" /> Customer
          </p>
          <div className="space-y-1.5 text-sm">
            <p className="font-medium text-gray-900">{customerName}</p>
            {customerEmail && <p className="text-xs text-gray-500">{customerEmail}</p>}
            {inv.issuedToAddress && (
              <p className="text-xs text-gray-500 whitespace-pre-wrap">{inv.issuedToAddress}</p>
            )}
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 p-5">
          <p className="text-xs font-semibold text-gray-500 mb-2 inline-flex items-center gap-1">
            <Building2 className="h-3.5 w-3.5" /> Booking / Package
          </p>
          {bookingRef || packageName ? (
            <div className="space-y-1 text-sm">
              {packageName && <p className="font-medium text-gray-900">{packageName}</p>}
              {bookingRef && (
                <Link href={`/bookings/${inv.bookingId ?? bookingRef}`} className="text-xs text-brand-600 hover:underline inline-block">
                  Booking ref: {bookingRef} →
                </Link>
              )}
            </div>
          ) : (
            <p className="text-xs text-gray-400">No booking linked</p>
          )}
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 p-5">
          <p className="text-xs font-semibold text-gray-500 mb-2 inline-flex items-center gap-1">
            <Calendar className="h-3.5 w-3.5" /> Key dates
          </p>
          <ul className="space-y-1.5 text-xs">
            <li><span className="text-gray-400">Issued:</span> <span className="text-gray-700">{issueDate ? new Date(issueDate).toLocaleDateString() : '—'}</span></li>
            <li><span className="text-gray-400">Due:</span> <span className="text-gray-700">{dueDate ? new Date(dueDate).toLocaleDateString() : '—'}</span></li>
            <li><span className="text-gray-400">Paid:</span> <span className="text-gray-700">{inv.paidAt ? new Date(inv.paidAt).toLocaleDateString() : '—'}</span></li>
          </ul>
        </div>
      </div>
    </div>
  );
}

function PaymentsTab({ inv }: { inv: any }) {
  const payments: any[] = Array.isArray(inv.payments) ? inv.payments : [];
  const currency = inv.currency ?? 'SAR';
  const totalCents = Number(inv.totalCents ?? 0);
  const paidCents = Number(inv.paidCents ?? 0);
  const outstandingCents = Math.max(0, totalCents - paidCents);
  const isSettled = inv.status === 'PAID' || inv.status === 'CANCELLED' || inv.status === 'VOID';

  // FIX-06: record a payment against this invoice. Backend derives invoice status
  // (DRAFT→SENT→PARTIAL→PAID) from the cumulative paid total and recalculates outstanding.
  const record = useMarkInvoicePaid();
  const [amount, setAmount] = useState<string>('');
  const [method, setMethod] = useState('bank_transfer');
  const [reference, setReference] = useState('');

  const submit = async () => {
    const sar = Number(amount || (outstandingCents / 100));
    if (!sar || sar <= 0) { toast.error('Enter a payment amount'); return; }
    if (sar * 100 > outstandingCents + 1) { toast.error(`Amount exceeds outstanding (${formatMoney(outstandingCents, currency)})`); return; }
    try {
      await record.mutateAsync({ id: inv.id, amountCents: Math.round(sar * 100), method, referenceNumber: reference || undefined });
      toast.success('Payment recorded');
      setAmount(''); setReference('');
    } catch (e: any) {
      toast.error(e?.response?.data?.error?.message ?? 'Could not record payment');
    }
  };

  return (
    <div className="space-y-4">
      {/* Record payment form */}
      <div className="bg-white rounded-2xl border border-gray-100 p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-bold text-gray-900 inline-flex items-center gap-2"><CreditCard className="h-4 w-4" /> Record a payment</h3>
          <span className="text-xs text-gray-500">Outstanding: <span className="font-semibold text-gray-900">{formatMoney(outstandingCents, currency)}</span></span>
        </div>
        {isSettled ? (
          <p className="text-sm text-gray-400 py-2">This invoice is {String(inv.status).toLowerCase()} — no further payments needed.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <div className="sm:col-span-1">
              <label className="block text-[11px] font-semibold text-gray-500 mb-1">Amount ({currency})</label>
              <input type="number" min={0} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)}
                placeholder={(outstandingCents / 100).toString()}
                className="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg outline-none focus:border-brand-400" />
            </div>
            <div className="sm:col-span-1">
              <label className="block text-[11px] font-semibold text-gray-500 mb-1">Method</label>
              <select value={method} onChange={(e) => setMethod(e.target.value)} className="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg outline-none bg-white focus:border-brand-400">
                <option value="bank_transfer">Bank transfer</option>
                <option value="cash">Cash</option>
                <option value="card">Card</option>
                <option value="cheque">Cheque</option>
                <option value="online">Online</option>
              </select>
            </div>
            <div className="sm:col-span-1">
              <label className="block text-[11px] font-semibold text-gray-500 mb-1">Reference</label>
              <input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="e.g. TXN-1234"
                className="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg outline-none focus:border-brand-400" />
            </div>
            <div className="sm:col-span-1 flex items-end">
              <button onClick={submit} disabled={record.isPending}
                className="w-full inline-flex items-center justify-center gap-2 bg-brand-500 hover:bg-brand-600 text-white text-sm font-semibold py-2 rounded-lg transition-colors disabled:opacity-60">
                {record.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Record
              </button>
            </div>
          </div>
        )}
      </div>

    <div className="bg-white rounded-2xl border border-gray-100">
      <div className="p-4 border-b border-gray-100">
        <h3 className="text-sm font-bold text-gray-900 inline-flex items-center gap-2">
          <CreditCard className="h-4 w-4" /> Payments ({payments.length})
        </h3>
      </div>
      {payments.length === 0 ? (
        <div className="py-10 text-center text-sm text-gray-400">No payments recorded yet — use the form above.</div>
      ) : (
        <table className="w-full">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-100">
              <th className="text-left text-xs font-semibold text-gray-500 px-5 py-3">Date</th>
              <th className="text-left text-xs font-semibold text-gray-500 px-5 py-3">Method</th>
              <th className="text-left text-xs font-semibold text-gray-500 px-5 py-3 hidden md:table-cell">Reference</th>
              <th className="text-right text-xs font-semibold text-gray-500 px-5 py-3">Amount</th>
              <th className="text-left text-xs font-semibold text-gray-500 px-5 py-3">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {payments.map((p: any, i: number) => {
              const at = p.paidAt ?? p.createdAt;
              const method = p.method ?? p.gateway ?? '—';
              const ref = p.referenceNumber ?? p.gatewayRef ?? p.idempotencyKey ?? '—';
              const amountCents = Number(p.amountCents ?? p.amount ?? 0);
              const status = p.status ?? '—';
              return (
                <tr key={p.id ?? i} className="hover:bg-gray-50/60">
                  <td className="px-5 py-3.5 text-sm text-gray-700">
                    {at ? new Date(at).toLocaleString() : '—'}
                  </td>
                  <td className="px-5 py-3.5 text-sm text-gray-700 capitalize">{String(method).replace(/_/g, ' ')}</td>
                  <td className="px-5 py-3.5 text-xs text-gray-500 hidden md:table-cell font-mono truncate max-w-[200px]" title={ref}>{ref}</td>
                  <td className="px-5 py-3.5 text-sm text-gray-900 font-semibold text-right">
                    {formatMoney(amountCents, p.currency ?? currency)}
                  </td>
                  <td className="px-5 py-3.5">
                    <span className={cn(
                      'text-[11px] font-medium px-2 py-1 rounded-full',
                      status === 'COMPLETED' ? 'bg-green-50 text-green-700' :
                      status === 'PENDING' ? 'bg-yellow-50 text-yellow-700' :
                      status === 'FAILED' ? 'bg-red-50 text-red-600' :
                      'bg-gray-100 text-gray-500',
                    )}>{String(status).replace(/_/g, ' ')}</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: any }) {
  return (
    <div>
      <dt className="text-[11px] font-semibold text-gray-500">{label}</dt>
      <dd className="text-sm text-gray-900 font-medium">{value ?? '—'}</dd>
    </div>
  );
}

function EditTab({ inv, refetch }: { inv: any; refetch: () => void }) {
  const router = useRouter();
  const update = useUpdateInvoice();
  const remove = useDeleteInvoice();
  const markPaid = useMarkInvoicePaid();

  const totalCents = Number(inv.totalAmountCents ?? inv.totalCents ?? 0);
  const paidCents = Number(inv.paidAmountCents ?? inv.paidCents ?? 0);
  const outstandingCents = Math.max(0, totalCents - paidCents);

  const [form, setForm] = useState({
    status: inv.status ?? 'DRAFT',
    notes: inv.notes ?? '',
    dueDate: (inv.dueDate ?? inv.dueAt) ? String(inv.dueDate ?? inv.dueAt).slice(0, 10) : '',
  });

  const save = async () => {
    try {
      await update.mutateAsync({
        id: inv.id,
        status: form.status,
        notes: form.notes || undefined,
        dueDate: form.dueDate || undefined,
        dueAt: form.dueDate || undefined,
      });
      toast.success('Invoice saved');
      refetch();
    } catch (e: any) {
      toast.error(e?.response?.data?.error?.message ?? e?.response?.data?.message ?? 'Failed');
    }
  };

  const handleMarkPaid = async () => {
    if (outstandingCents <= 0) {
      toast.info('No outstanding balance to pay');
      return;
    }
    if (!confirm(`Mark this invoice as paid? A payment of ${formatMoney(outstandingCents, inv.currency ?? 'SAR')} will be recorded.`)) return;
    try {
      await markPaid.mutateAsync({
        id: inv.id,
        amountCents: outstandingCents,
        method: 'cash',
      });
      toast.success('Invoice marked paid');
      refetch();
    } catch (e: any) {
      toast.error(e?.response?.data?.error?.message ?? e?.response?.data?.message ?? 'Failed');
    }
  };

  const handleCancel = async () => {
    if (!confirm('Mark this invoice as cancelled / void? This cannot be undone.')) return;
    try {
      await update.mutateAsync({ id: inv.id, status: 'VOID' });
      toast.success('Invoice cancelled');
      refetch();
    } catch (e: any) {
      toast.error(e?.response?.data?.error?.message ?? e?.response?.data?.message ?? 'Failed');
    }
  };

  const archive = async () => {
    if (!confirm('Archive this invoice? It will be removed from the active list.')) return;
    try {
      await remove.mutateAsync(inv.id);
      toast.success('Invoice archived');
      router.push('/finance');
    } catch (e: any) {
      toast.error(e?.response?.data?.error?.message ?? e?.response?.data?.message ?? 'Failed');
    }
  };

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="bg-white rounded-2xl border border-gray-100 p-5 space-y-3">
        <h3 className="text-sm font-bold text-gray-900 inline-flex items-center gap-2">
          <Edit3 className="h-4 w-4" /> Quick actions
        </h3>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={handleMarkPaid}
            disabled={markPaid.isPending || outstandingCents <= 0}
            className="flex items-center gap-2 px-4 py-2 text-sm bg-green-500 text-white rounded-lg disabled:opacity-50 hover:bg-green-600"
          >
            {markPaid.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} Mark paid
          </button>
          <button
            onClick={handleCancel}
            disabled={update.isPending || inv.status === 'VOID' || inv.status === 'CANCELLED'}
            className="flex items-center gap-2 px-4 py-2 text-sm bg-gray-100 text-gray-700 rounded-lg disabled:opacity-50 hover:bg-gray-200"
          >
            <XCircle className="h-4 w-4" /> Mark cancelled
          </button>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 p-5 space-y-3">
        <h3 className="text-sm font-bold text-gray-900 inline-flex items-center gap-2">
          <Edit3 className="h-4 w-4" /> Edit invoice
        </h3>
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Status">
            <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} className="w-full text-sm px-3 py-2.5 border border-gray-200 rounded-lg bg-white outline-none focus:border-brand-400">
              {INVOICE_STATUSES.map((s) => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
            </select>
          </FormField>
          <FormField label="Due date">
            <input type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} className="w-full text-sm px-3 py-2.5 border border-gray-200 rounded-lg outline-none focus:border-brand-400" />
          </FormField>
          <FormField label="Notes" full>
            <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={3} className="w-full text-sm px-3 py-2.5 border border-gray-200 rounded-lg outline-none resize-none focus:border-brand-400" />
          </FormField>
        </div>
        <div className="flex justify-end pt-2">
          <button onClick={save} disabled={update.isPending} className="flex items-center gap-2 px-4 py-2 text-sm bg-brand-500 text-white rounded-lg disabled:opacity-50 hover:bg-brand-600">
            {update.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save invoice
          </button>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-red-100 p-5">
        <h3 className="text-sm font-bold text-red-700 inline-flex items-center gap-2">
          <Trash2 className="h-4 w-4" /> Archive invoice
        </h3>
        <p className="text-xs text-gray-500 my-2">Removes the invoice from the active list. Past payments are preserved.</p>
        <button onClick={archive} disabled={remove.isPending} className="px-4 py-2 text-sm bg-red-50 hover:bg-red-100 text-red-600 rounded-lg disabled:opacity-50">
          {remove.isPending ? 'Archiving…' : 'Archive'}
        </button>
      </div>
    </div>
  );
}

function FormField({ label, children, full = false }: { label: string; children: React.ReactNode; full?: boolean }) {
  return (
    <label className={cn('block', full && 'col-span-2')}>
      <span className="block text-xs font-semibold text-gray-600 mb-1">{label}</span>
      {children}
    </label>
  );
}

function formatMoney(cents: number, currency = 'SAR'): string {
  const value = (Number(cents) || 0) / 100;
  return `${currency} ${value.toLocaleString('en-SA', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

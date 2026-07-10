'use client';

import { useState } from 'react';
import Link from 'next/link';
import { CreditCard, RefreshCw, AlertCircle, Loader2, Download, Undo2, Search } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useFinancePayments, useUpdatePayment, useRefundPayment } from '@/hooks/use-finance';

const PAYMENT_STATUSES = ['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'REFUNDED'];

export function FinancePaymentsView() {
  const { data, isLoading, error, refetch } = useFinancePayments({ limit: 100 });
  const update = useUpdatePayment();
  const refund = useRefundPayment();
  const [search, setSearch] = useState('');

  const items = (data?.items ?? []).filter((p: any) =>
    !search ||
    (p.invoice?.invoiceRef ?? '').toLowerCase().includes(search.toLowerCase()) ||
    (p.invoice?.issuedToName ?? '').toLowerCase().includes(search.toLowerCase()) ||
    (p.gatewayRef ?? '').toLowerCase().includes(search.toLowerCase()),
  );

  const totalCollected = items
    .filter((p: any) => p.status === 'COMPLETED')
    .reduce((s: number, p: any) => s + p.amountCents, 0);

  const exportCsv = () => {
    const rows = [
      ['Reference', 'Invoice', 'Counterparty', 'Method', 'Amount', 'Status', 'Paid at'],
      ...items.map((p: any) => [
        p.gatewayRef ?? '', p.invoice?.invoiceRef ?? '', p.invoice?.issuedToName ?? '',
        p.gateway ?? '', (p.amountCents / 100).toFixed(2), p.status,
        p.paidAt ? new Date(p.paidAt).toLocaleString() : '',
      ]),
    ];
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `payments-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-5 pb-10">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Payments</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {data?.total ?? 0} payments · SAR {(totalCollected / 100).toLocaleString()} collected
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => refetch()} className="p-2 border border-gray-200 rounded-xl hover:bg-gray-50 text-gray-500">
            <RefreshCw className={cn('h-4 w-4', isLoading && 'animate-spin')} />
          </button>
          <button onClick={exportCsv} className="flex items-center gap-2 text-sm px-3 py-2 border border-gray-200 rounded-xl hover:bg-gray-50">
            <Download className="h-4 w-4" /> Export
          </button>
        </div>
      </div>

      <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-xl px-3 py-2.5 w-full sm:w-80">
        <Search className="h-4 w-4 text-gray-500" />
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search invoice / counterparty / ref…" className="text-sm bg-transparent flex-1 outline-none" />
      </div>

      {isLoading ? (
        <div className="bg-white rounded-2xl border border-gray-100 py-16 text-center text-sm text-gray-500">
          <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2" /> Loading…
        </div>
      ) : error ? (
        <div className="bg-white rounded-2xl border border-gray-100 py-16 text-center">
          <AlertCircle className="h-10 w-10 mx-auto mb-3 text-red-400 opacity-60" />
          <p className="text-sm text-red-500">Failed to load payments</p>
        </div>
      ) : items.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 py-16 text-center">
          <CreditCard className="h-12 w-12 mx-auto mb-3 text-gray-200" />
          <p className="text-sm text-gray-500">No payments recorded yet</p>
          <Link href="/finance" className="text-xs text-brand-500 hover:underline mt-2 inline-block">Record a payment from an invoice →</Link>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs text-gray-500 bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="text-left p-3">Invoice</th>
                <th className="text-left p-3">Counterparty</th>
                <th className="text-left p-3">Method</th>
                <th className="text-left p-3">Reference</th>
                <th className="text-left p-3">Amount</th>
                <th className="text-left p-3">Paid at</th>
                <th className="text-left p-3">Status</th>
                <th />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {items.map((p: any) => (
                <tr key={p.id} className="hover:bg-gray-50/60">
                  <td className="p-3">
                    {p.invoiceId ? (
                      <Link href={`/finance/invoices/${p.invoiceId}`} className="text-brand-600 hover:underline font-medium">
                        {p.invoice?.invoiceRef ?? p.invoiceId.slice(0, 8)}
                      </Link>
                    ) : '—'}
                  </td>
                  <td className="p-3 text-xs text-gray-600">{p.invoice?.issuedToName ?? '—'}</td>
                  <td className="p-3 text-xs text-gray-600">{p.gateway ?? '—'}</td>
                  <td className="p-3 text-xs text-gray-500 font-mono">{p.gatewayRef ?? '—'}</td>
                  <td className="p-3 font-medium">
                    {p.currency} {(p.amountCents / 100).toLocaleString()}
                    {p.refundedCents > 0 && <span className="block text-[10px] text-red-500">−{(p.refundedCents / 100).toLocaleString()} refunded</span>}
                  </td>
                  <td className="p-3 text-xs text-gray-600">{p.paidAt ? new Date(p.paidAt).toLocaleDateString() : '—'}</td>
                  <td className="p-3">
                    <select
                      value={p.status}
                      onChange={async (e) => { await update.mutateAsync({ id: p.id, status: e.target.value }); toast.success('Updated'); refetch(); }}
                      className="text-xs border border-gray-200 rounded-lg px-2 py-1 bg-white"
                    >
                      {PAYMENT_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </td>
                  <td className="p-3 text-right">
                    {p.status !== 'REFUNDED' && (
                      <button
                        onClick={async () => {
                          if (!confirm('Refund this payment? The linked invoice balance will be adjusted.')) return;
                          await refund.mutateAsync({ id: p.id });
                          toast.success('Payment refunded');
                          refetch();
                        }}
                        className="inline-flex items-center gap-1 text-xs text-red-500 hover:underline"
                      >
                        <Undo2 className="h-3 w-3" /> Refund
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

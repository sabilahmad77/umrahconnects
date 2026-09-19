'use client';

import { useState } from 'react';
import Link from 'next/link';
import { CreditCard, Download, RefreshCw, Search } from 'lucide-react';
import { toast } from 'sonner';
import { apiErrorMessage } from '@/lib/api-error';
import { cn } from '@/lib/utils';
import { useCapabilities } from '@/hooks/use-capabilities';
import { useFinancePayments, useUpdatePayment } from '@/hooks/use-finance';
import { Button, LoadingState, QueryFailure, Select } from '@/components/ui/system';
import { RefundDialog, isGatewayPayment, refundableCents } from './refund-dialog';
import { formatAmount } from './money';

/**
 * Manual bookkeeping moves only. REFUNDED is reached by refunding and
 * PARTIALLY_REFUNDED / DISPUTED by the provider; the server refuses them here.
 */
const PAYMENT_STATUSES = ['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED'];
const PAGE_SIZE = 50;

export function FinancePaymentsView() {
  const { can } = useCapabilities();
  const canProcess = can('finance:payment:process');
  const canRefund = can('finance:payment:refund');
  const [page, setPage] = useState(1);
  const { data, isLoading, error, refetch } = useFinancePayments({ page, limit: PAGE_SIZE });
  const update = useUpdatePayment();
  const [search, setSearch] = useState('');
  const [refunding, setRefunding] = useState<any | null>(null);

  const needle = search.trim().toLowerCase();
  const items = (data?.items ?? []).filter(
    (p: any) =>
      !needle ||
      [p.invoice?.invoiceRef, p.invoice?.issuedToName, p.gatewayRef, p.gateway].some((v) =>
        String(v ?? '')
          .toLowerCase()
          .includes(needle),
      ),
  );
  const totalPages = Math.max(1, Math.ceil((data?.total ?? 0) / PAGE_SIZE));
  // Net money actually kept, per currency, for the rows on this page.
  const collected = items.reduce<Record<string, number>>((acc, p: any) => {
    if (['COMPLETED', 'PARTIALLY_REFUNDED'].includes(p.status)) {
      acc[p.currency ?? 'SAR'] =
        (acc[p.currency ?? 'SAR'] ?? 0) + Number(p.amountCents) - Number(p.refundedCents ?? 0);
    }
    return acc;
  }, {});

  const exportCsv = () => {
    const rows = [
      [
        'Reference',
        'Invoice',
        'Counterparty',
        'Method',
        'Currency',
        'Amount',
        'Refunded',
        'Status',
        'Paid at',
      ],
      ...items.map((p: any) => [
        p.gatewayRef ?? '',
        p.invoice?.invoiceRef ?? '',
        counterparty(p),
        p.gateway ?? '',
        p.currency ?? '',
        (Number(p.amountCents) / 100).toFixed(2),
        (Number(p.refundedCents ?? 0) / 100).toFixed(2),
        p.status,
        p.paidAt ? new Date(p.paidAt).toISOString() : '',
      ]),
    ];
    const csv = rows
      .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `payments-page-${page}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const changeStatus = async (p: any, status: string) => {
    try {
      await update.mutateAsync({ id: p.id, status });
      toast.success(`Payment marked ${status.toLowerCase()}`);
      void refetch();
    } catch (e) {
      toast.error(apiErrorMessage(e, 'The payment could not be updated.'));
    }
  };

  if (error) return <QueryFailure error={error} onRetry={() => void refetch()} />;
  return (
    <div className="space-y-5 pb-10">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Payments</h1>
          <p className="mt-0.5 text-sm text-gray-600">
            {data?.total ?? 0} payments ·{' '}
            {Object.keys(collected).length
              ? Object.entries(collected)
                  .map(([cur, cents]) => formatAmount(cents, cur))
                  .join(' + ')
              : formatAmount(0)}{' '}
            kept on this page, net of refunds
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="quiet" aria-label="Refresh information" onClick={() => void refetch()}>
            <RefreshCw aria-hidden="true" className={cn('h-4 w-4', isLoading && 'animate-spin')} />
          </Button>
          <Button variant="secondary" onClick={exportCsv} disabled={!items.length}>
            <Download aria-hidden="true" className="h-4 w-4" /> Export page
          </Button>
        </div>
      </div>

      <label className="flex w-full items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2.5 sm:w-80">
        <Search aria-hidden="true" className="h-4 w-4 text-gray-600" />
        <span className="sr-only">Search this page</span>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Invoice, customer, method or reference…"
          className="flex-1 bg-transparent text-sm outline-none"
        />
      </label>

      {isLoading ? (
        <LoadingState label="Loading payments…" />
      ) : items.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white py-16 text-center">
          <CreditCard aria-hidden="true" className="mx-auto mb-3 h-12 w-12 text-gray-300" />
          <p className="text-sm text-gray-600">
            {needle ? 'No payments on this page match' : 'No payments recorded yet'}
          </p>
          <Link
            href="/finance"
            className="text-brand-600 mt-2 inline-block text-xs hover:underline"
          >
            Record a payment from an invoice →
          </Link>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
          <div
            role="region"
            aria-label="Payments"
            tabIndex={0}
            className="max-w-full overflow-x-auto"
          >
            <table className="w-full text-sm">
              <thead className="border-b border-gray-200 bg-gray-50 text-left text-xs text-gray-600">
                <tr>
                  <th className="p-3">Invoice / booking</th>
                  <th className="p-3">Counterparty</th>
                  <th className="p-3">Method</th>
                  <th className="p-3">Reference</th>
                  <th className="p-3">Amount</th>
                  <th className="p-3">Paid at</th>
                  <th className="p-3">Status</th>
                  <th className="p-3">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {items.map((p: any) => {
                  const gateway = isGatewayPayment(p);
                  const refundable = refundableCents(p);
                  const settledOrRefunded = ['REFUNDED', 'PARTIALLY_REFUNDED', 'DISPUTED'].includes(
                    p.status,
                  );
                  return (
                    <tr key={p.id} className="hover:bg-gray-50/60">
                      <td className="p-3">
                        {p.invoiceId ? (
                          <Link
                            href={`/finance/invoices/${p.invoiceId}`}
                            className="text-brand-600 font-medium hover:underline"
                          >
                            {p.invoice?.invoiceRef ?? p.invoiceId.slice(0, 8)}
                          </Link>
                        ) : p.listingBookingId ? (
                          <span className="text-gray-700">Marketplace booking</span>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="p-3 text-xs text-gray-600">{counterparty(p)}</td>
                      <td className="p-3 text-xs capitalize text-gray-600">
                        {String(p.gateway ?? '—').replace(/_/g, ' ')}
                        {gateway && <span className="ml-1">(card)</span>}
                      </td>
                      <td className="p-3 font-mono text-xs text-gray-600">{p.gatewayRef ?? '—'}</td>
                      <td className="p-3 font-medium">
                        {formatAmount(p.amountCents, p.currency)}
                        {Number(p.refundedCents) > 0 && (
                          <span className="block text-xs text-red-700">
                            −{formatAmount(p.refundedCents, p.currency)} refunded
                          </span>
                        )}
                      </td>
                      <td className="p-3 text-xs text-gray-600">
                        {p.paidAt ? new Date(p.paidAt).toLocaleDateString() : '—'}
                      </td>
                      <td className="p-3">
                        {gateway || settledOrRefunded || !canProcess ? (
                          <span className="text-xs font-medium">
                            {String(p.status).replace(/_/g, ' ')}
                            {gateway && (
                              <span className="block font-normal text-gray-600">
                                Managed by the provider
                              </span>
                            )}
                          </span>
                        ) : (
                          <Select
                            aria-label={`Status of payment ${p.gatewayRef ?? p.id.slice(0, 8)}`}
                            disabled={update.isPending}
                            value={p.status}
                            onChange={(e) => void changeStatus(p, e.target.value)}
                            className="px-2 py-1 text-xs"
                          >
                            {Array.from(new Set([p.status, ...PAYMENT_STATUSES])).map((s) => (
                              <option key={s} value={s}>
                                {s.replace(/_/g, ' ')}
                              </option>
                            ))}
                          </Select>
                        )}
                      </td>
                      <td className="p-3 text-right">
                        {canRefund && refundable > 0 && (
                          <Button
                            variant="quiet"
                            className="text-xs text-red-700"
                            onClick={() => setRefunding(p)}
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
        </div>
      )}

      {totalPages > 1 && (
        <nav aria-label="Pagination" className="flex items-center justify-end gap-3">
          <Button variant="secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>
            Previous
          </Button>
          <span className="text-sm" aria-live="polite">
            Page {page} of {totalPages}
          </span>
          <Button
            variant="secondary"
            disabled={page >= totalPages}
            onClick={() => setPage(page + 1)}
          >
            Next
          </Button>
        </nav>
      )}
      {!canRefund && (
        <p className="text-xs text-gray-600">
          Refunds need the refund permission. Ask your workspace administrator.
        </p>
      )}
      {refunding && (
        <RefundDialog
          payment={refunding}
          onClose={() => setRefunding(null)}
          onDone={() => void refetch()}
        />
      )}
    </div>
  );
}

function counterparty(p: any): string {
  if (p.invoice?.issuedToName) return p.invoice.issuedToName;
  if (p.listingBookingId) return 'Traveler (card checkout)';
  return '—';
}

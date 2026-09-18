'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { CheckCircle2, ChevronRight, Clock, DollarSign, FileText, Plus, RefreshCw, Search, TrendingUp, X } from 'lucide-react';
import { apiErrorMessage } from '@/lib/api-error';
import { cn } from '@/lib/utils';
import { INVOICE_STATUS_META as INV_STATUS, INVOICE_STATUSES } from '@/lib/statuses';
import { useFinanceInvoices, useFinanceStats } from '@/hooks/use-api';
import { useCreateInvoice } from '@/hooks/use-finance';
import { useCapabilities } from '@/hooks/use-capabilities';
import { Button, Input, ModalSurface, QueryFailure, Select, Textarea } from '@/components/ui/system';
import { centsToMajor, formatAmount, parseMajorToCents } from './money';

// FIX-04: every backend invoice state is reachable in the filter bar.
const FILTERS = ['ALL', ...INVOICE_STATUSES];
const CURRENCIES = ['SAR', 'USD', 'EUR', 'GBP'];

export function FinanceView() {
  const { can } = useCapabilities();
  const canCreate = can('finance:invoice:create');
  const canReport = can('finance:report:read');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [createOpen, setCreateOpen] = useState(false);

  // Search runs on the server (reference or customer name), a moment after typing stops.
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const stats = useFinanceStats();
  const { data, isLoading, error, refetch } = useFinanceInvoices({
    page,
    limit: 20,
    status: statusFilter !== 'ALL' ? statusFilter : undefined,
    search: search || undefined,
  } as any);

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / 20);
  // The summary needs finance:report:read; staff without it still see the invoice list.
  const summary: any = canReport && !stats.error ? stats.data : undefined;
  const currency = summary?.currency ?? 'SAR';

  if (error) return <QueryFailure error={error} onRetry={() => void refetch()} />;
  return (
    <div className="space-y-5 pb-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Finance</h1>
          <p className="mt-0.5 text-sm text-gray-600">Invoices, payments and revenue tracking</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="quiet"
            aria-label="Refresh information"
            onClick={() => {
              void refetch();
              void stats.refetch();
            }}
          >
            <RefreshCw aria-hidden="true" className="h-4 w-4" />
          </Button>
          {canCreate && (
            <Button onClick={() => setCreateOpen(true)}>
              <Plus aria-hidden="true" className="h-4 w-4" /> New invoice
            </Button>
          )}
        </div>
      </div>

      {canReport && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <SummaryCard
            tone="brand"
            icon={CheckCircle2}
            label="Collected"
            loading={stats.isLoading}
            value={summary ? formatAmount(summary.paid?.amountCents, currency) : '—'}
            sub={summary ? `${summary.paid?.count ?? 0} invoices paid in full` : 'Unavailable'}
            foot={
              <span className="inline-flex items-center gap-1.5">
                <TrendingUp aria-hidden="true" className="h-3.5 w-3.5" /> Net of refunds
              </span>
            }
          />
          <SummaryCard
            icon={Clock}
            label="Outstanding"
            loading={stats.isLoading}
            value={summary ? formatAmount(summary.outstanding?.amountCents, currency) : '—'}
            sub={summary ? `${summary.outstanding?.count ?? 0} open invoices` : 'Unavailable'}
          />
          <SummaryCard
            icon={FileText}
            label="Drafts"
            loading={stats.isLoading}
            value={summary ? formatAmount(summary.draft?.amountCents, currency) : '—'}
            sub={summary ? `${summary.draft?.count ?? 0} not yet issued` : 'Unavailable'}
          />
        </div>
      )}
      {summary?.otherCurrencies?.length > 0 && (
        <p className="text-xs text-gray-600">
          Totals above are in {currency}. Other currencies:{' '}
          {summary.otherCurrencies
            .map((c: any) => `${formatAmount(c.collectedCents, c.currency)} collected, ${formatAmount(c.outstandingCents, c.currency)} outstanding`)
            .join('; ')}
          .
        </p>
      )}

      <div className="flex flex-col gap-3 sm:flex-row">
        <label className="flex w-full items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2.5 sm:w-72">
          <Search aria-hidden="true" className="h-4 w-4 shrink-0 text-gray-600" />
          <span className="sr-only">Search invoices</span>
          <input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Invoice number or customer…"
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-gray-600"
          />
        </label>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter by status">
          {FILTERS.map((f) => (
            <Button
              variant="quiet"
              key={f}
              aria-pressed={statusFilter === f}
              onClick={() => {
                setStatusFilter(f);
                setPage(1);
              }}
              className={cn(
                'rounded-full border px-3 py-1.5 text-xs font-medium',
                statusFilter === f ? 'border-brand-500 bg-brand-500 text-white' : 'border-gray-200 text-gray-600',
              )}
            >
              {f === 'ALL' ? 'All invoices' : (INV_STATUS[f]?.label ?? f)}
            </Button>
          ))}
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        {isLoading ? (
          <div className="divide-y divide-gray-50" aria-busy="true">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex animate-pulse items-center gap-4 px-5 py-4">
                <div className="h-10 w-10 rounded-xl bg-gray-100" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 w-32 rounded bg-gray-100" />
                  <div className="h-3 w-24 rounded bg-gray-100" />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <>
            <div role="region" aria-label="Invoices" tabIndex={0} className="max-w-full overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs font-semibold text-gray-600">
                    <th className="px-5 py-3">Invoice</th>
                    <th className="px-5 py-3">Status</th>
                    <th className="hidden px-5 py-3 md:table-cell">Customer</th>
                    <th className="px-5 py-3 text-right">Amount</th>
                    <th className="hidden px-5 py-3 lg:table-cell">Due</th>
                    <th className="px-5 py-3">
                      <span className="sr-only">Open</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {items.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-20 text-center">
                        <DollarSign aria-hidden="true" className="mx-auto mb-3 h-10 w-10 text-gray-300" />
                        <p className="text-sm text-gray-600">{search ? 'No invoices match your search' : 'No invoices found'}</p>
                      </td>
                    </tr>
                  ) : (
                    items.map((inv: any) => {
                      const cfg = INV_STATUS[inv.status] ?? { label: inv.status, color: 'bg-gray-100 text-gray-600', dot: 'bg-gray-400' };
                      const overdue = inv.status === 'OVERDUE';
                      const paid = Number(inv.paidCents ?? 0);
                      return (
                        <tr key={inv.id} className="hover:bg-gray-50/60">
                          <td className="px-5 py-3.5">
                            <Link href={`/finance/invoices/${inv.id}`} className="group flex items-center gap-3">
                              <div className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-xl', overdue ? 'bg-red-50' : 'bg-brand-50')}>
                                <FileText aria-hidden="true" className={cn('h-4 w-4', overdue ? 'text-red-700' : 'text-brand-600')} />
                              </div>
                              <div>
                                <p className="text-sm font-semibold text-gray-800 group-hover:text-brand-600">{inv.invoiceRef ?? inv.id?.slice(0, 8)}</p>
                                <p className="text-xs text-gray-600">{inv.createdAt ? new Date(inv.createdAt).toLocaleDateString() : '—'}</p>
                              </div>
                            </Link>
                          </td>
                          <td className="px-5 py-3.5">
                            <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium', cfg.color)}>
                              <span aria-hidden="true" className={cn('h-1.5 w-1.5 rounded-full', cfg.dot)} />
                              {cfg.label}
                            </span>
                          </td>
                          <td className="hidden px-5 py-3.5 text-sm text-gray-700 md:table-cell">{inv.issuedToName ?? '—'}</td>
                          <td className="px-5 py-3.5 text-right">
                            <p className={cn('text-sm font-bold', overdue ? 'text-red-700' : 'text-gray-800')}>{formatAmount(inv.totalCents, inv.currency)}</p>
                            {paid > 0 && paid < Number(inv.totalCents) && <p className="text-xs text-gray-600">Paid {formatAmount(paid, inv.currency)}</p>}
                          </td>
                          <td className={cn('hidden px-5 py-3.5 text-sm lg:table-cell', overdue ? 'font-medium text-red-700' : 'text-gray-600')}>
                            {inv.dueAt ? new Date(inv.dueAt).toLocaleDateString() : '—'}
                          </td>
                          <td className="px-5 py-3.5 text-right">
                            <Link href={`/finance/invoices/${inv.id}`} aria-label={`Open ${inv.invoiceRef ?? 'invoice'}`} className="inline-flex rounded-lg p-1.5 hover:bg-gray-100">
                              <ChevronRight aria-hidden="true" className="h-3.5 w-3.5 text-gray-600" />
                            </Link>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
            {totalPages > 1 && (
              <div className="flex items-center justify-between border-t border-gray-200 px-5 py-3">
                <p className="text-xs text-gray-600">
                  Page {page} of {totalPages} · {total} results
                </p>
                <div className="flex gap-1.5">
                  <Button variant="secondary" onClick={() => setPage(Math.max(1, page - 1))} disabled={page === 1}>
                    Previous
                  </Button>
                  <Button variant="secondary" onClick={() => setPage(page + 1)} disabled={page >= totalPages}>
                    Next
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {createOpen && (
        <CreateInvoiceModal
          onClose={() => setCreateOpen(false)}
          onCreated={() => {
            setCreateOpen(false);
            void refetch();
            void stats.refetch();
          }}
        />
      )}
    </div>
  );
}

function SummaryCard({
  icon: Icon,
  label,
  value,
  sub,
  foot,
  loading,
  tone,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  sub: string;
  foot?: React.ReactNode;
  loading: boolean;
  tone?: 'brand';
}) {
  const brand = tone === 'brand';
  return (
    <div className={cn('rounded-xl p-5', brand ? 'bg-gradient-to-br from-brand-500 to-brand-600 text-white' : 'border border-gray-200 bg-white')}>
      <div className="mb-3 flex items-center gap-2">
        <Icon aria-hidden="true" className={cn('h-5 w-5', brand ? 'opacity-80' : 'text-gray-600')} />
        <p className={cn('text-sm font-medium', brand ? 'opacity-90' : 'text-gray-600')}>{label}</p>
      </div>
      {loading ? (
        <div className={cn('h-8 w-28 animate-pulse rounded', brand ? 'bg-white/20' : 'bg-gray-100')} />
      ) : (
        <p className={cn('text-3xl font-bold', !brand && 'text-gray-900')}>{value}</p>
      )}
      <p className={cn('mt-1 text-xs', brand ? 'opacity-80' : 'text-gray-600')}>{sub}</p>
      {foot && <div className="mt-3 text-xs opacity-80">{foot}</div>}
    </div>
  );
}

function CreateInvoiceModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const router = useRouter();
  const create = useCreateInvoice();
  const inFlight = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', email: '', currency: 'SAR', subtotal: '', tax: '', dueDate: '', notes: '' });
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));
  const subtotalCents = parseMajorToCents(form.subtotal);
  const taxCents = form.tax.trim() === '' ? 0 : parseMajorToCents(form.tax);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (inFlight.current) return;
    if (!form.name.trim()) return setError('The customer name is required.');
    if (form.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) return setError('Enter a valid email address.');
    if (subtotalCents === null || subtotalCents <= 0) return setError('Enter a subtotal greater than zero, such as 1500 or 1500.50.');
    if (taxCents === null) return setError('Enter the tax as an amount such as 225 or 225.75.');
    if (form.dueDate && form.dueDate < new Date().toISOString().slice(0, 10)) return setError('The due date cannot be in the past.');
    setError(null);
    inFlight.current = true;
    try {
      const created = await create.mutateAsync({
        type: 'CUSTOMER',
        issuedToName: form.name.trim(),
        counterpartyEmail: form.email.trim() || undefined,
        currency: form.currency,
        subtotal: centsToMajor(subtotalCents),
        tax: centsToMajor(taxCents),
        dueDate: form.dueDate || undefined,
        notes: form.notes.trim() || undefined,
        lineItems: [{ description: form.notes.trim().slice(0, 120) || 'Services', qty: 1, unitPrice: centsToMajor(subtotalCents) }],
      });
      toast.success('Draft invoice created');
      onCreated();
      if (created?.id) router.push(`/finance/invoices/${created.id}`);
    } catch (err) {
      setError(apiErrorMessage(err, 'The invoice could not be created.'));
    } finally {
      inFlight.current = false;
    }
  };

  const totalCents = (subtotalCents ?? 0) + (taxCents ?? 0);
  return (
    <ModalSurface busy={create.isPending} title="New invoice" onClose={onClose}>
      <form onSubmit={submit} className="w-full max-w-md space-y-3 rounded-xl bg-white p-5" noValidate>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-gray-900">New invoice</h2>
          <Button disabled={create.isPending} variant="quiet" aria-label="Close dialog" onClick={onClose}>
            <X aria-hidden="true" className="h-4 w-4 text-gray-600" />
          </Button>
        </div>
        <p className="text-xs text-gray-600">Creates a draft. Issue it from the invoice page when it is ready.</p>
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-gray-600">Customer name *</span>
          <Input value={form.name} maxLength={200} onChange={set('name')} required />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-gray-600">Customer email</span>
          <Input type="email" value={form.email} maxLength={255} onChange={set('email')} />
        </label>
        <div className="grid grid-cols-3 gap-2">
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-gray-600">Currency</span>
            <Select value={form.currency} onChange={set('currency')}>
              {CURRENCIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-gray-600">Subtotal *</span>
            <Input inputMode="decimal" value={form.subtotal} onChange={set('subtotal')} placeholder="0.00" />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-gray-600">Tax</span>
            <Input inputMode="decimal" value={form.tax} onChange={set('tax')} placeholder="0.00" />
          </label>
        </div>
        <p className="text-xs text-gray-600">
          Total (calculated by the server): <span className="font-semibold text-gray-900">{formatAmount(totalCents, form.currency)}</span>
        </p>
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-gray-600">Due date</span>
          <Input type="date" value={form.dueDate} min={new Date().toISOString().slice(0, 10)} onChange={set('dueDate')} />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-gray-600">Notes</span>
          <Textarea value={form.notes} maxLength={5000} onChange={set('notes')} rows={2} />
        </label>
        {error && (
          <p role="alert" className="text-sm text-red-700">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" disabled={create.isPending} onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" busy={create.isPending}>
            <Plus aria-hidden="true" className="h-4 w-4" /> Create draft
          </Button>
        </div>
      </form>
    </ModalSurface>
  );
}

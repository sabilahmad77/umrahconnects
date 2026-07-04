'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  DollarSign, FileText, RefreshCw, Plus, Search,
  TrendingUp, AlertCircle, CheckCircle2, Clock, ChevronRight, X, Loader2,
} from 'lucide-react';
import { useFinanceInvoices, useFinanceStats } from '@/hooks/use-api';
import { useCreateInvoice } from '@/hooks/use-finance';
import { cn } from '@/lib/utils';

const INV_STATUS: Record<string, { label: string; color: string; dot: string }> = {
  DRAFT:          { label: 'Draft',          color: 'bg-gray-100 text-gray-600',    dot: 'bg-gray-400' },
  ISSUED:         { label: 'Issued',         color: 'bg-blue-100 text-blue-700',    dot: 'bg-blue-500' },
  SENT:           { label: 'Sent',           color: 'bg-indigo-100 text-indigo-700', dot: 'bg-indigo-500' },
  PARTIALLY_PAID: { label: 'Partial',        color: 'bg-yellow-100 text-yellow-700', dot: 'bg-yellow-500' },
  PAID:           { label: 'Paid',           color: 'bg-green-100 text-green-700',  dot: 'bg-green-500' },
  OVERDUE:        { label: 'Overdue',        color: 'bg-red-100 text-red-600',      dot: 'bg-red-500' },
  VOID:           { label: 'Void',           color: 'bg-gray-100 text-gray-500',    dot: 'bg-gray-300' },
};

const FILTERS = ['ALL', 'PAID', 'SENT', 'PARTIALLY_PAID', 'OVERDUE', 'DRAFT'];

const fmtSAR = (cents?: number) =>
  cents !== undefined
    ? `SAR ${(cents / 100).toLocaleString('en-SA', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
    : '—';

export function FinanceView() {
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [createOpen, setCreateOpen] = useState(false);

  const { data: stats, isLoading: statsLoading, refetch: refetchStats } = useFinanceStats();
  const { data, isLoading, error, refetch } = useFinanceInvoices({
    page,
    limit: 20,
    status: statusFilter !== 'ALL' ? statusFilter : undefined,
  });

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / 20);

  return (
    <div className="space-y-5 pb-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Finance</h1>
          <p className="text-sm text-gray-500 mt-0.5">Invoices, payments & revenue tracking</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => { refetch(); refetchStats(); }} className="p-2 border border-gray-200 rounded-xl hover:bg-gray-50 text-gray-400 transition-colors">
            <RefreshCw className="h-4 w-4" />
          </button>
          <button onClick={() => setCreateOpen(true)} className="flex items-center gap-2 text-sm px-4 py-2 bg-brand-500 text-white rounded-xl hover:bg-brand-600 transition-colors shadow-sm shadow-brand-500/30">
            <Plus className="h-4 w-4" />
            New Invoice
          </button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Revenue Collected */}
        <div className="bg-gradient-to-br from-brand-500 to-brand-600 rounded-2xl p-5 text-white">
          <div className="flex items-center gap-2 mb-3">
            <CheckCircle2 className="h-5 w-5 opacity-80" />
            <p className="text-sm font-medium opacity-80">Revenue Collected</p>
          </div>
          {statsLoading ? (
            <div className="h-8 w-28 bg-white/20 rounded animate-pulse" />
          ) : (
            <p className="text-3xl font-bold">{fmtSAR(stats?.paid?.amountCents)}</p>
          )}
          <p className="text-xs opacity-70 mt-1">{stats?.paid?.count ?? 0} invoices paid</p>
          <div className="flex items-center gap-1.5 mt-3 text-xs opacity-80">
            <TrendingUp className="h-3.5 w-3.5" />
            <span>+18% vs last period</span>
          </div>
        </div>

        {/* Outstanding */}
        <div className="bg-white rounded-2xl border border-gray-100 p-5">
          <div className="flex items-center gap-2 mb-3">
            <Clock className="h-5 w-5 text-yellow-500" />
            <p className="text-sm font-medium text-gray-600">Outstanding</p>
          </div>
          {statsLoading ? (
            <div className="h-8 w-28 bg-gray-100 rounded animate-pulse" />
          ) : (
            <p className="text-3xl font-bold text-gray-900">{fmtSAR(stats?.outstanding?.amountCents)}</p>
          )}
          <p className="text-xs text-gray-400 mt-1">{stats?.outstanding?.count ?? 0} invoices pending</p>
        </div>

        {/* Draft */}
        <div className="bg-white rounded-2xl border border-gray-100 p-5">
          <div className="flex items-center gap-2 mb-3">
            <FileText className="h-5 w-5 text-gray-400" />
            <p className="text-sm font-medium text-gray-600">Draft Invoices</p>
          </div>
          {statsLoading ? (
            <div className="h-8 w-28 bg-gray-100 rounded animate-pulse" />
          ) : (
            <p className="text-3xl font-bold text-gray-900">{fmtSAR(stats?.draft?.amountCents)}</p>
          )}
          <p className="text-xs text-gray-400 mt-1">{stats?.draft?.count ?? 0} invoices in draft</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-xl px-3 py-2.5 w-full sm:w-72 focus-within:border-brand-300 transition-colors">
          <Search className="h-4 w-4 text-gray-400 shrink-0" />
          <input
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            placeholder="Search invoices..."
            className="text-sm bg-transparent flex-1 outline-none placeholder:text-gray-400"
          />
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {FILTERS.map((f) => (
            <button
              key={f}
              onClick={() => { setStatusFilter(f); setPage(1); }}
              className={cn(
                'text-xs px-3 py-1.5 rounded-full border transition-all font-medium',
                statusFilter === f
                  ? 'bg-brand-500 text-white border-brand-500 shadow-sm'
                  : 'border-gray-200 text-gray-500 hover:border-gray-300 hover:text-gray-700',
              )}
            >
              {f === 'ALL' ? 'All Invoices' : INV_STATUS[f]?.label ?? f}
            </button>
          ))}
        </div>
      </div>

      {/* Invoice Table */}
      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
        {isLoading ? (
          <div className="divide-y divide-gray-50">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4 px-5 py-4 animate-pulse">
                <div className="w-10 h-10 rounded-xl bg-gray-100" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 w-32 bg-gray-100 rounded" />
                  <div className="h-3 w-24 bg-gray-100 rounded" />
                </div>
                <div className="h-6 w-20 bg-gray-100 rounded-full" />
                <div className="h-5 w-24 bg-gray-100 rounded" />
              </div>
            ))}
          </div>
        ) : error ? (
          <div className="py-20 text-center">
            <AlertCircle className="h-10 w-10 mx-auto mb-3 text-red-400 opacity-60" />
            <p className="text-sm text-red-500 mb-2">Failed to load invoices</p>
            <button onClick={() => refetch()} className="text-xs text-brand-500 hover:underline">Retry</button>
          </div>
        ) : (
          <>
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="text-left text-xs font-semibold text-gray-500 px-5 py-3">Invoice</th>
                  <th className="text-left text-xs font-semibold text-gray-500 px-5 py-3">Status</th>
                  <th className="text-left text-xs font-semibold text-gray-500 px-5 py-3 hidden md:table-cell">Client</th>
                  <th className="text-right text-xs font-semibold text-gray-500 px-5 py-3">Amount</th>
                  <th className="text-left text-xs font-semibold text-gray-500 px-5 py-3 hidden lg:table-cell">Due Date</th>
                  <th className="text-right text-xs font-semibold text-gray-500 px-5 py-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {items.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-20 text-center">
                      <DollarSign className="h-10 w-10 mx-auto mb-3 text-gray-300" />
                      <p className="text-sm text-gray-400">No invoices found</p>
                    </td>
                  </tr>
                ) : items.map((inv: any) => {
                  const cfg = INV_STATUS[inv.status] ?? { label: inv.status, color: 'bg-gray-100 text-gray-600', dot: 'bg-gray-400' };
                  const isOverdue = inv.status === 'OVERDUE';
                  return (
                    <tr key={inv.id} className="hover:bg-gray-50/60 transition-colors">
                      <td className="px-5 py-3.5">
                        <Link href={`/finance/invoices/${inv.id}`} className="flex items-center gap-3 group">
                          <div className={cn('w-9 h-9 rounded-xl flex items-center justify-center shrink-0', isOverdue ? 'bg-red-50' : 'bg-brand-50')}>
                            <FileText className={cn('h-4 w-4', isOverdue ? 'text-red-500' : 'text-brand-600')} />
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-gray-800 group-hover:text-brand-600 transition-colors">{inv.invoiceRef ?? inv.id?.slice(0, 8)}</p>
                            <p className="text-xs text-gray-400">{inv.createdAt ? new Date(inv.createdAt).toLocaleDateString() : '—'}</p>
                          </div>
                        </Link>
                      </td>
                      <td className="px-5 py-3.5">
                        <span className={cn('inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full font-medium', cfg.color)}>
                          <span className={cn('w-1.5 h-1.5 rounded-full', cfg.dot)} />
                          {cfg.label}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 hidden md:table-cell">
                        <p className="text-sm text-gray-700">{inv.pilgrim
                          ? [inv.pilgrim.firstNameEn, inv.pilgrim.lastNameEn].filter(Boolean).join(' ') || '—'
                          : inv.clientName ?? '—'}
                        </p>
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        <p className={cn('text-sm font-bold', isOverdue ? 'text-red-600' : 'text-gray-800')}>
                          {fmtSAR(inv.totalCents)}
                        </p>
                        {inv.paidCents > 0 && inv.paidCents < inv.totalCents && (
                          <p className="text-[10px] text-gray-400">Paid: {fmtSAR(inv.paidCents)}</p>
                        )}
                      </td>
                      <td className="px-5 py-3.5 hidden lg:table-cell">
                        <p className={cn('text-sm', isOverdue ? 'text-red-600 font-medium' : 'text-gray-600')}>
                          {(inv.dueAt ?? inv.dueDate) ? new Date(inv.dueAt ?? inv.dueDate).toLocaleDateString() : '—'}
                        </p>
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        <Link href={`/finance/invoices/${inv.id}`} className="inline-flex items-center p-1.5 hover:bg-gray-100 rounded-lg transition-colors">
                          <ChevronRight className="h-3.5 w-3.5 text-gray-400" />
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {totalPages > 1 && (
              <div className="flex items-center justify-between px-5 py-3 border-t border-gray-100">
                <p className="text-xs text-gray-400">Page {page} of {totalPages} · {total} results</p>
                <div className="flex gap-1.5">
                  <button onClick={() => setPage(Math.max(1, page - 1))} disabled={page === 1} className="text-xs px-3 py-1.5 border border-gray-200 rounded-lg disabled:opacity-40 hover:bg-gray-50">Prev</button>
                  <button onClick={() => setPage(page + 1)} disabled={page >= totalPages} className="text-xs px-3 py-1.5 border border-gray-200 rounded-lg disabled:opacity-40 hover:bg-gray-50">Next</button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {createOpen && <CreateInvoiceModal onClose={() => setCreateOpen(false)} onCreated={() => { setCreateOpen(false); refetch(); refetchStats(); }} />}
    </div>
  );
}

function CreateInvoiceModal({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const router = useRouter();
  const create = useCreateInvoice();
  const [form, setForm] = useState({
    counterpartyName: '',
    counterpartyEmail: '',
    currency: 'SAR',
    subtotal: '',
    tax: '',
    dueDate: '',
    notes: '',
  });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.counterpartyName.trim()) {
      toast.error('Customer name is required');
      return;
    }
    const subtotalNum = Number(form.subtotal) || 0;
    if (subtotalNum <= 0) {
      toast.error('Subtotal must be greater than 0');
      return;
    }
    try {
      const created = await create.mutateAsync({
        type: 'CUSTOMER',
        issuedToName: form.counterpartyName,
        counterpartyName: form.counterpartyName,
        counterpartyEmail: form.counterpartyEmail || undefined,
        currency: form.currency,
        subtotal: subtotalNum,
        tax: Number(form.tax) || 0,
        dueAt: form.dueDate || undefined,
        dueDate: form.dueDate || undefined,
        issueDate: new Date().toISOString().slice(0, 10),
        issuedAt: new Date().toISOString(),
        notes: form.notes || undefined,
        lineItems: [{ description: 'Invoice item', qty: 1, unitPrice: subtotalNum }],
      });
      toast.success('Invoice created');
      onCreated(created?.id);
      if (created?.id) router.push(`/finance/invoices/${created.id}`);
    } catch (e: any) {
      toast.error(e?.response?.data?.error?.message ?? e?.response?.data?.message ?? 'Failed to create invoice');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <form onClick={(e) => e.stopPropagation()} onSubmit={submit} className="bg-white rounded-2xl w-full max-w-md p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-gray-900">New invoice</h2>
          <button type="button" onClick={onClose} className="p-1 rounded hover:bg-gray-100">
            <X className="h-4 w-4 text-gray-500" />
          </button>
        </div>
        <p className="text-xs text-gray-500">Creates a DRAFT invoice. You can edit details on the next page.</p>

        <label className="block">
          <span className="block text-xs font-semibold text-gray-600 mb-1">Customer name</span>
          <input value={form.counterpartyName} onChange={(e) => setForm({ ...form, counterpartyName: e.target.value })} className="w-full text-sm px-3 py-2.5 border border-gray-200 rounded-lg outline-none focus:border-brand-400" />
        </label>
        <label className="block">
          <span className="block text-xs font-semibold text-gray-600 mb-1">Customer email</span>
          <input type="email" value={form.counterpartyEmail} onChange={(e) => setForm({ ...form, counterpartyEmail: e.target.value })} className="w-full text-sm px-3 py-2.5 border border-gray-200 rounded-lg outline-none focus:border-brand-400" />
        </label>
        <div className="grid grid-cols-3 gap-2">
          <label className="block">
            <span className="block text-xs font-semibold text-gray-600 mb-1">Currency</span>
            <select value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })} className="w-full text-sm px-3 py-2.5 border border-gray-200 rounded-lg bg-white outline-none focus:border-brand-400">
              <option value="SAR">SAR</option>
              <option value="USD">USD</option>
              <option value="EUR">EUR</option>
              <option value="GBP">GBP</option>
            </select>
          </label>
          <label className="block">
            <span className="block text-xs font-semibold text-gray-600 mb-1">Subtotal</span>
            <input type="number" min="0" step="0.01" value={form.subtotal} onChange={(e) => setForm({ ...form, subtotal: e.target.value })} className="w-full text-sm px-3 py-2.5 border border-gray-200 rounded-lg outline-none focus:border-brand-400" />
          </label>
          <label className="block">
            <span className="block text-xs font-semibold text-gray-600 mb-1">Tax</span>
            <input type="number" min="0" step="0.01" value={form.tax} onChange={(e) => setForm({ ...form, tax: e.target.value })} className="w-full text-sm px-3 py-2.5 border border-gray-200 rounded-lg outline-none focus:border-brand-400" />
          </label>
        </div>
        <label className="block">
          <span className="block text-xs font-semibold text-gray-600 mb-1">Due date</span>
          <input type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} className="w-full text-sm px-3 py-2.5 border border-gray-200 rounded-lg outline-none focus:border-brand-400" />
        </label>
        <label className="block">
          <span className="block text-xs font-semibold text-gray-600 mb-1">Notes</span>
          <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} className="w-full text-sm px-3 py-2.5 border border-gray-200 rounded-lg outline-none resize-none focus:border-brand-400" />
        </label>

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50">Cancel</button>
          <button type="submit" disabled={create.isPending} className="flex items-center gap-2 px-4 py-2 text-sm bg-brand-500 text-white rounded-lg disabled:opacity-50 hover:bg-brand-600">
            {create.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Create
          </button>
        </div>
      </form>
    </div>
  );
}

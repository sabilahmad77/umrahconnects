'use client';

import { useState } from 'react';
import {
  Search, Plus, Download, RefreshCw, BookOpen,
  AlertCircle, MoreHorizontal, Eye, X, Loader2,
  CheckCircle2, Clock, FileEdit, XCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  useBookings, useBookingStats, useCreateBooking,
  usePackages, usePilgrims,
} from '@/hooks/use-api';
import { cn } from '@/lib/utils';

const STATUS: Record<string, { label: string; color: string; dot: string }> = {
  DRAFT:      { label: 'Draft',      color: 'bg-gray-100 text-gray-600',    dot: 'bg-gray-400' },
  PENDING:    { label: 'Pending',    color: 'bg-yellow-100 text-yellow-700', dot: 'bg-yellow-500' },
  CONFIRMED:  { label: 'Confirmed',  color: 'bg-green-100 text-green-700',  dot: 'bg-green-500' },
  CANCELLED:  { label: 'Cancelled',  color: 'bg-red-100 text-red-600',      dot: 'bg-red-500' },
  COMPLETED:  { label: 'Completed',  color: 'bg-blue-100 text-blue-700',    dot: 'bg-blue-500' },
};

const FILTERS = ['ALL', 'CONFIRMED', 'PENDING', 'DRAFT', 'CANCELLED', 'COMPLETED'];

function StatCard({ label, value, color, Icon }: { label: string; value: number; color: string; Icon?: any }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-4">
      <p className="text-2xl font-bold text-gray-900">{value.toLocaleString()}</p>
      <div className={cn('inline-flex items-center gap-1.5 text-xs font-medium mt-1', color)}>
        {Icon && <Icon className="h-3.5 w-3.5" />}
        {label}
      </div>
    </div>
  );
}

export function BookingList() {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [page, setPage] = useState(1);
  const [showCreate, setShowCreate] = useState(false);
  const [viewBooking, setViewBooking] = useState<any | null>(null);

  const { data, isLoading, error, refetch } = useBookings({
    page,
    limit: 20,
    search: search || undefined,
    status: statusFilter !== 'ALL' ? statusFilter : undefined,
  });
  const { data: stats } = useBookingStats();
  const createBooking = useCreateBooking();

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / 20);

  return (
    <div className="space-y-5 pb-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Bookings</h1>
          <p className="text-sm text-gray-500 mt-0.5">{total.toLocaleString()} total bookings</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => refetch()} className="p-2 border border-gray-200 rounded-xl hover:bg-gray-50 text-gray-500 hover:text-gray-600 transition-colors">
            <RefreshCw className="h-4 w-4" />
          </button>
          <button
            onClick={() => {
              const rows = items;
              if (!rows.length) { toast('Nothing to export'); return; }
              const header = ['bookingRef', 'status', 'paxAdult', 'totalAmountCents', 'paidAmountCents', 'currency', 'createdAt'];
              const csv = [
                header.join(','),
                ...rows.map((r: any) => header.map((k) => {
                  const v = r[k];
                  const s = v == null ? '' : String(v);
                  return s.includes(',') || s.includes('"') ? `"${s.replace(/"/g, '""')}"` : s;
                }).join(',')),
              ].join('\n');
              const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = `bookings-${new Date().toISOString().slice(0, 10)}.csv`;
              a.click();
              URL.revokeObjectURL(url);
              toast.success(`Exported ${rows.length} bookings`);
            }}
            className="flex items-center gap-2 text-sm px-4 py-2 border border-gray-200 rounded-xl hover:bg-gray-50 text-gray-600 transition-colors"
          >
            <Download className="h-4 w-4" />
            Export
          </button>
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 text-sm px-4 py-2 bg-brand-500 text-white rounded-xl hover:bg-brand-600 transition-colors shadow-sm shadow-brand-500/30"
          >
            <Plus className="h-4 w-4" />
            New Booking
          </button>
        </div>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard label="Confirmed" Icon={CheckCircle2} value={stats.byStatus?.CONFIRMED ?? 0} color="text-green-600" />
          <StatCard label="Pending"   Icon={Clock}        value={stats.byStatus?.PENDING ?? 0}   color="text-yellow-600" />
          <StatCard label="Draft"     Icon={FileEdit}     value={stats.byStatus?.DRAFT ?? 0}     color="text-gray-500" />
          <StatCard label="Cancelled" Icon={XCircle}      value={stats.byStatus?.CANCELLED ?? 0} color="text-red-500" />
        </div>
      )}

      {/* Search + Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-xl px-3 py-2.5 w-full sm:w-72 focus-within:border-brand-300 transition-colors">
          <Search className="h-4 w-4 text-gray-500 shrink-0" />
          <input
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            placeholder="Search bookings..."
            className="text-sm bg-transparent flex-1 outline-none placeholder:text-gray-500"
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
              {f === 'ALL' ? 'All Bookings' : STATUS[f]?.label ?? f}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
        {isLoading ? (
          <div className="divide-y divide-gray-50">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4 px-5 py-3.5 animate-pulse">
                <div className="w-10 h-10 rounded-xl bg-gray-100" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 w-36 bg-gray-100 rounded" />
                  <div className="h-3 w-24 bg-gray-100 rounded" />
                </div>
                <div className="h-6 w-20 bg-gray-100 rounded-full" />
                <div className="h-4 w-24 bg-gray-100 rounded" />
              </div>
            ))}
          </div>
        ) : error ? (
          <div className="py-20 text-center">
            <AlertCircle className="h-10 w-10 mx-auto mb-3 text-red-400 opacity-60" />
            <p className="text-sm text-red-500 mb-2">Failed to load bookings</p>
            <button onClick={() => refetch()} className="text-xs text-brand-500 hover:underline">Retry</button>
          </div>
        ) : (
          <>
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="text-left text-xs font-semibold text-gray-500 px-5 py-3">Booking</th>
                  <th className="text-left text-xs font-semibold text-gray-500 px-5 py-3">Status</th>
                  <th className="text-left text-xs font-semibold text-gray-500 px-5 py-3 hidden md:table-cell">Package</th>
                  <th className="text-left text-xs font-semibold text-gray-500 px-5 py-3 hidden lg:table-cell">Amount</th>
                  <th className="text-left text-xs font-semibold text-gray-500 px-5 py-3 hidden xl:table-cell">Date</th>
                  <th className="text-right text-xs font-semibold text-gray-500 px-5 py-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {items.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-20 text-center">
                      <BookOpen className="h-10 w-10 mx-auto mb-3 text-gray-300" />
                      <p className="text-sm text-gray-500">No bookings found</p>
                    </td>
                  </tr>
                ) : items.map((b: any) => {
                  const cfg = STATUS[b.status] ?? { label: b.status, color: 'bg-gray-100 text-gray-600', dot: 'bg-gray-400' };
                  const amt = b.totalAmountCents != null
                    ? `SAR ${(b.totalAmountCents / 100).toLocaleString('en-SA', { maximumFractionDigits: 0 })}`
                    : '—';
                  const pilgrimName = b.pilgrim
                    ? [b.pilgrim.firstNameEn, b.pilgrim.lastNameEn].filter(Boolean).join(' ') || b.pilgrim.firstNameAr || '—'
                    : '—';
                  return (
                    <tr key={b.id} onClick={() => { window.location.href = `/bookings/${b.id}`; }} className="hover:bg-gray-50/60 transition-colors cursor-pointer">
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-xl bg-brand-50 flex items-center justify-center text-brand-600 text-xs font-bold shrink-0">
                            {b.bookingRef?.slice(0, 2) ?? 'BK'}
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-gray-800">{b.bookingRef ?? b.id?.slice(0, 8)}</p>
                            <p className="text-xs text-gray-500">{pilgrimName}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-3.5">
                        <span className={cn('inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full font-medium', cfg.color)}>
                          <span className={cn('w-1.5 h-1.5 rounded-full', cfg.dot)} />
                          {cfg.label}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 hidden md:table-cell">
                        <p className="text-sm text-gray-700">{b.package?.name ?? '—'}</p>
                        <p className="text-xs text-gray-500">{b.package?.type ?? ''}</p>
                      </td>
                      <td className="px-5 py-3.5 hidden lg:table-cell">
                        <p className="text-sm font-semibold text-gray-800">{amt}</p>
                      </td>
                      <td className="px-5 py-3.5 hidden xl:table-cell">
                        <p className="text-sm text-gray-600">{b.createdAt ? new Date(b.createdAt).toLocaleDateString() : '—'}</p>
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                          <button onClick={(e) => { e.stopPropagation(); setViewBooking(b); }} title="View" className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors">
                            <Eye className="h-3.5 w-3.5 text-gray-500" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {totalPages > 1 && (
              <div className="flex items-center justify-between px-5 py-3 border-t border-gray-100">
                <p className="text-xs text-gray-500">Page {page} of {totalPages} · {total.toLocaleString()} results</p>
                <div className="flex gap-1.5">
                  <button onClick={() => setPage(Math.max(1, page - 1))} disabled={page === 1} className="text-xs px-3 py-1.5 border border-gray-200 rounded-lg disabled:opacity-40 hover:bg-gray-50 transition-colors">Prev</button>
                  <button onClick={() => setPage(page + 1)} disabled={page >= totalPages} className="text-xs px-3 py-1.5 border border-gray-200 rounded-lg disabled:opacity-40 hover:bg-gray-50 transition-colors">Next</button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {showCreate && (
        <NewBookingModal
          onClose={() => setShowCreate(false)}
          onCreate={async (dto) => {
            try {
              await createBooking.mutateAsync(dto);
              toast.success('Booking created');
              setShowCreate(false);
              refetch();
            } catch (e: any) {
              toast.error(e?.response?.data?.error?.message ?? e?.message ?? 'Failed to create booking');
            }
          }}
          pending={createBooking.isPending}
        />
      )}

      {viewBooking && (
        <BookingDetailModal booking={viewBooking} onClose={() => setViewBooking(null)} />
      )}
    </div>
  );
}

function BookingDetailModal({ booking, onClose }: { booking: any; onClose: () => void }) {
  const fmt = (cents: any) => cents != null
    ? `${booking.currency ?? 'SAR'} ${(Number(cents) / 100).toLocaleString()}`
    : '—';
  return (
    <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-lg p-6 shadow-xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-bold text-gray-900">{booking.bookingRef ?? booking.id?.slice(0, 8)}</h2>
            <p className="text-xs text-gray-500 mt-0.5">{booking.status?.replace(/_/g, ' ')}</p>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg">
            <X className="h-4 w-4 text-gray-500" />
          </button>
        </div>
        <div className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
          <div><p className="text-[10px] font-bold uppercase tracking-wide text-gray-500">Package</p><p className="text-gray-800 mt-0.5">{booking.package?.name ?? '—'}</p></div>
          <div><p className="text-[10px] font-bold uppercase tracking-wide text-gray-500">Status</p><p className="text-gray-800 mt-0.5">{booking.status?.replace(/_/g, ' ') ?? '—'}</p></div>
          <div><p className="text-[10px] font-bold uppercase tracking-wide text-gray-500">Total</p><p className="text-brand-700 font-bold mt-0.5">{fmt(booking.totalAmountCents)}</p></div>
          <div><p className="text-[10px] font-bold uppercase tracking-wide text-gray-500">Paid</p><p className="text-gray-800 mt-0.5">{fmt(booking.paidAmountCents)}</p></div>
          <div><p className="text-[10px] font-bold uppercase tracking-wide text-gray-500">Departure</p><p className="text-gray-800 mt-0.5">{booking.departureDate ? new Date(booking.departureDate).toLocaleDateString() : '—'}</p></div>
          <div><p className="text-[10px] font-bold uppercase tracking-wide text-gray-500">Return</p><p className="text-gray-800 mt-0.5">{booking.returnDate ? new Date(booking.returnDate).toLocaleDateString() : '—'}</p></div>
          <div><p className="text-[10px] font-bold uppercase tracking-wide text-gray-500">Created</p><p className="text-gray-800 mt-0.5">{booking.createdAt ? new Date(booking.createdAt).toLocaleDateString() : '—'}</p></div>
          <div><p className="text-[10px] font-bold uppercase tracking-wide text-gray-500">Pilgrims</p><p className="text-gray-800 mt-0.5">{booking.pilgrims?.length ?? 0} assigned</p></div>
          {booking.notes && (
            <div className="col-span-2 mt-2 pt-3 border-t border-gray-100">
              <p className="text-[10px] font-bold uppercase tracking-wide text-gray-500">Notes</p>
              <p className="text-sm text-gray-700 mt-1 whitespace-pre-line">{booking.notes}</p>
            </div>
          )}
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onClose} className="px-4 py-2 text-sm border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50">Close</button>
        </div>
      </div>
    </div>
  );
}

// ─── New Booking Modal ──────────────────────────────────────────────────────
function NewBookingModal({
  onClose, onCreate, pending,
}: {
  onClose: () => void;
  onCreate: (dto: any) => Promise<void>;
  pending: boolean;
}) {
  const packages = usePackages();
  const pilgrims = usePilgrims({ limit: 100 });

  const pkgList: any[] = Array.isArray(packages.data) ? packages.data : (packages.data as any)?.items ?? [];
  const pilgrimList: any[] = pilgrims.data?.items ?? [];

  const [packageId, setPackageId] = useState(pkgList[0]?.id ?? '');
  const [leadPilgrimId, setLeadPilgrimId] = useState(pilgrimList[0]?.id ?? '');
  const [paxAdult, setPaxAdult] = useState('2');
  const [paxChild, setPaxChild] = useState('0');
  const [totalAmount, setTotalAmount] = useState('');
  const [depositAmount, setDepositAmount] = useState('');
  const [status, setStatus] = useState('DRAFT');
  const [notes, setNotes] = useState('');

  // Auto-fill packageId / leadPilgrimId once data loads
  if (!packageId && pkgList[0]?.id) setPackageId(pkgList[0].id);
  if (!leadPilgrimId && pilgrimList[0]?.id) setLeadPilgrimId(pilgrimList[0].id);

  // When package picked, auto-suggest total from package basePrice
  const suggestedTotal = packageId
    ? pkgList.find((p) => p.id === packageId)?.basePriceCents
    : undefined;
  const suggestedSar = suggestedTotal ? Math.round(Number(suggestedTotal) / 100) : '';

  const submit = async () => {
    if (!packageId || !leadPilgrimId) return;
    const amount = Number(totalAmount || suggestedSar || 0);
    if (!amount) return;
    await onCreate({
      packageId,
      leadPilgrimId,
      paxAdult: Number(paxAdult || 1),
      paxChild: Number(paxChild || 0),
      totalAmount: amount,
      depositAmount: depositAmount ? Number(depositAmount) : undefined,
      currency: 'SAR',
      status,
      notes: notes || undefined,
    });
  };

  return (
    <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-md p-5 shadow-xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-gray-900">New booking</h2>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg">
            <X className="h-4 w-4 text-gray-500" />
          </button>
        </div>

        {pkgList.length === 0 ? (
          <p className="text-sm text-gray-500 py-6 text-center">
            No packages found. Create a package first from the operator setup.
          </p>
        ) : pilgrimList.length === 0 ? (
          <p className="text-sm text-gray-500 py-6 text-center">
            No pilgrims found. Add at least one pilgrim before booking.
          </p>
        ) : (
          <div className="space-y-3">
            <label className="block">
              <span className="block text-xs font-semibold text-gray-600 mb-1">Package *</span>
              <select
                value={packageId}
                onChange={(e) => setPackageId(e.target.value)}
                className="w-full text-sm px-3 py-2.5 border border-gray-200 rounded-lg outline-none bg-white"
              >
                {pkgList.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="block text-xs font-semibold text-gray-600 mb-1">Lead pilgrim *</span>
              <select
                value={leadPilgrimId}
                onChange={(e) => setLeadPilgrimId(e.target.value)}
                className="w-full text-sm px-3 py-2.5 border border-gray-200 rounded-lg outline-none bg-white"
              >
                {pilgrimList.map((p) => (
                  <option key={p.id} value={p.id}>
                    {[p.firstNameEn, p.lastNameEn].filter(Boolean).join(' ') || p.id.slice(0, 8)}
                  </option>
                ))}
              </select>
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="block text-xs font-semibold text-gray-600 mb-1">Adults *</span>
                <input type="number" min="1" value={paxAdult} onChange={(e) => setPaxAdult(e.target.value)} className="w-full text-sm px-3 py-2.5 border border-gray-200 rounded-lg outline-none" />
              </label>
              <label className="block">
                <span className="block text-xs font-semibold text-gray-600 mb-1">Children</span>
                <input type="number" min="0" value={paxChild} onChange={(e) => setPaxChild(e.target.value)} className="w-full text-sm px-3 py-2.5 border border-gray-200 rounded-lg outline-none" />
              </label>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="block text-xs font-semibold text-gray-600 mb-1">Total (SAR) *</span>
                <input
                  type="number"
                  min="0"
                  value={totalAmount}
                  onChange={(e) => setTotalAmount(e.target.value)}
                  placeholder={suggestedSar ? `${suggestedSar}` : 'e.g. 25000'}
                  className="w-full text-sm px-3 py-2.5 border border-gray-200 rounded-lg outline-none"
                />
              </label>
              <label className="block">
                <span className="block text-xs font-semibold text-gray-600 mb-1">Deposit (SAR)</span>
                <input type="number" min="0" value={depositAmount} onChange={(e) => setDepositAmount(e.target.value)} className="w-full text-sm px-3 py-2.5 border border-gray-200 rounded-lg outline-none" />
              </label>
            </div>
            <label className="block">
              <span className="block text-xs font-semibold text-gray-600 mb-1">Status</span>
              <select value={status} onChange={(e) => setStatus(e.target.value)} className="w-full text-sm px-3 py-2.5 border border-gray-200 rounded-lg outline-none bg-white">
                <option value="DRAFT">Draft / Enquiry</option>
                <option value="CONFIRMED">Confirmed</option>
                <option value="PARTIALLY_PAID">Partially paid</option>
                <option value="FULLY_PAID">Fully paid</option>
                <option value="VISA_PROCESSING">Visa processing</option>
              </select>
            </label>
            <label className="block">
              <span className="block text-xs font-semibold text-gray-600 mb-1">Notes</span>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                placeholder="Special requests…"
                className="w-full text-sm px-3 py-2.5 border border-gray-200 rounded-lg outline-none resize-none"
              />
            </label>
          </div>
        )}

        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onClose} disabled={pending} className="px-4 py-2 text-sm border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 disabled:opacity-50">Cancel</button>
          <button
            onClick={submit}
            disabled={pending || !packageId || !leadPilgrimId || !(totalAmount || suggestedSar)}
            className="flex items-center gap-2 px-4 py-2 text-sm bg-brand-500 hover:bg-brand-600 text-white rounded-lg disabled:opacity-50 shadow-sm"
          >
            {pending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Create booking
          </button>
        </div>
      </div>
    </div>
  );
}

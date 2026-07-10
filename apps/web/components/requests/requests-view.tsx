'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  Building2, Bus, FileCheck2, Package, Users, ChefHat, MapPin, X,
  Loader2, Plus, Sparkles, CalendarDays, Check, XCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  useMyRequests, useCreateRequest, useAcceptOffer, useRejectOffer,
} from '@/hooks/use-platform';
import { cn } from '@/lib/utils';

const SERVICE_TYPE_META: Record<string, { label: string; Icon: any; tint: string }> = {
  HOTEL:     { label: 'Hotel room',  Icon: Building2,  tint: 'bg-blue-50 text-blue-700' },
  TRANSPORT: { label: 'Transport',   Icon: Bus,        tint: 'bg-purple-50 text-purple-700' },
  VISA:      { label: 'Visa',        Icon: FileCheck2, tint: 'bg-yellow-50 text-yellow-700' },
  PACKAGE:   { label: 'Package',     Icon: Package,    tint: 'bg-rose-50 text-rose-700' },
  GUIDE:     { label: 'Guide',       Icon: Users,      tint: 'bg-emerald-50 text-emerald-700' },
  CATERING:  { label: 'Catering',    Icon: ChefHat,    tint: 'bg-orange-50 text-orange-700' },
  OTHER:     { label: 'Other',       Icon: Sparkles,   tint: 'bg-gray-50 text-gray-700' },
};

const STATUS_META: Record<string, { label: string; color: string }> = {
  OPEN:           { label: 'Open',           color: 'bg-blue-100 text-blue-700' },
  IN_NEGOTIATION: { label: 'Receiving offers', color: 'bg-yellow-100 text-yellow-700' },
  FULFILLED:      { label: 'Fulfilled',      color: 'bg-saudi-50  text-saudi-700' },
  CLOSED:         { label: 'Closed',         color: 'bg-gray-100 text-gray-600' },
  EXPIRED:        { label: 'Expired',        color: 'bg-gray-100 text-gray-500' },
};

const fmtSAR = (cents?: number | null) =>
  cents != null ? `SAR ${(Number(cents) / 100).toLocaleString('en-SA', { maximumFractionDigits: 0 })}` : '—';

export function RequestsView() {
  const [showCreate, setShowCreate] = useState(false);
  const my = useMyRequests();
  const create = useCreateRequest();

  const items: any[] = my.data?.items ?? [];
  const total = my.data?.total ?? 0;

  return (
    <div className="space-y-5 pb-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">My Marketplace Requests</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Tell providers what you need — they send offers, you pick the best one.
          </p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 text-sm px-4 py-2 bg-brand-500 text-white rounded-xl hover:bg-brand-600 transition-colors shadow-sm shadow-brand-500/30"
        >
          <Plus className="h-4 w-4" /> New request
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <StatCard label="Open requests" value={items.filter((r) => r.status === 'OPEN' || r.status === 'IN_NEGOTIATION').length.toString()} tint="text-blue-700" />
        <StatCard label="Offers received" value={items.reduce((a, r) => a + (r.offers?.length ?? 0), 0).toString()} tint="text-brand-700" />
        <StatCard label="Fulfilled" value={items.filter((r) => r.status === 'FULFILLED').length.toString()} tint="text-saudi-700" />
      </div>

      {my.isLoading ? (
        <div className="grid gap-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-40 bg-gray-50 rounded-2xl animate-pulse" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 p-10 text-center">
          <Sparkles className="h-8 w-8 mx-auto text-brand-400 mb-3" />
          <p className="font-semibold text-gray-800">No requests yet</p>
          <p className="text-sm text-gray-500 mt-1">
            Open your first request and let providers come to you with offers.
          </p>
          <button
            onClick={() => setShowCreate(true)}
            className="inline-flex items-center gap-2 mt-5 text-sm px-4 py-2 bg-brand-500 text-white rounded-xl hover:bg-brand-600 transition-colors"
          >
            <Plus className="h-4 w-4" /> Create a request
          </button>
        </div>
      ) : (
        <div className="grid gap-3">
          {items.map((r) => (
            <RequestCard key={r.id} request={r} />
          ))}
        </div>
      )}

      {showCreate && (
        <CreateRequestModal
          onClose={() => setShowCreate(false)}
          onCreate={async (dto) => {
            try {
              await create.mutateAsync(dto);
              toast.success('Request created — providers can now send offers');
              setShowCreate(false);
            } catch (e: any) {
              toast.error(e?.response?.data?.error?.message ?? e?.message ?? 'Failed to create');
            }
          }}
          pending={create.isPending}
        />
      )}
    </div>
  );
}

function StatCard({ label, value, tint }: { label: string; value: string; tint: string }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-4">
      <p className={cn('text-2xl font-bold', tint)}>{value}</p>
      <p className="text-xs text-gray-500 mt-1">{label}</p>
    </div>
  );
}

function RequestCard({ request: r }: { request: any }) {
  const meta = SERVICE_TYPE_META[r.serviceType] ?? SERVICE_TYPE_META.OTHER;
  const statusMeta = STATUS_META[r.status] ?? STATUS_META.OPEN;
  const acceptOffer = useAcceptOffer();
  const rejectOffer = useRejectOffer();

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-5 hover:border-gray-200 transition-colors">
      <Link href={`/requests/${r.id}`} className="flex items-start gap-4 group">
        <div className={cn('w-12 h-12 rounded-xl flex items-center justify-center shrink-0', meta.tint)}>
          <meta.Icon className="h-5 w-5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <p className="font-semibold text-gray-900 group-hover:text-brand-700 transition-colors">{r.title}</p>
              <p className="text-xs text-gray-500 mt-0.5">{meta.label}</p>
            </div>
            <span className={cn('text-[10px] font-bold px-2 py-1 rounded-full', statusMeta.color)}>
              {statusMeta.label}
            </span>
          </div>
          {r.description && <p className="text-sm text-gray-600 mt-2.5">{r.description}</p>}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 mt-3 text-xs text-gray-500">
            {r.city && (
              <span className="inline-flex items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5" /> {r.city}
              </span>
            )}
            {(r.dateFrom || r.dateTo) && (
              <span className="inline-flex items-center gap-1.5">
                <CalendarDays className="h-3.5 w-3.5" />
                {r.dateFrom ? new Date(r.dateFrom).toLocaleDateString() : '—'}
                {' → '}
                {r.dateTo ? new Date(r.dateTo).toLocaleDateString() : '—'}
              </span>
            )}
            {r.travelers != null && (
              <span className="inline-flex items-center gap-1.5">
                <Users className="h-3.5 w-3.5" /> {r.travelers} traveler{r.travelers === 1 ? '' : 's'}
              </span>
            )}
            {(r.budgetMinCents != null || r.budgetMaxCents != null) && (
              <span className="text-brand-700 font-semibold">
                Budget {fmtSAR(r.budgetMinCents)} — {fmtSAR(r.budgetMaxCents)}
              </span>
            )}
          </div>
        </div>
      </Link>

      {/* Offers list */}
      {(r.offers?.length ?? 0) > 0 && (
        <div className="mt-4 pt-4 border-t border-gray-100">
          <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wide mb-2">
            Offers ({r.offers.length})
          </p>
          <div className="space-y-2">
            {r.offers.map((o: any) => {
              const oStatus = o.status as string;
              return (
                <div key={o.id} className="flex items-start justify-between gap-3 bg-gray-50 rounded-xl p-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900">{o.title}</p>
                    {o.description && <p className="text-xs text-gray-600 mt-0.5">{o.description}</p>}
                    <p className="text-xs text-brand-700 font-bold mt-1.5">{fmtSAR(o.priceCents)}</p>
                  </div>
                  {oStatus === 'PENDING' ? (
                    <div className="flex flex-col gap-1.5 shrink-0">
                      <button
                        onClick={async () => {
                          try {
                            await acceptOffer.mutateAsync({ requestId: r.id, offerId: o.id });
                            toast.success('Offer accepted');
                          } catch (e: any) {
                            toast.error(e?.response?.data?.error?.message ?? 'Failed');
                          }
                        }}
                        className="inline-flex items-center gap-1 text-[11px] px-2.5 py-1 bg-saudi-500 text-white rounded-lg hover:bg-saudi-600"
                      >
                        <Check className="h-3 w-3" /> Accept
                      </button>
                      <button
                        onClick={async () => {
                          try {
                            await rejectOffer.mutateAsync({ requestId: r.id, offerId: o.id });
                            toast('Offer rejected');
                          } catch (e: any) {
                            toast.error(e?.response?.data?.error?.message ?? 'Failed');
                          }
                        }}
                        className="inline-flex items-center gap-1 text-[11px] px-2.5 py-1 border border-gray-200 text-gray-600 rounded-lg hover:bg-white"
                      >
                        <XCircle className="h-3 w-3" /> Reject
                      </button>
                    </div>
                  ) : (
                    <span className={cn(
                      'text-[10px] font-bold px-2 py-1 rounded-full shrink-0',
                      oStatus === 'ACCEPTED' ? 'bg-saudi-50 text-saudi-700' :
                      oStatus === 'REJECTED' ? 'bg-red-50 text-red-600' : 'bg-gray-100 text-gray-500',
                    )}>
                      {oStatus}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Create-request modal ───────────────────────────────────────────────────
function CreateRequestModal({
  onClose, onCreate, pending,
}: {
  onClose: () => void;
  onCreate: (dto: any) => Promise<void>;
  pending: boolean;
}) {
  const [serviceType, setServiceType] = useState('HOTEL');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [city, setCity] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [travelers, setTravelers] = useState('2');
  const [budgetMin, setBudgetMin] = useState('');
  const [budgetMax, setBudgetMax] = useState('');

  const submit = async () => {
    if (!title.trim()) return;
    await onCreate({
      serviceType,
      title: title.trim(),
      description: description || undefined,
      city: city || undefined,
      dateFrom: dateFrom ? new Date(dateFrom).toISOString() : undefined,
      dateTo: dateTo ? new Date(dateTo).toISOString() : undefined,
      travelers: travelers ? Number(travelers) : undefined,
      budgetMinCents: budgetMin ? Number(budgetMin) * 100 : undefined,
      budgetMaxCents: budgetMax ? Number(budgetMax) * 100 : undefined,
      currency: 'SAR',
    });
  };

  return (
    <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-lg p-5 shadow-xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-gray-900">What do you need?</h2>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg">
            <X className="h-4 w-4 text-gray-500" />
          </button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5">Service type</label>
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
              {Object.entries(SERVICE_TYPE_META).map(([key, meta]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setServiceType(key)}
                  className={cn(
                    'flex flex-col items-center gap-1.5 p-3 rounded-xl border text-center transition-all',
                    serviceType === key
                      ? 'border-brand-500 bg-brand-50 text-brand-700 shadow-sm'
                      : 'border-gray-200 text-gray-500 hover:border-gray-300',
                  )}
                >
                  <meta.Icon className="h-4 w-4" />
                  <span className="text-[10px] font-medium">{meta.label}</span>
                </button>
              ))}
            </div>
          </div>

          <label className="block">
            <span className="block text-xs font-semibold text-gray-600 mb-1">Title *</span>
            <input
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Need 5-star room in Makkah for Ramadan"
              className="w-full text-sm px-3 py-2.5 border border-gray-200 rounded-lg focus:border-brand-400 focus:ring-2 focus:ring-brand-100 outline-none"
            />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="block text-xs font-semibold text-gray-600 mb-1">City</span>
              <input value={city} onChange={(e) => setCity(e.target.value)} placeholder="Makkah" className="w-full text-sm px-3 py-2.5 border border-gray-200 rounded-lg outline-none" />
            </label>
            <label className="block">
              <span className="block text-xs font-semibold text-gray-600 mb-1">Travelers</span>
              <input type="number" min="1" value={travelers} onChange={(e) => setTravelers(e.target.value)} className="w-full text-sm px-3 py-2.5 border border-gray-200 rounded-lg outline-none" />
            </label>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="block text-xs font-semibold text-gray-600 mb-1">From</span>
              <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="w-full text-sm px-3 py-2.5 border border-gray-200 rounded-lg outline-none" />
            </label>
            <label className="block">
              <span className="block text-xs font-semibold text-gray-600 mb-1">To</span>
              <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="w-full text-sm px-3 py-2.5 border border-gray-200 rounded-lg outline-none" />
            </label>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="block text-xs font-semibold text-gray-600 mb-1">Budget min (SAR)</span>
              <input type="number" min="0" value={budgetMin} onChange={(e) => setBudgetMin(e.target.value)} placeholder="3000" className="w-full text-sm px-3 py-2.5 border border-gray-200 rounded-lg outline-none" />
            </label>
            <label className="block">
              <span className="block text-xs font-semibold text-gray-600 mb-1">Budget max (SAR)</span>
              <input type="number" min="0" value={budgetMax} onChange={(e) => setBudgetMax(e.target.value)} placeholder="6000" className="w-full text-sm px-3 py-2.5 border border-gray-200 rounded-lg outline-none" />
            </label>
          </div>

          <label className="block">
            <span className="block text-xs font-semibold text-gray-600 mb-1">Description</span>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="Any specific requirements, preferences, group composition…"
              className="w-full text-sm px-3 py-2.5 border border-gray-200 rounded-lg outline-none resize-none"
            />
          </label>
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onClose} disabled={pending} className="px-4 py-2 text-sm border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 disabled:opacity-50">
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={pending || !title.trim()}
            className="flex items-center gap-2 px-4 py-2 text-sm bg-brand-500 hover:bg-brand-600 text-white rounded-lg disabled:opacity-50 shadow-sm"
          >
            {pending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Post request
          </button>
        </div>
      </div>
    </div>
  );
}

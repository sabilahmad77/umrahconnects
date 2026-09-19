'use client';

import { useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import {
  BadgeCheck, Building2, Bus, CalendarDays, ChefHat, Check, FileCheck2, Inbox, MapPin, Package, Plus, Send, Sparkles, Users, XCircle,
} from 'lucide-react';
import { Button, Input, LoadingState, ModalSurface, QueryFailure, Select, Textarea } from '@/components/ui/system';
import { apiErrorMessage } from '@/lib/api-error';
import { useCapabilities } from '@/hooks/use-capabilities';
import {
  useAcceptOffer,
  useCreateServiceRequest,
  useMyServiceRequests,
  useMySentOffers,
  useOpenServiceRequests,
  useRejectOffer,
} from '@/hooks/use-marketplace-requests';
import { formatMoney, toCents } from '@/components/marketplace/listing-rules';
import { cn } from '@/lib/utils';

export const SERVICE_TYPE_META: Record<string, { label: string; Icon: any; tint: string }> = {
  HOTEL: { label: 'Hotel room', Icon: Building2, tint: 'bg-blue-50 text-blue-700' },
  TRANSPORT: { label: 'Transport', Icon: Bus, tint: 'bg-purple-50 text-purple-700' },
  VISA: { label: 'Visa', Icon: FileCheck2, tint: 'bg-yellow-50 text-yellow-700' },
  PACKAGE: { label: 'Package', Icon: Package, tint: 'bg-rose-50 text-rose-700' },
  GUIDE: { label: 'Guide', Icon: Users, tint: 'bg-emerald-50 text-emerald-700' },
  CATERING: { label: 'Catering', Icon: ChefHat, tint: 'bg-orange-50 text-orange-700' },
  OTHER: { label: 'Other', Icon: Sparkles, tint: 'bg-gray-50 text-gray-700' },
};

export const REQUEST_STATUS_META: Record<string, { label: string; color: string }> = {
  OPEN: { label: 'Open', color: 'bg-blue-100 text-blue-700' },
  IN_NEGOTIATION: { label: 'Receiving offers', color: 'bg-yellow-100 text-yellow-700' },
  FULFILLED: { label: 'Fulfilled', color: 'bg-saudi-50 text-saudi-700' },
  CLOSED: { label: 'Closed', color: 'bg-gray-100 text-gray-600' },
  EXPIRED: { label: 'Expired', color: 'bg-gray-100 text-gray-600' },
};

const budget = (r: any) =>
  r.budgetMinCents != null || r.budgetMaxCents != null
    ? `Budget ${r.budgetMinCents != null ? formatMoney(r.budgetMinCents, r.currency) : '—'} – ${r.budgetMaxCents != null ? formatMoney(r.budgetMaxCents, r.currency) : '—'}`
    : '';

function RequestSummary({ r }: { r: any }) {
  const meta = SERVICE_TYPE_META[r.serviceType] ?? SERVICE_TYPE_META.OTHER;
  const status = REQUEST_STATUS_META[r.status] ?? REQUEST_STATUS_META.OPEN;
  return (
    <Link href={`/requests/${r.id}`} className="group flex items-start gap-4">
      <div className={cn('flex h-12 w-12 shrink-0 items-center justify-center rounded-xl', meta.tint)}>
        <meta.Icon className="h-5 w-5" aria-hidden="true" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="font-semibold text-gray-900 transition-colors group-hover:text-brand-700">{r.title}</p>
            <p className="mt-0.5 text-xs text-gray-600">{meta.label}</p>
          </div>
          <span className={cn('rounded-full px-2 py-1 text-xs font-bold', status.color)}>{status.label}</span>
        </div>
        {r.description && <p className="mt-2 line-clamp-2 text-sm text-gray-600">{r.description}</p>}
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-gray-600">
          {r.city && (
            <span className="inline-flex items-center gap-1.5">
              <MapPin className="h-3.5 w-3.5" aria-hidden="true" /> {r.city}
            </span>
          )}
          {(r.dateFrom || r.dateTo) && (
            <span className="inline-flex items-center gap-1.5">
              <CalendarDays className="h-3.5 w-3.5" aria-hidden="true" />
              {r.dateFrom ? new Date(r.dateFrom).toLocaleDateString() : '—'} → {r.dateTo ? new Date(r.dateTo).toLocaleDateString() : '—'}
            </span>
          )}
          {r.travelers != null && (
            <span className="inline-flex items-center gap-1.5">
              <Users className="h-3.5 w-3.5" aria-hidden="true" /> {r.travelers} traveler{r.travelers === 1 ? '' : 's'}
            </span>
          )}
          {budget(r) && <span className="font-semibold text-brand-700">{budget(r)}</span>}
        </div>
      </div>
    </Link>
  );
}

/** Seller shown on an offer: the provider's seller profile or organization, never a raw user id. */
export function OfferSeller({ offer }: { offer: any }) {
  if (!offer.seller?.name) return null;
  return (
    <span className="inline-flex items-center gap-1 text-xs text-gray-600">
      by {offer.seller.name}
      {offer.seller.verified && <BadgeCheck className="h-3.5 w-3.5 text-emerald-600" aria-label="Verified seller" />}
    </span>
  );
}

function MyRequestCard({ request: r }: { request: any }) {
  const accept = useAcceptOffer();
  const reject = useRejectOffer();
  const accepting = r.status === 'OPEN' || r.status === 'IN_NEGOTIATION';
  return (
    <li className="rounded-xl border border-gray-200 bg-white p-5">
      <RequestSummary r={r} />
      {(r.offers?.length ?? 0) > 0 && (
        <div className="mt-4 border-t border-gray-200 pt-4">
          <p className="mb-2 text-xs font-bold uppercase tracking-wide text-gray-600">Offers ({r.offers.length})</p>
          <ul className="space-y-2">
            {r.offers.map((o: any) => (
              <li key={o.id} className="flex items-start justify-between gap-3 rounded-xl bg-gray-50 p-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-gray-900">{o.title}</p>
                  <OfferSeller offer={o} />
                  {o.description && <p className="mt-0.5 text-xs text-gray-600">{o.description}</p>}
                  <p className="mt-1.5 text-xs font-bold text-brand-700">{formatMoney(o.priceCents, o.currency ?? r.currency)}</p>
                </div>
                {o.status === 'PENDING' && accepting ? (
                  <div className="flex shrink-0 flex-col gap-1.5">
                    <Button
                      className="px-2.5 py-1 text-xs"
                      busy={accept.isPending && accept.variables?.offerId === o.id}
                      disabled={accept.isPending || reject.isPending}
                      onClick={async () => {
                        try {
                          await accept.mutateAsync({ requestId: r.id, offerId: o.id });
                          toast.success('Offer accepted — convert it to a booking from the request page');
                        } catch (e) {
                          toast.error(apiErrorMessage(e, 'The offer could not be accepted.'));
                        }
                      }}
                    >
                      <Check className="h-3 w-3" aria-hidden="true" /> Accept
                    </Button>
                    <Button
                      variant="secondary"
                      className="px-2.5 py-1 text-xs"
                      busy={reject.isPending && reject.variables?.offerId === o.id}
                      disabled={accept.isPending || reject.isPending}
                      onClick={async () => {
                        try {
                          await reject.mutateAsync({ requestId: r.id, offerId: o.id });
                          toast('Offer declined');
                        } catch (e) {
                          toast.error(apiErrorMessage(e, 'The offer could not be declined.'));
                        }
                      }}
                    >
                      <XCircle className="h-3 w-3" aria-hidden="true" /> Decline
                    </Button>
                  </div>
                ) : (
                  <span className={cn('shrink-0 rounded-full px-2 py-1 text-xs font-bold', o.status === 'ACCEPTED' ? 'bg-saudi-50 text-saudi-700' : o.status === 'REJECTED' ? 'bg-red-50 text-red-600' : 'bg-gray-100 text-gray-600')}>
                    {o.status}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </li>
  );
}

function MyRequests({ onCreate }: { onCreate: () => void }) {
  const { data, isLoading, error, refetch } = useMyServiceRequests();
  const items: any[] = data?.items ?? [];
  if (error) return <QueryFailure error={error} onRetry={() => refetch()} />;
  if (isLoading) return <LoadingState label="Loading your requests…" />;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {[
          ['Open requests', items.filter((r) => r.status === 'OPEN' || r.status === 'IN_NEGOTIATION').length, 'text-blue-700'],
          ['Offers received', items.reduce((a, r) => a + (r.offers?.length ?? 0), 0), 'text-brand-700'],
          ['Fulfilled', items.filter((r) => r.status === 'FULFILLED').length, 'text-saudi-700'],
        ].map(([label, value, tint]) => (
          <div key={label as string} className="rounded-xl border border-gray-200 bg-white p-4">
            <p className={cn('text-2xl font-bold', tint as string)}>{value as number}</p>
            <p className="mt-1 text-xs text-gray-600">{label as string}</p>
          </div>
        ))}
      </div>
      {items.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white p-10 text-center">
          <Sparkles className="mx-auto mb-3 h-8 w-8 text-brand-400" aria-hidden="true" />
          <p className="font-semibold text-gray-800">No requests yet</p>
          <p className="mt-1 text-sm text-gray-600">Describe what you need and providers will send you offers.</p>
          <Button className="mt-5" onClick={onCreate}>
            <Plus className="h-4 w-4" aria-hidden="true" /> Create a request
          </Button>
        </div>
      ) : (
        <ul className="grid gap-3">
          {items.map((r) => (
            <MyRequestCard key={r.id} request={r} />
          ))}
        </ul>
      )}
    </div>
  );
}

function OpenRequests() {
  const [serviceType, setServiceType] = useState('');
  const { data, isLoading, error, refetch } = useOpenServiceRequests({ serviceType: serviceType || undefined });
  const items: any[] = data?.items ?? [];
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-gray-600">Requests from travelers and organizations that you can make an offer on.</p>
        <Select aria-label="Service type" value={serviceType} onChange={(e) => setServiceType(e.target.value)} className="w-auto">
          <option value="">Services I provide</option>
          {Object.entries(SERVICE_TYPE_META).map(([key, meta]) => (
            <option key={key} value={key}>
              {meta.label}
            </option>
          ))}
        </Select>
      </div>
      {error ? (
        <QueryFailure error={error} onRetry={() => refetch()} />
      ) : isLoading ? (
        <LoadingState label="Loading open requests…" />
      ) : items.length === 0 ? (
        <p className="flex flex-col items-center gap-2 rounded-xl border border-gray-200 bg-white p-10 text-center text-sm text-gray-600">
          <Inbox className="h-6 w-6 text-gray-400" aria-hidden="true" /> No open requests right now.
        </p>
      ) : (
        <ul className="grid gap-3">
          {items.map((r) => (
            <li key={r.id} className="rounded-xl border border-gray-200 bg-white p-5">
              <RequestSummary r={r} />
              <div className="mt-3 flex items-center justify-between gap-2 border-t border-gray-100 pt-3 text-xs text-gray-600">
                <span>{r._count?.offers ?? 0} offer{r._count?.offers === 1 ? '' : 's'} so far{r.offers?.length ? ' · you have made an offer' : ''}</span>
                <Link href={`/requests/${r.id}`} className="inline-flex items-center gap-1 font-semibold text-brand-700">
                  <Send className="h-3.5 w-3.5" aria-hidden="true" /> {r.offers?.length ? 'View' : 'Make an offer'}
                </Link>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function SentOffers() {
  const { data, isLoading, error, refetch } = useMySentOffers();
  const items: any[] = data?.items ?? [];
  if (error) return <QueryFailure error={error} onRetry={() => refetch()} />;
  if (isLoading) return <LoadingState label="Loading your offers…" />;
  if (!items.length) return <p className="rounded-xl border border-gray-200 bg-white p-10 text-center text-sm text-gray-600">You have not sent any offers yet.</p>;
  return (
    <ul className="divide-y divide-gray-100 rounded-xl border border-gray-200 bg-white">
      {items.map((o) => (
        <li key={o.id} className="flex flex-wrap items-center justify-between gap-2 p-4">
          <div className="min-w-0">
            <Link href={`/requests/${o.requestId}`} className="font-semibold text-gray-900 hover:text-brand-600">{o.request?.title ?? o.title}</Link>
            <p className="text-xs text-gray-600">{o.title} · {formatMoney(o.priceCents, o.currency)}</p>
          </div>
          <span className={cn('rounded-full px-2 py-1 text-xs font-bold', o.status === 'ACCEPTED' ? 'bg-saudi-50 text-saudi-700' : o.status === 'REJECTED' ? 'bg-red-50 text-red-600' : 'bg-yellow-50 text-yellow-700')}>
            {o.status}
          </span>
        </li>
      ))}
    </ul>
  );
}

function CreateRequestModal({ onClose }: { onClose: () => void }) {
  const create = useCreateServiceRequest();
  const [serviceType, setServiceType] = useState('HOTEL');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [city, setCity] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [travelers, setTravelers] = useState('2');
  const [budgetMin, setBudgetMin] = useState('');
  const [budgetMax, setBudgetMax] = useState('');
  const [error, setError] = useState('');

  const submit = async () => {
    setError('');
    if (!title.trim()) return setError('Describe what you need in the title.');
    const people = travelers.trim() ? Number(travelers) : undefined;
    if (people !== undefined && (!Number.isInteger(people) || people < 1 || people > 500)) return setError('Travelers must be a whole number between 1 and 500.');
    const min = budgetMin.trim() ? toCents(budgetMin) : undefined;
    const max = budgetMax.trim() ? toCents(budgetMax) : undefined;
    if (min === null || max === null) return setError('Enter budgets as numbers with at most two decimals.');
    if (min != null && max != null && min > max) return setError('The minimum budget is higher than the maximum.');
    if (dateFrom && dateTo && dateTo < dateFrom) return setError('The end date cannot be before the start date.');
    try {
      await create.mutateAsync({
        serviceType,
        title: title.trim(),
        description: description.trim() || undefined,
        city: city.trim() || undefined,
        dateFrom: dateFrom ? new Date(`${dateFrom}T00:00:00`).toISOString() : undefined,
        dateTo: dateTo ? new Date(`${dateTo}T00:00:00`).toISOString() : undefined,
        travelers: people,
        budgetMinCents: min ?? undefined,
        budgetMaxCents: max ?? undefined,
        currency: 'SAR',
      });
      toast.success('Request posted — providers can now send offers');
      onClose();
    } catch (e) {
      setError(apiErrorMessage(e, 'The request could not be posted.'));
    }
  };

  return (
    <ModalSurface title="What do you need?" onClose={onClose} busy={create.isPending}>
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white p-5 shadow-xl">
        <h2 className="mb-4 text-lg font-bold text-gray-900">What do you need?</h2>
        <div className="space-y-3">
          <fieldset>
            <legend className="mb-1.5 block text-xs font-semibold text-gray-600">Service type</legend>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {Object.entries(SERVICE_TYPE_META).map(([key, meta]) => (
                <button
                  key={key}
                  type="button"
                  aria-pressed={serviceType === key}
                  onClick={() => setServiceType(key)}
                  className={cn('flex flex-col items-center gap-1.5 rounded-xl border p-3 text-center transition-all', serviceType === key ? 'border-brand-500 bg-brand-50 text-brand-700 shadow-sm' : 'border-gray-200 text-gray-600 hover:border-gray-300')}
                >
                  <meta.Icon className="h-4 w-4" aria-hidden="true" />
                  <span className="text-xs font-medium">{meta.label}</span>
                </button>
              ))}
            </div>
          </fieldset>
          <label className="block text-xs font-semibold text-gray-600">
            Title *
            <Input className="mt-1" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. 5-star room in Makkah for Ramadan" maxLength={200} />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-xs font-semibold text-gray-600">
              City
              <Input className="mt-1" value={city} onChange={(e) => setCity(e.target.value)} placeholder="Makkah" />
            </label>
            <label className="block text-xs font-semibold text-gray-600">
              Travelers
              <Input className="mt-1" inputMode="numeric" value={travelers} onChange={(e) => setTravelers(e.target.value)} />
            </label>
            <label className="block text-xs font-semibold text-gray-600">
              From
              <Input className="mt-1" type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
            </label>
            <label className="block text-xs font-semibold text-gray-600">
              To
              <Input className="mt-1" type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
            </label>
            <label className="block text-xs font-semibold text-gray-600">
              Budget min (SAR)
              <Input className="mt-1" inputMode="decimal" value={budgetMin} onChange={(e) => setBudgetMin(e.target.value)} placeholder="3000" />
            </label>
            <label className="block text-xs font-semibold text-gray-600">
              Budget max (SAR)
              <Input className="mt-1" inputMode="decimal" value={budgetMax} onChange={(e) => setBudgetMax(e.target.value)} placeholder="6000" />
            </label>
          </div>
          <label className="block text-xs font-semibold text-gray-600">
            Description
            <Textarea className="mt-1" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Requirements, preferences, group composition…" />
          </label>
          {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={create.isPending}>Cancel</Button>
          <Button busy={create.isPending} onClick={() => void submit()}>Post request</Button>
        </div>
      </div>
    </ModalSurface>
  );
}

type Tab = 'mine' | 'open' | 'sent';

/**
 * /requests — travelers post what they need and compare offers; providers
 * (marketplace:listing:manage) also browse open requests and track their offers.
 */
export function RequestsView() {
  const { can } = useCapabilities();
  const isProvider = can('marketplace:listing:manage');
  const [tab, setTab] = useState<Tab>('mine');
  const [creating, setCreating] = useState(false);
  const active: Tab = isProvider ? tab : 'mine';
  const tabs: { key: Tab; label: string }[] = [
    { key: 'mine', label: 'My requests' },
    { key: 'open', label: 'Open requests' },
    { key: 'sent', label: 'Offers I sent' },
  ];

  return (
    <div className="space-y-5 pb-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Marketplace requests</h1>
          <p className="mt-0.5 text-sm text-gray-600">Tell providers what you need — they send offers, you pick the best one.</p>
        </div>
        <Button onClick={() => setCreating(true)}>
          <Plus className="h-4 w-4" aria-hidden="true" /> New request
        </Button>
      </div>
      {isProvider && (
        <div role="tablist" aria-label="Request sections" className="flex w-fit flex-wrap gap-1 rounded-xl border border-gray-200 bg-white p-1">
          {tabs.map((t) => (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={active === t.key}
              onClick={() => setTab(t.key)}
              className={cn('rounded-xl px-4 py-2 text-sm font-medium', active === t.key ? 'bg-brand-500 text-white shadow-sm' : 'text-gray-600 hover:bg-gray-50')}
            >
              {t.label}
            </button>
          ))}
        </div>
      )}
      <div role={isProvider ? 'tabpanel' : undefined}>
        {active === 'mine' && <MyRequests onCreate={() => setCreating(true)} />}
        {active === 'open' && <OpenRequests />}
        {active === 'sent' && <SentOffers />}
      </div>
      {creating && <CreateRequestModal onClose={() => setCreating(false)} />}
    </div>
  );
}

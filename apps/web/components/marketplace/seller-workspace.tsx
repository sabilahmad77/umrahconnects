'use client';

import { useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { Building2, Inbox, Plus, Store } from 'lucide-react';
import { Badge, Button, Input, LoadingState, ModalSurface, QueryFailure, Select, Textarea } from '@/components/ui/system';
import { apiErrorMessage } from '@/lib/api-error';
import { useAuthContext } from '@/components/providers/auth-provider';
import {
  useArchiveListing,
  useCreateListing,
  useCreateVendor,
  useDecideQuote,
  useIncomingQuotes,
  useMyListings,
  useMyQuotes,
  useMyVendors,
  useRespondQuote,
  useUpdateListing,
} from '@/hooks/use-marketplace';
import { cn } from '@/lib/utils';
import { ListingForm, type ListingIntent } from './listing-form';
import { formatMoney, listingPriceLabel, listingTransitions, STATUS_LABEL, toCents, TRANSITION_LABEL } from './listing-rules';

const VENDOR_TYPES = [
  { value: 'HOTEL', label: 'Hotel' },
  { value: 'TRANSPORT', label: 'Transport' },
  { value: 'VISA_AGENT', label: 'Visa agent' },
  { value: 'GUIDE', label: 'Guide' },
  { value: 'CATERING', label: 'Catering' },
  { value: 'OTHER', label: 'Other (use my organization type)' },
];
const DEFAULT_VENDOR_TYPE: Record<string, string> = {
  VENDOR_HOTEL: 'HOTEL',
  VENDOR_TRANSPORT: 'TRANSPORT',
  VENDOR_VISA: 'VISA_AGENT',
  VENDOR_GUIDE: 'GUIDE',
  VENDOR_CATERING: 'CATERING',
};

export const STATUS_TONE: Record<string, 'neutral' | 'success' | 'warning' | 'danger'> = {
  PUBLISHED: 'success',
  DRAFT: 'neutral',
  PAUSED: 'warning',
  ARCHIVED: 'danger',
};

/** A seller profile is the name travelers see on the organization's listings. */
export function SellerProfileForm({ onDone, onCancel }: { onDone?: () => void; onCancel?: () => void }) {
  const { user } = useAuthContext();
  const create = useCreateVendor();
  const [name, setName] = useState(user?.tenantName ?? '');
  const [type, setType] = useState(DEFAULT_VENDOR_TYPE[user?.tenantType ?? ''] ?? 'OTHER');
  const [city, setCity] = useState('');
  const [email, setEmail] = useState(user?.email ?? '');
  const [phone, setPhone] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState('');

  const submit = async () => {
    setError('');
    if (!name.trim()) return setError('Enter the name travelers should see.');
    try {
      await create.mutateAsync({ name: name.trim(), type, city: city.trim() || undefined, email: email.trim() || undefined, phone: phone.trim() || undefined, description: description.trim() || undefined });
      toast.success('Seller profile created');
      onDone?.();
    } catch (e) {
      setError(apiErrorMessage(e, 'The seller profile could not be created.'));
    }
  };

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
      noValidate
    >
      <label className="block text-xs font-semibold text-gray-600">
        Seller name shown on listings *
        <Input className="mt-1" value={name} onChange={(e) => setName(e.target.value)} maxLength={255} />
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-xs font-semibold text-gray-600">
          Seller type *
          <Select className="mt-1" value={type} onChange={(e) => setType(e.target.value)}>
            {VENDOR_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </Select>
        </label>
        <label className="block text-xs font-semibold text-gray-600">
          City
          <Input className="mt-1" value={city} onChange={(e) => setCity(e.target.value)} placeholder="Makkah" maxLength={100} />
        </label>
        <label className="block text-xs font-semibold text-gray-600">
          Contact email (private)
          <Input className="mt-1" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label className="block text-xs font-semibold text-gray-600">
          Contact phone (private)
          <Input className="mt-1" value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={30} />
        </label>
      </div>
      <label className="block text-xs font-semibold text-gray-600">
        About the seller
        <Textarea className="mt-1" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={5000} />
      </label>
      <p className="text-xs text-gray-600">Contact details are never shown on public pages; travelers reach you through inquiries.</p>
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      <div className="flex justify-end gap-2">
        {onCancel && (
          <Button variant="secondary" onClick={onCancel} disabled={create.isPending}>
            Cancel
          </Button>
        )}
        <Button type="submit" busy={create.isPending}>
          Create seller profile
        </Button>
      </div>
    </form>
  );
}

/** Status actions a seller can take on a listing, exactly as the server allows them. */
export function ListingStatusActions({ listing, onDone, size = 'sm' }: { listing: any; onDone?: () => void; size?: 'sm' | 'md' }) {
  const update = useUpdateListing();
  const archive = useArchiveListing();
  const [confirmArchive, setConfirmArchive] = useState(false);
  const busy = update.isPending || archive.isPending;

  const go = async (to: string) => {
    try {
      if (to === 'ARCHIVED') await archive.mutateAsync(listing.id);
      else await update.mutateAsync({ id: listing.id, status: to });
      toast.success(to === 'PUBLISHED' ? 'Listing published' : to === 'PAUSED' ? 'Listing unpublished' : to === 'ARCHIVED' ? 'Listing archived' : 'Listing moved to drafts');
      setConfirmArchive(false);
      onDone?.();
    } catch (e) {
      toast.error(apiErrorMessage(e, 'The status could not be changed.'));
    }
  };

  return (
    <>
      <div className="flex flex-wrap gap-2">
        {listingTransitions(listing.status).map((to) => (
          <Button
            key={to}
            variant={to === 'PUBLISHED' ? 'primary' : to === 'ARCHIVED' ? 'danger' : 'secondary'}
            className={cn(size === 'sm' && 'px-3 py-1.5 text-xs')}
            disabled={busy}
            onClick={() => (to === 'ARCHIVED' ? setConfirmArchive(true) : void go(to))}
          >
            {TRANSITION_LABEL[to] ?? to}
          </Button>
        ))}
      </div>
      {confirmArchive && (
        <ModalSurface title="Archive listing" onClose={() => setConfirmArchive(false)} busy={busy}>
          <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl">
            <h2 className="text-lg font-bold text-gray-900">Archive “{listing.name}”?</h2>
            <p className="mt-2 text-sm text-gray-600">
              It leaves the marketplace immediately. Its inquiries, quotes and bookings stay, and you can restore it as a draft later.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setConfirmArchive(false)} disabled={busy}>
                Keep it
              </Button>
              <Button variant="danger" busy={busy} onClick={() => void go('ARCHIVED')}>
                Archive listing
              </Button>
            </div>
          </div>
        </ModalSurface>
      )}
    </>
  );
}

export function CreateListingModal({ vendors, onClose, onCreated }: { vendors: any[]; onClose: () => void; onCreated?: (listing: any) => void }) {
  const create = useCreateListing();
  const submit = async (dto: Record<string, unknown>, intent: ListingIntent) => {
    try {
      const listing = await create.mutateAsync(dto);
      toast.success(intent === 'publish' ? 'Listing published' : 'Draft saved');
      onCreated?.(listing);
      onClose();
    } catch (e) {
      toast.error(apiErrorMessage(e, 'The listing could not be created.'));
    }
  };
  return (
    <ModalSurface title="New marketplace listing" onClose={onClose} busy={create.isPending}>
      <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-white p-5 shadow-xl">
        <h2 className="mb-4 text-lg font-bold text-gray-900">New marketplace listing</h2>
        <ListingForm mode="create" vendors={vendors} busy={create.isPending} onSubmit={submit} onCancel={onClose} />
      </div>
    </ModalSurface>
  );
}

const STATUS_FILTERS = ['', 'DRAFT', 'PUBLISHED', 'PAUSED', 'ARCHIVED'];

/** The organization's seller area: seller profile set-up, its listings in every status, and their actions. */
export function SellerWorkspace({ canManage }: { canManage: boolean }) {
  const vendors = useMyVendors();
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);
  const [addingProfile, setAddingProfile] = useState(false);
  const listings = useMyListings({ status: status || undefined, search: search.trim() || undefined, page, limit: 20 }, (vendors.data?.length ?? 0) > 0);

  if (vendors.error) return <QueryFailure error={vendors.error} onRetry={() => vendors.refetch()} />;
  if (vendors.isLoading) return <LoadingState label="Loading your seller profile…" />;

  if (!vendors.data?.length) {
    return (
      <div className="max-w-2xl rounded-xl border border-gray-200 bg-white p-5">
        <h2 className="flex items-center gap-2 text-base font-bold text-gray-900">
          <Store className="h-5 w-5 text-brand-600" aria-hidden="true" /> Set up your seller profile
        </h2>
        <p className="mb-4 mt-1 text-sm text-gray-600">Travelers see this name on your listings. You need one before you can list services.</p>
        {canManage ? <SellerProfileForm onDone={() => vendors.refetch()} /> : <p className="text-sm text-gray-600">Ask an administrator of your organization to create it.</p>}
      </div>
    );
  }

  const items = listings.data?.items ?? [];
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-gray-200 bg-white p-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-600">Selling as</p>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-sm font-semibold text-gray-900">
            {vendors.data.map((v: any) => (
              <span key={v.id} className="inline-flex items-center gap-1.5">
                <Building2 className="h-4 w-4 text-brand-600" aria-hidden="true" /> {v.name}
                <Badge tone={v.verified ? 'success' : 'neutral'}>{v.verified ? 'Verified' : 'Verification pending'}</Badge>
              </span>
            ))}
          </p>
        </div>
        {canManage && (
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => setAddingProfile(true)}>
              Add seller profile
            </Button>
            <Button onClick={() => setCreating(true)}>
              <Plus className="h-4 w-4" aria-hidden="true" /> New listing
            </Button>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter by status">
          {STATUS_FILTERS.map((s) => (
            <Button
              key={s || 'all'}
              variant={status === s ? 'primary' : 'secondary'}
              aria-pressed={status === s}
              className="px-3 py-1.5 text-xs"
              onClick={() => {
                setStatus(s);
                setPage(1);
              }}
            >
              {s ? STATUS_LABEL[s] : 'All'}
            </Button>
          ))}
        </div>
        <Input type="search" aria-label="Search my listings" placeholder="Search my listings" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} className="sm:w-64" />
      </div>

      {listings.error ? (
        <QueryFailure error={listings.error} onRetry={() => listings.refetch()} />
      ) : listings.isLoading ? (
        <LoadingState label="Loading your listings…" />
      ) : items.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white py-12 text-center text-sm text-gray-600">
          {status || search ? 'No listings match this filter.' : 'You have not created any listings yet.'}
        </div>
      ) : (
        <ul className="divide-y divide-gray-100 rounded-xl border border-gray-200 bg-white" aria-label="My listings">
          {items.map((l: any) => (
            <li key={l.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
              <div className="h-16 w-24 shrink-0 overflow-hidden rounded-lg bg-gray-100">
                {l.imageUrls?.[0] ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={l.imageUrls[0]} alt="" className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full items-center justify-center text-gray-400">
                    <Store className="h-5 w-5" aria-hidden="true" />
                  </div>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Link href={`/marketplace/${l.id}`} className="truncate font-semibold text-gray-900 hover:text-brand-600">
                    {l.name}
                  </Link>
                  <Badge tone={STATUS_TONE[l.status] ?? 'neutral'}>{STATUS_LABEL[l.status] ?? l.status}</Badge>
                </div>
                <p className="mt-0.5 text-xs text-gray-600">
                  {listingPriceLabel(l)} · {l.vendor?.name} · {l._count?.inquiries ?? 0} inquiries · {l._count?.bookings ?? 0} bookings · {l._count?.quotes ?? 0} quotes
                </p>
              </div>
              {canManage && <ListingStatusActions listing={l} onDone={() => listings.refetch()} />}
            </li>
          ))}
        </ul>
      )}

      {(listings.data?.totalPages ?? 1) > 1 && (
        <nav aria-label="My listing pages" className="flex items-center justify-end gap-2">
          <Button variant="secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            Previous
          </Button>
          <span className="text-xs text-gray-600">
            Page {page} of {listings.data?.totalPages}
          </span>
          <Button variant="secondary" disabled={page >= (listings.data?.totalPages ?? 1)} onClick={() => setPage((p) => p + 1)}>
            Next
          </Button>
        </nav>
      )}

      {creating && <CreateListingModal vendors={vendors.data} onClose={() => setCreating(false)} onCreated={() => listings.refetch()} />}
      {addingProfile && (
        <ModalSurface title="Add seller profile" onClose={() => setAddingProfile(false)}>
          <div className="w-full max-w-lg rounded-xl bg-white p-5 shadow-xl">
            <h2 className="mb-3 text-lg font-bold text-gray-900">Add seller profile</h2>
            <SellerProfileForm onCancel={() => setAddingProfile(false)} onDone={() => { setAddingProfile(false); vendors.refetch(); }} />
          </div>
        </ModalSurface>
      )}
    </div>
  );
}

function QuoteRequirements({ q }: { q: any }) {
  const r = q.requirements ?? {};
  const parts = [r.pax ? `${r.pax} people` : '', r.startDate ? `from ${r.startDate}` : '', r.endDate ? `to ${r.endDate}` : ''].filter(Boolean);
  return (
    <>
      {parts.length > 0 && <p className="text-xs text-gray-600">{parts.join(' · ')}</p>}
      {r.text && <p className="mt-1 whitespace-pre-wrap text-sm text-gray-700">{r.text}</p>}
    </>
  );
}

function RespondQuoteForm({ quote, onDone }: { quote: any; onDone: () => void }) {
  const respond = useRespondQuote();
  const [price, setPrice] = useState('');
  const [validUntil, setValidUntil] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const submit = async () => {
    setError('');
    const cents = toCents(price);
    if (!cents) return setError('Enter a price greater than zero, with at most two decimals.');
    try {
      await respond.mutateAsync({ id: quote.id, offeredPriceCents: cents, validUntil: validUntil ? new Date(`${validUntil}T23:59:59`).toISOString() : undefined, notes: notes.trim() || undefined });
      toast.success('Price sent');
      onDone();
    } catch (e) {
      setError(apiErrorMessage(e, 'The price could not be sent.'));
    }
  };
  return (
    <div className="mt-3 grid gap-2 sm:grid-cols-4">
      <Input aria-label={`Price in ${quote.currency}`} inputMode="decimal" placeholder={`Price (${quote.currency})`} value={price} onChange={(e) => setPrice(e.target.value)} />
      <Input aria-label="Valid until" type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} />
      <Input aria-label="Notes" placeholder="Notes (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} />
      <Button busy={respond.isPending} onClick={() => void submit()}>
        {quote.status === 'OFFERED' ? 'Update price' : 'Send price'}
      </Button>
      {error && <p role="alert" className="text-xs text-red-700 sm:col-span-4">{error}</p>}
    </div>
  );
}

/** Quotes the organization asked for, and quotes other organizations asked its seller profiles for. */
export function QuotesPanel() {
  const mine = useMyQuotes();
  const incoming = useIncomingQuotes();
  const decide = useDecideQuote();
  const [responding, setResponding] = useState<string | null>(null);

  const act = async (id: string, decision: 'accept' | 'reject') => {
    try {
      await decide.mutateAsync({ id, decision });
      toast.success(decision === 'accept' ? 'Quote accepted' : 'Quote declined');
    } catch (e) {
      toast.error(apiErrorMessage(e, 'The quote could not be updated.'));
    }
  };
  const expired = (q: any) => q.validUntil && new Date(q.validUntil).getTime() < Date.now();

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <section className="rounded-xl border border-gray-200 bg-white" aria-label="Quotes you requested">
        <h2 className="border-b border-gray-100 p-4 text-sm font-bold text-gray-900">Quotes you requested</h2>
        {mine.error ? (
          <div className="p-4"><QueryFailure error={mine.error} onRetry={() => mine.refetch()} /></div>
        ) : mine.isLoading ? (
          <LoadingState />
        ) : !mine.data?.length ? (
          <p className="p-6 text-center text-sm text-gray-600">Open a listing and choose “Request a quote”.</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {mine.data.map((q: any) => (
              <li key={q.id} className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <Link href={`/marketplace/${q.listing?.id}`} className="font-semibold text-gray-900 hover:text-brand-600">{q.listing?.name ?? 'Listing'}</Link>
                    <p className="text-xs text-gray-600">{q.vendor?.name}</p>
                  </div>
                  <Badge tone={q.status === 'ACCEPTED' ? 'success' : q.status === 'REJECTED' ? 'danger' : q.status === 'OFFERED' ? 'warning' : 'neutral'}>{q.status}</Badge>
                </div>
                <QuoteRequirements q={q} />
                {q.offeredPriceCents != null && (
                  <p className="mt-2 text-sm font-semibold text-gray-900">
                    Offered {formatMoney(q.offeredPriceCents, q.currency)}
                    {q.validUntil && <span className="font-normal text-gray-600"> · valid until {new Date(q.validUntil).toLocaleDateString()}</span>}
                  </p>
                )}
                {q.notes && <p className="mt-1 text-xs text-gray-600">{q.notes}</p>}
                <div className="mt-2 flex gap-2">
                  {q.status === 'OFFERED' && !expired(q) && (
                    <Button className="px-3 py-1.5 text-xs" disabled={decide.isPending} onClick={() => void act(q.id, 'accept')}>Accept</Button>
                  )}
                  {(q.status === 'PENDING' || q.status === 'OFFERED') && (
                    <Button variant="secondary" className="px-3 py-1.5 text-xs" disabled={decide.isPending} onClick={() => void act(q.id, 'reject')}>
                      {q.status === 'PENDING' ? 'Withdraw' : 'Decline'}
                    </Button>
                  )}
                  {q.status === 'OFFERED' && expired(q) && <span className="text-xs text-gray-600">This offer has expired.</span>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-xl border border-gray-200 bg-white" aria-label="Quotes you received">
        <h2 className="border-b border-gray-100 p-4 text-sm font-bold text-gray-900">Quotes you received</h2>
        {incoming.error ? (
          <div className="p-4"><QueryFailure error={incoming.error} onRetry={() => incoming.refetch()} /></div>
        ) : incoming.isLoading ? (
          <LoadingState />
        ) : !incoming.data?.length ? (
          <p className="flex flex-col items-center gap-2 p-6 text-center text-sm text-gray-600">
            <Inbox className="h-6 w-6 text-gray-400" aria-hidden="true" /> No quote requests yet.
          </p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {incoming.data.map((q: any) => (
              <li key={q.id} className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold text-gray-900">{q.requesterName ?? 'An organization'}</p>
                    <p className="text-xs text-gray-600">for {q.listing?.name ?? 'a listing'} · {new Date(q.requestedAt).toLocaleDateString()}</p>
                  </div>
                  <Badge tone={q.status === 'ACCEPTED' ? 'success' : q.status === 'REJECTED' ? 'danger' : q.status === 'OFFERED' ? 'warning' : 'neutral'}>{q.status}</Badge>
                </div>
                <QuoteRequirements q={q} />
                {q.offeredPriceCents != null && <p className="mt-2 text-sm text-gray-900">Your price: {formatMoney(q.offeredPriceCents, q.currency)}</p>}
                {(q.status === 'PENDING' || q.status === 'OFFERED') &&
                  (responding === q.id ? (
                    <RespondQuoteForm quote={q} onDone={() => setResponding(null)} />
                  ) : (
                    <Button variant="secondary" className="mt-2 px-3 py-1.5 text-xs" onClick={() => setResponding(q.id)}>
                      {q.status === 'OFFERED' ? 'Change price' : 'Send a price'}
                    </Button>
                  ))}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

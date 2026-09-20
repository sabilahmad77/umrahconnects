'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  ArrowLeft, BadgeCheck, CalendarCheck2, Edit3, FileText, ListChecks, MapPin, MessageSquare, Send, Store,
} from 'lucide-react';
import { Alert, Badge, Button, Input, LoadingState, ModalSurface, QueryFailure, Select, Textarea } from '@/components/ui/system';
import { apiErrorMessage } from '@/lib/api-error';
import { bookingTransitions } from '@/lib/booking-transitions';
import { bookingEstimateCents } from '@/lib/booking-estimate';
import { cn } from '@/lib/utils';
import { useAuthContext } from '@/components/providers/auth-provider';
import { useCapabilities } from '@/hooks/use-capabilities';
import {
  useCreateInquiry,
  useCreateMarketplaceBooking,
  useIncomingQuotes,
  useListingBookings,
  useListingInquiries,
  useMarketplaceListing,
  useMyListing,
  useRequestQuote,
  useRespondInquiry,
  useUpdateListing,
  useUpdateMarketplaceBooking,
} from '@/hooks/use-marketplace';
import { ListingMedia } from './listing-visual';
import { ListingForm } from './listing-form';
import { ListingStatusActions, STATUS_TONE } from './seller-workspace';
import { categoryLabel, formatMoney, isDirectlyBookable, isTakenDown, listingPriceLabel, PRICING_MODEL_LABEL, STATUS_LABEL } from './listing-rules';

// ─── Shared pieces ──────────────────────────────────────────────────────────

export function Gallery({ listing }: { listing: any }) {
  const images: string[] = Array.isArray(listing.imageUrls) ? listing.imageUrls : [];
  const [index, setIndex] = useState(0);
  const current = images[Math.min(index, images.length - 1)];
  if (!images.length) return <ListingMedia category={listing.type ?? ''} className="h-64 rounded-xl" />;
  return (
    <div className="space-y-2">
      <div className="aspect-[16/9] overflow-hidden rounded-xl bg-gray-100">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={current} alt={`${listing.name} — photo ${index + 1} of ${images.length}`} className="h-full w-full object-cover" />
      </div>
      {images.length > 1 && (
        <div className="flex gap-2 overflow-x-auto" role="group" aria-label="Photos">
          {images.map((url, i) => (
            <button
              key={url}
              type="button"
              aria-label={`Show photo ${i + 1}`}
              aria-pressed={i === index}
              onClick={() => setIndex(i)}
              className={cn('h-16 w-24 shrink-0 overflow-hidden rounded-lg border-2', i === index ? 'border-brand-500' : 'border-transparent')}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={url} alt="" className="h-full w-full object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function Details({ listing }: { listing: any }) {
  const attrs = Object.entries(listing.attributes ?? {}).filter(
    ([k, v]) => !['city', 'source', 'requestId', 'offerId'].includes(k) && v !== null && (typeof v !== 'object' || Array.isArray(v)),
  );
  return (
    <div className="space-y-3 rounded-xl border border-gray-200 bg-white p-5">
      <h2 className="text-sm font-bold text-gray-900">About this listing</h2>
      <p className="whitespace-pre-wrap text-sm text-gray-700">{listing.description || 'The seller has not added a description.'}</p>
      {attrs.length > 0 && (
        <dl className="grid grid-cols-2 gap-2 border-t border-gray-50 pt-3 text-xs">
          {attrs.map(([k, v]) => (
            <div key={k} className="rounded-lg bg-gray-50 px-2.5 py-1.5">
              <dt className="capitalize text-gray-600">{k.replace(/([A-Z])/g, ' $1')}</dt>
              <dd className="font-medium text-gray-900">{Array.isArray(v) ? v.join(', ') : v === true ? 'Yes' : v === false ? 'No' : String(v)}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}

export function PriceCard({ listing }: { listing: any }) {
  const cents = Number(listing.priceCents ?? 0);
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5">
      <p className="mb-1 text-xs font-semibold text-gray-600">Price</p>
      {cents ? (
        <>
          <p className="text-2xl font-bold text-gray-900">{formatMoney(cents, listing.currency ?? 'SAR')}</p>
          <p className="text-xs text-gray-600">{PRICING_MODEL_LABEL[String(listing.pricingModel).toUpperCase()] ?? ''}</p>
        </>
      ) : (
        <p className="text-base font-medium text-gray-600">Price on request</p>
      )}
    </div>
  );
}

export function SellerCard({ vendor, city }: { vendor?: any; city?: string | null }) {
  if (!vendor) return null;
  return (
    <div className="space-y-1 rounded-xl border border-gray-200 bg-white p-5">
      <p className="text-xs font-semibold text-gray-600">Seller</p>
      <p className="flex items-center gap-1.5 text-sm font-bold text-gray-900">
        <Store className="h-4 w-4 text-brand-600" aria-hidden="true" /> {vendor.name}
        {vendor.verified && <BadgeCheck className="h-4 w-4 text-emerald-600" aria-label="Verified seller" />}
      </p>
      {(city || vendor.city) && (
        <p className="flex items-center gap-1 text-xs text-gray-600">
          <MapPin className="h-3 w-3" aria-hidden="true" /> {city || vendor.city}
          {vendor.country ? `, ${vendor.country}` : ''}
        </p>
      )}
      {Number(vendor.ratingCount) > 0 && (
        <p className="text-xs text-gray-600">
          Rated {Number(vendor.rating).toFixed(1)} from {vendor.ratingCount} review{vendor.ratingCount === 1 ? '' : 's'}
        </p>
      )}
    </div>
  );
}

function Modal({ title, busy, onClose, children }: { title: string; busy?: boolean; onClose: () => void; children: React.ReactNode }) {
  return (
    <ModalSurface title={title} busy={busy} onClose={onClose}>
      <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-xl bg-white p-5 shadow-xl">
        <h2 className="mb-4 text-lg font-bold text-gray-900">{title}</h2>
        {children}
      </div>
    </ModalSurface>
  );
}

// ─── Buyer actions ──────────────────────────────────────────────────────────

function InquireModal({ listing, onClose }: { listing: any; onClose: () => void }) {
  const { user } = useAuthContext();
  const create = useCreateInquiry();
  const [name, setName] = useState(user?.displayName ?? '');
  const [email, setEmail] = useState(user?.email ?? '');
  const [phone, setPhone] = useState('');
  const [partySize, setPartySize] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const submit = async () => {
    setError('');
    if (!message.trim()) return setError('Write your question for the seller.');
    const size = partySize.trim() ? Number(partySize) : undefined;
    if (size !== undefined && (!Number.isInteger(size) || size < 1)) return setError('Party size must be a whole number.');
    try {
      await create.mutateAsync({ listingId: listing.id, name: name.trim() || undefined, email: email.trim() || undefined, phone: phone.trim() || undefined, partySize: size, message: message.trim() });
      toast.success('Inquiry sent to the seller');
      onClose();
    } catch (e) {
      setError(apiErrorMessage(e, 'The inquiry could not be sent.'));
    }
  };
  return (
    <Modal title="Send an inquiry" busy={create.isPending} onClose={onClose}>
      <div className="space-y-3">
        <Input aria-label="Your name" placeholder="Your name" value={name} onChange={(e) => setName(e.target.value)} />
        <Input aria-label="Email" type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
        <Input aria-label="Phone" placeholder="Phone (optional)" value={phone} onChange={(e) => setPhone(e.target.value)} />
        <Input aria-label="Party size" inputMode="numeric" placeholder="Party size (optional)" value={partySize} onChange={(e) => setPartySize(e.target.value)} />
        <Textarea aria-label="Message" rows={3} placeholder={`Your question about “${listing.name}”`} value={message} onChange={(e) => setMessage(e.target.value)} />
        {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={create.isPending}>Cancel</Button>
          <Button busy={create.isPending} onClick={() => void submit()}>
            <Send className="h-4 w-4" aria-hidden="true" /> Send inquiry
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function BookModal({ listing, onClose }: { listing: any; onClose: () => void }) {
  const { user } = useAuthContext();
  const create = useCreateMarketplaceBooking();
  const [customerName, setCustomerName] = useState(user?.displayName ?? '');
  const [customerEmail, setCustomerEmail] = useState(user?.email ?? '');
  const [customerPhone, setCustomerPhone] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [partySize, setPartySize] = useState('1');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const size = Number(partySize);
  const estimate = bookingEstimateCents(listing.priceCents, String(listing.pricingModel).toUpperCase(), size);
  const submit = async () => {
    setError('');
    if (!customerName.trim()) return setError('Enter the name the booking is for.');
    if (!Number.isInteger(size) || size < 1) return setError('Party size must be a whole number of at least 1.');
    if (!startDate) return setError('Choose a start date.');
    if (endDate && endDate < startDate) return setError('The end date cannot be before the start date.');
    try {
      await create.mutateAsync({
        listingId: listing.id,
        customerName: customerName.trim(),
        customerEmail: customerEmail.trim() || undefined,
        customerPhone: customerPhone.trim() || undefined,
        startDate,
        endDate: endDate || undefined,
        partySize: size,
        ...(estimate != null ? { totalAmountCents: estimate } : {}),
        notes: notes.trim() || undefined,
      });
      toast.success('Booking requested — find it under My bookings');
      onClose();
    } catch (e) {
      setError(apiErrorMessage(e, 'The booking could not be created.'));
    }
  };
  return (
    <Modal title="Request a booking" busy={create.isPending} onClose={onClose}>
      <div className="space-y-3">
        <Input aria-label="Customer name" placeholder="Name on the booking" value={customerName} onChange={(e) => setCustomerName(e.target.value)} />
        <Input aria-label="Customer email" type="email" placeholder="Email" value={customerEmail} onChange={(e) => setCustomerEmail(e.target.value)} />
        <Input aria-label="Customer phone" placeholder="Phone (optional)" value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} />
        <div className="grid grid-cols-2 gap-3">
          <label className="block text-xs font-semibold text-gray-600">
            Start date
            <Input className="mt-1" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </label>
          <label className="block text-xs font-semibold text-gray-600">
            End date
            <Input className="mt-1" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </label>
        </div>
        <label className="block text-xs font-semibold text-gray-600">
          Party size
          <Input className="mt-1" inputMode="numeric" value={partySize} onChange={(e) => setPartySize(e.target.value)} />
        </label>
        <Textarea aria-label="Notes" rows={2} placeholder="Notes for the seller (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} />
        <p className="rounded-lg bg-brand-50 px-3 py-2 text-sm">
          <span className="text-gray-600">Total: </span>
          <strong className="text-gray-900">{estimate != null ? formatMoney(estimate, listing.currency ?? 'SAR') : '—'}</strong>
          <span className="block text-xs text-gray-600">Calculated by the server from the listing price. Requesting a booking does not take payment.</span>
        </p>
        {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={create.isPending}>Cancel</Button>
          <Button busy={create.isPending} onClick={() => void submit()}>
            <CalendarCheck2 className="h-4 w-4" aria-hidden="true" /> Request booking
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function QuoteModal({ listing, onClose }: { listing: any; onClose: () => void }) {
  const request = useRequestQuote();
  const [pax, setPax] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [requirements, setRequirements] = useState('');
  const [error, setError] = useState('');
  const submit = async () => {
    setError('');
    const n = pax.trim() ? Number(pax) : undefined;
    if (n !== undefined && (!Number.isInteger(n) || n < 1)) return setError('Number of people must be a whole number.');
    if (startDate && endDate && endDate < startDate) return setError('The end date cannot be before the start date.');
    try {
      await request.mutateAsync({ listingId: listing.id, requestedPax: n, startDate: startDate || undefined, endDate: endDate || undefined, requirements: requirements.trim() || undefined });
      toast.success('Quote requested — track it under Marketplace › Quotes');
      onClose();
    } catch (e) {
      setError(apiErrorMessage(e, 'The quote could not be requested.'));
    }
  };
  return (
    <Modal title="Request a quote" busy={request.isPending} onClose={onClose}>
      <div className="space-y-3">
        <Input aria-label="Number of people" inputMode="numeric" placeholder="Number of people" value={pax} onChange={(e) => setPax(e.target.value)} />
        <div className="grid grid-cols-2 gap-3">
          <label className="block text-xs font-semibold text-gray-600">
            From
            <Input className="mt-1" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </label>
          <label className="block text-xs font-semibold text-gray-600">
            To
            <Input className="mt-1" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </label>
        </div>
        <Textarea aria-label="What you need" rows={3} placeholder="What you need" value={requirements} onChange={(e) => setRequirements(e.target.value)} />
        {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={request.isPending}>Cancel</Button>
          <Button busy={request.isPending} onClick={() => void submit()}>Request quote</Button>
        </div>
      </div>
    </Modal>
  );
}

// ─── Public (buyer) view ────────────────────────────────────────────────────

function PublicListingView({ listing, canQuote }: { listing: any; canQuote: boolean }) {
  const [modal, setModal] = useState<'inquire' | 'book' | 'quote' | null>(null);
  const bookable = isDirectlyBookable(listing);
  return (
    <>
      <div className="flex flex-wrap gap-2">
        {bookable && (
          <Button onClick={() => setModal('book')}>
            <CalendarCheck2 className="h-4 w-4" aria-hidden="true" /> Request booking
          </Button>
        )}
        <Button variant={bookable ? 'secondary' : 'primary'} onClick={() => setModal('inquire')}>
          <MessageSquare className="h-4 w-4" aria-hidden="true" /> Send inquiry
        </Button>
        {canQuote && (
          <Button variant="secondary" onClick={() => setModal('quote')}>
            <FileText className="h-4 w-4" aria-hidden="true" /> Request a quote
          </Button>
        )}
      </div>
      {!bookable && (
        <p className="text-xs text-gray-600">
          {Number(listing.priceCents) ? `This ${PRICING_MODEL_LABEL[String(listing.pricingModel).toUpperCase()] ?? ''} price is confirmed by the seller — send an inquiry to book.` : 'The seller prices this on request — send an inquiry.'}
        </p>
      )}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Gallery listing={listing} />
          <Details listing={listing} />
        </div>
        <div className="space-y-3">
          <PriceCard listing={listing} />
          <SellerCard vendor={listing.vendor} city={listing.city} />
        </div>
      </div>
      {modal === 'inquire' && <InquireModal listing={listing} onClose={() => setModal(null)} />}
      {modal === 'book' && <BookModal listing={listing} onClose={() => setModal(null)} />}
      {modal === 'quote' && <QuoteModal listing={listing} onClose={() => setModal(null)} />}
    </>
  );
}

// ─── Owner (seller) view ────────────────────────────────────────────────────

function InquiriesTab({ listingId, canManage }: { listingId: string; canManage: boolean }) {
  const { data = [], isLoading, error, refetch } = useListingInquiries(listingId);
  const respond = useRespondInquiry();
  const [active, setActive] = useState<string | null>(null);
  const [text, setText] = useState('');
  if (error) return <QueryFailure error={error} onRetry={() => refetch()} />;
  if (isLoading) return <LoadingState label="Loading inquiries…" />;
  if (!data.length) return <p className="rounded-xl border border-gray-200 bg-white py-10 text-center text-sm text-gray-600">No inquiries yet.</p>;
  return (
    <ul className="space-y-3">
      {data.map((q: any) => (
        <li key={q.id} className="rounded-xl border border-gray-200 bg-white p-4">
          <div className="mb-2 flex items-start justify-between gap-2">
            <div>
              <p className="text-sm font-semibold text-gray-900">{q.fromName ?? 'Customer'}</p>
              <p className="text-xs text-gray-600">{[q.fromEmail, q.fromPhone, q.partySize ? `${q.partySize} people` : ''].filter(Boolean).join(' · ') || 'No contact details given'}</p>
            </div>
            <Badge tone={q.status === 'NEW' ? 'warning' : q.status === 'RESPONDED' ? 'success' : 'neutral'}>{q.status}</Badge>
          </div>
          <p className="whitespace-pre-wrap text-sm text-gray-700">{q.message}</p>
          {q.response && <p className="mt-2 rounded-lg bg-brand-50 p-3 text-sm text-gray-700"><strong className="block text-xs text-brand-700">Your response</strong>{q.response}</p>}
          {canManage &&
            (active === q.id ? (
              <div className="mt-3 flex gap-2">
                <Input aria-label="Reply" value={text} onChange={(e) => setText(e.target.value)} placeholder="Reply…" className="flex-1" />
                <Button
                  busy={respond.isPending}
                  disabled={!text.trim()}
                  onClick={async () => {
                    try {
                      await respond.mutateAsync({ id: q.id, response: text.trim() });
                      toast.success('Response sent');
                      setText('');
                      setActive(null);
                    } catch (e) {
                      toast.error(apiErrorMessage(e, 'The response could not be sent.'));
                    }
                  }}
                >
                  Send
                </Button>
              </div>
            ) : (
              <Button variant="quiet" className="mt-2 px-2 py-1 text-xs" onClick={() => setActive(q.id)}>
                {q.response ? 'Reply again' : 'Reply'}
              </Button>
            ))}
        </li>
      ))}
    </ul>
  );
}

function BookingsTab({ listingId, canManage }: { listingId: string; canManage: boolean }) {
  const { data = [], isLoading, error, refetch } = useListingBookings(listingId);
  const update = useUpdateMarketplaceBooking();
  if (error) return <QueryFailure error={error} onRetry={() => refetch()} />;
  if (isLoading) return <LoadingState label="Loading bookings…" />;
  if (!data.length) return <p className="rounded-xl border border-gray-200 bg-white py-10 text-center text-sm text-gray-600">No bookings yet.</p>;
  return (
    <div role="region" aria-label="Bookings on this listing" tabIndex={0} className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
      <table className="w-full text-sm">
        <thead className="border-b border-gray-200 text-xs text-gray-600">
          <tr>
            <th className="p-3 text-left">Customer</th>
            <th className="p-3 text-left">Dates</th>
            <th className="p-3 text-left">Party</th>
            <th className="p-3 text-left">Total</th>
            <th className="p-3 text-left">Status</th>
            <th className="p-3 text-left">Payment</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {data.map((b: any) => {
            const next = bookingTransitions(b.status);
            return (
              <tr key={b.id}>
                <td className="p-3">
                  <p className="font-medium text-gray-900">{b.customerName}</p>
                  <p className="text-xs text-gray-600">{b.customerEmail ?? b.customerPhone ?? ''}</p>
                </td>
                <td className="p-3 text-xs text-gray-600">
                  {b.startDate ? new Date(b.startDate).toLocaleDateString() : '—'}
                  {b.endDate ? ` → ${new Date(b.endDate).toLocaleDateString()}` : ''}
                </td>
                <td className="p-3">{b.partySize}</td>
                <td className="p-3 font-medium">{formatMoney(b.totalAmountCents, b.currency)}</td>
                <td className="p-3">
                  {canManage && next.length > 0 ? (
                    // Only the transitions the server accepts from this state (PAID/REFUNDED come from payments).
                    <Select
                      aria-label={`Status of the booking for ${b.customerName}`}
                      value={b.status}
                      disabled={update.isPending}
                      onChange={async (e) => {
                        try {
                          await update.mutateAsync({ id: b.id, status: e.target.value });
                          toast.success('Booking updated');
                        } catch (err) {
                          toast.error(apiErrorMessage(err, 'The booking could not be updated.'));
                        }
                      }}
                      className="py-1 text-xs"
                    >
                      {[b.status, ...next].map((s: string) => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </Select>
                  ) : (
                    <span className="text-xs font-medium text-gray-700">{b.status}</span>
                  )}
                </td>
                <td className="p-3 text-xs font-medium text-gray-700">{b.paymentStatus}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function ListingQuotesTab({ listingId }: { listingId: string }) {
  const { data = [], isLoading, error, refetch } = useIncomingQuotes();
  if (error) return <QueryFailure error={error} onRetry={() => refetch()} />;
  if (isLoading) return <LoadingState label="Loading quotes…" />;
  const quotes = data.filter((q: any) => q.listing?.id === listingId);
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 text-sm">
      {quotes.length ? (
        <ul className="divide-y divide-gray-100">
          {quotes.map((q: any) => (
            <li key={q.id} className="flex items-center justify-between gap-2 py-2">
              <span>{q.requesterName ?? 'An organization'} · {q.status}{q.offeredPriceCents != null ? ` · ${formatMoney(q.offeredPriceCents, q.currency)}` : ''}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-gray-600">No quote requests for this listing.</p>
      )}
      <Link href="/marketplace?tab=quotes" className="mt-3 inline-block text-xs font-semibold text-brand-700">Answer quotes in Marketplace › Quotes →</Link>
    </div>
  );
}

type OwnerTab = 'overview' | 'edit' | 'inquiries' | 'bookings' | 'quotes';

function OwnerListingView({ listing, canManage, refetch }: { listing: any; canManage: boolean; refetch: () => void }) {
  const [tab, setTab] = useState<OwnerTab>('overview');
  const update = useUpdateListing();
  const tabs: { key: OwnerTab; label: string; icon: any; show: boolean }[] = [
    { key: 'overview', label: 'Overview', icon: ListChecks, show: true },
    { key: 'edit', label: 'Edit', icon: Edit3, show: canManage },
    { key: 'inquiries', label: `Inquiries (${listing._count?.inquiries ?? 0})`, icon: MessageSquare, show: true },
    { key: 'bookings', label: `Bookings (${listing._count?.bookings ?? 0})`, icon: CalendarCheck2, show: true },
    { key: 'quotes', label: `Quotes (${listing._count?.quotes ?? 0})`, icon: FileText, show: true },
  ];
  return (
    <>
      {isTakenDown(listing) ? (
        <Alert title="This listing was taken down by the platform">
          <p>{listing.moderationReason ? `Reason: ${listing.moderationReason}` : 'No reason was recorded.'}</p>
          <p className="mt-1">
            It is hidden from travelers and cannot be published or restored from here. You can still correct its content;
            contact Umrah Connect support to have it reviewed. Its existing bookings are kept.
          </p>
        </Alert>
      ) : (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-sm text-gray-700">
            You manage this listing. {listing.status === 'PUBLISHED' ? 'Travelers can see and book it.' : 'It is not visible to travelers.'}
          </p>
          {canManage && <div className="ml-auto"><ListingStatusActions listing={listing} onDone={refetch} size="md" /></div>}
        </div>
      )}
      <div role="tablist" aria-label="Listing sections" className="flex gap-1 overflow-x-auto rounded-xl border border-gray-200 bg-white p-1.5">
        {tabs.filter((t) => t.show).map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => setTab(t.key)}
            className={cn('flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-medium', tab === t.key ? 'border border-brand-100 bg-brand-50 text-brand-700' : 'text-gray-600 hover:bg-gray-50')}
          >
            <t.icon className="h-4 w-4" aria-hidden="true" /> {t.label}
          </button>
        ))}
      </div>
      <div role="tabpanel">
        {tab === 'overview' && (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <div className="space-y-4 lg:col-span-2">
              <Gallery listing={listing} />
              <Details listing={listing} />
            </div>
            <div className="space-y-3">
              <PriceCard listing={listing} />
              <SellerCard vendor={listing.vendor} city={listing.city} />
            </div>
          </div>
        )}
        {tab === 'edit' && canManage && (
          <div className="max-w-2xl rounded-xl border border-gray-200 bg-white p-5">
            <ListingForm
              key={listing.updatedAt}
              mode="edit"
              initial={listing}
              busy={update.isPending}
              onSubmit={async (dto) => {
                try {
                  await update.mutateAsync({ id: listing.id, ...dto });
                  toast.success('Listing saved');
                  refetch();
                } catch (e) {
                  toast.error(apiErrorMessage(e, 'The listing could not be saved.'));
                }
              }}
            />
          </div>
        )}
        {tab === 'inquiries' && <InquiriesTab listingId={listing.id} canManage={canManage} />}
        {tab === 'bookings' && <BookingsTab listingId={listing.id} canManage={canManage} />}
        {tab === 'quotes' && <ListingQuotesTab listingId={listing.id} />}
      </div>
    </>
  );
}

// ─── Page ───────────────────────────────────────────────────────────────────

/**
 * A listing page. The organization that owns the listing gets the seller view
 * (any status, management tabs); everyone else gets the published listing and
 * the buyer actions. Ownership is decided by the server: GET /listings/mine/:id
 * answers 404 for anyone else.
 */
export function ListingDetail({ id }: { id: string }) {
  const router = useRouter();
  const { ready, can } = useCapabilities();
  const canRead = can('marketplace:listing:read');
  const canManage = can('marketplace:listing:manage');
  // GET /listings/mine/:id answers 404 for anyone but the owning organization, so asking
  // for it as a buyer produced a failed request and a console error on every listing view
  // (A10 DEF-004). Only an account that can manage listings can own one.
  const owned = useMyListing(id, ready && canManage);
  const checkPublic = ready && (!canManage || owned.isError);
  const pub = useMarketplaceListing(id, checkPublic);

  const listing = owned.data ?? pub.data;
  const loading = !ready || (canRead && owned.isLoading) || (checkPublic && pub.isLoading);

  if (loading) return <LoadingState label="Loading listing…" />;
  if (!listing) {
    const status = (pub.error as any)?.response?.status;
    if (pub.error && status !== 404) return <QueryFailure error={pub.error} onRetry={() => pub.refetch()} />;
    return (
      <div className="rounded-xl border border-gray-200 bg-white py-20 text-center">
        <p className="text-sm text-gray-700">This listing is not available. It may have been unpublished or removed.</p>
        <Link href="/marketplace" className="mt-3 inline-block text-xs font-semibold text-brand-700">← Back to the marketplace</Link>
      </div>
    );
  }

  const isOwner = !!owned.data;
  return (
    <div className="space-y-5 pb-10">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="quiet" aria-label="Back to the marketplace" onClick={() => router.push(isOwner ? '/marketplace?tab=mine' : '/marketplace')} className="rounded-xl border border-gray-200 p-2">
          <ArrowLeft className="h-4 w-4 text-gray-600" aria-hidden="true" />
        </Button>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold text-gray-900">{listing.name}</h1>
            <Badge>{categoryLabel(listing.type)}</Badge>
            {isOwner &&
              (isTakenDown(listing) ? (
                <Badge tone="danger">Taken down by the platform</Badge>
              ) : (
                <Badge tone={STATUS_TONE[listing.status] ?? 'neutral'}>{STATUS_LABEL[listing.status] ?? listing.status}</Badge>
              ))}
          </div>
          <p className="mt-1 text-sm text-gray-600">
            {listing.vendor?.name ? `by ${listing.vendor.name}` : ''}
            {listing.city ? ` · ${listing.city}` : ''} · {listingPriceLabel(listing)}
          </p>
        </div>
      </div>
      {isOwner ? (
        <OwnerListingView listing={listing} canManage={canManage} refetch={() => owned.refetch()} />
      ) : (
        <PublicListingView listing={listing} canQuote={canManage} />
      )}
    </div>
  );
}

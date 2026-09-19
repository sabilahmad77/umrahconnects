'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowLeft, Calendar, CheckCircle2, MapPin, MessageSquare, Send, Wallet, XCircle } from 'lucide-react';
import { Button, Input, LoadingState, ModalSurface, QueryFailure, Select, Textarea } from '@/components/ui/system';
import { apiErrorMessage } from '@/lib/api-error';
import { apiClient } from '@/lib/api';
import { cn } from '@/lib/utils';
import { useAuthContext } from '@/components/providers/auth-provider';
import { useCapabilities } from '@/hooks/use-capabilities';
import { useMyVendors } from '@/hooks/use-marketplace';
import { useTransportVehicles } from '@/hooks/use-api';
import {
  useAcceptOffer,
  useCloseRequest,
  useConvertOfferToBooking,
  useCreateOffer,
  useMarketplaceRequest,
  useRejectOffer,
} from '@/hooks/use-marketplace-requests';
import { formatMoney, toCents } from '@/components/marketplace/listing-rules';
import { OfferSeller, REQUEST_STATUS_META, SERVICE_TYPE_META } from './requests-view';

const OFFER_STATUS_META: Record<string, { label: string; color: string }> = {
  PENDING: { label: 'Pending', color: 'bg-yellow-50 text-yellow-700' },
  ACCEPTED: { label: 'Accepted', color: 'bg-saudi-50 text-saudi-700' },
  REJECTED: { label: 'Declined', color: 'bg-red-50 text-red-600' },
  WITHDRAWN: { label: 'Withdrawn', color: 'bg-gray-100 text-gray-600' },
};

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

function Field({ label, value, full }: { label: string; value: React.ReactNode; full?: boolean }) {
  return (
    <div className={cn(full && 'col-span-2')}>
      <dt className="text-xs font-semibold text-gray-600">{label}</dt>
      <dd className="mt-0.5 text-sm font-medium text-gray-900">{value ?? '—'}</dd>
    </div>
  );
}

function DetailsCard({ r }: { r: any }) {
  const requirements = Object.entries(r.requirements ?? {}).filter(([k]) => !k.startsWith('_'));
  const conversion = r.requirements?._conversion;
  return (
    <div className="space-y-3 rounded-xl border border-gray-200 bg-white p-5 lg:col-span-1">
      <h2 className="text-sm font-bold text-gray-900">Request details</h2>
      {r.description && <p className="whitespace-pre-wrap text-sm text-gray-700">{r.description}</p>}
      <dl className="grid grid-cols-2 gap-3 border-t border-gray-50 pt-2 text-sm">
        <Field label="City" value={r.city ? <span className="inline-flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5 text-gray-600" aria-hidden="true" /> {r.city}</span> : null} />
        <Field label="Travelers" value={r.travelers != null ? String(r.travelers) : null} />
        <Field label="From" value={r.dateFrom ? <span className="inline-flex items-center gap-1.5"><Calendar className="h-3.5 w-3.5 text-gray-600" aria-hidden="true" />{new Date(r.dateFrom).toLocaleDateString()}</span> : null} />
        <Field label="To" value={r.dateTo ? <span className="inline-flex items-center gap-1.5"><Calendar className="h-3.5 w-3.5 text-gray-600" aria-hidden="true" />{new Date(r.dateTo).toLocaleDateString()}</span> : null} />
        <Field
          label="Budget"
          full
          value={
            r.budgetMinCents != null || r.budgetMaxCents != null ? (
              <span className="inline-flex items-center gap-1.5 font-semibold text-brand-700">
                <Wallet className="h-3.5 w-3.5" aria-hidden="true" />
                {r.budgetMinCents != null ? formatMoney(r.budgetMinCents, r.currency) : '—'} – {r.budgetMaxCents != null ? formatMoney(r.budgetMaxCents, r.currency) : '—'}
              </span>
            ) : null
          }
        />
        <Field label="Posted" value={r.createdAt ? new Date(r.createdAt).toLocaleDateString() : null} />
      </dl>
      {requirements.length > 0 && (
        <dl className="grid grid-cols-2 gap-2 border-t border-gray-50 pt-3 text-xs">
          {requirements.map(([k, v]) => (
            <div key={k} className="rounded-lg bg-gray-50 px-2.5 py-1.5">
              <dt className="capitalize text-gray-600">{k.replace(/([A-Z])/g, ' $1')}</dt>
              <dd className="font-medium text-gray-900">{typeof v === 'object' ? JSON.stringify(v) : String(v)}</dd>
            </div>
          ))}
        </dl>
      )}
      {conversion && (
        <p className="rounded-lg bg-saudi-50 p-3 text-xs text-saudi-700">
          Converted into a {String(conversion.kind).replace(/_/g, ' ').toLowerCase()} on {new Date(conversion.at).toLocaleDateString()}.
        </p>
      )}
    </div>
  );
}

/** The seller's published listings, to attach the booking to one of them (optional). */
function useSellerListings(vendorId?: string | null) {
  return useQuery({
    queryKey: ['marketplace', 'vendor', vendorId],
    queryFn: async () => (await apiClient.get(`/marketplace/vendors/${vendorId}`)).data.data as { listings: any[] },
    enabled: !!vendorId,
    retry: false,
  });
}

function ConvertModal({ request, offer, onClose }: { request: any; offer: any; onClose: () => void }) {
  const convert = useConvertOfferToBooking();
  const listings = useSellerListings(offer.seller?.vendorId);
  const [listingId, setListingId] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const submit = async () => {
    setError('');
    try {
      await convert.mutateAsync({ requestId: request.id, offerId: offer.id, listingId: listingId || undefined, notes: notes.trim() || undefined });
      toast.success(request.serviceType === 'VISA' ? 'Visa application created with the provider' : 'Booking created — find it under My bookings');
      onClose();
    } catch (e) {
      setError(apiErrorMessage(e, 'The offer could not be converted.'));
    }
  };
  return (
    <Modal title="Convert to booking" busy={convert.isPending} onClose={onClose}>
      <div className="space-y-3">
        <p className="text-sm text-gray-700">
          {request.serviceType === 'VISA'
            ? `Opens a visa application with ${offer.seller?.name ?? 'the provider'} for ${formatMoney(offer.priceCents, offer.currency)}.`
            : `Books “${offer.title}” with ${offer.seller?.name ?? 'the provider'} for ${formatMoney(offer.priceCents, offer.currency)}.`}
        </p>
        {request.serviceType !== 'VISA' && (listings.data?.listings?.length ?? 0) > 0 && (
          <label className="block text-xs font-semibold text-gray-600">
            Link to one of the seller&apos;s listings (optional)
            <Select className="mt-1" value={listingId} onChange={(e) => setListingId(e.target.value)}>
              <option value="">No listing — record it as a private booking</option>
              {listings.data!.listings.map((l: any) => (
                <option key={l.id} value={l.id}>{l.name}</option>
              ))}
            </Select>
          </label>
        )}
        <Textarea aria-label="Notes" rows={3} placeholder="Notes for the booking (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} />
        {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={convert.isPending}>Cancel</Button>
          <Button busy={convert.isPending} onClick={() => void submit()}>Create booking</Button>
        </div>
      </div>
    </Modal>
  );
}

/** Transport offers are scheduled by the provider, who picks one of its own vehicles. */
function ScheduleTransportModal({ request, offer, onClose }: { request: any; offer: any; onClose: () => void }) {
  const convert = useConvertOfferToBooking();
  const vehicles = useTransportVehicles({ limit: 100 });
  const [vehicleId, setVehicleId] = useState('');
  const [scheduledAt, setScheduledAt] = useState('');
  const [passengers, setPassengers] = useState(String(request.travelers ?? 1));
  const [error, setError] = useState('');
  const submit = async () => {
    setError('');
    if (!vehicleId) return setError('Choose the vehicle that will run this trip.');
    const count = Number(passengers);
    if (!Number.isInteger(count) || count < 1) return setError('Passengers must be a whole number of at least 1.');
    try {
      await convert.mutateAsync({ requestId: request.id, offerId: offer.id, vehicleId, passengerCount: count, scheduledAt: scheduledAt ? new Date(scheduledAt).toISOString() : undefined });
      toast.success('Trip scheduled — it is now in your transport assignments');
      onClose();
    } catch (e) {
      setError(apiErrorMessage(e, 'The trip could not be scheduled.'));
    }
  };
  return (
    <Modal title="Schedule transport" busy={convert.isPending} onClose={onClose}>
      <div className="space-y-3">
        {vehicles.error ? (
          <QueryFailure error={vehicles.error} onRetry={() => vehicles.refetch()} />
        ) : (
          <label className="block text-xs font-semibold text-gray-600">
            Vehicle *
            <Select className="mt-1" value={vehicleId} onChange={(e) => setVehicleId(e.target.value)} disabled={vehicles.isLoading}>
              <option value="">{vehicles.isLoading ? 'Loading your fleet…' : 'Choose a vehicle'}</option>
              {(vehicles.data?.items ?? []).map((v: any) => (
                <option key={v.id} value={v.id}>{[v.plateNumber, v.type, v.capacity ? `${v.capacity} seats` : ''].filter(Boolean).join(' · ')}</option>
              ))}
            </Select>
          </label>
        )}
        <div className="grid grid-cols-2 gap-3">
          <label className="block text-xs font-semibold text-gray-600">
            Pick-up time
            <Input className="mt-1" type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} />
          </label>
          <label className="block text-xs font-semibold text-gray-600">
            Passengers
            <Input className="mt-1" inputMode="numeric" value={passengers} onChange={(e) => setPassengers(e.target.value)} />
          </label>
        </div>
        {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={convert.isPending}>Cancel</Button>
          <Button busy={convert.isPending} onClick={() => void submit()}>Schedule trip</Button>
        </div>
      </div>
    </Modal>
  );
}

function OfferCard({ request, offer, viewerId, isOwner, accepting }: { request: any; offer: any; viewerId?: string; isOwner: boolean; accepting: boolean }) {
  const { can } = useCapabilities();
  const accept = useAcceptOffer();
  const reject = useRejectOffer();
  const [modal, setModal] = useState<'convert' | 'schedule' | null>(null);
  const status = OFFER_STATUS_META[offer.status] ?? OFFER_STATUS_META.PENDING;
  const converted = !!request.requirements?._conversion;
  const transport = request.serviceType === 'TRANSPORT';
  const isOfferProvider = !!viewerId && offer.providerId === viewerId;

  const decide = async (decision: 'accept' | 'reject') => {
    try {
      if (decision === 'accept') await accept.mutateAsync({ requestId: request.id, offerId: offer.id });
      else await reject.mutateAsync({ requestId: request.id, offerId: offer.id });
      toast.success(decision === 'accept' ? 'Offer accepted' : 'Offer declined');
    } catch (e) {
      toast.error(apiErrorMessage(e, 'The offer could not be updated.'));
    }
  };

  return (
    <div className="space-y-2.5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-gray-900">{offer.title}</p>
          <OfferSeller offer={offer} />
          {offer.description && <p className="mt-1 whitespace-pre-wrap text-xs text-gray-600">{offer.description}</p>}
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-600">
            <span className="inline-flex items-center gap-1 text-sm font-bold text-brand-700">
              <Wallet className="h-3.5 w-3.5" aria-hidden="true" /> {formatMoney(offer.priceCents, offer.currency ?? request.currency)}
            </span>
            {offer.validUntil && <span>Valid until {new Date(offer.validUntil).toLocaleDateString()}</span>}
          </div>
        </div>
        <span className={cn('shrink-0 rounded-full px-2 py-1 text-xs font-bold', status.color)}>{status.label}</span>
      </div>

      {isOwner && offer.status === 'PENDING' && accepting && (
        <div className="flex gap-2 pt-1">
          <Button className="px-3 py-1.5 text-xs" disabled={accept.isPending || reject.isPending} busy={accept.isPending} onClick={() => void decide('accept')}>
            <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" /> Accept
          </Button>
          <Button variant="secondary" className="px-3 py-1.5 text-xs" disabled={accept.isPending || reject.isPending} busy={reject.isPending} onClick={() => void decide('reject')}>
            <XCircle className="h-3.5 w-3.5" aria-hidden="true" /> Decline
          </Button>
        </div>
      )}
      {offer.status === 'ACCEPTED' && !converted && isOwner && !transport && (
        <Button className="px-3 py-1.5 text-xs" onClick={() => setModal('convert')}>
          <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" /> Convert to booking
        </Button>
      )}
      {offer.status === 'ACCEPTED' && !converted && isOwner && transport && (
        <p className="text-xs text-gray-600">The provider now schedules the vehicle; you will be notified when the trip is booked.</p>
      )}
      {offer.status === 'ACCEPTED' && !converted && isOfferProvider && transport && can('transport:vehicle:read') && (
        <Button className="px-3 py-1.5 text-xs" onClick={() => setModal('schedule')}>
          Schedule transport
        </Button>
      )}
      {modal === 'convert' && <ConvertModal request={request} offer={offer} onClose={() => setModal(null)} />}
      {modal === 'schedule' && <ScheduleTransportModal request={request} offer={offer} onClose={() => setModal(null)} />}
    </div>
  );
}

function CreateOfferModal({ request, onClose }: { request: any; onClose: () => void }) {
  const create = useCreateOffer();
  const vendors = useMyVendors();
  const [vendorId, setVendorId] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('');
  const [validUntil, setValidUntil] = useState('');
  const [error, setError] = useState('');
  const currency = request.currency ?? 'SAR';
  const submit = async () => {
    setError('');
    if (!title.trim()) return setError('Give the offer a title.');
    const priceCents = toCents(price);
    if (!priceCents) return setError('Enter a price greater than zero, with at most two decimals.');
    try {
      await create.mutateAsync({
        requestId: request.id,
        title: title.trim(),
        description: description.trim() || undefined,
        priceCents,
        currency,
        validUntil: validUntil ? new Date(`${validUntil}T23:59:59`).toISOString() : undefined,
        vendorId: vendorId || vendors.data?.[0]?.id || undefined,
      });
      toast.success('Offer sent');
      onClose();
    } catch (e) {
      setError(apiErrorMessage(e, 'The offer could not be sent.'));
    }
  };
  return (
    <Modal title="Send an offer" busy={create.isPending} onClose={onClose}>
      <div className="space-y-3">
        {(vendors.data?.length ?? 0) > 1 && (
          <label className="block text-xs font-semibold text-gray-600">
            Offer as
            <Select className="mt-1" value={vendorId || vendors.data![0].id} onChange={(e) => setVendorId(e.target.value)}>
              {vendors.data!.map((v: any) => (
                <option key={v.id} value={v.id}>{v.name}</option>
              ))}
            </Select>
          </label>
        )}
        <label className="block text-xs font-semibold text-gray-600">
          Title *
          <Input className="mt-1" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Deluxe room, breakfast included" maxLength={200} />
        </label>
        <Textarea aria-label="Description" rows={3} placeholder="What is included, terms…" value={description} onChange={(e) => setDescription(e.target.value)} />
        <div className="grid grid-cols-2 gap-3">
          <label className="block text-xs font-semibold text-gray-600">
            Price ({currency}) *
            <Input className="mt-1" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="4500" />
          </label>
          <label className="block text-xs font-semibold text-gray-600">
            Valid until
            <Input className="mt-1" type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} />
          </label>
        </div>
        {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={create.isPending}>Cancel</Button>
          <Button busy={create.isPending} onClick={() => void submit()}>
            <Send className="h-4 w-4" aria-hidden="true" /> Send offer
          </Button>
        </div>
      </div>
    </Modal>
  );
}

export function RequestDetail({ id }: { id: string }) {
  const router = useRouter();
  const { user } = useAuthContext();
  const { can } = useCapabilities();
  const { data: r, isLoading, error, refetch } = useMarketplaceRequest(id);
  const close = useCloseRequest();
  const [offering, setOffering] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);

  if (isLoading) return <LoadingState label="Loading request…" />;
  if (error || !r) {
    const status = (error as any)?.response?.status;
    if (error && status !== 404) return <QueryFailure error={error} onRetry={() => refetch()} />;
    return (
      <div className="rounded-xl border border-gray-200 bg-white py-20 text-center">
        <p className="text-sm text-gray-700">This request is not available.</p>
        <Link href="/requests" className="mt-3 inline-block text-xs font-semibold text-brand-700">Back to requests</Link>
      </div>
    );
  }

  const isOwner = !!user && user.id === r.travelerId;
  const isProvider = !isOwner && can('marketplace:listing:manage');
  const accepting = r.status === 'OPEN' || r.status === 'IN_NEGOTIATION';
  const status = REQUEST_STATUS_META[r.status] ?? REQUEST_STATUS_META.OPEN;
  const meta = SERVICE_TYPE_META[r.serviceType] ?? SERVICE_TYPE_META.OTHER;
  const offers: any[] = Array.isArray(r.offers) ? r.offers : [];

  return (
    <div className="space-y-5 pb-10">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="quiet" aria-label="Back to requests" onClick={() => router.push('/requests')} className="rounded-xl border border-gray-200 p-2">
          <ArrowLeft className="h-4 w-4 text-gray-600" aria-hidden="true" />
        </Button>
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand-50">
          <meta.Icon className="h-6 w-6 text-brand-600" aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-bold text-gray-900">{r.title}</h1>
          <p className="text-sm text-gray-600">{meta.label}</p>
        </div>
        <span className={cn('rounded-full px-2.5 py-1 text-xs font-bold', status.color)}>{status.label}</span>
        {isOwner && accepting && (
          <Button variant="secondary" className="text-xs" onClick={() => setConfirmClose(true)}>
            <XCircle className="h-3.5 w-3.5" aria-hidden="true" /> Close request
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <DetailsCard r={r} />
        <div className="space-y-3 lg:col-span-2">
          <div className="rounded-xl border border-gray-200 bg-white">
            <div className="flex items-center justify-between border-b border-gray-200 p-4">
              <h2 className="inline-flex items-center gap-2 text-sm font-bold text-gray-900">
                <MessageSquare className="h-4 w-4" aria-hidden="true" /> {isOwner ? `Offers (${offers.length})` : 'Your offers'}
              </h2>
              {isProvider && accepting && (
                <Button className="text-sm" onClick={() => setOffering(true)}>
                  <Send className="h-4 w-4" aria-hidden="true" /> Send an offer
                </Button>
              )}
            </div>
            {offers.length === 0 ? (
              <p className="py-10 text-center text-sm text-gray-600">{isOwner ? 'No offers yet.' : isProvider && accepting ? 'You have not made an offer on this request.' : 'No offers to show.'}</p>
            ) : (
              <ul className="divide-y divide-gray-50">
                {offers.map((o) => (
                  <li key={o.id} className="p-4">
                    <OfferCard request={r} offer={o} viewerId={user?.id} isOwner={isOwner} accepting={accepting} />
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>

      {offering && <CreateOfferModal request={r} onClose={() => setOffering(false)} />}
      {confirmClose && (
        <Modal title="Close this request?" busy={close.isPending} onClose={() => setConfirmClose(false)}>
          <p className="text-sm text-gray-600">Providers will no longer be able to send offers.</p>
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setConfirmClose(false)} disabled={close.isPending}>Keep it open</Button>
            <Button
              variant="danger"
              busy={close.isPending}
              onClick={async () => {
                try {
                  await close.mutateAsync(r.id);
                  toast.success('Request closed');
                  setConfirmClose(false);
                } catch (e) {
                  toast.error(apiErrorMessage(e, 'The request could not be closed.'));
                }
              }}
            >
              Close request
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
}

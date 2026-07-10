'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft, Loader2, AlertCircle, MessageSquare, Send, CheckCircle2,
  XCircle, Wallet, Calendar, MapPin, Save, X,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useAuthContext } from '@/components/providers/auth-provider';
import {
  useMarketplaceRequest,
  useAcceptOffer,
  useRejectOffer,
  useConvertOfferToBooking,
  useCreateOffer,
  useCloseRequest,
} from '@/hooks/use-marketplace-requests';

const SERVICE_TYPE_LABEL: Record<string, string> = {
  HOTEL: 'Hotel',
  TRANSPORT: 'Transport',
  VISA: 'Visa',
  PACKAGE: 'Package',
  GUIDE: 'Guide',
  CATERING: 'Catering',
  OTHER: 'Other',
};

const STATUS_META: Record<string, { label: string; color: string }> = {
  OPEN:           { label: 'Open',             color: 'bg-blue-100 text-blue-700' },
  IN_NEGOTIATION: { label: 'Receiving offers', color: 'bg-yellow-100 text-yellow-700' },
  FULFILLED:      { label: 'Fulfilled',        color: 'bg-saudi-50 text-saudi-700' },
  CLOSED:         { label: 'Closed',           color: 'bg-gray-100 text-gray-600' },
  EXPIRED:        { label: 'Expired',          color: 'bg-gray-100 text-gray-500' },
};

const OFFER_STATUS_META: Record<string, { label: string; color: string }> = {
  PENDING:   { label: 'Pending',   color: 'bg-yellow-50 text-yellow-700' },
  ACCEPTED:  { label: 'Accepted',  color: 'bg-saudi-50 text-saudi-700' },
  REJECTED:  { label: 'Rejected',  color: 'bg-red-50 text-red-600' },
  WITHDRAWN: { label: 'Withdrawn', color: 'bg-gray-100 text-gray-500' },
  EXPIRED:   { label: 'Expired',   color: 'bg-gray-100 text-gray-500' },
};

const fmtMoney = (cents?: number | null, currency = 'SAR') =>
  cents != null
    ? `${currency} ${(Number(cents) / 100).toLocaleString('en-SA', { maximumFractionDigits: 0 })}`
    : '—';

export function RequestDetail({ id }: { id: string }) {
  const router = useRouter();
  const { user } = useAuthContext();
  const { data: r, isLoading, error } = useMarketplaceRequest(id);
  const closeRequest = useCloseRequest();
  const [showOfferModal, setShowOfferModal] = useState(false);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20 text-gray-500 text-sm">
        <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading request…
      </div>
    );
  }
  if (error || !r) {
    return (
      <div className="py-20 text-center bg-white rounded-2xl border border-gray-100">
        <AlertCircle className="h-10 w-10 mx-auto mb-3 text-red-400 opacity-60" />
        <p className="text-sm text-red-500">Request not found</p>
        <Link href="/requests" className="text-xs text-brand-500 hover:underline mt-3 inline-block">
          Back to requests
        </Link>
      </div>
    );
  }

  const isOwner = !!user && user.id === r.travelerId;
  const isProvider = !!user && !isOwner;
  const isAcceptingOffers = r.status === 'OPEN' || r.status === 'IN_NEGOTIATION';
  const statusMeta = STATUS_META[r.status] ?? STATUS_META.OPEN;
  const serviceLabel = SERVICE_TYPE_LABEL[r.serviceType] ?? r.serviceType;
  const offers: any[] = Array.isArray(r.offers) ? r.offers : [];

  const handleClose = async () => {
    if (!confirm('Close this request? Providers will no longer be able to send offers.')) return;
    try {
      await closeRequest.mutateAsync(r.id);
      toast.success('Request closed');
    } catch (e: any) {
      toast.error(e?.response?.data?.error?.message ?? e?.response?.data?.message ?? 'Failed to close');
    }
  };

  return (
    <div className="space-y-5 pb-10">
      <div className="flex items-center gap-3 flex-wrap">
        <button
          onClick={() => router.push('/requests')}
          className="p-2 rounded-xl border border-gray-200 hover:bg-gray-50"
          aria-label="Back to requests"
        >
          <ArrowLeft className="h-4 w-4 text-gray-500" />
        </button>
        <div className="w-12 h-12 rounded-xl bg-brand-50 flex items-center justify-center">
          <MessageSquare className="h-6 w-6 text-brand-600" />
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-bold text-gray-900 truncate">{r.title}</h1>
          <p className="text-sm text-gray-500">{serviceLabel}</p>
        </div>
        <span className={cn('text-[11px] font-bold px-2.5 py-1 rounded-full', statusMeta.color)}>
          {statusMeta.label}
        </span>
        {isOwner && isAcceptingOffers && (
          <button
            onClick={handleClose}
            disabled={closeRequest.isPending}
            className="inline-flex items-center gap-1.5 text-xs px-3 py-2 border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50 disabled:opacity-50"
          >
            {closeRequest.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <XCircle className="h-3.5 w-3.5" />}
            Close request
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <DetailsCard request={r} />
        <div className="lg:col-span-2 space-y-3">
          <div className="bg-white rounded-2xl border border-gray-100">
            <div className="p-4 border-b border-gray-100 flex items-center justify-between">
              <h3 className="text-sm font-bold text-gray-900 inline-flex items-center gap-2">
                <MessageSquare className="h-4 w-4" /> Offers ({offers.length})
              </h3>
            </div>
            {offers.length === 0 ? (
              <div className="py-10 text-center text-sm text-gray-500">
                No offers yet
              </div>
            ) : (
              <ul className="divide-y divide-gray-50">
                {offers.map((o) => (
                  <li key={o.id} className="p-4">
                    <OfferCard
                      request={r}
                      offer={o}
                      isOwner={isOwner}
                      isAcceptingOffers={isAcceptingOffers}
                    />
                  </li>
                ))}
              </ul>
            )}
            {isProvider && isAcceptingOffers && (
              <div className="p-4 border-t border-gray-100 flex justify-end">
                <button
                  onClick={() => setShowOfferModal(true)}
                  className="inline-flex items-center gap-2 text-sm px-4 py-2 bg-brand-500 hover:bg-brand-600 text-white rounded-lg shadow-sm"
                >
                  <Send className="h-4 w-4" /> Add offer
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {showOfferModal && (
        <CreateOfferModal
          requestId={r.id}
          currency={r.currency ?? 'SAR'}
          onClose={() => setShowOfferModal(false)}
        />
      )}
    </div>
  );
}

// ─── Left column: request details ────────────────────────────────────────────
function DetailsCard({ request: r }: { request: any }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-5 space-y-3 lg:col-span-1">
      <h3 className="text-sm font-bold text-gray-900">Request details</h3>
      {r.description && (
        <p className="text-sm text-gray-700 whitespace-pre-wrap">{r.description}</p>
      )}
      <dl className="grid grid-cols-2 gap-3 text-sm pt-2 border-t border-gray-50">
        <Field
          label="City"
          value={
            r.city ? (
              <span className="inline-flex items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5 text-gray-500" /> {r.city}
              </span>
            ) : null
          }
        />
        <Field
          label="Travelers"
          value={r.travelers != null ? `${r.travelers}` : null}
        />
        <Field
          label="From"
          value={
            r.dateFrom ? (
              <span className="inline-flex items-center gap-1.5">
                <Calendar className="h-3.5 w-3.5 text-gray-500" />
                {new Date(r.dateFrom).toLocaleDateString()}
              </span>
            ) : null
          }
        />
        <Field
          label="To"
          value={
            r.dateTo ? (
              <span className="inline-flex items-center gap-1.5">
                <Calendar className="h-3.5 w-3.5 text-gray-500" />
                {new Date(r.dateTo).toLocaleDateString()}
              </span>
            ) : null
          }
        />
        <Field
          label="Budget"
          full
          value={
            r.budgetMinCents != null || r.budgetMaxCents != null ? (
              <span className="inline-flex items-center gap-1.5 text-brand-700 font-semibold">
                <Wallet className="h-3.5 w-3.5" />
                {fmtMoney(r.budgetMinCents, r.currency)} — {fmtMoney(r.budgetMaxCents, r.currency)}
              </span>
            ) : null
          }
        />
        <Field
          label="Created"
          value={r.createdAt ? new Date(r.createdAt).toLocaleDateString() : null}
        />
        <Field label="Currency" value={r.currency ?? 'SAR'} />
      </dl>

      {r.requirements && Object.keys(r.requirements ?? {}).length > 0 && (
        <div className="pt-3 border-t border-gray-50">
          <p className="text-xs font-semibold text-gray-600 mb-1.5">Requirements</p>
          <pre className="text-xs bg-gray-50 rounded-lg p-3 overflow-x-auto text-gray-700">
{JSON.stringify(r.requirements, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}

function Field({
  label,
  value,
  full = false,
}: {
  label: string;
  value: React.ReactNode;
  full?: boolean;
}) {
  return (
    <div className={cn(full && 'col-span-2')}>
      <dt className="text-[11px] font-semibold text-gray-500">{label}</dt>
      <dd className="text-sm text-gray-900 font-medium mt-0.5">{value ?? '—'}</dd>
    </div>
  );
}

// ─── Single offer card ──────────────────────────────────────────────────────
function OfferCard({
  request,
  offer,
  isOwner,
  isAcceptingOffers,
}: {
  request: any;
  offer: any;
  isOwner: boolean;
  isAcceptingOffers: boolean;
}) {
  const acceptOffer = useAcceptOffer();
  const rejectOffer = useRejectOffer();
  const [showConvert, setShowConvert] = useState(false);

  const statusMeta = OFFER_STATUS_META[offer.status] ?? OFFER_STATUS_META.PENDING;

  const onAccept = async () => {
    try {
      await acceptOffer.mutateAsync({ requestId: request.id, offerId: offer.id });
      toast.success('Offer accepted');
    } catch (e: any) {
      toast.error(e?.response?.data?.error?.message ?? e?.response?.data?.message ?? 'Failed to accept');
    }
  };

  const onReject = async () => {
    try {
      await rejectOffer.mutateAsync({ requestId: request.id, offerId: offer.id });
      toast('Offer rejected');
    } catch (e: any) {
      toast.error(e?.response?.data?.error?.message ?? e?.response?.data?.message ?? 'Failed to reject');
    }
  };

  return (
    <div className="space-y-2.5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-900">{offer.title}</p>
          {offer.description && (
            <p className="text-xs text-gray-600 mt-1 whitespace-pre-wrap">{offer.description}</p>
          )}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-[11px] text-gray-500">
            <span className="inline-flex items-center gap-1 text-brand-700 font-bold text-sm">
              <Wallet className="h-3.5 w-3.5" />
              {fmtMoney(offer.priceCents, offer.currency ?? request.currency)}
            </span>
            {offer.validUntil && (
              <span className="inline-flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                Valid until {new Date(offer.validUntil).toLocaleDateString()}
              </span>
            )}
            {offer.providerId && (
              <span className="text-[11px] text-gray-500 font-mono">
                Provider {String(offer.providerId).slice(0, 8)}
              </span>
            )}
          </div>
        </div>
        <span className={cn('text-[10px] font-bold px-2 py-1 rounded-full shrink-0', statusMeta.color)}>
          {statusMeta.label}
        </span>
      </div>

      {isOwner && offer.status === 'PENDING' && isAcceptingOffers && (
        <div className="flex items-center gap-2 pt-1">
          <button
            onClick={onAccept}
            disabled={acceptOffer.isPending}
            className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 bg-saudi-500 hover:bg-saudi-600 text-white rounded-lg disabled:opacity-50"
          >
            {acceptOffer.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
            Accept
          </button>
          <button
            onClick={onReject}
            disabled={rejectOffer.isPending}
            className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50 disabled:opacity-50"
          >
            {rejectOffer.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <XCircle className="h-3.5 w-3.5" />}
            Reject
          </button>
        </div>
      )}

      {isOwner && offer.status === 'ACCEPTED' && (
        <div className="pt-1">
          <button
            onClick={() => setShowConvert(true)}
            className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 bg-brand-500 hover:bg-brand-600 text-white rounded-lg"
          >
            <CheckCircle2 className="h-3.5 w-3.5" /> Convert to booking
          </button>
        </div>
      )}

      {showConvert && (
        <ConvertOfferModal
          request={request}
          offer={offer}
          onClose={() => setShowConvert(false)}
        />
      )}
    </div>
  );
}

// ─── Convert-to-booking modal ───────────────────────────────────────────────
function ConvertOfferModal({
  request,
  offer,
  onClose,
}: {
  request: any;
  offer: any;
  onClose: () => void;
}) {
  const convert = useConvertOfferToBooking();
  const isTransport = request.serviceType === 'TRANSPORT';
  const [vehicleId, setVehicleId] = useState('');
  const [routeId, setRouteId] = useState('');
  const [scheduledAt, setScheduledAt] = useState(
    request.dateFrom ? toDateTimeLocal(request.dateFrom) : '',
  );
  const [passengerCount, setPassengerCount] = useState(String(request.travelers ?? 1));
  const [listingId, setListingId] = useState('');
  const [notes, setNotes] = useState('');

  const submit = async () => {
    if (isTransport && !vehicleId.trim()) {
      toast.error('Vehicle ID is required for transport');
      return;
    }
    try {
      await convert.mutateAsync({
        requestId: request.id,
        offerId: offer.id,
        vehicleId: isTransport ? vehicleId.trim() : undefined,
        routeId: isTransport && routeId.trim() ? routeId.trim() : undefined,
        scheduledAt: isTransport && scheduledAt ? new Date(scheduledAt).toISOString() : undefined,
        passengerCount: isTransport && passengerCount ? Number(passengerCount) : undefined,
        listingId: !isTransport && listingId.trim() ? listingId.trim() : undefined,
        notes: notes.trim() || undefined,
      });
      toast.success(isTransport ? 'Assignment created' : 'Booking created');
      onClose();
    } catch (e: any) {
      toast.error(e?.response?.data?.error?.message ?? e?.response?.data?.message ?? 'Failed to convert');
    }
  };

  return (
    <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-md p-5 shadow-xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-gray-900">Convert to booking</h2>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg" aria-label="Close">
            <X className="h-4 w-4 text-gray-500" />
          </button>
        </div>

        <div className="space-y-3">
          {isTransport ? (
            <>
              <label className="block">
                <span className="block text-xs font-semibold text-gray-600 mb-1">Vehicle ID *</span>
                <input
                  autoFocus
                  value={vehicleId}
                  onChange={(e) => setVehicleId(e.target.value)}
                  placeholder="uuid of the vehicle"
                  className="w-full text-sm px-3 py-2.5 border border-gray-200 rounded-lg outline-none focus:border-brand-400"
                />
              </label>
              <label className="block">
                <span className="block text-xs font-semibold text-gray-600 mb-1">Route ID</span>
                <input
                  value={routeId}
                  onChange={(e) => setRouteId(e.target.value)}
                  placeholder="optional route uuid"
                  className="w-full text-sm px-3 py-2.5 border border-gray-200 rounded-lg outline-none focus:border-brand-400"
                />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="block text-xs font-semibold text-gray-600 mb-1">Scheduled at</span>
                  <input
                    type="datetime-local"
                    value={scheduledAt}
                    onChange={(e) => setScheduledAt(e.target.value)}
                    className="w-full text-sm px-3 py-2.5 border border-gray-200 rounded-lg outline-none focus:border-brand-400"
                  />
                </label>
                <label className="block">
                  <span className="block text-xs font-semibold text-gray-600 mb-1">Passengers</span>
                  <input
                    type="number"
                    min="1"
                    value={passengerCount}
                    onChange={(e) => setPassengerCount(e.target.value)}
                    className="w-full text-sm px-3 py-2.5 border border-gray-200 rounded-lg outline-none focus:border-brand-400"
                  />
                </label>
              </div>
            </>
          ) : (
            <label className="block">
              <span className="block text-xs font-semibold text-gray-600 mb-1">Listing ID (optional)</span>
              <input
                value={listingId}
                onChange={(e) => setListingId(e.target.value)}
                placeholder="link a specific listing, or leave blank"
                className="w-full text-sm px-3 py-2.5 border border-gray-200 rounded-lg outline-none focus:border-brand-400"
              />
            </label>
          )}

          <label className="block">
            <span className="block text-xs font-semibold text-gray-600 mb-1">Notes</span>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="Internal notes for this booking"
              className="w-full text-sm px-3 py-2.5 border border-gray-200 rounded-lg outline-none resize-none focus:border-brand-400"
            />
          </label>
        </div>

        <div className="flex justify-end gap-2 mt-5">
          <button
            onClick={onClose}
            disabled={convert.isPending}
            className="px-4 py-2 text-sm border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={convert.isPending || (isTransport && !vehicleId.trim())}
            className="flex items-center gap-2 px-4 py-2 text-sm bg-brand-500 hover:bg-brand-600 text-white rounded-lg disabled:opacity-50 shadow-sm"
          >
            {convert.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            Create booking
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Create-offer modal (provider) ──────────────────────────────────────────
function CreateOfferModal({
  requestId,
  currency,
  onClose,
}: {
  requestId: string;
  currency: string;
  onClose: () => void;
}) {
  const create = useCreateOffer();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('');
  const [validUntil, setValidUntil] = useState('');

  const submit = async () => {
    if (!title.trim() || !price.trim()) {
      toast.error('Title and price are required');
      return;
    }
    const priceCents = Math.round(Number(price) * 100);
    if (!Number.isFinite(priceCents) || priceCents <= 0) {
      toast.error('Enter a valid price');
      return;
    }
    try {
      await create.mutateAsync({
        requestId,
        title: title.trim(),
        description: description.trim() || undefined,
        priceCents,
        currency,
        validUntil: validUntil ? new Date(validUntil).toISOString() : undefined,
      });
      toast.success('Offer sent');
      onClose();
    } catch (e: any) {
      toast.error(e?.response?.data?.error?.message ?? e?.response?.data?.message ?? 'Failed to send offer');
    }
  };

  return (
    <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-md p-5 shadow-xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-gray-900">Send a new offer</h2>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg" aria-label="Close">
            <X className="h-4 w-4 text-gray-500" />
          </button>
        </div>

        <div className="space-y-3">
          <label className="block">
            <span className="block text-xs font-semibold text-gray-600 mb-1">Title *</span>
            <input
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Deluxe Movenpick room, breakfast included"
              className="w-full text-sm px-3 py-2.5 border border-gray-200 rounded-lg outline-none focus:border-brand-400"
            />
          </label>

          <label className="block">
            <span className="block text-xs font-semibold text-gray-600 mb-1">Description</span>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="What is included, terms, anything the traveler should know…"
              className="w-full text-sm px-3 py-2.5 border border-gray-200 rounded-lg outline-none resize-none focus:border-brand-400"
            />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="block text-xs font-semibold text-gray-600 mb-1">Price ({currency}) *</span>
              <input
                type="number"
                min="0"
                step="1"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="4500"
                className="w-full text-sm px-3 py-2.5 border border-gray-200 rounded-lg outline-none focus:border-brand-400"
              />
            </label>
            <label className="block">
              <span className="block text-xs font-semibold text-gray-600 mb-1">Valid until</span>
              <input
                type="date"
                value={validUntil}
                onChange={(e) => setValidUntil(e.target.value)}
                className="w-full text-sm px-3 py-2.5 border border-gray-200 rounded-lg outline-none focus:border-brand-400"
              />
            </label>
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-5">
          <button
            onClick={onClose}
            disabled={create.isPending}
            className="px-4 py-2 text-sm border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={create.isPending || !title.trim() || !price.trim()}
            className="flex items-center gap-2 px-4 py-2 text-sm bg-brand-500 hover:bg-brand-600 text-white rounded-lg disabled:opacity-50 shadow-sm"
          >
            {create.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
            Send offer
          </button>
        </div>
      </div>
    </div>
  );
}

function toDateTimeLocal(value: string | Date): string {
  const d = new Date(value);
  if (isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

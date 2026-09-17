'use client';
import { apiErrorMessage } from '@/lib/api-error';
import { Input, Select, Textarea, ModalSurface , Button , QueryFailure } from '@/components/ui/system';


import { bookingEstimateCents } from '@/lib/booking-estimate';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft, Loader2, AlertCircle, Edit3, Trash2, MessageSquare, CalendarCheck2,
  Send, Save, X, Building2, MapPin, Phone, Mail, Star, ListChecks, Bus, FileText,
  Hotel, BedDouble, Calendar, BadgeCheck, Pause, Play, Archive,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import {
  useMarketplaceListing, useUpdateListing, useDeactivateListing,
  useListingInquiries, useCreateInquiry, useRespondInquiry,
  useListingBookings, useCreateMarketplaceBooking, useUpdateMarketplaceBooking,
} from '@/hooks/use-marketplace';

type TabKey = 'overview' | 'inquiries' | 'bookings' | 'edit';

const TABS: { key: TabKey; label: string; icon: any }[] = [
  { key: 'overview',  label: 'Overview',  icon: ListChecks },
  { key: 'inquiries', label: 'Inquiries', icon: MessageSquare },
  { key: 'bookings',  label: 'Bookings',  icon: CalendarCheck2 },
  { key: 'edit',      label: 'Edit',      icon: Edit3 },
];

const TYPE_ICON: Record<string, any> = {
  hotel_room: Hotel,
  transport_service: Bus,
  visa_service: FileText,
  catering: BedDouble,
  guide_service: BadgeCheck,
  other: Building2,
};

// Mirrors BOOKING_TRANSITIONS in the marketplace service: the server refuses any
// other move, so the UI must not offer one.
const BOOKING_TRANSITIONS: Record<string, string[]> = {
  PENDING: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['COMPLETED', 'CANCELLED'],
  PAID: ['COMPLETED'],
  COMPLETED: [],
  CANCELLED: [],
  REFUNDED: [],
};

export function ListingDetail({ id }: { id: string }) {
  const router = useRouter();
  const { data: listing, isLoading, error, refetch } = useMarketplaceListing(id);
  const [tab, setTab] = useState<TabKey>('overview');
  const [showInquire, setShowInquire] = useState(false);
  const [showBook, setShowBook] = useState(false);

  if (error) return <QueryFailure error={error} onRetry={() => { refetch(); }} />;
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20 text-gray-600 text-sm">
        <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading listing…
      </div>
    );
  }
  if (error || !listing) {
    return (
      <div className="py-20 text-center bg-white rounded-xl border border-gray-200">
        <AlertCircle className="h-10 w-10 mx-auto mb-3 text-red-700 opacity-60" />
        <p className="text-sm text-red-700">Listing not found</p>
        <Link href="/marketplace" className="text-xs text-brand-500 hover:underline mt-3 inline-block">← Back to marketplace</Link>
      </div>
    );
  }

  const Icon = TYPE_ICON[listing.type] ?? Building2;
  const price = listing.priceCents ? (listing.priceCents / 100).toLocaleString() : null;


  return (
    <div className="space-y-5 pb-10">
      {/* Header */}
      <div className="flex items-center gap-3 flex-wrap">
        <Button variant="quiet" type="button" aria-label="Go back" onClick={() => router.push('/marketplace')} className="p-2 rounded-xl border border-gray-200 hover:bg-gray-50">
          <ArrowLeft className="h-4 w-4 text-gray-600" />
        </Button>
        <div className="w-12 h-12 rounded-xl bg-brand-50 flex items-center justify-center">
          <Icon className="h-6 w-6 text-brand-600" />
        </div>
        <div className="flex-1 min-w-0 basis-[calc(100%_-_140px)] sm:basis-auto">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold text-gray-900 ">{listing.name}</h1>
            <span className="text-xs font-medium text-saudi-700 bg-saudi-50 px-2 py-1 rounded-full">{listing.type?.replace('_', ' ')}</span>
            <span className={cn('text-xs font-medium px-2 py-1 rounded-full',
              listing.status === 'PUBLISHED' ? 'bg-green-50 text-green-700' :
              listing.status === 'PAUSED' ? 'bg-yellow-50 text-yellow-700' :
              listing.status === 'ARCHIVED' ? 'bg-gray-100 text-gray-600' : 'bg-blue-50 text-blue-700'
            )}>{listing.status ?? 'PUBLISHED'}</span>
          </div>
          {listing.vendor && (
            <p className="text-xs text-gray-600 mt-1 flex items-center gap-1.5">
              <Building2 className="h-3 w-3" /> {listing.vendor.name} {listing.vendor.city && `• ${listing.vendor.city}`}
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <PublishToggle listing={listing} refetch={refetch} />
          <Button variant="quiet" type="button" onClick={() => setShowInquire(true)} className="flex items-center gap-2 px-4 py-2 text-sm border border-gray-200 rounded-xl hover:bg-gray-50">
            <MessageSquare className="h-4 w-4" /> Inquire
          </Button>
          <Button variant="quiet" type="button" onClick={() => setShowBook(true)} className="flex items-center gap-2 px-4 py-2 text-sm bg-brand-500 hover:bg-brand-600 text-white rounded-xl shadow-sm">
            <CalendarCheck2 className="h-4 w-4" /> Book
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-xl border border-gray-200 p-1.5 flex gap-1 overflow-x-auto">
        {TABS.map((t) => {
          const I = t.icon;
          return (
            <Button variant="quiet" type="button"
              key={t.key}
              onClick={() => setTab(t.key)}
              className={cn(
                'flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium transition-colors shrink-0',
                tab === t.key
                  ? 'bg-brand-50 text-brand-700 border border-brand-100'
                  : 'text-gray-600 hover:bg-gray-50',
              )}
            >
              <I className="h-4 w-4" /> {t.label}
            </Button>
          );
        })}
      </div>

      {/* Tab body */}
      {tab === 'overview' && <OverviewTab listing={listing} price={price} />}
      {tab === 'inquiries' && <InquiriesTab listingId={id} />}
      {tab === 'bookings' && <BookingsTab listingId={id} />}
      {tab === 'edit' && <EditTab listing={listing} refetch={refetch} />}

      {/* Modals */}
      {showInquire && <InquireModal listingId={id} onClose={() => setShowInquire(false)} />}
      {showBook && <BookModal listing={listing} onClose={() => setShowBook(false)} />}
    </div>
  );
}

function PublishToggle({ listing, refetch }: { listing: any; refetch: () => void }) {
  const update = useUpdateListing();
  const isPublished = (listing.status ?? 'PUBLISHED') === 'PUBLISHED' && listing.isActive !== false;
  return (
    <Button busy={update.isPending} variant="quiet" type="button"
      onClick={async () => {
        try {
          await update.mutateAsync({
            id: listing.id,
            status: isPublished ? 'PAUSED' : 'PUBLISHED',
            isActive: isPublished ? false : true,
          });
          toast.success(isPublished ? 'Listing unpublished' : 'Listing published');
          refetch();
        } catch (e: any) {
          toast.error(apiErrorMessage(e, 'Failed'));
        }
      }}
      className={cn(
        'flex items-center gap-2 px-4 py-2 text-sm rounded-xl transition-colors',
        isPublished
          ? 'bg-green-50 hover:bg-green-100 text-green-700 border border-green-200'
          : 'bg-gray-100 hover:bg-gray-200 text-gray-700 border border-gray-200',
      )}
    >
      {isPublished ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
      {isPublished ? 'Published' : 'Unpublished'}
    </Button>
  );
}

function OverviewTab({ listing, price }: { listing: any; price: string | null }) {
  const attrs = listing.attributes ?? {};
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <div className="bg-white rounded-xl border border-gray-200 p-5 lg:col-span-2 space-y-3">
        <h3 className="text-sm font-bold text-gray-900">About this listing</h3>
        <p className="text-sm text-gray-700 whitespace-pre-wrap">{listing.description ?? '—'}</p>

        {Object.keys(attrs).length > 0 && (
          <div className="pt-3 border-t border-gray-50">
            <p className="text-xs font-semibold text-gray-600 mb-2">Details</p>
            <dl className="grid grid-cols-2 gap-2 text-xs">
              {Object.entries(attrs).map(([k, v]) => (
                <div key={k} className="bg-gray-50 rounded-lg px-2.5 py-1.5">
                  <dt className="text-gray-600 capitalize">{k.replace(/([A-Z])/g, ' $1')}</dt>
                  <dd className="text-gray-900 font-medium">{Array.isArray(v) ? v.join(', ') : v === true ? 'Yes' : v === false ? 'No' : String(v)}</dd>
                </div>
              ))}
            </dl>
          </div>
        )}

        {listing.imageUrls && listing.imageUrls.length > 0 && (
          <div className="pt-3 border-t border-gray-50">
            <p className="text-xs font-semibold text-gray-600 mb-2">Photos</p>
            <div className="grid grid-cols-3 gap-2">
              {listing.imageUrls.slice(0, 6).map((u: string, i: number) => (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img key={i} src={u} alt="" className="aspect-video rounded-lg object-cover bg-gray-100" />
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="space-y-3">
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-xs font-semibold text-gray-600 mb-2">Price</p>
          {price ? (
            <p className="text-3xl font-bold text-gray-900">
              <span className="text-base font-medium text-gray-600">{listing.currency ?? 'SAR'} </span>
              {price}
            </p>
          ) : (
            <p className="text-base font-medium text-gray-600">Contact for pricing</p>
          )}
          <p className="text-xs text-gray-600 mt-1">{listing.pricingModel?.replace('_', ' ').toLowerCase()}</p>
        </div>

        {listing.vendor && (
          <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-2">
            <p className="text-xs font-semibold text-gray-600">Provider</p>
            <p className="text-sm font-bold text-gray-900">{listing.vendor.name}</p>
            {listing.vendor.city && <p className="text-xs text-gray-600 inline-flex items-center gap-1"><MapPin className="h-3 w-3" />{listing.vendor.city}, {listing.vendor.country}</p>}
            {listing.vendor.phone && <p className="text-xs text-gray-600 inline-flex items-center gap-1"><Phone className="h-3 w-3" />{listing.vendor.phone}</p>}
            {listing.vendor.email && <p className="text-xs text-gray-600 inline-flex items-center gap-1"><Mail className="h-3 w-3" />{listing.vendor.email}</p>}
            {listing.vendor.rating != null && listing.vendor.ratingCount > 0 && (
              <div className="flex items-center gap-1 pt-2 border-t border-gray-50">
                <Star className="h-3.5 w-3.5 fill-yellow-400 text-yellow-400" />
                <span className="text-xs font-semibold text-gray-700">{Number(listing.vendor.rating).toFixed(1)}</span>
                <span className="text-xs text-gray-600">({listing.vendor.ratingCount ?? 0} reviews)</span>
              </div>
            )}
          </div>
        )}

        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-xs font-semibold text-gray-600 mb-2">Activity</p>
          <div className="grid grid-cols-2 gap-2 text-center">
            <div>
              <p className="text-xl font-bold text-gray-900">{listing._count?.inquiries ?? 0}</p>
              <p className="text-xs text-gray-600">Inquiries</p>
            </div>
            <div>
              <p className="text-xl font-bold text-gray-900">{listing._count?.bookings ?? 0}</p>
              <p className="text-xs text-gray-600">Bookings</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function InquiriesTab({ listingId }: { listingId: string }) {
  const { data: inquiries = [], refetch , error: listingInquiriesError} = useListingInquiries(listingId);
  const respond = useRespondInquiry();
  const [active, setActive] = useState<string | null>(null);
  const [text, setText] = useState('');

  if (listingInquiriesError) return <QueryFailure error={listingInquiriesError} onRetry={() => { refetch(); }} />;
  return (
    <div className="space-y-3">
      {inquiries.length === 0 ? (
        <div className="py-10 text-center text-sm text-gray-600 bg-white rounded-xl border border-gray-200">No inquiries yet — inquiries from interested buyers will appear here</div>
      ) : (
        inquiries.map((q: any) => (
          <div key={q.id} className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="flex items-start justify-between mb-2">
              <div>
                <p className="text-sm font-semibold text-gray-900">{q.fromName ?? 'Customer'}</p>
                <p className="text-xs text-gray-600">
                  {q.fromEmail ?? '—'} {q.fromPhone && `• ${q.fromPhone}`}
                  {q.partySize ? ` • ${q.partySize} pax` : ''}
                </p>
              </div>
              <span className={cn('text-xs font-medium px-2 py-1 rounded-full',
                q.status === 'NEW' ? 'bg-blue-50 text-blue-600' :
                q.status === 'RESPONDED' ? 'bg-green-50 text-green-700' :
                'bg-gray-100 text-gray-600'
              )}>{q.status}</span>
            </div>
            <p className="text-sm text-gray-700 whitespace-pre-wrap">{q.message}</p>
            {q.response && (
              <div className="mt-2 pt-2 border-t border-gray-50 bg-brand-50/50 rounded-lg p-3">
                <p className="text-xs font-semibold text-brand-700 mb-1">Your response</p>
                <p className="text-sm text-gray-700 whitespace-pre-wrap">{q.response}</p>
              </div>
            )}
            {active === q.id ? (
              <div className="mt-3 flex gap-2">
                <Input aria-label="Text"
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder="Reply…"
                  className="flex-1 text-sm px-3 py-2 border border-gray-200 rounded-lg outline-none"
                />
                <Button variant="quiet" type="button"
                  onClick={async () => { try {
                    if (!text.trim()) return;
                    await respond.mutateAsync({ id: q.id, response: text.trim() });
                    toast.success('Response sent');
                    setText(''); setActive(null);
                    refetch();
                  } catch (error) { toast.error(apiErrorMessage(error, 'This action could not be completed. Try again.')); } }}
                  className="text-sm px-3 py-2 bg-brand-500 text-white rounded-lg disabled:opacity-50"
                  disabled={respond.isPending}
                >
                  Send
                </Button>
              </div>
            ) : (
              <Button variant="quiet" type="button" onClick={() => setActive(q.id)} className="text-xs text-brand-500 font-medium hover:underline mt-2">Reply</Button>
            )}
          </div>
        ))
      )}
    </div>
  );
}

function BookingsTab({ listingId }: { listingId: string }) {
  const { data: bookings = [], refetch , error: listingBookingsError} = useListingBookings(listingId);
  const update = useUpdateMarketplaceBooking();

  if (listingBookingsError) return <QueryFailure error={listingBookingsError} onRetry={() => { refetch(); }} />;
  return (
    <div className="bg-white rounded-xl border border-gray-200">
      {bookings.length === 0 ? (
        <div className="py-10 text-center text-sm text-gray-600">No bookings yet — accepted offers convert into bookings here</div>
      ) : (
        <div role="region" aria-label="Scrollable records" tabIndex={0} className="max-w-full overflow-x-auto"><table className="w-full text-sm">
          <thead className="text-xs text-gray-600 border-b border-gray-200">
            <tr>
              <th className="text-left p-3">Customer</th>
              <th className="text-left p-3">Dates</th>
              <th className="text-left p-3">Party</th>
              <th className="text-left p-3">Total</th>
              <th className="text-left p-3">Status</th>
              <th className="text-left p-3">Payment</th>
              <th />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {bookings.map((b: any) => (
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
                <td className="p-3 font-medium">{b.currency} {(b.totalAmountCents / 100).toLocaleString()}</td>
                <td className="p-3">
                  <Select disabled={update.isPending} aria-label={`Status for ${b.id ?? 'record'}`}
                    value={b.status}
                    onChange={async (e) => { try {
                      await update.mutateAsync({ id: b.id, status: e.target.value });
                      refetch();
                    } catch (error) { toast.error(apiErrorMessage(error, 'This action could not be completed. Try again.')); } }}
                    className="text-xs border border-gray-200 rounded-lg px-2 py-1 bg-white"
                  >
                    {/* Only the transitions the server will actually accept from the
                        current state. PAID and REFUNDED are owned by the payments
                        module and are rejected here, so they are never offered. */}
                    {[b.status, ...(BOOKING_TRANSITIONS[String(b.status).toUpperCase()] ?? [])]
                      .filter((s, i, a) => s && a.indexOf(s) === i)
                      .map((s: string) => <option key={s} value={s}>{s}</option>)}
                  </Select>
                </td>
                <td className="p-3">
                  {/* Read-only: payment state is set by the payments module from a
                      settled transaction. Offering it as an editable control here
                      only ever produced a 400. */}
                  <span className="text-xs font-medium text-gray-700">{b.paymentStatus ?? '—'}</span>
                </td>
                <td className="p-3 text-right">
                </td>
              </tr>
            ))}
          </tbody>
        </table></div>
      )}
    </div>
  );
}

function EditTab({ listing, refetch }: { listing: any; refetch: () => void }) {
  const router = useRouter();
  const update = useUpdateListing();
  const deactivate = useDeactivateListing();
  const [name, setName] = useState(listing.name ?? '');
  const [description, setDescription] = useState(listing.description ?? '');
  const [priceFrom, setPriceFrom] = useState<string>(String((listing.priceCents ?? 0) / 100));
  const [currency, setCurrency] = useState(listing.currency ?? 'SAR');
  const [pricingModel, setPricingModel] = useState(listing.pricingModel ?? 'PER_PERSON');
  const [status, setStatus] = useState(listing.status ?? 'PUBLISHED');
  const [city, setCity] = useState(listing.attributes?.city ?? '');

  const save = async () => {
    try {
      await update.mutateAsync({
        id: listing.id,
        name,
        description,
        priceFrom: Number(priceFrom),
        currency,
        pricingModel,
        status,
        attributes: { ...(listing.attributes ?? {}), city },
      });
      toast.success('Listing saved');
      refetch();
    } catch (e: any) {
      toast.error(apiErrorMessage(e, 'Failed'));
    }
  };

  const archive = async () => {
    if (!confirm('Archive this listing? It will be hidden from public marketplace.')) return;
    try {
      await deactivate.mutateAsync(listing.id);
      toast.success('Listing archived');
      router.push('/marketplace');
    } catch (e: any) {
      toast.error(apiErrorMessage(e, 'Failed'));
    }
  };

  return (
    <div className="space-y-4 max-w-2xl">
      <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
        <h3 className="text-sm font-bold text-gray-900 inline-flex items-center gap-2">
          <Edit3 className="h-4 w-4" /> Edit listing
        </h3>
        <FieldLabel label="Title">
          <Input aria-label="Name" value={name} onChange={(e) => setName(e.target.value)} className="w-full text-sm px-3 py-2.5 border border-gray-200 rounded-lg outline-none focus:border-brand-400" />
        </FieldLabel>
        <FieldLabel label="Description">
          <Textarea aria-label="Description" value={description} onChange={(e) => setDescription(e.target.value)} rows={3} className="w-full text-sm px-3 py-2.5 border border-gray-200 rounded-lg resize-none outline-none focus:border-brand-400" />
        </FieldLabel>
        <div className="grid grid-cols-3 gap-3">
          <FieldLabel label="Price">
            <Input aria-label="Price From" type="number" value={priceFrom} onChange={(e) => setPriceFrom(e.target.value)} className="w-full text-sm px-3 py-2.5 border border-gray-200 rounded-lg" />
          </FieldLabel>
          <FieldLabel label="Currency">
            <Select aria-label="Currency" value={currency} onChange={(e) => setCurrency(e.target.value)} className="w-full text-sm px-3 py-2.5 border border-gray-200 rounded-lg bg-white">
              {['SAR', 'USD', 'IDR', 'PKR', 'MYR'].map((c) => <option key={c} value={c}>{c}</option>)}
            </Select>
          </FieldLabel>
          <FieldLabel label="Pricing model">
            <Select aria-label="Pricing Model" value={pricingModel} onChange={(e) => setPricingModel(e.target.value)} className="w-full text-sm px-3 py-2.5 border border-gray-200 rounded-lg bg-white">
              {['PER_PERSON', 'PER_GROUP', 'PER_NIGHT', 'PER_TRIP', 'FLAT'].map((c) => <option key={c} value={c}>{c.replace('_', ' ')}</option>)}
            </Select>
          </FieldLabel>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <FieldLabel label="Status">
            <Select aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value)} className="w-full text-sm px-3 py-2.5 border border-gray-200 rounded-lg bg-white">
              {['PUBLISHED', 'DRAFT', 'PAUSED', 'ARCHIVED'].map((s) => <option key={s} value={s}>{s}</option>)}
            </Select>
          </FieldLabel>
          <FieldLabel label="City">
            <Input aria-label="City" value={city} onChange={(e) => setCity(e.target.value)} className="w-full text-sm px-3 py-2.5 border border-gray-200 rounded-lg" />
          </FieldLabel>
        </div>
        <div className="flex justify-end pt-2">
          <Button variant="quiet" type="button" onClick={save} disabled={update.isPending} className="flex items-center gap-2 px-4 py-2 text-sm bg-brand-500 text-white rounded-lg disabled:opacity-50">
            {update.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save listing
          </Button>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-red-100 p-5">
        <h3 className="text-sm font-bold text-red-700 inline-flex items-center gap-2"><Archive className="h-4 w-4" /> Archive listing</h3>
        <p className="text-xs text-gray-600 my-2">Hide this listing from the public marketplace. Past inquiries and bookings remain.</p>
        <Button variant="quiet" type="button" onClick={archive} className="px-4 py-2 text-sm bg-red-50 hover:bg-red-100 text-red-600 rounded-lg">Archive listing</Button>
      </div>
    </div>
  );
}

function FieldLabel({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs font-semibold text-gray-600 mb-1">{label}</span>
      {children}
    </label>
  );
}

function InquireModal({ listingId, onClose }: { listingId: string; onClose: () => void }) {
  const createInquiry = useCreateInquiry();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [message, setMessage] = useState('');
  const [partySize, setPartySize] = useState<string>('');
  return (
    <ModalSurface busy={createInquiry.isPending} title="Send inquiry" onClose={onClose}   >
      <div className="bg-white rounded-xl w-full max-w-md p-5 shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-gray-900">Send inquiry</h2>
          <Button disabled={createInquiry.isPending} variant="quiet" type="button" aria-label="Close dialog" onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg"><X className="h-4 w-4" /></Button>
        </div>
        <div className="space-y-3">
          <Input aria-label="Name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" className="w-full text-sm px-3 py-2.5 border border-gray-200 rounded-lg" />
          <Input aria-label="Email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" className="w-full text-sm px-3 py-2.5 border border-gray-200 rounded-lg" />
          <Input aria-label="Phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Phone" className="w-full text-sm px-3 py-2.5 border border-gray-200 rounded-lg" />
          <Input aria-label="Party Size" value={partySize} onChange={(e) => setPartySize(e.target.value)} type="number" placeholder="Party size" className="w-full text-sm px-3 py-2.5 border border-gray-200 rounded-lg" />
          <Textarea aria-label="Message" value={message} onChange={(e) => setMessage(e.target.value)} rows={3} placeholder="Your message" className="w-full text-sm px-3 py-2.5 border border-gray-200 rounded-lg resize-none" />
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <Button disabled={createInquiry.isPending} variant="quiet" type="button" onClick={onClose} className="px-4 py-2 text-sm border border-gray-200 rounded-lg">Cancel</Button>
          <Button variant="quiet" type="button"
            onClick={async () => {
              try {
                await createInquiry.mutateAsync({
                  listingId, name, email, phone, message,
                  partySize: partySize ? Number(partySize) : undefined,
                });
                toast.success('Inquiry sent');
                onClose();
              } catch (e: any) {
                toast.error(apiErrorMessage(e, 'Failed'));
              }
            }}
            disabled={createInquiry.isPending || !message.trim()}
            className="flex items-center gap-2 px-4 py-2 text-sm bg-brand-500 text-white rounded-lg disabled:opacity-50"
          >
            {createInquiry.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Send
          </Button>
        </div>
      </div>
    </ModalSurface>
  );
}

function BookModal({ listing, onClose }: { listing: any; onClose: () => void }) {
  const createBooking = useCreateMarketplaceBooking();
  const [customerName, setCustomerName] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [partySize, setPartySize] = useState<string>('1');
  const [notes, setNotes] = useState('');

  const estimateCents = bookingEstimateCents(listing.priceCents, listing.pricingModel, Number(partySize));
  const canPrice = estimateCents != null;
  const validPartySize = Number.isSafeInteger(Number(partySize)) && Number(partySize) >= 1;
  const totalEst = (estimateCents ?? 0) / 100;
  const validDates = !!startDate && (!endDate || endDate >= startDate);

  return (
    <ModalSurface busy={createBooking.isPending} title="Create booking" onClose={onClose}   >
      <div className="bg-white rounded-xl w-full max-w-md p-5 shadow-xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-gray-900">Create booking</h2>
          <Button disabled={createBooking.isPending} variant="quiet" type="button" aria-label="Close dialog" onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg"><X className="h-4 w-4" /></Button>
        </div>
        <div className="space-y-3">
          <Input aria-label="Customer Name" value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="Customer name" className="w-full text-sm px-3 py-2.5 border border-gray-200 rounded-lg" />
          <Input aria-label="Customer Email" value={customerEmail} onChange={(e) => setCustomerEmail(e.target.value)} placeholder="Email" className="w-full text-sm px-3 py-2.5 border border-gray-200 rounded-lg" />
          <Input aria-label="Customer Phone" value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} placeholder="Phone" className="w-full text-sm px-3 py-2.5 border border-gray-200 rounded-lg" />
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="block text-xs font-semibold text-gray-600 mb-1">Start date</span>
              <Input  type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-full text-sm px-3 py-2.5 border border-gray-200 rounded-lg" />
            </label>
            <label className="block">
              <span className="block text-xs font-semibold text-gray-600 mb-1">End date</span>
              <Input  type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="w-full text-sm px-3 py-2.5 border border-gray-200 rounded-lg" />
            </label>
          </div>
          <label className="block">
            <span className="block text-xs font-semibold text-gray-600 mb-1">Party size</span>
            <Input  type="number" min="1" value={partySize} onChange={(e) => setPartySize(e.target.value)} className="w-full text-sm px-3 py-2.5 border border-gray-200 rounded-lg" />
          </label>
          <Textarea aria-label="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Notes" className="w-full text-sm px-3 py-2.5 border border-gray-200 rounded-lg resize-none" />
          <div className="bg-brand-50 rounded-lg px-3 py-2 text-sm">
            <span className="text-gray-600">Estimated total:</span> <span className="font-bold text-gray-900">{canPrice && validPartySize ? `${listing.currency ?? 'SAR'} ${totalEst.toLocaleString()}` : 'Provider confirmation required'}</span>
          </div>
          <p className="text-sm text-gray-600">Enter a customer name, a start date and a whole party size. The end date cannot precede the start date. Creating a booking records a request with the provider; it does not confirm availability or collect payment. Review the dates, party size and estimate before continuing. Nightly and custom pricing require a provider inquiry.</p>
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <Button disabled={createBooking.isPending} variant="quiet" type="button" onClick={onClose} className="px-4 py-2 text-sm border border-gray-200 rounded-lg">Cancel</Button>
          <Button variant="quiet" type="button"
            onClick={async () => {
              try {
                await createBooking.mutateAsync({
                  listingId: listing.id,
                  customerName, customerEmail, customerPhone,
                  startDate: startDate || undefined,
                  endDate: endDate || undefined,
                  partySize: Number(partySize) || 1,
                  totalAmountCents: Math.round(totalEst * 100),
                  notes: notes || undefined,
                });
                toast.success('Booking created');
                onClose();
              } catch (e: any) {
                toast.error(apiErrorMessage(e, 'Failed'));
              }
            }}
            disabled={createBooking.isPending || !customerName.trim() || !validPartySize || !validDates || !canPrice}
            className="flex items-center gap-2 px-4 py-2 text-sm bg-brand-500 text-white rounded-lg disabled:opacity-50"
          >
            {createBooking.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CalendarCheck2 className="h-4 w-4" />} Create booking
          </Button>
        </div>
      </div>
    </ModalSurface>
  );
}

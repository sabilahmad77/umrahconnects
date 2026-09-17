'use client';
import { apiErrorMessage } from '@/lib/api-error';
import { Input, ModalSurface, Select, Textarea , Button , QueryFailure } from '@/components/ui/system';


import { useState } from 'react';
import Link from 'next/link';
import {
  Store, Star, RefreshCw, Search, Plus, Package, AlertCircle, BadgeCheck, X, Loader2,
  MapPin, ShoppingBag, Building2, CheckCircle2,
} from 'lucide-react';
import { useMarketplaceListings, useMarketplaceVendors, useMyMarketplaceVendor, useCreateListing } from '@/hooks/use-api';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { ListingMedia, CategoryIcon, CATEGORY_META, normalizeCategory } from './listing-visual';

const TABS = ['listings', 'vendors'] as const;

// Map display labels → ListingCategory enum values used by the API
const CATEGORY_TO_TYPE: Record<string, string> = {
  HOTEL: 'hotel_room',
  TRANSPORT: 'transport_service',
  VISA: 'visa_service',
  CATERING: 'catering',
  GUIDE: 'guide_service',
  PACKAGE: 'other',
};

export function MarketplaceView() {
  const [tab, setTab] = useState<'listings' | 'vendors'>('listings');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [showCreate, setShowCreate] = useState(false);

  const { data: listingsData, isLoading: ll, error: le, refetch: rl } = useMarketplaceListings({
    page,
    limit: 20,
    category: categoryFilter !== 'ALL' ? CATEGORY_TO_TYPE[categoryFilter] : undefined,
  });
  const { data: vendors, isLoading: vl , error: marketplaceVendorsError, refetch: retryMarketplaceVendors} = useMarketplaceVendors();
  // Authoring a listing is scoped to the caller's own vendor record; the public
  // directory above would offer other organizations' vendors, which the server
  // rejects with 404 "Vendor not found".
  const { data: myVendor } = useMyMarketplaceVendor(showCreate);
  const createListing = useCreateListing();

  const listings = listingsData?.items ?? [];
  const total = listingsData?.total ?? 0;
  const totalPages = Math.ceil(total / 20);

  const categories = ['ALL', 'HOTEL', 'TRANSPORT', 'VISA', 'CATERING', 'GUIDE', 'PACKAGE'];

  if (le || marketplaceVendorsError) return <QueryFailure error={le || marketplaceVendorsError} onRetry={() => { rl(); retryMarketplaceVendors(); }} />;
  return (
    <div className="space-y-5 pb-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Marketplace</h1>
          <p className="text-sm text-gray-600 mt-0.5">Discover & connect with Umrah service providers</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="quiet" type="button" aria-label="Refresh information" onClick={() => rl()} className="p-2 border border-gray-200 rounded-xl hover:bg-gray-50 text-gray-600 transition-colors">
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Button variant="quiet" type="button"
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 text-sm px-4 py-2 bg-brand-500 text-white rounded-xl hover:bg-brand-600 transition-colors shadow-sm"
          >
            <Plus className="h-4 w-4" />
            Add Listing
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-white border border-gray-200 rounded-xl p-1 w-fit">
        {TABS.map((t) => (
          <Button variant="quiet" type="button"
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              'flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-medium transition-all capitalize',
              tab === t ? 'bg-brand-500 text-white shadow-sm' : 'text-gray-600 hover:text-gray-700 hover:bg-gray-50',
            )}
          >
            {t === 'listings' ? <ShoppingBag className="h-4 w-4" /> : <Building2 className="h-4 w-4" />}
            {t === 'listings' ? 'Listings' : 'Vendors'}
          </Button>
        ))}
      </div>

      {/* ── LISTINGS ── */}
      {tab === 'listings' && (
        <>
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-xl px-3 py-2.5 w-full sm:w-72 focus-within:border-brand-300 transition-colors">
              <Search className="h-4 w-4 text-gray-600 shrink-0" />
              <Input aria-label="Search"
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                placeholder="Search listings..."
                className="text-sm bg-transparent flex-1 outline-none placeholder:text-gray-600"
              />
            </div>
            <div className="flex gap-1.5 flex-wrap">
              {categories.map((c) => (
                <Button variant="quiet" type="button"
                  key={c}
                  onClick={() => { setCategoryFilter(c); setPage(1); }}
                  className={cn(
                    'flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border transition-all font-medium',
                    categoryFilter === c
                      ? 'bg-brand-500 text-white border-brand-500 shadow-sm'
                      : 'border-gray-200 text-gray-600 hover:border-brand-300 hover:text-brand-600 bg-white',
                  )}
                >
                  {c !== 'ALL' && <CategoryIcon category={c} className={categoryFilter === c ? 'text-white' : 'text-brand-500'} />}
                  {c === 'ALL' ? 'All' : CATEGORY_META[normalizeCategory(c)].label}
                </Button>
              ))}
            </div>
          </div>

          {ll ? (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="bg-white rounded-xl border border-gray-200 p-4 animate-pulse space-y-3">
                  <div className="h-32 bg-gray-100 rounded-xl" />
                  <div className="h-4 w-36 bg-gray-100 rounded" />
                  <div className="h-3 w-24 bg-gray-100 rounded" />
                </div>
              ))}
            </div>
          ) : le ? (
            <div className="py-20 text-center bg-white rounded-xl border border-gray-200">
              <AlertCircle className="h-10 w-10 mx-auto mb-3 text-red-700 opacity-60" />
              <p className="text-sm text-red-700">Failed to load listings</p>
            </div>
          ) : listings.length === 0 ? (
            <div className="py-20 text-center bg-white rounded-xl border border-gray-200">
              <Store className="h-12 w-12 mx-auto mb-3 text-gray-200" />
              <p className="text-sm text-gray-600">No listings found</p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
                {listings.map((l: any) => {
                  const cat = l.type ?? l.category ?? '';
                  // `imageUrls` is what the API returns (schema.prisma `Listing.imageUrls`).
                  // The older imageUrl/coverUrl/image/images names never existed on the
                  // payload, so this always fell through to a stock category photo.
                  const img = Array.isArray(l.imageUrls) ? l.imageUrls[0] : undefined;
                  const priceLabel =
                    l.pricePerNightCents != null
                      ? `SAR ${(l.pricePerNightCents / 100).toLocaleString('en-SA', { maximumFractionDigits: 0 })} /night`
                      : l.priceCents != null
                        ? `SAR ${(l.priceCents / 100).toLocaleString('en-SA', { maximumFractionDigits: 0 })}`
                        : undefined;
                  const city = l.attributes?.city ?? l.city;
                  // The API selects `vendor: { name, ... }`; companyName/providerName/tenant
                  // are not on the payload, so this used to be undefined every time and the
                  // card invented a "<Category> provider" label in place of the real seller.
                  const provider = l.vendor?.name;
                  return (
                    <Link
                      key={l.id}
                      href={`/marketplace/${l.id}`}
                      className="group block bg-white rounded-xl border border-gray-200 hover:shadow-xl hover:shadow-brand-500/5 hover:border-brand-200 hover:-translate-y-0.5 transition-all overflow-hidden"
                    >
                      <ListingMedia category={cat} image={img} priceLabel={priceLabel} verified={l.verified} />

                      <div className="p-4">
                        <p className="text-[15px] font-heading font-bold text-gray-900 leading-snug line-clamp-1 group-hover:text-brand-600 transition-colors">
                          {l.title ?? l.name}
                        </p>
                        {l.description && (
                          <p className="text-xs text-gray-600 line-clamp-2 mt-1 leading-relaxed">{l.description}</p>
                        )}

                        {/* rating */}
                        {l.rating != null && l.reviewCount > 0 && <div className="flex items-center gap-1 mt-3">
                          {Array.from({ length: 5 }).map((_, i) => (
                            <Star key={i} className={cn('h-3.5 w-3.5', i < Math.floor(Number(l.rating)) ? 'fill-gold-400 text-gold-400' : 'text-gray-200')} />
                          ))}
                          <span className="text-xs text-gray-600 ml-1">
                            {(Number(l.rating)).toFixed(1)} ({l.reviewCount ?? 0})
                          </span>
                        </div>}

                        {/* footer: provider + location */}
                        <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-50">
                          <div className="flex items-center gap-1.5 min-w-0">
                            {/* Only the real seller's name. When the payload has no vendor
                                we show nothing rather than a manufactured provider label. */}
                            {provider && (
                              <>
                                <div className="w-5 h-5 rounded-md bg-brand-50 flex items-center justify-center shrink-0">
                                  <CategoryIcon category={cat} className="text-brand-600 h-3 w-3" />
                                </div>
                                <span className="text-xs text-gray-600 truncate">{provider}</span>
                              </>
                            )}
                          </div>
                          {city && (
                            <span className="flex items-center gap-1 text-xs text-gray-600 shrink-0">
                              <MapPin className="h-3 w-3" /> {city}
                            </span>
                          )}
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </div>

              {totalPages > 1 && (
                <div className="flex items-center justify-between pt-2">
                  <p className="text-xs text-gray-600">Page {page} of {totalPages}</p>
                  <div className="flex gap-1.5">
                    <Button variant="quiet" type="button" onClick={() => setPage(Math.max(1, page - 1))} disabled={page === 1} className="text-xs px-3 py-1.5 border border-gray-200 rounded-lg disabled:opacity-40 hover:bg-white">Prev</Button>
                    <Button variant="quiet" type="button" onClick={() => setPage(page + 1)} disabled={page >= totalPages} className="text-xs px-3 py-1.5 border border-gray-200 rounded-lg disabled:opacity-40 hover:bg-white">Next</Button>
                  </div>
                </div>
              )}
            </>
          )}
        </>
      )}

      {/* ── VENDORS ── */}
      {tab === 'vendors' && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {vl ? (
            Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="bg-white rounded-xl border border-gray-200 p-4 animate-pulse space-y-3 h-36" />
            ))
          ) : !vendors || (vendors as any[]).length === 0 ? (
            <div className="col-span-3 py-16 text-center bg-white rounded-xl border border-gray-200">
              <Package className="h-12 w-12 mx-auto mb-3 text-gray-200" />
              <p className="text-sm text-gray-600">No vendors found</p>
            </div>
          ) : (vendors as any[]).map((v: any) => (
            <div key={v.id} className="bg-white rounded-xl border border-gray-200 p-4 hover:shadow-md transition-shadow">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-brand-500 to-emerald-600 flex items-center justify-center shrink-0">
                  <CategoryIcon category={v.type ?? ''} className="text-white h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-900">{v.companyName ?? v.name}</p>
                  <p className="text-xs text-gray-600">{v.type ?? 'Vendor'} · {v.city ?? '—'}</p>
                </div>
              </div>
              {v.rating != null && (
                <div className="flex items-center gap-1">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Star key={i} className={cn('h-3 w-3', i < Math.floor(v.rating) ? 'fill-yellow-400 text-yellow-400' : 'text-gray-200')} />
                  ))}
                  <span className="text-xs text-gray-600 ml-1">{v.rating?.toFixed(1)}</span>
                </div>
              )}
              {v.verified && (
                <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700 bg-green-50 px-2 py-0.5 rounded-full mt-2">
                  <CheckCircle2 className="h-3 w-3" /> Verified
                </span>
              )}
            </div>
          ))}
        </div>
      )}

      {showCreate && (
        <CreateListingModal
          vendors={myVendor ? [myVendor] : []}
          onClose={() => setShowCreate(false)}
          onCreate={async (dto) => {
            try {
              await createListing.mutateAsync(dto);
              toast.success('Listing created');
              setShowCreate(false);
              rl();
            } catch (e: any) {
              toast.error(apiErrorMessage(e, 'Failed to create listing'));
            }
          }}
          pending={createListing.isPending}
        />
      )}
    </div>
  );
}

// ─── Create Listing Modal ───────────────────────────────────────────────────
// ─── Category-specific fields ───────────────────────────────────────────────
const CATEGORIES = [
  { value: 'hotel_room',        label: 'Hotel room',     placeholder: 'VIP Suite — Makkah Clock Tower' },
  { value: 'transport_service', label: 'Transport',      placeholder: 'Airport transfer JED → MAK (45-seat coach)' },
  { value: 'visa_service',      label: 'Visa service',   placeholder: 'Umrah visa — 7-day processing' },
  { value: 'guide_service',     label: 'Guide service',  placeholder: 'Licensed Mutawif (Arabic/English/Urdu)' },
  { value: 'catering',          label: 'Catering',       placeholder: 'Halal full-board (3 meals/day)' },
  { value: 'other',             label: 'Package / other',placeholder: '14-day premium Umrah package' },
];

function CreateListingModal({
  vendors, onClose, onCreate, pending,
}: {
  vendors: any[];
  onClose: () => void;
  onCreate: (dto: any) => Promise<void>;
  pending: boolean;
}) {
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('hotel_room');
  const [description, setDescription] = useState('');
  const [vendorId, setVendorId] = useState(vendors[0]?.id ?? '');
  const [priceFrom, setPriceFrom] = useState<string>('');
  const [city, setCity] = useState('');

  // Category-specific extras (stored in structured `attributes` on the listing)
  const [roomType, setRoomType] = useState('');
  const [starRating, setStarRating] = useState('5');
  const [distanceToHaram, setDistanceToHaram] = useState('');
  const [vehicleType, setVehicleType] = useState('coach');
  const [seatCapacity, setSeatCapacity] = useState('');
  const [routeFrom, setRouteFrom] = useState('');
  const [routeTo, setRouteTo] = useState('');
  const [visaCountry, setVisaCountry] = useState('');
  const [visaType, setVisaType] = useState('UMRAH');
  const [processingDays, setProcessingDays] = useState('');
  const [packageDuration, setPackageDuration] = useState('');
  const [packageIncludes, setPackageIncludes] = useState({ hotel: true, transport: true, visa: false });

  const cat = CATEGORIES.find((c) => c.value === category) ?? CATEGORIES[0];

  const submit = async () => {
    if (!title.trim() || !vendorId) return;

    // Build per-category structured attributes — sent as `attributes` JSON
    let attributes: Record<string, any> = {};
    if (category === 'hotel_room') {
      attributes = {
        roomType: roomType || undefined,
        starRating: starRating ? Number(starRating) : undefined,
        distanceToHaram: distanceToHaram ? Number(distanceToHaram) : undefined,
      };
    } else if (category === 'transport_service') {
      attributes = {
        vehicleType: vehicleType || undefined,
        seatCapacity: seatCapacity ? Number(seatCapacity) : undefined,
        routeFrom: routeFrom || undefined,
        routeTo: routeTo || undefined,
      };
    } else if (category === 'visa_service') {
      attributes = {
        country: visaCountry || undefined,
        visaType,
        processingDays: processingDays ? Number(processingDays) : undefined,
      };
    } else if (category === 'other') {
      attributes = {
        durationDays: packageDuration ? Number(packageDuration) : undefined,
        includes: packageIncludes,
      };
    }

    await onCreate({
      title: title.trim(),
      category,
      vendorId,
      description: description || undefined,
      // Major units — the field is labelled "Price from (SAR)" and the server
      // converts to cents itself, so multiplying here listed everything at
      // 100x. The edit form in listing-detail.tsx already sends major units.
      priceFrom: priceFrom ? Number(priceFrom) : undefined,
      currency: 'SAR',
      city: city || undefined,
      attributes,
    });
  };

  return (
    <ModalSurface title="New marketplace listing" onClose={onClose}   >
      <div className="bg-white rounded-xl w-full max-w-lg p-5 shadow-xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-gray-900">New marketplace listing</h2>
          <Button variant="quiet" type="button" aria-label="Close dialog" onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg">
            <X className="h-4 w-4 text-gray-600" />
          </Button>
        </div>

        <div className="space-y-3">
          {/* Category picker — tile grid so it's obvious which type drives the form */}
          <div>
            <span className="block text-xs font-semibold text-gray-600 mb-1.5">Service type</span>
            <div className="grid grid-cols-3 gap-2">
              {CATEGORIES.map((c) => (
                <Button variant="quiet"
                  key={c.value}
                  type="button"
                  onClick={() => setCategory(c.value)}
                  className={cn(
                    'text-xs font-medium px-2 py-2.5 rounded-lg border transition-all',
                    category === c.value
                      ? 'border-brand-500 bg-brand-50 text-brand-700 shadow-sm'
                      : 'border-gray-200 text-gray-600 hover:border-gray-300',
                  )}
                >
                  {c.label}
                </Button>
              ))}
            </div>
          </div>

          <label className="block">
            <span className="block text-xs font-semibold text-gray-600 mb-1">Title *</span>
            <Input
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={cat.placeholder}
              className="w-full text-sm px-3 py-2.5 border border-gray-200 rounded-lg focus:border-brand-400 focus:ring-2 focus:ring-brand-100 outline-none"
            />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="block text-xs font-semibold text-gray-600 mb-1">Vendor *</span>
              <Select
                value={vendorId}
                onChange={(e) => setVendorId(e.target.value)}
                className="w-full text-sm px-3 py-2.5 border border-gray-200 rounded-lg outline-none bg-white"
              >
                {vendors.length === 0 && <option value="">No vendors yet</option>}
                {vendors.map((v) => (
                  <option key={v.id} value={v.id}>{v.name}</option>
                ))}
              </Select>
            </label>
            <label className="block">
              <span className="block text-xs font-semibold text-gray-600 mb-1">Price from (SAR)</span>
              <Input
                type="number" min="0" value={priceFrom}
                onChange={(e) => setPriceFrom(e.target.value)}
                placeholder="600"
                className="w-full text-sm px-3 py-2.5 border border-gray-200 rounded-lg focus:border-brand-400 focus:ring-2 focus:ring-brand-100 outline-none"
              />
            </label>
          </div>

          <label className="block">
            <span className="block text-xs font-semibold text-gray-600 mb-1">City</span>
            <Input
              value={city}
              onChange={(e) => setCity(e.target.value)}
              placeholder={category === 'transport_service' ? 'Hub city, e.g. Jeddah' : 'Makkah'}
              className="w-full text-sm px-3 py-2.5 border border-gray-200 rounded-lg focus:border-brand-400 focus:ring-2 focus:ring-brand-100 outline-none"
            />
          </label>

          {/* ── Category-specific extras ── */}
          {category === 'hotel_room' && (
            <div className="grid grid-cols-3 gap-3 p-3 bg-blue-50/40 rounded-xl border border-blue-100">
              <label className="block">
                <span className="block text-xs font-semibold text-gray-600 mb-1">Room type</span>
                <Select  value={roomType} onChange={(e) => setRoomType(e.target.value)} className="w-full text-sm px-2 py-2 border border-gray-200 rounded-lg outline-none bg-white">
                  <option value="">—</option>
                  <option value="single">Single</option>
                  <option value="double">Double</option>
                  <option value="triple">Triple</option>
                  <option value="quad">Quad</option>
                  <option value="suite">Suite</option>
                </Select>
              </label>
              <label className="block">
                <span className="block text-xs font-semibold text-gray-600 mb-1">Stars</span>
                <Select  value={starRating} onChange={(e) => setStarRating(e.target.value)} className="w-full text-sm px-2 py-2 border border-gray-200 rounded-lg outline-none bg-white">
                  {[3, 4, 5].map((n) => <option key={n} value={n}>{'★'.repeat(n)}</option>)}
                </Select>
              </label>
              <label className="block">
                <span className="block text-xs font-semibold text-gray-600 mb-1">Haram (m)</span>
                <Input  type="number" min="0" value={distanceToHaram} onChange={(e) => setDistanceToHaram(e.target.value)} placeholder="200" className="w-full text-sm px-2 py-2 border border-gray-200 rounded-lg outline-none" />
              </label>
            </div>
          )}

          {category === 'transport_service' && (
            <div className="grid grid-cols-2 gap-3 p-3 bg-purple-50/40 rounded-xl border border-purple-100">
              <label className="block">
                <span className="block text-xs font-semibold text-gray-600 mb-1">Vehicle type</span>
                <Select  value={vehicleType} onChange={(e) => setVehicleType(e.target.value)} className="w-full text-sm px-2 py-2 border border-gray-200 rounded-lg outline-none bg-white">
                  <option value="coach">Coach</option>
                  <option value="van">Van</option>
                  <option value="sedan">Sedan</option>
                  <option value="suv">SUV</option>
                </Select>
              </label>
              <label className="block">
                <span className="block text-xs font-semibold text-gray-600 mb-1">Seats</span>
                <Input  type="number" min="1" value={seatCapacity} onChange={(e) => setSeatCapacity(e.target.value)} placeholder="45" className="w-full text-sm px-2 py-2 border border-gray-200 rounded-lg outline-none" />
              </label>
              <label className="block">
                <span className="block text-xs font-semibold text-gray-600 mb-1">From</span>
                <Input  value={routeFrom} onChange={(e) => setRouteFrom(e.target.value)} placeholder="Jeddah" className="w-full text-sm px-2 py-2 border border-gray-200 rounded-lg outline-none" />
              </label>
              <label className="block">
                <span className="block text-xs font-semibold text-gray-600 mb-1">To</span>
                <Input  value={routeTo} onChange={(e) => setRouteTo(e.target.value)} placeholder="Makkah" className="w-full text-sm px-2 py-2 border border-gray-200 rounded-lg outline-none" />
              </label>
            </div>
          )}

          {category === 'visa_service' && (
            <div className="grid grid-cols-3 gap-3 p-3 bg-yellow-50/40 rounded-xl border border-yellow-100">
              <label className="block">
                <span className="block text-xs font-semibold text-gray-600 mb-1">Country</span>
                <Input  value={visaCountry} onChange={(e) => setVisaCountry(e.target.value)} placeholder="Pakistan" className="w-full text-sm px-2 py-2 border border-gray-200 rounded-lg outline-none" />
              </label>
              <label className="block">
                <span className="block text-xs font-semibold text-gray-600 mb-1">Visa type</span>
                <Select  value={visaType} onChange={(e) => setVisaType(e.target.value)} className="w-full text-sm px-2 py-2 border border-gray-200 rounded-lg outline-none bg-white">
                  <option value="UMRAH">Umrah</option>
                  <option value="HAJJ">Hajj</option>
                  <option value="VISIT">Visit</option>
                </Select>
              </label>
              <label className="block">
                <span className="block text-xs font-semibold text-gray-600 mb-1">Days</span>
                <Input  type="number" min="0" value={processingDays} onChange={(e) => setProcessingDays(e.target.value)} placeholder="7" className="w-full text-sm px-2 py-2 border border-gray-200 rounded-lg outline-none" />
              </label>
            </div>
          )}

          {category === 'other' && (
            <div className="p-3 bg-rose-50/40 rounded-xl border border-rose-100 space-y-2">
              <label className="block">
                <span className="block text-xs font-semibold text-gray-600 mb-1">Duration (days)</span>
                <Input  type="number" min="1" value={packageDuration} onChange={(e) => setPackageDuration(e.target.value)} placeholder="14" className="w-full text-sm px-2 py-2 border border-gray-200 rounded-lg outline-none" />
              </label>
              <div className="flex flex-wrap gap-3 text-xs">
                {(['hotel', 'transport', 'visa'] as const).map((k) => (
                  <label key={k} className="inline-flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={packageIncludes[k]}
                      onChange={(e) => setPackageIncludes({ ...packageIncludes, [k]: e.target.checked })}
                    />
                    Includes {k}
                  </label>
                ))}
              </div>
            </div>
          )}

          <label className="block">
            <span className="block text-xs font-semibold text-gray-600 mb-1">Description</span>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder="What does this listing offer?"
              className="w-full text-sm px-3 py-2.5 border border-gray-200 rounded-lg focus:border-brand-400 focus:ring-2 focus:ring-brand-100 outline-none resize-none"
            />
          </label>
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <Button variant="quiet" type="button"
            onClick={onClose}
            disabled={pending}
            className="px-4 py-2 text-sm border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 disabled:opacity-50"
          >
            Cancel
          </Button>
          <Button variant="quiet" type="button"
            onClick={submit}
            disabled={pending || !title.trim() || !vendorId}
            className="flex items-center gap-2 px-4 py-2 text-sm bg-brand-500 hover:bg-brand-600 text-white rounded-lg disabled:opacity-50 shadow-sm"
          >
            {pending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Create listing
          </Button>
        </div>
      </div>
    </ModalSurface>
  );
}

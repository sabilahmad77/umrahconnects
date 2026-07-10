'use client';

import { useState } from 'react';
import { Hotel, Plus, RefreshCw, Search, Star, CheckCircle2, MoreHorizontal, AlertCircle, X, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useHotels, useHotelStats, useCreateHotel } from '@/hooks/use-api';
import { cn } from '@/lib/utils';

const CITIES = ['ALL', 'MAKKAH', 'MADINAH', 'JEDDAH', 'RIYADH'];

export function HotelsList() {
  const [search, setSearch] = useState('');
  const [city, setCity] = useState('ALL');
  const [page, setPage] = useState(1);
  const [showCreate, setShowCreate] = useState(false);

  const { data, isLoading, error, refetch } = useHotels({
    page,
    limit: 20,
    search: search || undefined,
    city: city !== 'ALL' ? city : undefined,
  });
  const { data: stats } = useHotelStats();
  const createHotel = useCreateHotel();

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / 20);

  // API shape: { hotels: {total, active}, rooms: {total, booked, ...}, occupancyRate }
  const totalHotels = stats?.hotels?.total ?? stats?.totalHotels ?? 0;
  const totalRooms = stats?.rooms?.total ?? stats?.totalRooms ?? 0;
  const bookedRooms = stats?.rooms?.booked ?? stats?.bookedRooms ?? 0;
  const occupancy = stats?.occupancyRate ?? (totalRooms > 0 ? Math.round((bookedRooms / totalRooms) * 100) : 0);

  return (
    <div className="space-y-5 pb-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Hotels & Inventory</h1>
          <p className="text-sm text-gray-500 mt-0.5">{total.toLocaleString()} hotels in your network</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => refetch()} className="p-2 border border-gray-200 rounded-xl hover:bg-gray-50 text-gray-500 transition-colors">
            <RefreshCw className="h-4 w-4" />
          </button>
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 text-sm px-4 py-2 bg-brand-500 text-white rounded-xl hover:bg-brand-600 transition-colors shadow-sm shadow-brand-500/30"
          >
            <Plus className="h-4 w-4" />
            Add Hotel
          </button>
        </div>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-white rounded-2xl border border-gray-100 p-4">
            <p className="text-2xl font-bold text-gray-900">{totalHotels}</p>
            <p className="text-xs font-medium text-blue-600 mt-1">Total Hotels</p>
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 p-4">
            <p className="text-2xl font-bold text-gray-900">{totalRooms.toLocaleString()}</p>
            <p className="text-xs font-medium text-gray-500 mt-1">Total Rooms</p>
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 p-4">
            <p className="text-2xl font-bold text-gray-900">{bookedRooms.toLocaleString()}</p>
            <p className="text-xs font-medium text-green-600 mt-1">Booked Rooms</p>
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 p-4">
            <p className="text-2xl font-bold text-gray-900">{occupancy}%</p>
            <p className="text-xs font-medium text-brand-600 mt-1">Occupancy Rate</p>
            <div className="h-1.5 bg-gray-100 rounded-full mt-2 overflow-hidden">
              <div className="h-full bg-brand-500 rounded-full" style={{ width: `${occupancy}%` }} />
            </div>
          </div>
        </div>
      )}

      {/* Search + Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-xl px-3 py-2.5 w-full sm:w-72 focus-within:border-brand-300 transition-colors">
          <Search className="h-4 w-4 text-gray-500 shrink-0" />
          <input
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            placeholder="Search hotels..."
            className="text-sm bg-transparent flex-1 outline-none placeholder:text-gray-500"
          />
        </div>
        <div className="flex gap-1.5">
          {CITIES.map((c) => (
            <button
              key={c}
              onClick={() => { setCity(c); setPage(1); }}
              className={cn(
                'text-xs px-3 py-1.5 rounded-full border transition-all font-medium',
                city === c
                  ? 'bg-brand-500 text-white border-brand-500'
                  : 'border-gray-200 text-gray-500 hover:border-gray-300',
              )}
            >
              {c === 'ALL' ? 'All Cities' : c.charAt(0) + c.slice(1).toLowerCase()}
            </button>
          ))}
        </div>
      </div>

      {/* Grid of hotel cards */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="bg-white rounded-2xl border border-gray-100 p-4 animate-pulse space-y-3">
              <div className="h-28 bg-gray-100 rounded-xl" />
              <div className="h-4 w-40 bg-gray-100 rounded" />
              <div className="h-3 w-24 bg-gray-100 rounded" />
            </div>
          ))}
        </div>
      ) : error ? (
        <div className="py-20 text-center bg-white rounded-2xl border border-gray-100">
          <AlertCircle className="h-10 w-10 mx-auto mb-3 text-red-400 opacity-60" />
          <p className="text-sm text-red-500">Failed to load hotels</p>
          <button onClick={() => refetch()} className="mt-2 text-xs text-brand-500 hover:underline">Retry</button>
        </div>
      ) : items.length === 0 ? (
        <div className="py-20 text-center bg-white rounded-2xl border border-gray-100">
          <Hotel className="h-12 w-12 mx-auto mb-3 text-gray-200" />
          <p className="text-sm text-gray-500">No hotels found</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {items.map((h: any) => {
            const occ = h.totalRooms > 0 ? Math.round((h.bookedRooms / h.totalRooms) * 100) : 0;
            return (
              <a key={h.id} href={`/hotels/${h.id}`} className="block bg-white rounded-2xl border border-gray-100 p-4 hover:shadow-md hover:border-brand-200 transition-all">
                {/* Hotel header */}
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2.5">
                    <div className="w-10 h-10 rounded-xl bg-yellow-50 flex items-center justify-center text-yellow-600 shrink-0 text-xl">
                      🏨
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-gray-900 leading-tight">{h.name}</p>
                      <p className="text-xs text-gray-500">{h.city ?? '—'} · {h.country ?? 'KSA'}</p>
                    </div>
                  </div>
                </div>

                {/* Stars */}
                <div className="flex items-center gap-0.5 mb-3">
                  {Array.from({ length: h.starRating ?? 0 }).map((_, i) => (
                    <Star key={i} className="h-3.5 w-3.5 fill-yellow-400 text-yellow-400" />
                  ))}
                  {Array.from({ length: 5 - (h.starRating ?? 0) }).map((_, i) => (
                    <Star key={i} className="h-3.5 w-3.5 text-gray-200" />
                  ))}
                  {h.verified && (
                    <CheckCircle2 className="h-3.5 w-3.5 text-green-500 ml-1.5" />
                  )}
                </div>

                {/* Occupancy */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-gray-500">Occupancy</span>
                    <span className="font-semibold text-gray-800">{occ}%</span>
                  </div>
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className={cn('h-full rounded-full', occ > 80 ? 'bg-red-400' : occ > 50 ? 'bg-yellow-400' : 'bg-green-400')}
                      style={{ width: `${occ}%` }}
                    />
                  </div>
                  <div className="flex items-center justify-between text-[10px] text-gray-500">
                    <span>{h.bookedRooms ?? 0} booked</span>
                    <span>{h.availableRooms ?? (h.totalRooms != null && h.bookedRooms != null ? h.totalRooms - h.bookedRooms : 0)} available</span>
                  </div>
                </div>

                {/* Distance to Haram */}
                {h.distanceToHaram && (
                  <p className="text-[11px] text-gray-500 mt-2">📍 {h.distanceToHaram}m from Haram</p>
                )}
              </a>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-2">
          <p className="text-xs text-gray-500">Page {page} of {totalPages}</p>
          <div className="flex gap-1.5">
            <button onClick={() => setPage(Math.max(1, page - 1))} disabled={page === 1} className="text-xs px-3 py-1.5 border border-gray-200 rounded-lg disabled:opacity-40 hover:bg-white">Prev</button>
            <button onClick={() => setPage(page + 1)} disabled={page >= totalPages} className="text-xs px-3 py-1.5 border border-gray-200 rounded-lg disabled:opacity-40 hover:bg-white">Next</button>
          </div>
        </div>
      )}

      {showCreate && (
        <AddHotelModal
          onClose={() => setShowCreate(false)}
          onCreate={async (dto) => {
            try {
              await createHotel.mutateAsync(dto);
              toast.success('Hotel added');
              setShowCreate(false);
              refetch();
            } catch (e: any) {
              toast.error(e?.response?.data?.error?.message ?? e?.message ?? 'Failed');
            }
          }}
          pending={createHotel.isPending}
        />
      )}
    </div>
  );
}

function AddHotelModal({
  onClose, onCreate, pending,
}: {
  onClose: () => void;
  onCreate: (dto: any) => Promise<void>;
  pending: boolean;
}) {
  const [f, setF] = useState({
    name: '', city: 'MAKKAH', country: 'SA', area: '', address: '', postalCode: '',
    starRating: '5', distanceToHaram: '', totalRooms: '', description: '',
    amenitiesText: '', images: '', contactPerson: '', phone: '', email: '',
    checkInTime: '15:00', checkOutTime: '12:00', cancellationPolicy: '', status: 'ACTIVE', notes: '',
  });
  const set = (k: string, v: string) => setF((p) => ({ ...p, [k]: v }));

  const submit = async () => {
    if (!f.name.trim()) return;
    await onCreate({
      name: f.name.trim(),
      city: f.city,
      country: f.country,
      area: f.area || undefined,
      address: f.address || undefined,
      postalCode: f.postalCode || undefined,
      starRating: Number(f.starRating),
      distanceToHaram: f.distanceToHaram ? Number(f.distanceToHaram) : undefined,
      totalRooms: f.totalRooms ? Number(f.totalRooms) : undefined,
      description: f.description || undefined,
      contactPerson: f.contactPerson || undefined,
      phone: f.phone || undefined,
      email: f.email || undefined,
      checkInTime: f.checkInTime || undefined,
      checkOutTime: f.checkOutTime || undefined,
      cancellationPolicy: f.cancellationPolicy || undefined,
      status: f.status,
      notes: f.notes || undefined,
      amenities: f.amenitiesText ? f.amenitiesText.split(',').map((s) => s.trim()).filter(Boolean) : undefined,
      imageUrls: f.images ? f.images.split(',').map((s) => s.trim()).filter(Boolean) : undefined,
    });
  };

  const FieldInput = ({ label, k, type = 'text', placeholder, full }: { label: string; k: string; type?: string; placeholder?: string; full?: boolean }) => (
    <label className={cn('block', full && 'col-span-2')}>
      <span className="block text-xs font-semibold text-gray-600 mb-1">{label}</span>
      <input type={type} value={(f as any)[k]} onChange={(e) => set(k, e.target.value)} placeholder={placeholder} className="w-full text-sm px-3 py-2.5 border border-gray-200 rounded-lg outline-none focus:border-brand-400" />
    </label>
  );

  return (
    <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-2xl p-6 shadow-xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-gray-900">Add hotel</h2>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg"><X className="h-4 w-4 text-gray-500" /></button>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2"><FieldInput label="Hotel name *" k="name" placeholder="Makkah Royal Clock Tower" /></div>
          <label className="block">
            <span className="block text-xs font-semibold text-gray-600 mb-1">City</span>
            <select value={f.city} onChange={(e) => set('city', e.target.value)} className="w-full text-sm px-3 py-2.5 border border-gray-200 rounded-lg outline-none bg-white">
              {['MAKKAH', 'MADINAH', 'JEDDAH', 'RIYADH', 'TAIF'].map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
          <FieldInput label="Country (ISO-2)" k="country" placeholder="SA" />
          <FieldInput label="Area / district" k="area" placeholder="Ajyad" />
          <FieldInput label="Postal code" k="postalCode" placeholder="24231" />
          <div className="col-span-2"><FieldInput label="Address" k="address" placeholder="King Abdul Aziz Endowment" /></div>
          <label className="block">
            <span className="block text-xs font-semibold text-gray-600 mb-1">Star rating</span>
            <select value={f.starRating} onChange={(e) => set('starRating', e.target.value)} className="w-full text-sm px-3 py-2.5 border border-gray-200 rounded-lg outline-none bg-white">
              {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{'★'.repeat(n)} ({n})</option>)}
            </select>
          </label>
          <FieldInput label="Distance to Haram (m)" k="distanceToHaram" type="number" placeholder="200" />
          <FieldInput label="Total rooms" k="totalRooms" type="number" placeholder="120" />
          <label className="block">
            <span className="block text-xs font-semibold text-gray-600 mb-1">Status</span>
            <select value={f.status} onChange={(e) => set('status', e.target.value)} className="w-full text-sm px-3 py-2.5 border border-gray-200 rounded-lg outline-none bg-white">
              {['ACTIVE', 'INACTIVE', 'MAINTENANCE'].map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </label>
          <FieldInput label="Contact person" k="contactPerson" placeholder="Reservations manager" />
          <FieldInput label="Phone" k="phone" placeholder="+966 12 ..." />
          <FieldInput label="Email" k="email" type="email" placeholder="bookings@hotel.com" />
          <FieldInput label="Check-in time" k="checkInTime" placeholder="15:00" />
          <FieldInput label="Check-out time" k="checkOutTime" placeholder="12:00" />
          <div className="col-span-2"><FieldInput label="Description" k="description" placeholder="Brief hotel description" /></div>
          <div className="col-span-2"><FieldInput label="Amenities (comma-separated)" k="amenitiesText" placeholder="wifi, breakfast, prayer room, gym" /></div>
          <div className="col-span-2"><FieldInput label="Image URLs (comma-separated)" k="images" placeholder="https://…, https://…" /></div>
          <div className="col-span-2"><FieldInput label="Cancellation policy" k="cancellationPolicy" placeholder="Free cancellation up to 48h before check-in" /></div>
          <div className="col-span-2"><FieldInput label="Notes" k="notes" placeholder="Internal notes" /></div>
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onClose} disabled={pending} className="px-4 py-2 text-sm border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 disabled:opacity-50">Cancel</button>
          <button onClick={submit} disabled={pending || !f.name.trim()} className="flex items-center gap-2 px-4 py-2 text-sm bg-brand-500 hover:bg-brand-600 text-white rounded-lg disabled:opacity-50 shadow-sm">
            {pending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Add hotel
          </button>
        </div>
      </div>
    </div>
  );
}

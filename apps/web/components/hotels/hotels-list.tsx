'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Hotel, Plus, RefreshCw, Search, Star, CheckCircle2, X, Globe2 } from 'lucide-react';
import { toast } from 'sonner';
import { apiErrorMessage } from '@/lib/api-error';
import { Alert, Button, Input, ModalSurface, QueryFailure, Select } from '@/components/ui/system';
import { useCapabilities } from '@/hooks/use-capabilities';
import { HOTEL_STATUSES, useCreateHotel, useHotelList, useHotelOwnerStats } from '@/hooks/use-hotels';
import { ReadOnlyNotice } from '@/components/dashboard/read-only-notice';
import { cn } from '@/lib/utils';
import { HotelFormFields, emptyHotelForm, hotelFormErrors, hotelPayload, type HotelForm } from './hotel-form';

const CITIES = ['ALL', 'MAKKAH', 'MADINAH', 'JEDDAH', 'RIYADH', 'TAIF'];
const PAGE_SIZE = 20;

export function HotelsList() {
  const { ready, can } = useCapabilities();
  const canManage = can('hotel:allotment:manage');
  const [search, setSearch] = useState('');
  const [city, setCity] = useState('ALL');
  const [status, setStatus] = useState('ALL');
  const [page, setPage] = useState(1);
  const [showCreate, setShowCreate] = useState(false);

  const { data, isLoading, error, refetch } = useHotelList({
    page,
    limit: PAGE_SIZE,
    search: search.trim() || undefined,
    city: city !== 'ALL' ? city : undefined,
    status: status !== 'ALL' ? status : undefined,
  });
  const stats = useHotelOwnerStats();

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);
  const s = stats.data;

  if (error) return <QueryFailure error={error} onRetry={() => refetch()} />;
  return (
    <div className="space-y-5 pb-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Hotels & Inventory</h1>
          <p className="text-sm text-gray-600 mt-0.5">
            {total.toLocaleString()} hotel{total === 1 ? '' : 's'} — your own properties and shared marketplace hotels you can contract
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="quiet" type="button" aria-label="Refresh hotels" onClick={() => { refetch(); stats.refetch(); }} className="p-2 border border-gray-200 rounded-xl hover:bg-gray-50 text-gray-600">
            <RefreshCw className="h-4 w-4" />
          </Button>
          {canManage && (
            <Button variant="quiet" type="button" onClick={() => setShowCreate(true)} className="flex items-center gap-2 text-sm px-4 py-2 bg-brand-500 text-white rounded-xl hover:bg-brand-600 shadow-sm">
              <Plus className="h-4 w-4" /> Add hotel
            </Button>
          )}
        </div>
      </div>

      {ready && !canManage && (
        <ReadOnlyNotice>You can view hotels, rooms and bookings. Adding or changing hotels needs the hotel management permission.</ReadOnlyNotice>
      )}

      {stats.error ? (
        <Alert title="Hotel figures are unavailable">{apiErrorMessage(stats.error, 'Try refreshing.')}</Alert>
      ) : s ? (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Figure label="Own hotels" value={s.hotels.total} note={`${s.hotels.active} active · ${s.hotels.shared} shared in marketplace`} />
          <Figure label="Rooms in service" value={s.rooms.total} note={`${s.rooms.available} available · ${s.rooms.maintenance} maintenance`} />
          <Figure label="Occupied now" value={s.rooms.booked} note="guests checked in" />
          <Figure label="Occupancy" value={`${s.occupancyRate}%`} note="occupied ÷ rooms in service" />
        </div>
      ) : null}

      <div className="flex flex-col lg:flex-row gap-3">
        <div className="flex items-center gap-2 bg-white border border-gray-500 rounded-xl px-3 py-2.5 w-full lg:w-72 focus-within:border-brand-300">
          <Search className="h-4 w-4 text-gray-600 shrink-0" />
          <Input aria-label="Search hotels" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder="Search hotels…" className="text-sm bg-transparent flex-1 outline-none border-0 p-0 min-h-0" />
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {CITIES.map((c) => (
            <Button variant="quiet" type="button" key={c} aria-pressed={city === c} onClick={() => { setCity(c); setPage(1); }}
              className={cn('text-xs px-3 py-1.5 rounded-full border font-medium', city === c ? 'bg-brand-500 text-white border-brand-500' : 'border-gray-200 text-gray-600 hover:border-gray-300')}>
              {c === 'ALL' ? 'All cities' : c.charAt(0) + c.slice(1).toLowerCase()}
            </Button>
          ))}
        </div>
        <Select aria-label="Hotel status" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} className="text-sm lg:w-44">
          <option value="ALL">All statuses</option>
          {HOTEL_STATUSES.map((st) => <option key={st} value={st}>{st.charAt(0) + st.slice(1).toLowerCase()}</option>)}
        </Select>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4" aria-busy="true">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="bg-white rounded-xl border border-gray-200 p-4 animate-pulse space-y-3">
              <div className="h-4 w-40 bg-gray-100 rounded" />
              <div className="h-3 w-24 bg-gray-100 rounded" />
              <div className="h-2 w-full bg-gray-100 rounded" />
            </div>
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="py-16 text-center bg-white rounded-xl border border-gray-200">
          <Hotel className="h-12 w-12 mx-auto mb-3 text-gray-300" />
          <p className="text-sm font-semibold text-gray-700">No hotels match these filters</p>
          <p className="text-xs text-gray-600 mt-1">{canManage ? 'Add your first property with “Add hotel”.' : 'Hotels appear here once your organization adds them.'}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {items.map((h: any) => (
            <Link key={h.id} href={`/hotels/${h.id}`} className="block bg-white rounded-xl border border-gray-200 p-4 hover:shadow-md hover:border-brand-200 transition-all">
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-gray-900 leading-tight truncate">{h.name}</p>
                  <p className="text-xs text-gray-600">{h.city ?? '—'} · {h.country ?? 'SA'}</p>
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  {h.isShared && (
                    <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full bg-gold-50 text-gold-800"><Globe2 className="h-3 w-3" /> Shared</span>
                  )}
                  {h.status !== 'ACTIVE' && (
                    <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-700">{h.status?.charAt(0) + h.status?.slice(1).toLowerCase()}</span>
                  )}
                </div>
              </div>
              <div role="img" className="flex items-center gap-0.5 mb-3" aria-label={h.starRating ? `${h.starRating} star hotel` : 'No star rating'}>
                {Array.from({ length: 5 }).map((_, i) => (
                  <Star key={i} className={cn('h-3.5 w-3.5', i < (h.starRating ?? 0) ? 'fill-yellow-400 text-yellow-400' : 'text-gray-200')} />
                ))}
                {h.isVerified && <CheckCircle2 aria-label="Verified" className="h-3.5 w-3.5 text-green-700 ml-1.5" />}
              </div>
              {h.isShared ? (
                <p className="text-xs text-gray-600">Marketplace hotel — contract rooms through allotments.</p>
              ) : (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-gray-600">Occupied</span>
                    <span className="font-semibold text-gray-800">{h.occupancy}%</span>
                  </div>
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div className={cn('h-full rounded-full', h.occupancy > 80 ? 'bg-red-400' : h.occupancy > 50 ? 'bg-yellow-400' : 'bg-green-400')} style={{ width: `${h.occupancy}%` }} />
                  </div>
                  <div className="flex items-center justify-between text-xs text-gray-600">
                    <span>{h.totalRooms} rooms · {h.bookedRooms} occupied</span>
                    <span>{h.availableRooms} available</span>
                  </div>
                </div>
              )}
              {h.distanceToHaram != null && <p className="text-xs text-gray-600 mt-2">{h.distanceToHaram} m from the Haram</p>}
            </Link>
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-2">
          <p className="text-xs text-gray-600">Page {page} of {totalPages}</p>
          <div className="flex gap-1.5">
            <Button variant="secondary" type="button" onClick={() => setPage(Math.max(1, page - 1))} disabled={page === 1}>Previous</Button>
            <Button variant="secondary" type="button" onClick={() => setPage(page + 1)} disabled={page >= totalPages}>Next</Button>
          </div>
        </div>
      )}

      {showCreate && canManage && <AddHotelModal onClose={() => setShowCreate(false)} />}
    </div>
  );
}

function Figure({ label, value, note }: { label: string; value: number | string; note: string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <p className="text-2xl font-bold text-gray-900 tabular-nums">{typeof value === 'number' ? value.toLocaleString() : value}</p>
      <p className="text-xs font-semibold text-gray-700 mt-1">{label}</p>
      <p className="text-xs text-gray-600 mt-0.5">{note}</p>
    </div>
  );
}

function AddHotelModal({ onClose }: { onClose: () => void }) {
  const create = useCreateHotel();
  const [form, setForm] = useState<HotelForm>(emptyHotelForm());
  const [touched, setTouched] = useState(false);
  const [serverError, setServerError] = useState('');
  const errors = hotelFormErrors(form);
  const invalid = Object.keys(errors).length > 0;

  const submit = async () => {
    setTouched(true);
    if (invalid || create.isPending) return;
    setServerError('');
    try {
      await create.mutateAsync(hotelPayload(form));
      toast.success('Hotel added');
      onClose();
    } catch (e) {
      setServerError(apiErrorMessage(e, 'The hotel could not be added.'));
    }
  };

  return (
    <ModalSurface busy={create.isPending} title="Add hotel" onClose={onClose}>
      <form className="bg-white rounded-xl w-full max-w-2xl p-6 shadow-xl max-h-[90vh] overflow-y-auto" onSubmit={(e) => { e.preventDefault(); submit(); }} noValidate>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-gray-900">Add hotel</h2>
          <Button variant="quiet" type="button" aria-label="Close dialog" disabled={create.isPending} onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg"><X className="h-4 w-4 text-gray-600" /></Button>
        </div>
        {serverError && <div className="mb-3"><Alert title={serverError} /></div>}
        <HotelFormFields form={form} setForm={setForm} errors={touched ? errors : {}} />
        <div className="flex justify-end gap-2 mt-5">
          <Button variant="secondary" type="button" onClick={onClose} disabled={create.isPending}>Cancel</Button>
          <Button type="submit" busy={create.isPending}>Add hotel</Button>
        </div>
      </form>
    </ModalSurface>
  );
}

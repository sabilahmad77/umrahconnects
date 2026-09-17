'use client';
import { FieldInput as LabeledInput } from '@/components/ui/system';
import { ModalSurface, Input, Select , Button , QueryFailure } from '@/components/ui/system';


import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft, Loader2, AlertCircle, Hotel, Save, Edit3, Trash2, Plus, X,
  BedDouble, ListChecks, Calendar, Star, DoorOpen, CalendarCheck2,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import {
  useHotel, useUpdateHotel, useDeleteHotel,
  useHotelRoomTypes, useCreateRoomType,
  useHotelRooms, useCreateRoom, useUpdateRoom, useDeleteRoom,
  useHotelBookings, useUpdateHotelBooking,
  useHotelAllotments, useCreateAllotment,
} from '@/hooks/use-hotels';

type TabKey = 'overview' | 'roomtypes' | 'rooms' | 'bookings' | 'allotments' | 'edit';

export function HotelDetail({ id }: { id: string }) {
  const router = useRouter();
  const { data: h, isLoading, error, refetch } = useHotel(id);
  const [tab, setTab] = useState<TabKey>('overview');

  if (error) return <QueryFailure error={error} onRetry={() => { refetch(); }} />;
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20 text-gray-600 text-sm">
        <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading hotel…
      </div>
    );
  }
  if (error || !h) {
    return (
      <div className="py-20 text-center bg-white rounded-xl border border-gray-200">
        <AlertCircle className="h-10 w-10 mx-auto mb-3 text-red-700 opacity-60" />
        <p className="text-sm text-red-700">Hotel not found</p>
        <Link href="/hotels" className="text-xs text-brand-500 hover:underline mt-3 inline-block">← Back to hotels</Link>
      </div>
    );
  }


  return (
    <div className="space-y-5 pb-10">
      <div className="flex items-center gap-3 flex-wrap">
        <Button variant="quiet" type="button" aria-label="Go back" onClick={() => router.push('/hotels')} className="p-2 rounded-xl border border-gray-200 hover:bg-gray-50">
          <ArrowLeft className="h-4 w-4 text-gray-600" />
        </Button>
        <div className="w-12 h-12 rounded-xl bg-yellow-50 flex items-center justify-center">
          <Hotel className="h-6 w-6 text-yellow-800" />
        </div>
        <div className="flex-1 min-w-0 basis-[calc(100%_-_140px)] sm:basis-auto">
          <h1 className="text-2xl font-bold text-gray-900 ">{h.name}</h1>
          <p className="text-sm text-gray-600">{h.city ?? '—'}, {h.country ?? '—'} {h.distanceToHaram ? `· ${h.distanceToHaram}m from Haram` : ''}</p>
        </div>
        <div className="flex items-center gap-1">
          {Array.from({ length: h.starRating ?? 0 }).map((_, i) => <Star key={i} className="h-4 w-4 fill-yellow-400 text-yellow-400" />)}
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-1.5 flex gap-1 overflow-x-auto">
        {(['overview', 'roomtypes', 'rooms', 'bookings', 'allotments', 'edit'] as TabKey[]).map((t) => (
          <Button variant="quiet" type="button"
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              'capitalize px-3 py-2 rounded-xl text-sm font-medium transition-colors',
              tab === t ? 'bg-brand-50 text-brand-700 border border-brand-100' : 'text-gray-600 hover:bg-gray-50',
            )}
          >
            {t === 'roomtypes' ? 'Room Types' : t}
          </Button>
        ))}
      </div>

      {tab === 'overview' && <Overview h={h} />}
      {tab === 'roomtypes' && <RoomsTab hotelId={id} />}
      {tab === 'rooms' && <IndividualRoomsTab hotelId={id} />}
      {tab === 'bookings' && <HotelBookingsTab hotelId={id} />}
      {tab === 'allotments' && <AllotmentsTab hotelId={id} />}
      {tab === 'edit' && <EditTab h={h} refetch={refetch} />}
    </div>
  );
}

function Overview({ h }: { h: any }) {
  const totalRooms = h.totalRooms ?? 0;
  const bookedRooms = h.bookedRooms ?? 0;
  const occ = totalRooms > 0 ? Math.round((bookedRooms / totalRooms) * 100) : 0;
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <div className="bg-white rounded-xl border border-gray-200 p-5 lg:col-span-2 space-y-3">
        <h3 className="text-sm font-bold text-gray-900 inline-flex items-center gap-2"><ListChecks className="h-4 w-4" /> Hotel details</h3>
        <dl className="grid grid-cols-2 gap-3 text-sm">
          <Field label="Star rating" value={h.starRating ? `${h.starRating} ★` : '—'} />
          <Field label="Distance to Haram" value={h.distanceToHaram ? `${h.distanceToHaram} m` : '—'} />
          <Field label="Total rooms" value={totalRooms} />
          <Field label="Booked" value={bookedRooms} />
          <Field label="Available" value={totalRooms - bookedRooms} />
          <Field label="Occupancy" value={`${occ}%`} />
          <Field label="Address" value={h.address ?? '—'} />
          <Field label="Phone" value={h.phone ?? '—'} />
          <Field label="Email" value={h.email ?? '—'} />
          <Field label="Contact" value={h.contactPerson ?? '—'} />
        </dl>
        {(h.amenities ?? []).length > 0 && (
          <div className="pt-3 border-t border-gray-50">
            <p className="text-xs font-semibold text-gray-600 mb-2">Amenities</p>
            <div className="flex flex-wrap gap-2">
              {(h.amenities ?? []).map((a: string) => <span key={a} className="text-xs bg-gray-100 text-gray-700 px-2 py-1 rounded-full">{a}</span>)}
            </div>
          </div>
        )}
      </div>
      <div className="space-y-3">
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-xs font-semibold text-gray-600 mb-2">Occupancy</p>
          <div className="h-3 bg-gray-100 rounded-full overflow-hidden mb-2">
            <div className={cn('h-full', occ > 80 ? 'bg-red-400' : occ > 50 ? 'bg-yellow-400' : 'bg-green-400')} style={{ width: `${occ}%` }} />
          </div>
          <p className="text-2xl font-bold text-gray-900">{occ}%</p>
          <p className="text-xs text-gray-600 mt-1">{bookedRooms} of {totalRooms} rooms</p>
        </div>
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: any }) {
  return (
    <div>
      <dt className="text-xs font-semibold text-gray-600">{label}</dt>
      <dd className="text-sm text-gray-900 font-medium">{value ?? '—'}</dd>
    </div>
  );
}

function RoomsTab({ hotelId }: { hotelId: string }) {
  const { data: rooms = [], refetch , error: hotelRoomTypesError} = useHotelRoomTypes(hotelId);
  const create = useCreateRoomType();
  const [show, setShow] = useState(false);

  if (hotelRoomTypesError) return <QueryFailure error={hotelRoomTypesError} onRetry={() => { refetch(); }} />;
  return (
    <div className="space-y-3">
      <div className="flex justify-between items-center">
        <h3 className="text-sm font-bold text-gray-900">Room types ({rooms.length})</h3>
        <Button variant="quiet" type="button" onClick={() => setShow(true)} className="flex items-center gap-2 px-3 py-1.5 text-sm bg-brand-500 text-white rounded-lg shadow-sm">
          <Plus className="h-4 w-4" /> Add room type
        </Button>
      </div>
      <div className="bg-white rounded-xl border border-gray-200">
        {rooms.length === 0 ? (
          <div className="py-10 text-center text-sm text-gray-600">No room types yet — add one to start managing inventory and prices</div>
        ) : (
          <ul className="divide-y divide-gray-50">
            {rooms.map((r: any) => (
              <li key={r.id} className="p-4 flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-yellow-50 flex items-center justify-center text-yellow-700">
                    <BedDouble className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-gray-900">{r.name}</p>
                    <p className="text-xs text-gray-600">{r.bedConfiguration ?? r.bedConfig ?? '—'} · {r.maxOccupancy ?? '?'} pax max</p>
                  </div>
                </div>
                <div className="text-right">
                  {r.basePriceCents != null && (
                    <p className="text-sm font-bold text-gray-900">SAR {(Number(r.basePriceCents) / 100).toLocaleString()}</p>
                  )}
                  <p className="text-xs text-gray-600">{r.totalCount ?? r.inventory ?? '?'} rooms</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {show && (
        <RoomTypeModal
          hotelId={hotelId}
          onClose={() => setShow(false)}
          onCreated={() => { setShow(false); refetch(); }}
          create={create}
        />
      )}
    </div>
  );
}

function RoomTypeModal({ hotelId, onClose, onCreated, create }: { hotelId: string; onClose: () => void; onCreated: () => void; create: any }) {
  const [form, setForm] = useState({
    name: '',
    bedConfiguration: 'DOUBLE',
    maxOccupancy: '2',
    basePrice: '',
    totalCount: '10',
    amenities: '',
  });

  return (
    <ModalSurface busy={create.isPending} title="Add room type" onClose={onClose}   >
      <div className="bg-white rounded-xl w-full max-w-md p-5 shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-gray-900">Add room type</h2>
          <Button disabled={create.isPending} variant="quiet" type="button" aria-label="Close dialog" onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg"><X className="h-4 w-4" /></Button>
        </div>
        <div className="space-y-3">
          <Input aria-label="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Room name (Deluxe Double)" className="w-full text-sm px-3 py-2.5 border border-gray-200 rounded-lg" />
          <div className="grid grid-cols-2 gap-3">
            <Select aria-label="Bed Configuration" value={form.bedConfiguration} onChange={(e) => setForm({ ...form, bedConfiguration: e.target.value })} className="w-full text-sm px-3 py-2.5 border border-gray-200 rounded-lg bg-white">
              <option value="SINGLE">Single</option>
              <option value="DOUBLE">Double</option>
              <option value="TWIN">Twin</option>
              <option value="TRIPLE">Triple</option>
              <option value="QUAD">Quad</option>
              <option value="SUITE">Suite</option>
            </Select>
            <Input aria-label="Max Occupancy" type="number" value={form.maxOccupancy} onChange={(e) => setForm({ ...form, maxOccupancy: e.target.value })} placeholder="Max pax" className="w-full text-sm px-3 py-2.5 border border-gray-200 rounded-lg" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input aria-label="Base Price" type="number" value={form.basePrice} onChange={(e) => setForm({ ...form, basePrice: e.target.value })} placeholder="Base price (SAR)" className="w-full text-sm px-3 py-2.5 border border-gray-200 rounded-lg" />
            <Input aria-label="Total Count" type="number" value={form.totalCount} onChange={(e) => setForm({ ...form, totalCount: e.target.value })} placeholder="Total count" className="w-full text-sm px-3 py-2.5 border border-gray-200 rounded-lg" />
          </div>
          <Input aria-label="Amenities" value={form.amenities} onChange={(e) => setForm({ ...form, amenities: e.target.value })} placeholder="Amenities (comma-separated)" className="w-full text-sm px-3 py-2.5 border border-gray-200 rounded-lg" />
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <Button disabled={create.isPending} variant="quiet" type="button" onClick={onClose} className="px-4 py-2 text-sm border border-gray-200 rounded-lg">Cancel</Button>
          <Button variant="quiet" type="button"
            onClick={async () => {
              try {
                await create.mutateAsync({
                  hotelId,
                  name: form.name,
                  bedConfiguration: form.bedConfiguration,
                  maxOccupancy: Number(form.maxOccupancy) || 2,
                  basePriceCents: form.basePrice ? Math.round(Number(form.basePrice) * 100) : 0,
                  totalCount: Number(form.totalCount) || 1,
                  amenities: form.amenities.split(',').map((s: string) => s.trim()).filter(Boolean),
                });
                toast.success('Room type added');
                onCreated();
              } catch (e: any) {
                toast.error(e?.response?.data?.error?.message ?? 'Failed');
              }
            }}
            disabled={create.isPending || !form.name.trim()}
            className="flex items-center gap-2 px-4 py-2 text-sm bg-brand-500 text-white rounded-lg disabled:opacity-50"
          >
            {create.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Add
          </Button>
        </div>
      </div>
    </ModalSurface>
  );
}

function AllotmentsTab({ hotelId }: { hotelId: string }) {
  const { data: allots = [], refetch , error: hotelAllotmentsError} = useHotelAllotments(hotelId);
  if (hotelAllotmentsError) return <QueryFailure error={hotelAllotmentsError} onRetry={() => { refetch(); }} />;
  return (
    <div className="bg-white rounded-xl border border-gray-200">
      <div className="p-4 border-b border-gray-200">
        <h3 className="text-sm font-bold text-gray-900 inline-flex items-center gap-2">
          <Calendar className="h-4 w-4" /> Allotments ({allots.length})
        </h3>
      </div>
      {allots.length === 0 ? (
        <div className="py-10 text-center text-sm text-gray-600">No allotments configured</div>
      ) : (
        <div role="region" aria-label="Scrollable records" tabIndex={0} className="max-w-full overflow-x-auto"><table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs text-gray-600 border-b border-gray-200">
            <tr>
              <th className="text-left p-3">Date</th>
              <th className="text-left p-3">Room type</th>
              <th className="text-left p-3">Allotted</th>
              <th className="text-left p-3">Sold</th>
              <th className="text-left p-3">Rate</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {allots.map((a: any) => (
              <tr key={a.id}>
                <td className="p-3">{a.date ? new Date(a.date).toLocaleDateString() : '—'}</td>
                <td className="p-3">{a.roomType?.name ?? '—'}</td>
                <td className="p-3">{a.allotted ?? a.allottedRooms ?? '—'}</td>
                <td className="p-3">{a.sold ?? a.soldRooms ?? 0}</td>
                <td className="p-3">{a.rateCents != null ? `SAR ${(Number(a.rateCents) / 100).toLocaleString()}` : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table></div>
      )}
    </div>
  );
}

function EditTab({ h, refetch }: { h: any; refetch: () => void }) {
  const router = useRouter();
  const update = useUpdateHotel();
  const remove = useDeleteHotel();
  const [form, setForm] = useState({
    name: h.name ?? '',
    city: h.city ?? '',
    country: h.country ?? 'SA',
    starRating: h.starRating ?? 4,
    distanceToHaram: h.distanceToHaram ?? '',
    totalRooms: h.totalRooms ?? 0,
    address: h.address ?? '',
    phone: h.phone ?? '',
    email: h.email ?? '',
    contactPerson: h.contactPerson ?? '',
    amenities: (h.amenities ?? []).join(', '),
  });

  const save = async () => {
    try {
      await update.mutateAsync({
        id: h.id,
        ...form,
        starRating: Number(form.starRating),
        distanceToHaram: form.distanceToHaram ? Number(form.distanceToHaram) : null,
        totalRooms: Number(form.totalRooms),
        amenities: form.amenities.split(',').map((s: string) => s.trim()).filter(Boolean),
      });
      toast.success('Hotel saved');
      refetch();
    } catch (e: any) {
      toast.error(e?.response?.data?.error?.message ?? 'Failed');
    }
  };

  const archive = async () => {
    if (!confirm('Archive this hotel?')) return;
    await remove.mutateAsync(h.id);
    toast.success('Hotel archived');
    router.push('/hotels');
  };

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
        <h3 className="text-sm font-bold text-gray-900 inline-flex items-center gap-2"><Edit3 className="h-4 w-4" /> Edit hotel</h3>
        <div className="grid grid-cols-2 gap-3">
          <LabeledInput label="Name" value={form.name} onChange={(v) => setForm({ ...form, name: v })} full />
          <LabeledInput label="City" value={form.city} onChange={(v) => setForm({ ...form, city: v })} />
          <LabeledInput label="Country (ISO-2)" value={form.country} onChange={(v) => setForm({ ...form, country: v.toUpperCase().slice(0, 2) })} />
          <LabeledInput label="Star rating" value={String(form.starRating)} onChange={(v) => setForm({ ...form, starRating: v as any })} type="number" />
          <LabeledInput label="Distance to Haram (m)" value={String(form.distanceToHaram)} onChange={(v) => setForm({ ...form, distanceToHaram: v as any })} type="number" />
          <LabeledInput label="Total rooms" value={String(form.totalRooms)} onChange={(v) => setForm({ ...form, totalRooms: v as any })} type="number" />
          <LabeledInput label="Address" value={form.address} onChange={(v) => setForm({ ...form, address: v })} full />
          <LabeledInput label="Phone" value={form.phone} onChange={(v) => setForm({ ...form, phone: v })} />
          <LabeledInput label="Email" value={form.email} onChange={(v) => setForm({ ...form, email: v })} />
          <LabeledInput label="Contact person" value={form.contactPerson} onChange={(v) => setForm({ ...form, contactPerson: v })} />
          <LabeledInput label="Amenities (comma-separated)" value={form.amenities} onChange={(v) => setForm({ ...form, amenities: v })} full />
        </div>
        <div className="flex justify-end pt-2">
          <Button variant="quiet" type="button" onClick={save} disabled={update.isPending} className="flex items-center gap-2 px-4 py-2 text-sm bg-brand-500 text-white rounded-lg disabled:opacity-50">
            {update.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save hotel
          </Button>
        </div>
      </div>
      <div className="bg-white rounded-xl border border-red-100 p-5">
        <h3 className="text-sm font-bold text-red-700 inline-flex items-center gap-2"><Trash2 className="h-4 w-4" /> Archive hotel</h3>
        <p className="text-xs text-gray-600 my-2">Hides the hotel from active inventory.</p>
        <Button variant="quiet" type="button" onClick={archive} className="px-4 py-2 text-sm bg-red-50 hover:bg-red-100 text-red-600 rounded-lg">Archive</Button>
      </div>
    </div>
  );
}



// ─── Individual Rooms tab ───────────────────────────────────────────────
const ROOM_STATUSES = ['AVAILABLE', 'OCCUPIED', 'MAINTENANCE', 'INACTIVE'];

function IndividualRoomsTab({ hotelId }: { hotelId: string }) {
  const { data: rooms = [], refetch , error: hotelRoomsError} = useHotelRooms(hotelId);
  const { data: roomTypes = [] , error: hotelRoomTypesError2, refetch: retryHotelRoomTypes} = useHotelRoomTypes(hotelId);
  const create = useCreateRoom();
  const update = useUpdateRoom();
  const del = useDeleteRoom();
  const [show, setShow] = useState(false);

  if (hotelRoomsError || hotelRoomTypesError2) return <QueryFailure error={hotelRoomsError || hotelRoomTypesError2} onRetry={() => { refetch(); retryHotelRoomTypes(); }} />;
  return (
    <div className="space-y-3">
      <div className="flex justify-between items-center">
        <h3 className="text-sm font-bold text-gray-900 inline-flex items-center gap-2"><DoorOpen className="h-4 w-4" /> Rooms ({rooms.length})</h3>
        <Button variant="quiet" type="button" onClick={() => setShow(true)} className="flex items-center gap-2 px-3 py-1.5 text-sm bg-brand-500 text-white rounded-lg shadow-sm">
          <Plus className="h-4 w-4" /> Add room
        </Button>
      </div>
      <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
        {rooms.length === 0 ? (
          <div className="py-10 text-center text-sm text-gray-600">No rooms added yet — add rooms to track availability and occupancy</div>
        ) : (
          <div role="region" aria-label="Scrollable records" tabIndex={0} className="max-w-full overflow-x-auto"><table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-600 border-b border-gray-200">
              <tr>
                <th className="text-left p-3">Room</th>
                <th className="text-left p-3">Type</th>
                <th className="text-left p-3">Floor</th>
                <th className="text-left p-3">Beds</th>
                <th className="text-left p-3">Capacity</th>
                <th className="text-left p-3">Price/night</th>
                <th className="text-left p-3">Status</th>
                <th />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {rooms.map((r: any) => (
                <tr key={r.id}>
                  <td className="p-3 font-medium text-gray-900">{r.roomNumber}</td>
                  <td className="p-3 text-xs text-gray-600">{r.roomType?.name ?? '—'}</td>
                  <td className="p-3 text-xs text-gray-600">{r.floor ?? '—'}</td>
                  <td className="p-3 text-xs text-gray-600">{r.bedCount} {r.bedType ? `(${r.bedType})` : ''}</td>
                  <td className="p-3">{r.capacity}</td>
                  <td className="p-3 font-medium">SAR {(r.pricePerNightCents / 100).toLocaleString()}</td>
                  <td className="p-3">
                    <Select disabled={update.isPending} aria-label={`Status for ${r.id ?? 'record'}`}
                      value={r.status}
                      onChange={async (e) => { try { await update.mutateAsync({ roomId: r.id, status: e.target.value }); toast.success('Updated'); refetch(); } catch (error) { toast.error((error as any)?.response?.data?.error?.message ?? (error as any)?.response?.data?.message ?? 'This action could not be completed. Try again.'); } }}
                      className="text-xs border border-gray-200 rounded-lg px-2 py-1 bg-white"
                    >
                      {ROOM_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                    </Select>
                  </td>
                  <td className="p-3 text-right">
                    <Button busy={del.isPending} variant="quiet" type="button" aria-label="Delete record"
                      onClick={async () => { try { if (!confirm('Archive this room?')) return; await del.mutateAsync(r.id); toast.success('Archived'); refetch(); } catch (error) { toast.error((error as any)?.response?.data?.error?.message ?? (error as any)?.response?.data?.message ?? 'This action could not be completed. Try again.'); } }}
                      className="p-1.5 rounded hover:bg-red-50 text-red-700"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table></div>
        )}
      </div>
      {show && (
        <AddRoomModal
          hotelId={hotelId}
          roomTypes={roomTypes}
          create={create}
          onClose={() => setShow(false)}
          onCreated={() => { setShow(false); refetch(); }}
        />
      )}
    </div>
  );
}

function AddRoomModal({ hotelId, roomTypes, create, onClose, onCreated }: { hotelId: string; roomTypes: any[]; create: any; onClose: () => void; onCreated: () => void }) {
  const [f, setF] = useState({
    roomNumber: '', roomTypeId: '', floor: '', capacity: '2', bedType: 'DOUBLE', bedCount: '1',
    pricePerNight: '', pricePerPerson: '', facilities: '', images: '', description: '', status: 'AVAILABLE',
  });
  const set = (k: string, v: string) => setF((p) => ({ ...p, [k]: v }));

  return (
    <ModalSurface busy={create.isPending} title="Add room" onClose={onClose}   >
      <div className="bg-white rounded-xl w-full max-w-lg p-5 shadow-xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-gray-900">Add room</h2>
          <Button disabled={create.isPending} variant="quiet" type="button" aria-label="Close dialog" onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg"><X className="h-4 w-4" /></Button>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <LabeledInput label="Room number / name *" value={f.roomNumber} onChange={(v) => set('roomNumber', v)} />
          <label className="block">
            <span className="block text-xs font-semibold text-gray-600 mb-1">Room type</span>
            <Select  value={f.roomTypeId} onChange={(e) => set('roomTypeId', e.target.value)} className="w-full text-sm px-3 py-2.5 border border-gray-200 rounded-lg bg-white">
              <option value="">—</option>
              {roomTypes.map((rt: any) => <option key={rt.id} value={rt.id}>{rt.name}</option>)}
            </Select>
          </label>
          <LabeledInput label="Floor" value={f.floor} onChange={(v) => set('floor', v)} />
          <LabeledInput label="Capacity" value={f.capacity} onChange={(v) => set('capacity', v)} type="number" />
          <label className="block">
            <span className="block text-xs font-semibold text-gray-600 mb-1">Bed type</span>
            <Select  value={f.bedType} onChange={(e) => set('bedType', e.target.value)} className="w-full text-sm px-3 py-2.5 border border-gray-200 rounded-lg bg-white">
              {['SINGLE', 'DOUBLE', 'TWIN', 'TRIPLE', 'QUAD', 'KING', 'BUNK'].map((b) => <option key={b} value={b}>{b}</option>)}
            </Select>
          </label>
          <LabeledInput label="Number of beds" value={f.bedCount} onChange={(v) => set('bedCount', v)} type="number" />
          <LabeledInput label="Price per night (SAR)" value={f.pricePerNight} onChange={(v) => set('pricePerNight', v)} type="number" />
          <LabeledInput label="Price per person (SAR)" value={f.pricePerPerson} onChange={(v) => set('pricePerPerson', v)} type="number" />
          <label className="block">
            <span className="block text-xs font-semibold text-gray-600 mb-1">Status</span>
            <Select  value={f.status} onChange={(e) => set('status', e.target.value)} className="w-full text-sm px-3 py-2.5 border border-gray-200 rounded-lg bg-white">
              {ROOM_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
            </Select>
          </label>
          <LabeledInput label="Facilities (comma-separated)" value={f.facilities} onChange={(v) => set('facilities', v)} full />
          <LabeledInput label="Image URLs (comma-separated)" value={f.images} onChange={(v) => set('images', v)} full />
          <LabeledInput label="Description" value={f.description} onChange={(v) => set('description', v)} full />
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <Button disabled={create.isPending} variant="quiet" type="button" onClick={onClose} className="px-4 py-2 text-sm border border-gray-200 rounded-lg">Cancel</Button>
          <Button variant="quiet" type="button"
            onClick={async () => {
              if (!f.roomNumber.trim()) { toast.error('Room number required'); return; }
              try {
                await create.mutateAsync({
                  hotelId,
                  roomNumber: f.roomNumber.trim(),
                  roomTypeId: f.roomTypeId || undefined,
                  floor: f.floor || undefined,
                  capacity: Number(f.capacity) || 2,
                  bedType: f.bedType,
                  bedCount: Number(f.bedCount) || 1,
                  pricePerNight: f.pricePerNight ? Number(f.pricePerNight) : 0,
                  pricePerPerson: f.pricePerPerson ? Number(f.pricePerPerson) : undefined,
                  facilities: f.facilities.split(',').map((s: string) => s.trim()).filter(Boolean),
                  images: f.images.split(',').map((s: string) => s.trim()).filter(Boolean),
                  description: f.description || undefined,
                  status: f.status,
                });
                toast.success('Room added');
                onCreated();
              } catch (e: any) {
                toast.error(e?.response?.data?.error?.message ?? 'Failed');
              }
            }}
            disabled={create.isPending}
            className="flex items-center gap-2 px-4 py-2 text-sm bg-brand-500 text-white rounded-lg disabled:opacity-50"
          >
            {create.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Add room
          </Button>
        </div>
      </div>
    </ModalSurface>
  );
}

// ─── Hotel bookings tab ─────────────────────────────────────────────────
function HotelBookingsTab({ hotelId }: { hotelId: string }) {
  const { data: bookings = [], refetch , error: hotelBookingsError} = useHotelBookings({ hotelId });
  const update = useUpdateHotelBooking();
  if (hotelBookingsError) return <QueryFailure error={hotelBookingsError} onRetry={() => { refetch(); }} />;
  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
      <div className="p-4 border-b border-gray-200 flex items-center justify-between">
        <h3 className="text-sm font-bold text-gray-900 inline-flex items-center gap-2"><CalendarCheck2 className="h-4 w-4" /> Bookings ({bookings.length})</h3>
        <Link href="/hotel-bookings" className="text-xs text-brand-500 hover:underline">Open bookings page →</Link>
      </div>
      {bookings.length === 0 ? (
        <div className="py-10 text-center text-sm text-gray-600">No bookings for this hotel yet — new reservations will appear here</div>
      ) : (
        <div role="region" aria-label="Scrollable records" tabIndex={0} className="max-w-full overflow-x-auto"><table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs text-gray-600 border-b border-gray-200">
            <tr>
              <th className="text-left p-3">Guest</th>
              <th className="text-left p-3">Dates</th>
              <th className="text-left p-3">Guests</th>
              <th className="text-left p-3">Amount</th>
              <th className="text-left p-3">Status</th>
              <th className="text-left p-3">Payment</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {bookings.map((b: any) => (
              <tr key={b.id}>
                <td className="p-3">
                  <p className="font-medium text-gray-900">{b.guestName}</p>
                  <p className="text-xs text-gray-600">{b.guestEmail ?? b.guestPhone ?? ''}</p>
                </td>
                <td className="p-3 text-xs text-gray-600">
                  {b.checkIn ? new Date(b.checkIn).toLocaleDateString() : '—'}
                  {b.checkOut ? ` → ${new Date(b.checkOut).toLocaleDateString()}` : ''}
                </td>
                <td className="p-3">{b.guests}</td>
                <td className="p-3 font-medium">{b.currency} {(b.totalAmountCents / 100).toLocaleString()}</td>
                <td className="p-3">
                  <Select disabled={update.isPending} aria-label={`Status for ${b.id ?? 'record'}`}
                    value={b.status}
                    onChange={async (e) => { try { await update.mutateAsync({ id: b.id, status: e.target.value }); toast.success('Updated'); refetch(); } catch (error) { toast.error((error as any)?.response?.data?.error?.message ?? (error as any)?.response?.data?.message ?? 'This action could not be completed. Try again.'); } }}
                    className="text-xs border border-gray-200 rounded-lg px-2 py-1 bg-white"
                  >
                    {['PENDING', 'CONFIRMED', 'CHECKED_IN', 'CHECKED_OUT', 'COMPLETED', 'CANCELLED'].map((s) => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
                  </Select>
                </td>
                <td className="p-3">
                  <Select disabled={update.isPending} aria-label={`Payment Status for ${b.id ?? 'record'}`}
                    value={b.paymentStatus}
                    onChange={async (e) => { try { await update.mutateAsync({ id: b.id, paymentStatus: e.target.value }); toast.success('Updated'); refetch(); } catch (error) { toast.error((error as any)?.response?.data?.error?.message ?? (error as any)?.response?.data?.message ?? 'This action could not be completed. Try again.'); } }}
                    className="text-xs border border-gray-200 rounded-lg px-2 py-1 bg-white"
                  >
                    {['UNPAID', 'PARTIAL', 'PAID', 'REFUNDED'].map((s) => <option key={s} value={s}>{s}</option>)}
                  </Select>
                </td>
              </tr>
            ))}
          </tbody>
        </table></div>
      )}
    </div>
  );
}

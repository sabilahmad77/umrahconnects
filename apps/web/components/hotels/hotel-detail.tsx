'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft, Hotel, Save, Trash2, Plus, BedDouble, ListChecks, Calendar, Star, DoorOpen, CalendarCheck2,
  Pencil, Users, Globe2,
} from 'lucide-react';
import { toast } from 'sonner';
import { apiErrorMessage } from '@/lib/api-error';
import { Alert, Button, Checkbox, Input, LoadingState, ModalSurface, QueryFailure, Select, Textarea } from '@/components/ui/system';
import { tablistKeys } from '@/components/ui/tablist';
import { ConfirmDialog, type ConfirmSpec } from '@/components/ui/confirm-dialog';
import { useCapabilities } from '@/hooks/use-capabilities';
import { usePilgrims } from '@/hooks/use-api';
import {
  HOTEL_CONTRACT_TYPES, ROOM_MANUAL_STATUSES,
  useAssignableBookings, useCreateAllotment, useCreateRoom, useCreateRoomAssignment, useCreateRoomType, useDeleteHotel,
  useDeleteRoom, useHotel, useHotelAllotments, useHotelBookings, useHotelRoomTypes, useHotelRooms, useReleaseRoomAssignment,
  useRoomAssignments, useUpdateAllotment, useUpdateHotel, useUpdateRoom, useUpdateRoomType,
} from '@/hooks/use-hotels';
import { ReadOnlyNotice } from '@/components/dashboard/read-only-notice';
import { cn } from '@/lib/utils';
import { FormField, HotelFormFields, hotelFormErrors, hotelFormFromHotel, hotelUpdatePayload, type HotelForm } from './hotel-form';
import { BookingStatusBadge, ModalFooter, ModalHeader, sar, shortDate } from './hotel-ui';

type TabKey = 'overview' | 'roomtypes' | 'rooms' | 'bookings' | 'allotments' | 'edit';
const TAB_LABEL: Record<TabKey, string> = {
  overview: 'Overview', roomtypes: 'Room types', rooms: 'Rooms', bookings: 'Bookings', allotments: 'Allotments', edit: 'Edit',
};
const BED_CONFIGS = ['SINGLE', 'DOUBLE', 'TWIN', 'TRIPLE', 'QUAD', 'QUINTUPLE', 'SUITE'];
const BED_TYPES = ['SINGLE', 'DOUBLE', 'TWIN', 'TRIPLE', 'QUAD', 'KING', 'BUNK'];
const title = (s?: string) => (s ? s.charAt(0) + s.slice(1).toLowerCase().replace(/_/g, ' ') : '—');
const money = (v: string) => /^\d+(\.\d{1,2})?$/.test(v);

export function HotelDetail({ id }: { id: string }) {
  const router = useRouter();
  const { data: h, isLoading, error, refetch } = useHotel(id);
  const { ready, can } = useCapabilities();
  const [tab, setTab] = useState<TabKey>('overview');

  if (error) return <QueryFailure error={error} onRetry={() => refetch()} />;
  if (isLoading || !h) return <LoadingState label="Loading hotel…" />;

  const canManage = can('hotel:allotment:manage');
  const writable = canManage && !h.isShared;
  const tabs: TabKey[] = ['overview', 'roomtypes', ...(h.isShared ? [] : (['rooms', 'bookings'] as TabKey[])), 'allotments', ...(writable ? (['edit'] as TabKey[]) : [])];

  return (
    <div className="space-y-5 pb-10">
      <div className="flex items-center gap-3 flex-wrap">
        <Button variant="quiet" type="button" aria-label="Back to hotels" onClick={() => router.push('/hotels')} className="p-2 rounded-xl border border-gray-200 hover:bg-gray-50">
          <ArrowLeft className="h-4 w-4 text-gray-600" />
        </Button>
        <div className="w-12 h-12 rounded-xl bg-yellow-50 flex items-center justify-center"><Hotel className="h-6 w-6 text-yellow-800" /></div>
        <div className="flex-1 min-w-0 basis-[calc(100%_-_140px)] sm:basis-auto">
          <h1 className="text-2xl font-bold text-gray-900">{h.name}</h1>
          <p className="text-sm text-gray-600">
            {h.city ?? '—'}, {h.country ?? '—'}{h.distanceToHaram != null ? ` · ${h.distanceToHaram} m from the Haram` : ''}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {h.isShared && <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full bg-gold-50 text-gold-800"><Globe2 className="h-3 w-3" /> Shared marketplace hotel</span>}
          {h.status !== 'ACTIVE' && <span className="text-xs font-medium px-2 py-1 rounded-full bg-gray-100 text-gray-700">{title(h.status)}</span>}
          <span role="img" className="flex items-center gap-0.5" aria-label={h.starRating ? `${h.starRating} stars` : 'Not rated'}>
            {Array.from({ length: h.starRating ?? 0 }).map((_, i) => <Star key={i} className="h-4 w-4 fill-yellow-400 text-yellow-400" />)}
          </span>
        </div>
      </div>

      {h.isShared ? (
        <ReadOnlyNotice>This is a shared marketplace hotel: its details and room types are read-only. Your organization can contract rooms here through allotments.</ReadOnlyNotice>
      ) : ready && !canManage ? (
        <ReadOnlyNotice>You can view this hotel. Changing rooms, room types or the hotel needs the hotel management permission.</ReadOnlyNotice>
      ) : null}

      <div role="tablist" {...tablistKeys()} aria-label="Hotel sections" className="bg-white rounded-xl border border-gray-200 p-1.5 flex gap-1 overflow-x-auto">
        {tabs.map((t) => (
          <Button variant="quiet" type="button" role="tab" aria-selected={tab === t} key={t} onClick={() => setTab(t)}
            className={cn('px-3 py-2 rounded-xl text-sm font-medium', tab === t ? 'bg-brand-50 text-brand-700 border border-brand-100' : 'text-gray-600 hover:bg-gray-50')}>
            {TAB_LABEL[t]}
          </Button>
        ))}
      </div>

      {tab === 'overview' && <Overview h={h} />}
      {tab === 'roomtypes' && <RoomTypesTab hotelId={id} writable={writable} />}
      {tab === 'rooms' && <RoomsTab hotelId={id} writable={writable} />}
      {tab === 'bookings' && <BookingsTab hotelId={id} />}
      {tab === 'allotments' && <AllotmentsTab hotel={h} />}
      {tab === 'edit' && writable && <EditTab h={h} onSaved={() => refetch()} />}
    </div>
  );
}

function Overview({ h }: { h: any }) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <div className="bg-white rounded-xl border border-gray-200 p-5 lg:col-span-2 space-y-3">
        <h2 className="text-sm font-bold text-gray-900 inline-flex items-center gap-2"><ListChecks className="h-4 w-4" /> Hotel details</h2>
        <dl className="grid grid-cols-2 gap-3 text-sm">
          <Field label="Star rating" value={h.starRating ? `${h.starRating} ★` : 'Not rated'} />
          <Field label="Distance to the Haram" value={h.distanceToHaram != null ? `${h.distanceToHaram} m` : '—'} />
          <Field label="Area" value={h.area || '—'} />
          <Field label="Address" value={h.address || '—'} />
          <Field label="Check-in / check-out" value={`${h.checkInTime || '—'} / ${h.checkOutTime || '—'}`} />
          <Field label="Contact" value={h.contactPerson || '—'} />
          <Field label="Phone" value={h.phone || '—'} />
          <Field label="Email" value={h.email || '—'} />
        </dl>
        {h.cancellationPolicy && <p className="text-sm text-gray-700 pt-2 border-t border-gray-100"><span className="font-semibold">Cancellation: </span>{h.cancellationPolicy}</p>}
        {(h.amenities ?? []).length > 0 && (
          <div className="pt-3 border-t border-gray-100 flex flex-wrap gap-2">
            {h.amenities.map((a: string) => <span key={a} className="text-xs bg-gray-100 text-gray-700 px-2 py-1 rounded-full">{a}</span>)}
          </div>
        )}
      </div>
      {!h.isShared && (
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-xs font-semibold text-gray-600 mb-2">Occupied now</p>
          <div className="h-3 bg-gray-100 rounded-full overflow-hidden mb-2">
            <div className={cn('h-full', h.occupancy > 80 ? 'bg-red-400' : h.occupancy > 50 ? 'bg-yellow-400' : 'bg-green-400')} style={{ width: `${h.occupancy}%` }} />
          </div>
          <p className="text-2xl font-bold text-gray-900">{h.occupancy}%</p>
          <dl className="mt-3 space-y-1 text-xs text-gray-700">
            <div className="flex justify-between"><dt>Rooms in service</dt><dd className="font-semibold">{h.totalRooms}</dd></div>
            <div className="flex justify-between"><dt>Guests checked in</dt><dd className="font-semibold">{h.bookedRooms}</dd></div>
            <div className="flex justify-between"><dt>Available</dt><dd className="font-semibold">{h.availableRooms}</dd></div>
            <div className="flex justify-between"><dt>Under maintenance</dt><dd className="font-semibold">{h.maintenanceRooms}</dd></div>
          </dl>
          <p className="text-xs text-gray-600 mt-3">Occupancy follows check-in and check-out on the bookings.</p>
        </div>
      )}
    </div>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-semibold text-gray-600">{label}</dt>
      <dd className="text-sm text-gray-900 font-medium break-words">{value ?? '—'}</dd>
    </div>
  );
}

// ─── Room types ─────────────────────────────────────────────────────────
function RoomTypesTab({ hotelId, writable }: { hotelId: string; writable: boolean }) {
  const { data: types = [], isLoading, error, refetch } = useHotelRoomTypes(hotelId);
  const [editing, setEditing] = useState<any | null>(null);
  if (error) return <QueryFailure error={error} onRetry={() => refetch()} />;
  return (
    <section className="space-y-3" aria-label="Room types">
      <div className="flex justify-between items-center">
        <h2 className="text-sm font-bold text-gray-900">Room types ({types.length})</h2>
        {writable && <Button type="button" onClick={() => setEditing({})} className="text-sm"><Plus className="h-4 w-4" /> Add room type</Button>}
      </div>
      <div className="bg-white rounded-xl border border-gray-200">
        {isLoading ? <LoadingState label="Loading room types…" /> : types.length === 0 ? (
          <p className="py-10 text-center text-sm text-gray-600">No room types yet{writable ? ' — add one to price and group your rooms' : ''}.</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {types.map((rt: any) => (
              <li key={rt.id} className="p-4 flex items-start justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-xl bg-yellow-50 flex items-center justify-center text-yellow-700 shrink-0"><BedDouble className="h-5 w-5" /></div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-gray-900">{rt.name}{rt.status !== 'ACTIVE' && <span className="ml-2 text-xs font-medium text-gray-600">({title(rt.status)})</span>}</p>
                    <p className="text-xs text-gray-600">{title(rt.bedConfig)} · sleeps {rt.occupancy} · {rt.roomCount} room{rt.roomCount === 1 ? '' : 's'} set up{rt.totalCount ? ` · inventory ${rt.totalCount}` : ''}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <p className="text-sm font-bold text-gray-900">{sar(rt.basePriceCents)}<span className="text-xs font-normal text-gray-600"> / night</span></p>
                  {writable && (
                    <Button variant="quiet" type="button" aria-label={`Edit ${rt.name}`} onClick={() => setEditing(rt)} className="p-1.5 rounded-lg hover:bg-gray-100"><Pencil className="h-3.5 w-3.5" /></Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
      {editing && <RoomTypeModal hotelId={hotelId} roomType={editing.id ? editing : null} onClose={() => setEditing(null)} />}
    </section>
  );
}

function RoomTypeModal({ hotelId, roomType, onClose }: { hotelId: string; roomType: any | null; onClose: () => void }) {
  const create = useCreateRoomType();
  const update = useUpdateRoomType();
  const pending = create.isPending || update.isPending;
  const [form, setForm] = useState({
    name: roomType?.name ?? '',
    bedConfig: roomType?.bedConfig ?? 'DOUBLE',
    occupancy: String(roomType?.occupancy ?? 2),
    basePrice: roomType ? String(roomType.basePriceCents / 100) : '',
    totalCount: String(roomType?.totalCount ?? 0),
    status: roomType?.status ?? 'ACTIVE',
    amenities: (roomType?.amenities ?? []).join(', '),
  });
  const [touched, setTouched] = useState(false);
  const [serverError, setServerError] = useState('');
  const errors: Record<string, string> = {};
  if (!form.name.trim()) errors.name = 'Enter a name, for example Deluxe Double.';
  if (!/^\d+$/.test(form.occupancy) || Number(form.occupancy) < 1 || Number(form.occupancy) > 20) errors.occupancy = 'Between 1 and 20 guests.';
  if (form.basePrice && !money(form.basePrice)) errors.basePrice = 'Enter an amount such as 450 or 450.50.';
  if (!/^\d+$/.test(form.totalCount)) errors.totalCount = 'Whole number, 0 or more.';
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const save = async () => {
    setTouched(true);
    if (Object.keys(errors).length || pending) return;
    setServerError('');
    const body = {
      name: form.name.trim(), bedConfig: form.bedConfig, occupancy: Number(form.occupancy),
      basePrice: form.basePrice ? Number(form.basePrice) : 0, totalCount: Number(form.totalCount), status: form.status,
      amenities: String(form.amenities).split(',').map((s: string) => s.trim()).filter(Boolean),
    };
    try {
      if (roomType) await update.mutateAsync({ roomTypeId: roomType.id, ...body });
      else await create.mutateAsync({ hotelId, ...body, maxOccupancy: body.occupancy, occupancy: undefined });
      toast.success(roomType ? 'Room type saved' : 'Room type added');
      onClose();
    } catch (e) {
      setServerError(apiErrorMessage(e, 'The room type could not be saved.'));
    }
  };
  const err = touched ? errors : {};
  return (
    <ModalSurface busy={pending} title={roomType ? 'Edit room type' : 'Add room type'} onClose={onClose}>
      <form noValidate onSubmit={(e) => { e.preventDefault(); save(); }} className="bg-white rounded-xl w-full max-w-md p-5 shadow-xl">
        <ModalHeader title={roomType ? 'Edit room type' : 'Add room type'} onClose={onClose} busy={pending} />
        {serverError && <div className="mb-3"><Alert title={serverError} /></div>}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <FormField label="Name *" error={err.name} full>{(p) => <Input {...p} value={form.name} onChange={set('name')} />}</FormField>
          <FormField label="Bed layout">{(p) => <Select {...p} value={form.bedConfig} onChange={set('bedConfig')}>{BED_CONFIGS.map((b) => <option key={b} value={b}>{title(b)}</option>)}</Select>}</FormField>
          <FormField label="Sleeps (guests) *" error={err.occupancy}>{(p) => <Input {...p} type="number" min={1} max={20} value={form.occupancy} onChange={set('occupancy')} />}</FormField>
          <FormField label="Base price per night (SAR)" error={err.basePrice}>{(p) => <Input {...p} type="number" min={0} step="0.01" value={form.basePrice} onChange={set('basePrice')} />}</FormField>
          <FormField label="Inventory count" error={err.totalCount} hint="Rooms of this type you sell">{(p) => <Input {...p} type="number" min={0} value={form.totalCount} onChange={set('totalCount')} />}</FormField>
          <FormField label="Status">{(p) => <Select {...p} value={form.status} onChange={set('status')}><option value="ACTIVE">Active</option><option value="INACTIVE">Inactive</option></Select>}</FormField>
          <FormField label="Amenities" hint="Separate with commas" full>{(p) => <Input {...p} value={form.amenities} onChange={set('amenities')} />}</FormField>
        </div>
        <ModalFooter onClose={onClose} pending={pending} cta={roomType ? 'Save room type' : 'Add room type'} />
      </form>
    </ModalSurface>
  );
}

// ─── Rooms ──────────────────────────────────────────────────────────────
function RoomsTab({ hotelId, writable }: { hotelId: string; writable: boolean }) {
  const { data: rooms = [], isLoading, error, refetch } = useHotelRooms(hotelId);
  const { data: roomTypes = [] } = useHotelRoomTypes(hotelId);
  const update = useUpdateRoom();
  const del = useDeleteRoom();
  const [editing, setEditing] = useState<any | null>(null);
  const [confirm, setConfirm] = useState<ConfirmSpec | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const setStatus = async (room: any, status: string) => {
    setBusyId(room.id);
    try {
      await update.mutateAsync({ roomId: room.id, status });
      toast.success(`Room ${room.roomNumber} is now ${title(status).toLowerCase()}`);
    } catch (e) {
      toast.error(apiErrorMessage(e, 'The room status could not be changed.'));
    } finally {
      setBusyId(null);
    }
  };

  if (error) return <QueryFailure error={error} onRetry={() => refetch()} />;
  return (
    <section className="space-y-3" aria-label="Rooms">
      <div className="flex justify-between items-center">
        <h2 className="text-sm font-bold text-gray-900 inline-flex items-center gap-2"><DoorOpen className="h-4 w-4" /> Rooms ({rooms.filter((r: any) => r.status !== 'INACTIVE').length} in service)</h2>
        {writable && <Button type="button" onClick={() => setEditing({})} className="text-sm"><Plus className="h-4 w-4" /> Add room</Button>}
      </div>
      <div className="bg-white rounded-xl border border-gray-200">
        {isLoading ? <LoadingState label="Loading rooms…" /> : rooms.length === 0 ? (
          <p className="py-10 text-center text-sm text-gray-600">No rooms yet{writable ? ' — add rooms to track availability and occupancy' : ''}.</p>
        ) : (
          <div role="region" aria-label="Rooms table" tabIndex={0} className="max-w-full overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs text-gray-600 border-b border-gray-200">
                <tr><th className="text-left p-3">Room</th><th className="text-left p-3">Type</th><th className="text-left p-3">Floor</th><th className="text-left p-3">Sleeps</th><th className="text-left p-3">Price / night</th><th className="text-left p-3">Status</th><th className="p-3"><span className="sr-only">Actions</span></th></tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rooms.map((r: any) => (
                  <tr key={r.id} className={cn(r.status === 'INACTIVE' && 'text-gray-500')}>
                    <td className="p-3 font-medium text-gray-900">{r.roomNumber}</td>
                    <td className="p-3 text-xs text-gray-600">{r.roomType?.name ?? '—'}</td>
                    <td className="p-3 text-xs text-gray-600">{r.floor ?? '—'}</td>
                    <td className="p-3">{r.capacity}</td>
                    <td className="p-3 font-medium">{sar(r.pricePerNightCents)}</td>
                    <td className="p-3">
                      {r.status === 'OCCUPIED' || r.status === 'INACTIVE' || !writable ? (
                        <span className="text-xs font-medium">{r.status === 'OCCUPIED' ? 'Occupied (guest checked in)' : r.status === 'INACTIVE' ? 'Archived' : title(r.status)}</span>
                      ) : (
                        <Select aria-label={`Status of room ${r.roomNumber}`} value={r.status} disabled={busyId === r.id}
                          onChange={(e) => setStatus(r, e.target.value)} className="text-xs py-1">
                          {ROOM_MANUAL_STATUSES.filter((s) => s !== 'INACTIVE').map((s) => <option key={s} value={s}>{title(s)}</option>)}
                        </Select>
                      )}
                    </td>
                    <td className="p-3 text-right whitespace-nowrap">
                      {writable && r.status !== 'INACTIVE' && (
                        <>
                          <Button variant="quiet" type="button" aria-label={`Edit room ${r.roomNumber}`} onClick={() => setEditing(r)} className="p-1.5 rounded hover:bg-gray-100"><Pencil className="h-3.5 w-3.5" /></Button>
                          <Button variant="quiet" type="button" aria-label={`Archive room ${r.roomNumber}`} className="p-1.5 rounded hover:bg-red-50 text-red-700"
                            onClick={() => setConfirm({
                              title: `Archive room ${r.roomNumber}?`,
                              body: 'The room leaves the inventory but keeps its booking history. Rooms with a guest in house or stays ahead cannot be archived.',
                              cta: 'Archive room', tone: 'danger',
                              onConfirm: async () => {
                                try { await del.mutateAsync(r.id); toast.success(`Room ${r.roomNumber} archived`); }
                                catch (e) { toast.error(apiErrorMessage(e, 'The room could not be archived.')); }
                              },
                            })}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {editing && <RoomModal hotelId={hotelId} room={editing.id ? editing : null} roomTypes={roomTypes} onClose={() => setEditing(null)} />}
      {confirm && <ConfirmDialog spec={confirm} onClose={() => setConfirm(null)} />}
    </section>
  );
}

function RoomModal({ hotelId, room, roomTypes, onClose }: { hotelId: string; room: any | null; roomTypes: any[]; onClose: () => void }) {
  const create = useCreateRoom();
  const update = useUpdateRoom();
  const pending = create.isPending || update.isPending;
  const [form, setForm] = useState({
    roomNumber: room?.roomNumber ?? '', roomTypeId: room?.roomTypeId ?? '', floor: room?.floor ?? '',
    capacity: String(room?.capacity ?? 2), bedType: room?.bedType ?? 'DOUBLE', bedCount: String(room?.bedCount ?? 1),
    pricePerNight: room ? String(room.pricePerNightCents / 100) : '', status: room?.status && room.status !== 'OCCUPIED' ? room.status : 'AVAILABLE',
    facilities: (room?.facilities ?? []).join(', '), description: room?.description ?? '',
  });
  const [touched, setTouched] = useState(false);
  const [serverError, setServerError] = useState('');
  const errors: Record<string, string> = {};
  if (!form.roomNumber.trim()) errors.roomNumber = 'Enter the room number.';
  if (!/^\d+$/.test(form.capacity) || Number(form.capacity) < 1 || Number(form.capacity) > 50) errors.capacity = 'Between 1 and 50 guests.';
  if (!/^\d+$/.test(form.bedCount) || Number(form.bedCount) > 50) errors.bedCount = 'Whole number up to 50.';
  if (form.pricePerNight && !money(form.pricePerNight)) errors.pricePerNight = 'Enter an amount such as 300 or 300.50.';
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const save = async () => {
    setTouched(true);
    if (Object.keys(errors).length || pending) return;
    setServerError('');
    const body: Record<string, any> = {
      roomNumber: form.roomNumber.trim(), roomTypeId: form.roomTypeId || null, floor: form.floor.trim() || null,
      capacity: Number(form.capacity), bedType: form.bedType, bedCount: Number(form.bedCount),
      pricePerNight: form.pricePerNight ? Number(form.pricePerNight) : 0,
      facilities: String(form.facilities).split(',').map((s: string) => s.trim()).filter(Boolean), description: form.description.trim(),
    };
    // Occupied rooms keep their status: it follows the guest on the booking.
    if (!room || room.status !== 'OCCUPIED') body.status = form.status;
    try {
      if (room) await update.mutateAsync({ roomId: room.id, ...body });
      else await create.mutateAsync({ hotelId, ...body, roomTypeId: body.roomTypeId || undefined, floor: body.floor || undefined });
      toast.success(room ? `Room ${body.roomNumber} saved` : `Room ${body.roomNumber} added`);
      onClose();
    } catch (e) {
      setServerError(apiErrorMessage(e, 'The room could not be saved.'));
    }
  };
  const err = touched ? errors : {};
  return (
    <ModalSurface busy={pending} title={room ? `Edit room ${room.roomNumber}` : 'Add room'} onClose={onClose}>
      <form noValidate onSubmit={(e) => { e.preventDefault(); save(); }} className="bg-white rounded-xl w-full max-w-lg p-5 shadow-xl max-h-[90vh] overflow-y-auto">
        <ModalHeader title={room ? `Edit room ${room.roomNumber}` : 'Add room'} onClose={onClose} busy={pending} />
        {serverError && <div className="mb-3"><Alert title={serverError} /></div>}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <FormField label="Room number *" error={err.roomNumber}>{(p) => <Input {...p} value={form.roomNumber} onChange={set('roomNumber')} />}</FormField>
          <FormField label="Room type">{(p) => (
            <Select {...p} value={form.roomTypeId} onChange={set('roomTypeId')}>
              <option value="">No type</option>
              {roomTypes.map((rt: any) => <option key={rt.id} value={rt.id}>{rt.name}</option>)}
            </Select>
          )}</FormField>
          <FormField label="Floor">{(p) => <Input {...p} value={form.floor} onChange={set('floor')} />}</FormField>
          <FormField label="Sleeps (guests) *" error={err.capacity}>{(p) => <Input {...p} type="number" min={1} max={50} value={form.capacity} onChange={set('capacity')} />}</FormField>
          <FormField label="Bed type">{(p) => <Select {...p} value={form.bedType} onChange={set('bedType')}>{BED_TYPES.map((b) => <option key={b} value={b}>{title(b)}</option>)}</Select>}</FormField>
          <FormField label="Number of beds" error={err.bedCount}>{(p) => <Input {...p} type="number" min={0} max={50} value={form.bedCount} onChange={set('bedCount')} />}</FormField>
          <FormField label="Price per night (SAR)" error={err.pricePerNight}>{(p) => <Input {...p} type="number" min={0} step="0.01" value={form.pricePerNight} onChange={set('pricePerNight')} />}</FormField>
          {room?.status === 'OCCUPIED' ? (
            <p className="text-xs text-gray-600 self-end">Status: occupied — it changes when the guest checks out.</p>
          ) : (
            <FormField label="Status">{(p) => <Select {...p} value={form.status} onChange={set('status')}>{ROOM_MANUAL_STATUSES.filter((s) => s !== 'INACTIVE').map((s) => <option key={s} value={s}>{title(s)}</option>)}</Select>}</FormField>
          )}
          <FormField label="Facilities" hint="Separate with commas" full>{(p) => <Input {...p} value={form.facilities} onChange={set('facilities')} />}</FormField>
          <FormField label="Description" full>{(p) => <Textarea {...p} rows={2} value={form.description} onChange={set('description')} />}</FormField>
        </div>
        <ModalFooter onClose={onClose} pending={pending} cta={room ? 'Save room' : 'Add room'} />
      </form>
    </ModalSurface>
  );
}

// ─── Bookings (read here, managed on the bookings page) ─────────────────
function BookingsTab({ hotelId }: { hotelId: string }) {
  const { data: bookings = [], isLoading, error, refetch } = useHotelBookings({ hotelId });
  if (error) return <QueryFailure error={error} onRetry={() => refetch()} />;
  return (
    <section className="bg-white rounded-xl border border-gray-200" aria-label="Bookings">
      <div className="p-4 border-b border-gray-200 flex items-center justify-between gap-2">
        <h2 className="text-sm font-bold text-gray-900 inline-flex items-center gap-2"><CalendarCheck2 className="h-4 w-4" /> Bookings ({bookings.length})</h2>
        <Link href={`/hotel-bookings?hotelId=${hotelId}`} className="text-xs font-semibold text-brand-700 hover:underline">Manage on the bookings page →</Link>
      </div>
      {isLoading ? <LoadingState label="Loading bookings…" /> : bookings.length === 0 ? (
        <p className="py-10 text-center text-sm text-gray-600">No bookings for this hotel yet.</p>
      ) : (
        <div role="region" aria-label="Hotel bookings" tabIndex={0} className="max-w-full overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-600 border-b border-gray-200">
              <tr><th className="text-left p-3">Guest</th><th className="text-left p-3">Stay</th><th className="text-left p-3">Room</th><th className="text-left p-3">Amount</th><th className="text-left p-3">Status</th></tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {bookings.map((b: any) => (
                <tr key={b.id}>
                  <td className="p-3"><p className="font-medium text-gray-900">{b.guestName}</p><p className="text-xs text-gray-600">{b.guests} guest{b.guests === 1 ? '' : 's'}</p></td>
                  <td className="p-3 text-xs text-gray-600">{shortDate(b.checkIn)} → {shortDate(b.checkOut)}</td>
                  <td className="p-3 text-xs">{b.room?.roomNumber ?? 'Not assigned'}</td>
                  <td className="p-3 font-medium">{sar(b.totalAmountCents, b.currency)}</td>
                  <td className="p-3"><BookingStatusBadge status={b.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

// ─── Allotments and room assignments ────────────────────────────────────
function AllotmentsTab({ hotel }: { hotel: any }) {
  const { can } = useCapabilities();
  const canManage = can('hotel:allotment:manage');
  const canAssign = can('hotel:room:assign') && can('booking:booking:read');
  const canRelease = can('hotel:assignment:manage');
  const allotments = useHotelAllotments(hotel.id);
  const assignments = useRoomAssignments(hotel.id);
  const release = useReleaseRoomAssignment();
  const [allotmentForm, setAllotmentForm] = useState<any | null>(null);
  const [assigning, setAssigning] = useState(false);
  const [confirm, setConfirm] = useState<ConfirmSpec | null>(null);

  if (allotments.error) return <QueryFailure error={allotments.error} onRetry={() => allotments.refetch()} />;
  const list = allotments.data ?? [];
  const open = list.filter((a: any) => a.availableRooms > 0);
  return (
    <div className="space-y-5">
      <section className="bg-white rounded-xl border border-gray-200" aria-label="Allotments">
        <div className="p-4 border-b border-gray-200 flex items-center justify-between gap-2 flex-wrap">
          <div>
            <h2 className="text-sm font-bold text-gray-900 inline-flex items-center gap-2"><Calendar className="h-4 w-4" /> Allotments ({list.length})</h2>
            <p className="text-xs text-gray-600 mt-0.5">Rooms your organization has contracted at this hotel. Assigned rooms are counted by the server.</p>
          </div>
          {canManage && hotel.status !== 'INACTIVE' && <Button type="button" onClick={() => setAllotmentForm({})} className="text-sm"><Plus className="h-4 w-4" /> New allotment</Button>}
        </div>
        {allotments.isLoading ? <LoadingState label="Loading allotments…" /> : list.length === 0 ? (
          <p className="py-10 text-center text-sm text-gray-600">No allotments contracted here yet.</p>
        ) : (
          <div role="region" aria-label="Allotment contracts" tabIndex={0} className="max-w-full overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs text-gray-600 border-b border-gray-200">
                <tr><th className="text-left p-3">Period</th><th className="text-left p-3">Room type</th><th className="text-left p-3">Contract</th><th className="text-left p-3">Rooms</th><th className="text-left p-3">Assigned</th><th className="text-left p-3">Left</th><th className="text-left p-3">Rate / night</th><th className="p-3"><span className="sr-only">Actions</span></th></tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {list.map((a: any) => (
                  <tr key={a.id}>
                    <td className="p-3 text-xs">{shortDate(a.checkIn)} → {shortDate(a.checkOut)}</td>
                    <td className="p-3 text-xs">{a.roomTypeName ?? 'Any'}</td>
                    <td className="p-3 text-xs">{title(a.contractType)}</td>
                    <td className="p-3">{a.totalRooms}{a.overbookBuffer ? ` +${a.overbookBuffer}` : ''}</td>
                    <td className="p-3">{a.bookedRooms}</td>
                    <td className="p-3 font-semibold">{a.availableRooms}</td>
                    <td className="p-3">{sar(a.rateCents, a.currency)}</td>
                    <td className="p-3 text-right">{canManage && <Button variant="quiet" type="button" aria-label="Adjust allotment" onClick={() => setAllotmentForm(a)} className="p-1.5 rounded hover:bg-gray-100"><Pencil className="h-3.5 w-3.5" /></Button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="bg-white rounded-xl border border-gray-200" aria-label="Room assignments">
        <div className="p-4 border-b border-gray-200 flex items-center justify-between gap-2 flex-wrap">
          <div>
            <h2 className="text-sm font-bold text-gray-900 inline-flex items-center gap-2"><Users className="h-4 w-4" /> Room assignments</h2>
            <p className="text-xs text-gray-600 mt-0.5">Travelers of your bookings placed into contracted rooms.</p>
          </div>
          {canAssign && open.length > 0 && <Button type="button" onClick={() => setAssigning(true)} className="text-sm"><Plus className="h-4 w-4" /> Assign rooms</Button>}
        </div>
        {assignments.error ? <div className="p-4"><QueryFailure error={assignments.error} onRetry={() => assignments.refetch()} /></div>
          : assignments.isLoading ? <LoadingState label="Loading assignments…" />
            : (assignments.data ?? []).length === 0 ? (
              <p className="py-8 text-center text-sm text-gray-600">{list.length === 0 ? 'Contract an allotment first, then assign rooms from it.' : 'No rooms assigned yet.'}</p>
            ) : (
              <ul className="divide-y divide-gray-100">
                {(assignments.data ?? []).map((r: any) => (
                  <li key={r.id} className="p-4 flex items-center justify-between gap-3 text-sm">
                    <div>
                      <p className="font-medium text-gray-900">{r.booking?.bookingRef ?? 'Booking'}{r.roomNumber ? ` · room ${r.roomNumber}` : ''}</p>
                      <p className="text-xs text-gray-600">{shortDate(r.checkIn)} → {shortDate(r.checkOut)} · {r.pilgrimCount} traveler{r.pilgrimCount === 1 ? '' : 's'}</p>
                    </div>
                    {canRelease && (
                      <Button variant="quiet" type="button" className="text-xs text-red-700 hover:underline" busy={release.isPending && release.variables?.assignmentId === r.id}
                        onClick={() => setConfirm({
                          title: 'Release this room?', body: 'The assignment is removed and the room goes back to the allotment.', cta: 'Release room', tone: 'danger',
                          onConfirm: async () => {
                            try { await release.mutateAsync({ hotelId: hotel.id, assignmentId: r.id }); toast.success('Room released'); }
                            catch (e) { toast.error(apiErrorMessage(e, 'The room could not be released.')); }
                          },
                        })}>Release</Button>
                    )}
                  </li>
                ))}
              </ul>
            )}
        {!canAssign && list.length > 0 && <div className="p-4 pt-0"><ReadOnlyNotice>Assigning rooms needs the room-assignment permission and access to bookings.</ReadOnlyNotice></div>}
      </section>

      {allotmentForm && <AllotmentModal hotelId={hotel.id} allotment={allotmentForm.id ? allotmentForm : null} onClose={() => setAllotmentForm(null)} />}
      {assigning && <AssignRoomsModal hotelId={hotel.id} allotments={open} onClose={() => setAssigning(false)} />}
      {confirm && <ConfirmDialog spec={confirm} onClose={() => setConfirm(null)} />}
    </div>
  );
}

function AllotmentModal({ hotelId, allotment, onClose }: { hotelId: string; allotment: any | null; onClose: () => void }) {
  const create = useCreateAllotment();
  const update = useUpdateAllotment();
  const { data: roomTypes = [] } = useHotelRoomTypes(hotelId);
  const pending = create.isPending || update.isPending;
  const [form, setForm] = useState({
    checkIn: allotment?.checkIn?.slice(0, 10) ?? '', checkOut: allotment?.checkOut?.slice(0, 10) ?? '',
    roomTypeId: allotment?.roomTypeId ?? '', contractType: allotment?.contractType ?? 'ALLOTMENT',
    totalRooms: String(allotment?.totalRooms ?? ''), overbookBuffer: String(allotment?.overbookBuffer ?? 0),
    rate: allotment ? String(allotment.rateCents / 100) : '', notes: allotment?.notes ?? '',
  });
  const [touched, setTouched] = useState(false);
  const [serverError, setServerError] = useState('');
  const errors: Record<string, string> = {};
  if (!allotment) {
    if (!form.checkIn) errors.checkIn = 'Choose the first night.';
    if (!form.checkOut) errors.checkOut = 'Choose the check-out day.';
    else if (form.checkIn && form.checkOut <= form.checkIn) errors.checkOut = 'Check-out must be after check-in.';
  }
  if (!/^\d+$/.test(form.totalRooms) || Number(form.totalRooms) < 1) errors.totalRooms = 'At least 1 room.';
  else if (allotment && Number(form.totalRooms) + Number(form.overbookBuffer || 0) < allotment.bookedRooms) errors.totalRooms = `${allotment.bookedRooms} room(s) are already assigned.`;
  if (!/^\d+$/.test(form.overbookBuffer)) errors.overbookBuffer = 'Whole number, 0 or more.';
  if (form.rate && !money(form.rate)) errors.rate = 'Enter an amount such as 300 or 300.50.';
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const save = async () => {
    setTouched(true);
    if (Object.keys(errors).length || pending) return;
    setServerError('');
    const common = {
      contractType: form.contractType, totalRooms: Number(form.totalRooms), overbookBuffer: Number(form.overbookBuffer),
      contractPrice: form.rate ? Number(form.rate) : 0, notes: form.notes.trim() || undefined,
    };
    try {
      if (allotment) await update.mutateAsync({ allotmentId: allotment.id, ...common });
      else await create.mutateAsync({ hotelId, ...common, checkIn: form.checkIn, checkOut: form.checkOut, roomTypeId: form.roomTypeId || undefined });
      toast.success(allotment ? 'Allotment updated' : 'Allotment contracted');
      onClose();
    } catch (e) {
      setServerError(apiErrorMessage(e, 'The allotment could not be saved.'));
    }
  };
  const err = touched ? errors : {};
  return (
    <ModalSurface busy={pending} title={allotment ? 'Adjust allotment' : 'New allotment'} onClose={onClose}>
      <form noValidate onSubmit={(e) => { e.preventDefault(); save(); }} className="bg-white rounded-xl w-full max-w-lg p-5 shadow-xl">
        <ModalHeader title={allotment ? 'Adjust allotment' : 'New allotment'} onClose={onClose} busy={pending} />
        {serverError && <div className="mb-3"><Alert title={serverError} /></div>}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {allotment ? (
            <p className="sm:col-span-2 text-xs text-gray-600">{shortDate(allotment.checkIn)} → {shortDate(allotment.checkOut)} · dates are fixed once contracted.</p>
          ) : (
            <>
              <FormField label="Check-in *" error={err.checkIn}>{(p) => <Input {...p} type="date" value={form.checkIn} onChange={set('checkIn')} />}</FormField>
              <FormField label="Check-out *" error={err.checkOut}>{(p) => <Input {...p} type="date" value={form.checkOut} onChange={set('checkOut')} />}</FormField>
              <FormField label="Room type">{(p) => (
                <Select {...p} value={form.roomTypeId} onChange={set('roomTypeId')}>
                  <option value="">Any room type</option>
                  {roomTypes.map((rt: any) => <option key={rt.id} value={rt.id}>{rt.name} (sleeps {rt.occupancy})</option>)}
                </Select>
              )}</FormField>
            </>
          )}
          <FormField label="Contract type">{(p) => <Select {...p} value={form.contractType} onChange={set('contractType')}>{HOTEL_CONTRACT_TYPES.map((c) => <option key={c} value={c}>{title(c)}</option>)}</Select>}</FormField>
          <FormField label="Rooms *" error={err.totalRooms}>{(p) => <Input {...p} type="number" min={1} value={form.totalRooms} onChange={set('totalRooms')} />}</FormField>
          <FormField label="Overbooking buffer" error={err.overbookBuffer}>{(p) => <Input {...p} type="number" min={0} value={form.overbookBuffer} onChange={set('overbookBuffer')} />}</FormField>
          <FormField label="Rate per room per night (SAR)" error={err.rate}>{(p) => <Input {...p} type="number" min={0} step="0.01" value={form.rate} onChange={set('rate')} />}</FormField>
          <FormField label="Contract notes" full>{(p) => <Textarea {...p} rows={2} value={form.notes} onChange={set('notes')} />}</FormField>
        </div>
        <ModalFooter onClose={onClose} pending={pending} cta={allotment ? 'Save allotment' : 'Contract allotment'} />
      </form>
    </ModalSurface>
  );
}

function AssignRoomsModal({ hotelId, allotments, onClose }: { hotelId: string; allotments: any[]; onClose: () => void }) {
  const create = useCreateRoomAssignment();
  const bookings = useAssignableBookings();
  const pilgrims = usePilgrims({ limit: 100 });
  const [form, setForm] = useState({ allotmentId: allotments[0]?.id ?? '', bookingId: '', checkIn: '', checkOut: '', roomNumber: '' });
  const [selected, setSelected] = useState<string[]>([]);
  const [touched, setTouched] = useState(false);
  const [serverError, setServerError] = useState('');
  const allotment = allotments.find((a) => a.id === form.allotmentId);
  const booking = (bookings.data ?? []).find((b: any) => b.id === form.bookingId);
  const names = useMemo(() => new Map((pilgrims.data?.items ?? []).map((p: any) => [p.id, [p.firstNameEn, p.lastNameEn].filter(Boolean).join(' ') || p.firstNameAr || 'Traveler'])), [pilgrims.data]);
  const bookingPilgrims: string[] = (booking?.pilgrims ?? []).map((bp: any) => bp.pilgrimId);
  const checkIn = form.checkIn || allotment?.checkIn?.slice(0, 10) || '';
  const checkOut = form.checkOut || allotment?.checkOut?.slice(0, 10) || '';
  const errors: Record<string, string> = {};
  if (!allotment) errors.allotmentId = 'Choose an allotment with rooms left.';
  if (!booking) errors.bookingId = 'Choose the booking.';
  if (!checkIn || !checkOut || checkOut <= checkIn) errors.checkOut = 'Check-out must be after check-in.';
  else if (allotment && (checkIn < allotment.checkIn.slice(0, 10) || checkOut > allotment.checkOut.slice(0, 10))) errors.checkOut = 'The stay must fall inside the allotment period.';

  const save = async () => {
    setTouched(true);
    if (Object.keys(errors).length || create.isPending) return;
    setServerError('');
    try {
      await create.mutateAsync({ hotelId, allotmentId: form.allotmentId, bookingId: form.bookingId, checkIn, checkOut, roomNumber: form.roomNumber.trim() || undefined, pilgrims: selected });
      toast.success('Room assigned');
      onClose();
    } catch (e) {
      setServerError(apiErrorMessage(e, 'The room could not be assigned.'));
    }
  };
  const err = touched ? errors : {};
  return (
    <ModalSurface busy={create.isPending} title="Assign rooms" onClose={onClose}>
      <form noValidate onSubmit={(e) => { e.preventDefault(); save(); }} className="bg-white rounded-xl w-full max-w-lg p-5 shadow-xl max-h-[90vh] overflow-y-auto">
        <ModalHeader title="Assign a contracted room" onClose={onClose} busy={create.isPending} />
        {serverError && <div className="mb-3"><Alert title={serverError} /></div>}
        {bookings.error ? <QueryFailure error={bookings.error} onRetry={() => bookings.refetch()} /> : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <FormField label="Allotment *" error={err.allotmentId} full>{(p) => (
              <Select {...p} value={form.allotmentId} onChange={(e) => setForm((f) => ({ ...f, allotmentId: e.target.value, checkIn: '', checkOut: '' }))}>
                {allotments.map((a) => <option key={a.id} value={a.id}>{shortDate(a.checkIn)} → {shortDate(a.checkOut)} · {a.roomTypeName ?? 'any type'} · {a.availableRooms} left</option>)}
              </Select>
            )}</FormField>
            <FormField label="Booking *" error={err.bookingId} full>{(p) => (
              <Select {...p} value={form.bookingId} onChange={(e) => { setForm((f) => ({ ...f, bookingId: e.target.value })); setSelected([]); }}>
                <option value="">{bookings.isLoading ? 'Loading bookings…' : 'Choose a booking…'}</option>
                {(bookings.data ?? []).filter((b: any) => !['CANCELLED', 'REFUNDED'].includes(b.status)).map((b: any) => (
                  <option key={b.id} value={b.id}>{b.bookingRef} · {b.pilgrims?.length ?? 0} traveler(s) · {title(b.status)}</option>
                ))}
              </Select>
            )}</FormField>
            <FormField label="Check-in">{(p) => <Input {...p} type="date" value={checkIn} onChange={(e) => setForm((f) => ({ ...f, checkIn: e.target.value }))} />}</FormField>
            <FormField label="Check-out" error={err.checkOut}>{(p) => <Input {...p} type="date" value={checkOut} onChange={(e) => setForm((f) => ({ ...f, checkOut: e.target.value }))} />}</FormField>
            <FormField label="Room number">{(p) => <Input {...p} value={form.roomNumber} onChange={(e) => setForm((f) => ({ ...f, roomNumber: e.target.value }))} placeholder="From the hotel's rooming list" />}</FormField>
            {booking && (
              <fieldset className="sm:col-span-2">
                <legend className="text-xs font-semibold text-gray-700 mb-1">Travelers in this room</legend>
                {bookingPilgrims.length === 0 ? <p className="text-xs text-gray-600">This booking has no travelers attached.</p> : (
                  <div className="space-y-1">
                    {bookingPilgrims.map((pid) => (
                      <label key={pid} className="flex items-center gap-2 text-sm">
                        <Checkbox checked={selected.includes(pid)} onChange={(e) => setSelected((s) => e.target.checked ? [...s, pid] : s.filter((x) => x !== pid))} />
                        {names.get(pid) ?? `Traveler ${pid.slice(0, 8)}`}
                      </label>
                    ))}
                  </div>
                )}
              </fieldset>
            )}
          </div>
        )}
        <ModalFooter onClose={onClose} pending={create.isPending} cta="Assign room" />
      </form>
    </ModalSurface>
  );
}

// ─── Edit / archive ─────────────────────────────────────────────────────
function EditTab({ h, onSaved }: { h: any; onSaved: () => void }) {
  const router = useRouter();
  const update = useUpdateHotel();
  const remove = useDeleteHotel();
  const [form, setForm] = useState<HotelForm>(hotelFormFromHotel(h));
  const [touched, setTouched] = useState(false);
  const [serverError, setServerError] = useState('');
  const [confirm, setConfirm] = useState<ConfirmSpec | null>(null);
  const errors = hotelFormErrors(form);

  const save = async () => {
    setTouched(true);
    if (Object.keys(errors).length || update.isPending) return;
    setServerError('');
    try {
      await update.mutateAsync({ id: h.id, ...hotelUpdatePayload(form), status: form.status });
      toast.success('Hotel saved');
      onSaved();
    } catch (e) {
      setServerError(apiErrorMessage(e, 'The hotel could not be saved.'));
    }
  };

  return (
    <div className="space-y-4 max-w-3xl">
      <form noValidate onSubmit={(e) => { e.preventDefault(); save(); }} className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
        <h2 className="text-sm font-bold text-gray-900">Edit hotel</h2>
        {serverError && <Alert title={serverError} />}
        <HotelFormFields form={form} setForm={setForm} errors={touched ? errors : {}} />
        <p className="text-xs text-gray-600">The room count is not typed in: it follows the rooms you set up.</p>
        <div className="flex justify-end pt-2">
          <Button type="submit" busy={update.isPending}><Save className="h-4 w-4" /> Save hotel</Button>
        </div>
      </form>
      {h.status !== 'INACTIVE' && (
        <div className="bg-white rounded-xl border border-red-100 p-5">
          <h2 className="text-sm font-bold text-red-700 inline-flex items-center gap-2"><Trash2 className="h-4 w-4" /> Archive hotel</h2>
          <p className="text-xs text-gray-600 my-2">Takes the hotel out of active inventory; bookings history stays. Hotels with stays ahead cannot be archived.</p>
          <Button variant="danger" type="button" busy={remove.isPending} onClick={() => setConfirm({
            title: `Archive ${h.name}?`, body: 'The hotel becomes inactive and stops taking bookings.', cta: 'Archive hotel', tone: 'danger',
            onConfirm: async () => {
              try { await remove.mutateAsync(h.id); toast.success('Hotel archived'); router.push('/hotels'); }
              catch (e) { toast.error(apiErrorMessage(e, 'The hotel could not be archived.')); }
            },
          })}>Archive</Button>
        </div>
      )}
      {confirm && <ConfirmDialog spec={confirm} onClose={() => setConfirm(null)} />}
    </div>
  );
}

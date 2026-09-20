'use client';

import { useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Plus, RefreshCw, CalendarCheck2, Download, Search, Pencil } from 'lucide-react';
import { toast } from 'sonner';
import { apiErrorMessage } from '@/lib/api-error';
import { Alert, Button, Input, LoadingState, ModalSurface, QueryFailure, Select, Textarea } from '@/components/ui/system';
import { ConfirmDialog, type ConfirmSpec } from '@/components/ui/confirm-dialog';
import { useCapabilities } from '@/hooks/use-capabilities';
import {
  BOOKING_ACTION_LABEL, HOTEL_BOOKING_INITIAL_STATUSES, HOTEL_BOOKING_SOURCES, HOTEL_BOOKING_STATUSES,
  useCreateHotelBooking, useHotelBookings, useHotelList, useHotelRoomTypes, useRoomAvailability, useUpdateHotelBooking,
} from '@/hooks/use-hotels';
import { ReadOnlyNotice } from '@/components/dashboard/read-only-notice';
import { downloadCsv } from '@/components/dashboard/csv';
import { cn } from '@/lib/utils';
import { FormField } from './hotel-form';
import { BookingStatusBadge, ModalFooter, ModalHeader, PaymentBadge, humanize, sar, shortDate } from './hotel-ui';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const today = () => new Date().toISOString().slice(0, 10);

export function HotelBookingsView() {
  const params = useSearchParams();
  const hotelFilter = params.get('hotelId') ?? undefined;
  const { ready, can } = useCapabilities();
  const canManage = can('hotel:allotment:manage');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [search, setSearch] = useState('');
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [confirm, setConfirm] = useState<ConfirmSpec | null>(null);
  const [movingId, setMovingId] = useState<string | null>(null);
  const { data: bookings = [], isLoading, error, refetch } = useHotelBookings({
    hotelId: hotelFilter,
    status: statusFilter !== 'ALL' ? statusFilter : undefined,
  });
  const update = useUpdateHotelBooking();

  const q = search.trim().toLowerCase();
  const filtered = bookings.filter((b: any) =>
    !q || [b.guestName, b.guestPhone, b.guestEmail, b.hotel?.name].some((v) => (v ?? '').toLowerCase().includes(q)));

  const move = async (b: any, to: string) => {
    setMovingId(b.id);
    try {
      await update.mutateAsync({ id: b.id, status: to });
      toast.success(`${b.guestName}: ${humanize(to).toLowerCase()}`);
    } catch (e) {
      toast.error(apiErrorMessage(e, 'The booking could not be updated.'));
    } finally {
      setMovingId(null);
    }
  };
  const act = (b: any, to: string) => {
    if (to === 'CHECKED_IN' && !b.roomId) { setEditing({ ...b, needsRoom: true }); return; }
    if (to === 'CANCELLED') {
      setConfirm({
        title: `Cancel ${b.guestName}'s booking?`,
        body: 'The booking is closed and its room is freed for these dates. This cannot be undone.',
        cta: 'Cancel booking', tone: 'danger',
        onConfirm: () => move(b, to),
      });
      return;
    }
    move(b, to);
  };

  const exportCsv = () => downloadCsv(`hotel-bookings-${today()}.csv`, [
    ['Guest', 'Email', 'Phone', 'Hotel', 'Room', 'Check-in', 'Check-out', 'Guests', 'Source', 'Status', 'Payment', 'Amount'],
    ...filtered.map((b: any) => [
      b.guestName, b.guestEmail ?? '', b.guestPhone ?? '', b.hotel?.name ?? '', b.room?.roomNumber ?? '',
      b.checkIn?.slice(0, 10) ?? '', b.checkOut?.slice(0, 10) ?? '', b.guests, b.source, b.status, b.paymentStatus,
      (b.totalAmountCents / 100).toFixed(2),
    ]),
  ]);

  if (error) return <QueryFailure error={error} onRetry={() => refetch()} />;
  return (
    <div className="space-y-5 pb-10">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Hotel bookings</h1>
          <p className="text-sm text-gray-600 mt-0.5">{bookings.length} booking{bookings.length === 1 ? '' : 's'}{hotelFilter ? ' at this hotel' : ''} — reservations move from request to check-out here</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="quiet" type="button" aria-label="Refresh bookings" onClick={() => refetch()} className="p-2 border border-gray-200 rounded-xl hover:bg-gray-50 text-gray-600">
            <RefreshCw className={cn('h-4 w-4', isLoading && 'animate-spin')} />
          </Button>
          <Button variant="secondary" type="button" onClick={exportCsv} disabled={filtered.length === 0}><Download className="h-4 w-4" /> Export</Button>
          {canManage && <Button type="button" onClick={() => setCreating(true)}><Plus className="h-4 w-4" /> New booking</Button>}
        </div>
      </div>

      {ready && !canManage && <ReadOnlyNotice>You can view bookings. Recording and moving bookings needs the hotel management permission.</ReadOnlyNotice>}
      <p className="text-xs text-gray-600">Payment status is read-only here: it follows the payments recorded in Finance.</p>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex items-center gap-2 bg-white border border-gray-500 rounded-xl px-3 py-2.5 w-full sm:w-72">
          <Search className="h-4 w-4 text-gray-600" />
          <Input aria-label="Search bookings" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Guest, phone, email or hotel…" className="text-sm bg-transparent flex-1 outline-none border-0 p-0 min-h-0" />
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {['ALL', ...HOTEL_BOOKING_STATUSES].map((s) => (
            <Button variant="quiet" type="button" key={s} aria-pressed={statusFilter === s} onClick={() => setStatusFilter(s)}
              className={cn('text-xs px-3 py-1.5 rounded-full border font-medium', statusFilter === s ? 'bg-brand-500 text-white border-brand-500' : 'border-gray-200 text-gray-600 hover:border-gray-300')}>
              {s === 'ALL' ? 'All' : humanize(s)}
            </Button>
          ))}
        </div>
      </div>

      {isLoading ? <LoadingState label="Loading bookings…" /> : filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 py-16 text-center">
          <CalendarCheck2 className="h-12 w-12 mx-auto mb-3 text-gray-300" />
          <p className="text-sm font-semibold text-gray-700">No bookings match this view</p>
          {canManage && <p className="text-xs text-gray-600 mt-1">Use “New booking” to record a reservation.</p>}
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200">
          <div role="region" aria-label="Hotel bookings" tabIndex={0} className="max-w-full overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs text-gray-600 bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left p-3">Guest</th><th className="text-left p-3">Hotel / room</th><th className="text-left p-3">Stay</th>
                  <th className="text-left p-3">Amount</th><th className="text-left p-3">Payment</th><th className="text-left p-3">Status</th>
                  {canManage && <th className="text-left p-3">Next step</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map((b: any) => (
                  <tr key={b.id} className="align-top">
                    <td className="p-3">
                      <p className="font-medium text-gray-900">{b.guestName}</p>
                      <p className="text-xs text-gray-600">{b.guests} guest{b.guests === 1 ? '' : 's'} · {humanize(b.source)}</p>
                      {(b.guestEmail || b.guestPhone) && <p className="text-xs text-gray-600">{b.guestEmail ?? b.guestPhone}</p>}
                    </td>
                    <td className="p-3 text-xs text-gray-700">
                      <p>{b.hotel?.name ?? '—'}</p>
                      <p className={cn(!b.room && 'text-orange-800')}>{b.room ? `Room ${b.room.roomNumber}` : 'No room assigned'}</p>
                    </td>
                    <td className="p-3 text-xs text-gray-700 whitespace-nowrap">{shortDate(b.checkIn)} → {shortDate(b.checkOut)}</td>
                    <td className="p-3 font-medium whitespace-nowrap">{sar(b.totalAmountCents, b.currency)}</td>
                    <td className="p-3"><PaymentBadge status={b.paymentStatus} /></td>
                    <td className="p-3"><BookingStatusBadge status={b.status} /></td>
                    {canManage && (
                      <td className="p-3">
                        <div className="flex flex-wrap gap-1.5">
                          {(b.allowedTransitions ?? []).map((to: string) => (
                            <Button key={to} type="button" variant={to === 'CANCELLED' ? 'quiet' : 'secondary'} busy={movingId === b.id && update.variables?.status === to}
                              disabled={movingId === b.id} onClick={() => act(b, to)}
                              className={cn('text-xs px-2.5 py-1 min-h-0', to === 'CANCELLED' && 'text-red-700 hover:underline')}>
                              {to === 'CHECKED_IN' && !b.roomId ? 'Assign room to check in' : BOOKING_ACTION_LABEL[to] ?? humanize(to)}
                            </Button>
                          ))}
                          {!['COMPLETED', 'CANCELLED'].includes(b.status) && (
                            <Button variant="quiet" type="button" aria-label={`Edit ${b.guestName}'s booking`} onClick={() => setEditing(b)} className="p-1.5 min-h-0 rounded hover:bg-gray-100"><Pencil className="h-3.5 w-3.5" /></Button>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {creating && <BookingModal onClose={() => setCreating(false)} defaultHotelId={hotelFilter} />}
      {editing && <BookingModal booking={editing} onClose={() => setEditing(null)} />}
      {confirm && <ConfirmDialog spec={confirm} onClose={() => setConfirm(null)} />}
    </div>
  );
}

/** Create a booking, or edit one (dates, room, guest details, amount). Status moves are the row buttons. */
function BookingModal({ booking, onClose, defaultHotelId }: { booking?: any; onClose: () => void; defaultHotelId?: string }) {
  const create = useCreateHotelBooking();
  const update = useUpdateHotelBooking();
  const pending = create.isPending || update.isPending;
  const hotels = useHotelList({ limit: 100 });
  const ownHotels = (hotels.data?.items ?? []).filter((h: any) => !h.isShared && h.status !== 'INACTIVE');
  const [form, setForm] = useState({
    hotelId: booking?.hotelId ?? defaultHotelId ?? '',
    guestName: booking?.guestName ?? '', guestEmail: booking?.guestEmail ?? '', guestPhone: booking?.guestPhone ?? '',
    guestNationality: booking?.guestNationality ?? '', source: booking?.source ?? 'EXTERNAL',
    checkIn: booking?.checkIn?.slice(0, 10) ?? '', checkOut: booking?.checkOut?.slice(0, 10) ?? '',
    guests: String(booking?.guests ?? 1), roomTypeId: booking?.roomTypeId ?? '', roomId: booking?.roomId ?? '',
    amount: booking ? String(booking.totalAmountCents / 100) : '', status: 'PENDING', notes: booking?.notes ?? '',
  });
  const [touched, setTouched] = useState(false);
  const [serverError, setServerError] = useState('');
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const value = e.target.value;
    setForm((f) => ({ ...f, [k]: value, ...(k === 'hotelId' ? { roomId: '', roomTypeId: '' } : {}) }));
  };
  const hotelId = form.hotelId || undefined;
  const roomTypes = useHotelRoomTypes(hotelId);
  const stay = useMemo(() => ({ checkIn: form.checkIn, checkOut: form.checkOut, excludeBookingId: booking?.id }), [form.checkIn, form.checkOut, booking?.id]);
  const availability = useRoomAvailability(hotelId, stay);
  const guests = Number(form.guests) || 0;
  const roomChoices = (availability.data ?? []).filter((r: any) =>
    (r.available || r.id === booking?.roomId) && r.status !== 'INACTIVE' && (!form.roomTypeId || r.roomType?.id === form.roomTypeId));

  const errors: Record<string, string> = {};
  if (!form.hotelId) errors.hotelId = 'Choose the hotel.';
  if (!form.guestName.trim()) errors.guestName = 'Enter the guest name.';
  if (form.guestEmail && !EMAIL.test(form.guestEmail.trim())) errors.guestEmail = 'Enter a valid email address.';
  if (form.guestNationality && !/^[A-Za-z]{2}$/.test(form.guestNationality)) errors.guestNationality = 'Use the 2-letter country code.';
  if (!form.checkIn) errors.checkIn = 'Choose the check-in date.';
  if (!form.checkOut) errors.checkOut = 'Choose the check-out date.';
  else if (form.checkIn && form.checkOut <= form.checkIn) errors.checkOut = 'Check-out must be after check-in.';
  if (!/^\d+$/.test(form.guests) || guests < 1 || guests > 500) errors.guests = 'Between 1 and 500 guests.';
  if (form.amount && !/^\d+(\.\d{1,2})?$/.test(form.amount)) errors.amount = 'Enter an amount such as 1200 or 1200.50.';
  const chosenRoom = (availability.data ?? []).find((r: any) => r.id === form.roomId);
  if (chosenRoom && guests > chosenRoom.capacity) errors.roomId = `Room ${chosenRoom.roomNumber} sleeps ${chosenRoom.capacity}.`;
  if (booking?.needsRoom && !form.roomId) errors.roomId = 'Assign a room so the guest can check in.';

  const save = async () => {
    setTouched(true);
    if (Object.keys(errors).length || pending) return;
    setServerError('');
    const body: Record<string, any> = {
      guestName: form.guestName.trim(), guestEmail: form.guestEmail.trim() || null, guestPhone: form.guestPhone.trim(),
      guestNationality: form.guestNationality.trim() || null, source: form.source, checkIn: form.checkIn, checkOut: form.checkOut,
      guests, roomTypeId: form.roomTypeId || null, roomId: form.roomId || null,
      amount: form.amount ? Number(form.amount) : 0, notes: form.notes.trim(),
    };
    try {
      if (booking) {
        await update.mutateAsync({ id: booking.id, ...body });
        toast.success('Booking saved');
      } else {
        await create.mutateAsync({ ...body, hotelId: form.hotelId, status: form.status, guestEmail: body.guestEmail ?? undefined, guestNationality: body.guestNationality ?? undefined, roomTypeId: body.roomTypeId ?? undefined, roomId: body.roomId ?? undefined });
        toast.success('Booking recorded');
      }
      onClose();
    } catch (e) {
      setServerError(apiErrorMessage(e, 'The booking could not be saved.'));
    }
  };
  const err = touched || booking?.needsRoom ? errors : {};
  const heading = booking ? `Booking — ${booking.guestName}` : 'New hotel booking';
  return (
    <ModalSurface busy={pending} title={heading} onClose={onClose}>
      <form noValidate onSubmit={(e) => { e.preventDefault(); save(); }} className="bg-white rounded-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-5 shadow-xl">
        <ModalHeader title={heading} onClose={onClose} busy={pending} />
        {serverError && <div className="mb-3"><Alert title={serverError} /></div>}
        {booking?.needsRoom && <div className="mb-3"><Alert tone="info" title="Assign a room before checking the guest in." /></div>}
        {hotels.error ? <QueryFailure error={hotels.error} onRetry={() => hotels.refetch()} /> : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {booking ? (
              <p className="sm:col-span-2 text-xs text-gray-600">{booking.hotel?.name} · status {humanize(booking.status)}</p>
            ) : (
              <FormField label="Hotel *" error={err.hotelId} full>{(p) => (
                <Select {...p} value={form.hotelId} onChange={set('hotelId')}>
                  <option value="">{hotels.isLoading ? 'Loading hotels…' : ownHotels.length ? 'Choose a hotel…' : 'No active hotel of yours yet'}</option>
                  {ownHotels.map((h: any) => <option key={h.id} value={h.id}>{h.name} ({h.city})</option>)}
                </Select>
              )}</FormField>
            )}
            <FormField label="Guest name *" error={err.guestName}>{(p) => <Input {...p} value={form.guestName} onChange={set('guestName')} />}</FormField>
            <FormField label="Nationality" error={err.guestNationality} hint="2-letter code">{(p) => <Input {...p} maxLength={2} value={form.guestNationality} onChange={set('guestNationality')} />}</FormField>
            <FormField label="Email" error={err.guestEmail}>{(p) => <Input {...p} type="email" value={form.guestEmail} onChange={set('guestEmail')} />}</FormField>
            <FormField label="Phone">{(p) => <Input {...p} type="tel" value={form.guestPhone} onChange={set('guestPhone')} />}</FormField>
            <FormField label="Check-in *" error={err.checkIn}>{(p) => <Input {...p} type="date" value={form.checkIn} onChange={set('checkIn')} />}</FormField>
            <FormField label="Check-out *" error={err.checkOut}>{(p) => <Input {...p} type="date" value={form.checkOut} onChange={set('checkOut')} />}</FormField>
            <FormField label="Guests *" error={err.guests}>{(p) => <Input {...p} type="number" min={1} max={500} value={form.guests} onChange={set('guests')} />}</FormField>
            <FormField label="Booking source">{(p) => <Select {...p} value={form.source} onChange={set('source')}>{HOTEL_BOOKING_SOURCES.map((s) => <option key={s} value={s}>{humanize(s)}</option>)}</Select>}</FormField>
            <FormField label="Room type">{(p) => (
              <Select {...p} value={form.roomTypeId} onChange={set('roomTypeId')} disabled={!hotelId}>
                <option value="">Any</option>
                {(roomTypes.data ?? []).filter((rt: any) => rt.status === 'ACTIVE').map((rt: any) => <option key={rt.id} value={rt.id}>{rt.name} (sleeps {rt.occupancy})</option>)}
              </Select>
            )}</FormField>
            <FormField label="Room" error={err.roomId} hint={!form.checkIn || !form.checkOut ? 'Choose the dates to see free rooms' : availability.isLoading ? 'Checking free rooms…' : `${roomChoices.length} free for these dates`}>{(p) => (
              <Select {...p} value={form.roomId} onChange={set('roomId')} disabled={!availability.data}>
                <option value="">Assign later</option>
                {roomChoices.map((r: any) => <option key={r.id} value={r.id}>Room {r.roomNumber} · sleeps {r.capacity}{r.status === 'MAINTENANCE' ? ' · maintenance' : ''}</option>)}
              </Select>
            )}</FormField>
            <FormField label="Amount (SAR)" error={err.amount}>{(p) => <Input {...p} type="number" min={0} step="0.01" value={form.amount} onChange={set('amount')} />}</FormField>
            {!booking && (
              <FormField label="Record as">{(p) => (
                <Select {...p} value={form.status} onChange={set('status')}>
                  {HOTEL_BOOKING_INITIAL_STATUSES.map((s) => <option key={s} value={s}>{s === 'PENDING' ? 'Pending request' : 'Confirmed reservation'}</option>)}
                </Select>
              )}</FormField>
            )}
            <FormField label="Notes" full>{(p) => <Textarea {...p} rows={2} value={form.notes} onChange={set('notes')} />}</FormField>
            {availability.error && <div className="sm:col-span-2"><Alert title={apiErrorMessage(availability.error, 'Room availability could not be loaded.')} /></div>}
          </div>
        )}
        <ModalFooter onClose={onClose} pending={pending} cta={booking ? 'Save booking' : 'Record booking'} />
      </form>
    </ModalSurface>
  );
}

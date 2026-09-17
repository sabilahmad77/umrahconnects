'use client';
import { Input, Select, ModalSurface, Textarea , Button , QueryFailure } from '@/components/ui/system';


import { useState } from 'react';
import {
  Plus, RefreshCw, CalendarCheck2, AlertCircle, Loader2, X, Download, Search,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useHotelBookings, useCreateHotelBooking, useUpdateHotelBooking } from '@/hooks/use-hotels';
import { useHotels } from '@/hooks/use-api';

const STATUSES = ['PENDING', 'CONFIRMED', 'CHECKED_IN', 'CHECKED_OUT', 'COMPLETED', 'CANCELLED'];
const PAYMENT_STATUSES = ['UNPAID', 'PARTIAL', 'PAID', 'REFUNDED'];

export function HotelBookingsView() {
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const { data: bookings = [], isLoading, error, refetch } = useHotelBookings(
    statusFilter !== 'ALL' ? { status: statusFilter } : undefined,
  );
  const update = useUpdateHotelBooking();

  const filtered = bookings.filter((b: any) =>
    !search || (b.guestName ?? '').toLowerCase().includes(search.toLowerCase()) || (b.guestPhone ?? '').includes(search),
  );

  const exportCsv = () => {
    const rows = [
      ['Guest', 'Email', 'Phone', 'Hotel', 'Check-in', 'Check-out', 'Guests', 'Source', 'Status', 'Payment', 'Amount'],
      ...filtered.map((b: any) => [
        b.guestName, b.guestEmail ?? '', b.guestPhone ?? '', b.hotel?.name ?? '',
        b.checkIn?.slice(0, 10) ?? '', b.checkOut?.slice(0, 10) ?? '', b.guests,
        b.source, b.status, b.paymentStatus, (b.totalAmountCents / 100).toFixed(2),
      ]),
    ];
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `hotel-bookings-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (error) return <QueryFailure error={error} onRetry={() => { refetch(); }} />;
  return (
    <div className="space-y-5 pb-10">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Hotel bookings</h1>
          <p className="text-sm text-gray-600 mt-0.5">{bookings.length} bookings — platform guests &amp; external clients</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="quiet" type="button" aria-label="Refresh information" onClick={() => refetch()} className="p-2 border border-gray-200 rounded-xl hover:bg-gray-50 text-gray-600">
            <RefreshCw className={cn('h-4 w-4', isLoading && 'animate-spin')} />
          </Button>
          <Button variant="quiet" type="button" onClick={exportCsv} className="flex items-center gap-2 text-sm px-3 py-2 border border-gray-200 rounded-xl hover:bg-gray-50">
            <Download className="h-4 w-4" /> Export
          </Button>
          <Button variant="quiet" type="button" onClick={() => setShowCreate(true)} className="flex items-center gap-2 text-sm px-4 py-2 bg-brand-500 text-white rounded-xl hover:bg-brand-600 shadow-sm">
            <Plus className="h-4 w-4" /> New booking
          </Button>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-xl px-3 py-2.5 w-full sm:w-72">
          <Search className="h-4 w-4 text-gray-600" />
          <Input aria-label="Search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search guest / phone…" className="text-sm bg-transparent flex-1 outline-none" />
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {['ALL', ...STATUSES].map((s) => (
            <Button variant="quiet" type="button"
              key={s}
              onClick={() => setStatusFilter(s)}
              className={cn('text-xs px-3 py-1.5 rounded-full border font-medium transition-all',
                statusFilter === s ? 'bg-brand-500 text-white border-brand-500' : 'border-gray-200 text-gray-600 hover:border-gray-300')}
            >
              {s.replace(/_/g, ' ')}
            </Button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="bg-white rounded-xl border border-gray-200 py-16 text-center text-sm text-gray-600">
          <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2" /> Loading…
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 py-16 text-center">
          <CalendarCheck2 className="h-12 w-12 mx-auto mb-3 text-gray-200" />
          <p className="text-sm text-gray-600">No bookings yet — use “New booking” to record your first reservation</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
          <div role="region" aria-label="Scrollable records" tabIndex={0} className="max-w-full overflow-x-auto"><table className="w-full text-sm">
            <thead className="text-xs text-gray-600 bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left p-3">Guest</th>
                <th className="text-left p-3">Hotel</th>
                <th className="text-left p-3">Dates</th>
                <th className="text-left p-3">Guests</th>
                <th className="text-left p-3">Source</th>
                <th className="text-left p-3">Amount</th>
                <th className="text-left p-3">Status</th>
                <th className="text-left p-3">Payment</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.map((b: any) => (
                <tr key={b.id} className="hover:bg-gray-50/60">
                  <td className="p-3">
                    <p className="font-medium text-gray-900">{b.guestName}</p>
                    <p className="text-xs text-gray-600">{b.guestEmail ?? b.guestPhone ?? ''}</p>
                  </td>
                  <td className="p-3 text-xs text-gray-600">{b.hotel?.name ?? '—'}</td>
                  <td className="p-3 text-xs text-gray-600">
                    {b.checkIn ? new Date(b.checkIn).toLocaleDateString() : '—'}
                    {b.checkOut ? ` → ${new Date(b.checkOut).toLocaleDateString()}` : ''}
                  </td>
                  <td className="p-3">{b.guests}</td>
                  <td className="p-3 text-xs text-brand-700">{b.source?.replace(/_/g, ' ')}</td>
                  <td className="p-3 font-medium">{b.currency} {(b.totalAmountCents / 100).toLocaleString()}</td>
                  <td className="p-3">
                    <Select disabled={update.isPending} aria-label={`Status for ${b.id ?? 'record'}`}
                      value={b.status}
                      onChange={async (e) => { try { await update.mutateAsync({ id: b.id, status: e.target.value }); toast.success('Updated'); refetch(); } catch (error) { toast.error((error as any)?.response?.data?.error?.message ?? (error as any)?.response?.data?.message ?? 'This action could not be completed. Try again.'); } }}
                      className="text-xs border border-gray-200 rounded-lg px-2 py-1 bg-white"
                    >
                      {STATUSES.map((s) => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
                    </Select>
                  </td>
                  <td className="p-3">
                    <Select disabled={update.isPending} aria-label={`Payment Status for ${b.id ?? 'record'}`}
                      value={b.paymentStatus}
                      onChange={async (e) => { try { await update.mutateAsync({ id: b.id, paymentStatus: e.target.value }); toast.success('Updated'); refetch(); } catch (error) { toast.error((error as any)?.response?.data?.error?.message ?? (error as any)?.response?.data?.message ?? 'This action could not be completed. Try again.'); } }}
                      className="text-xs border border-gray-200 rounded-lg px-2 py-1 bg-white"
                    >
                      {PAYMENT_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                    </Select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table></div>
        </div>
      )}

      {showCreate && (
        <CreateHotelBookingModal onClose={() => setShowCreate(false)} onCreated={() => { setShowCreate(false); refetch(); }} />
      )}
    </div>
  );
}

function CreateHotelBookingModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const create = useCreateHotelBooking();
  const { data: hotelsData , error: hotelsError, refetch: retryHotels} = useHotels({ limit: 100 });
  const hotels = hotelsData?.items ?? [];
  const [form, setForm] = useState({
    hotelId: '',
    source: 'EXTERNAL',
    guestName: '',
    guestEmail: '',
    guestPhone: '',
    guestNationality: '',
    checkIn: '',
    checkOut: '',
    guests: '1',
    amount: '',
    status: 'PENDING',
    paymentStatus: 'UNPAID',
    notes: '',
  });

  const submit = async () => {
    if (!form.hotelId || !form.guestName.trim() || !form.checkIn || !form.checkOut) {
      toast.error('Hotel, guest name, check-in and check-out are required');
      return;
    }
    try {
      await create.mutateAsync({
        hotelId: form.hotelId,
        source: form.source,
        guestName: form.guestName.trim(),
        guestEmail: form.guestEmail || undefined,
        guestPhone: form.guestPhone || undefined,
        guestNationality: form.guestNationality || undefined,
        checkIn: form.checkIn,
        checkOut: form.checkOut,
        guests: Number(form.guests) || 1,
        amount: form.amount ? Number(form.amount) : 0,
        status: form.status,
        paymentStatus: form.paymentStatus,
        notes: form.notes || undefined,
      });
      toast.success('Booking created');
      onCreated();
    } catch (e: any) {
      toast.error(e?.response?.data?.error?.message ?? 'Failed');
    }
  };

  if (hotelsError) return <QueryFailure error={hotelsError} onRetry={() => { retryHotels(); }} />;
  return (
    <ModalSurface busy={create.isPending} title="New hotel booking" onClose={onClose}   >
      <div className="bg-white rounded-xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-5 shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-gray-900">New hotel booking</h2>
          <Button disabled={create.isPending} variant="quiet" type="button" aria-label="Close dialog" onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg"><X className="h-4 w-4" /></Button>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Hotel *">
            <Select aria-label="Hotel Id" value={form.hotelId} onChange={(e) => setForm({ ...form, hotelId: e.target.value })} className="input bg-white">
              <option value="">Select hotel…</option>
              {hotels.map((h: any) => <option key={h.id} value={h.id}>{h.name} ({h.city})</option>)}
            </Select>
          </Field>
          <Field label="Booking source">
            <Select aria-label="Source" value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })} className="input bg-white">
              <option value="EXTERNAL">External guest / client</option>
              <option value="PLATFORM_USER">Platform user</option>
              <option value="OPERATOR">Operator</option>
              <option value="MARKETPLACE">Marketplace</option>
            </Select>
          </Field>
          <Field label="Guest name *">
            <Input aria-label="Guest Name" value={form.guestName} onChange={(e) => setForm({ ...form, guestName: e.target.value })} className="input" />
          </Field>
          <Field label="Nationality (ISO-2)">
            <Input aria-label="Guest Nationality" value={form.guestNationality} maxLength={2} onChange={(e) => setForm({ ...form, guestNationality: e.target.value.toUpperCase() })} className="input" placeholder="SA" />
          </Field>
          <Field label="Email">
            <Input aria-label="Guest Email" value={form.guestEmail} onChange={(e) => setForm({ ...form, guestEmail: e.target.value })} className="input" />
          </Field>
          <Field label="Phone">
            <Input aria-label="Guest Phone" value={form.guestPhone} onChange={(e) => setForm({ ...form, guestPhone: e.target.value })} className="input" />
          </Field>
          <Field label="Check-in *">
            <Input aria-label="Check In" type="date" value={form.checkIn} onChange={(e) => setForm({ ...form, checkIn: e.target.value })} className="input" />
          </Field>
          <Field label="Check-out *">
            <Input aria-label="Check Out" type="date" value={form.checkOut} onChange={(e) => setForm({ ...form, checkOut: e.target.value })} className="input" />
          </Field>
          <Field label="Number of guests">
            <Input aria-label="Guests" type="number" min="1" value={form.guests} onChange={(e) => setForm({ ...form, guests: e.target.value })} className="input" />
          </Field>
          <Field label="Amount (SAR)">
            <Input aria-label="Amount" type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} className="input" />
          </Field>
          <Field label="Booking status">
            <Select aria-label="Status" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} className="input bg-white">
              {STATUSES.map((s) => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
            </Select>
          </Field>
          <Field label="Payment status">
            <Select aria-label="Payment Status" value={form.paymentStatus} onChange={(e) => setForm({ ...form, paymentStatus: e.target.value })} className="input bg-white">
              {PAYMENT_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
            </Select>
          </Field>
          <Field label="Notes" full>
            <Textarea aria-label="Notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} className="input resize-none" />
          </Field>
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <Button disabled={create.isPending} variant="quiet" type="button" onClick={onClose} className="px-4 py-2 text-sm border border-gray-200 rounded-lg">Cancel</Button>
          <Button variant="quiet" type="button" onClick={submit} disabled={create.isPending} className="flex items-center gap-2 px-4 py-2 text-sm bg-brand-500 text-white rounded-lg disabled:opacity-50">
            {create.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Create booking
          </Button>
        </div>
      </div>
    </ModalSurface>
  );
}

function Field({ label, children, full }: { label: string; children: React.ReactNode; full?: boolean }) {
  return (
    <label className={cn('block', full && 'col-span-2')}>
      <span className="block text-xs font-semibold text-gray-600 mb-1">{label}</span>
      {children}
    </label>
  );
}

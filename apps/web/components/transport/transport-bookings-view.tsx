'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  Plus, RefreshCw, BookOpen, AlertCircle, Loader2, X, Search, Download, Wallet,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import {
  useAssignments, useCreateAssignment, useUpdateAssignment, useCancelAssignment,
} from '@/hooks/use-transport';
import { useTransportVehicles, useTransportDrivers, useTransportRoutes } from '@/hooks/use-api';

const BOOKING_STATUSES = ['DRAFT', 'SCHEDULED', 'CONFIRMED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'];
const PAYMENT_STATUSES = ['UNPAID', 'PARTIAL', 'PAID', 'REFUNDED'];
const CUSTOMER_TYPES = ['PLATFORM_USER', 'OPERATOR', 'EXTERNAL'];

/**
 * Transport Bookings — the customer-facing commercial view of transport jobs.
 * Backed by the same TransportAssignment records as Assignments, but presented
 * around the customer, price and payment lifecycle (vs. the dispatch view).
 */
export function TransportBookingsView() {
  const [status, setStatus] = useState('ALL');
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const { data, isLoading, error, refetch } = useAssignments({
    status: status !== 'ALL' ? status : undefined,
    search: search || undefined,
  });
  const update = useUpdateAssignment();
  const cancel = useCancelAssignment();
  const items = data?.items ?? [];

  const exportCsv = () => {
    const rows = [
      ['Customer', 'Type', 'Phone', 'Route', 'Vehicle', 'Driver', 'Date', 'Passengers', 'Price', 'Payment', 'Status'],
      ...items.map((a: any) => [
        a.customerName ?? '', a.customerType ?? '', a.customerPhone ?? '',
        a.route?.name ?? '', a.vehicle?.plateNumber ?? '',
        a.driver ? `${a.driver.firstName} ${a.driver.lastName}` : '',
        a.scheduledAt ? new Date(a.scheduledAt).toLocaleString() : '',
        a.passengerCount, (a.priceCents / 100).toFixed(2), a.paymentStatus, a.status,
      ]),
    ];
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `transport-bookings-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-5 pb-10">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Transport bookings</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {(data?.total ?? 0).toLocaleString()} bookings — traveler, operator, marketplace &amp; manual
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => refetch()} className="p-2 border border-gray-200 rounded-xl hover:bg-gray-50 text-gray-500">
            <RefreshCw className={cn('h-4 w-4', isLoading && 'animate-spin')} />
          </button>
          <button onClick={exportCsv} className="flex items-center gap-2 text-sm px-3 py-2 border border-gray-200 rounded-xl hover:bg-gray-50">
            <Download className="h-4 w-4" /> Export
          </button>
          <button onClick={() => setShowCreate(true)} className="flex items-center gap-2 text-sm px-4 py-2 bg-brand-500 text-white rounded-xl hover:bg-brand-600 shadow-sm shadow-brand-500/30">
            <Plus className="h-4 w-4" /> New booking
          </button>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-xl px-3 py-2.5 w-full sm:w-72">
          <Search className="h-4 w-4 text-gray-400" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search customer / phone…" className="text-sm bg-transparent flex-1 outline-none" />
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {['ALL', ...BOOKING_STATUSES].map((s) => (
            <button
              key={s}
              onClick={() => setStatus(s)}
              className={cn('text-xs px-3 py-1.5 rounded-full border font-medium transition-all',
                status === s ? 'bg-brand-500 text-white border-brand-500' : 'border-gray-200 text-gray-500 hover:border-gray-300')}
            >
              {s.replace(/_/g, ' ')}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="bg-white rounded-2xl border border-gray-100 py-16 text-center text-sm text-gray-400">
          <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2" /> Loading…
        </div>
      ) : error ? (
        <div className="bg-white rounded-2xl border border-gray-100 py-16 text-center">
          <AlertCircle className="h-10 w-10 mx-auto mb-3 text-red-400 opacity-60" />
          <p className="text-sm text-red-500">Failed to load bookings</p>
        </div>
      ) : items.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 py-16 text-center">
          <BookOpen className="h-12 w-12 mx-auto mb-3 text-gray-200" />
          <p className="text-sm text-gray-400">No transport bookings yet</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs text-gray-500 bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="text-left p-3">Customer</th>
                <th className="text-left p-3">Route</th>
                <th className="text-left p-3">Vehicle / Driver</th>
                <th className="text-left p-3">Date</th>
                <th className="text-left p-3">Pax</th>
                <th className="text-left p-3">Price</th>
                <th className="text-left p-3">Payment</th>
                <th className="text-left p-3">Status</th>
                <th />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {items.map((a: any) => (
                <tr key={a.id} className="hover:bg-gray-50/60">
                  <td className="p-3">
                    <p className="font-medium text-gray-900">{a.customerName ?? '—'}</p>
                    <p className="text-[11px] text-gray-400">{a.customerPhone ?? a.customerEmail ?? ''}</p>
                    <p className="text-[10px] text-brand-700">{a.customerType?.replace(/_/g, ' ')}</p>
                  </td>
                  <td className="p-3">
                    {a.route ? (
                      <Link href={`/transport/routes/${a.route.id}`} className="text-brand-600 hover:underline">{a.route.name}</Link>
                    ) : '—'}
                  </td>
                  <td className="p-3 text-xs text-gray-600">
                    {a.vehicle ? (
                      <Link href={`/transport/vehicles/${a.vehicle.id}`} className="text-brand-600 hover:underline">{a.vehicle.plateNumber}</Link>
                    ) : '—'}
                    {a.driver && <span className="block text-[11px] text-gray-400">{a.driver.firstName} {a.driver.lastName}</span>}
                  </td>
                  <td className="p-3 text-xs text-gray-600">{a.scheduledAt ? new Date(a.scheduledAt).toLocaleString() : '—'}</td>
                  <td className="p-3">{a.passengerCount}</td>
                  <td className="p-3 font-medium">{a.currency} {(a.priceCents / 100).toLocaleString()}</td>
                  <td className="p-3">
                    <select
                      value={a.paymentStatus}
                      onChange={async (e) => { await update.mutateAsync({ id: a.id, paymentStatus: e.target.value }); toast.success('Updated'); refetch(); }}
                      className="text-xs border border-gray-200 rounded-lg px-2 py-1 bg-white"
                    >
                      {PAYMENT_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </td>
                  <td className="p-3">
                    <select
                      value={a.status}
                      onChange={async (e) => { await update.mutateAsync({ id: a.id, status: e.target.value }); toast.success('Updated'); refetch(); }}
                      className="text-xs border border-gray-200 rounded-lg px-2 py-1 bg-white"
                    >
                      {BOOKING_STATUSES.map((s) => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
                    </select>
                  </td>
                  <td className="p-3 text-right">
                    {a.status !== 'CANCELLED' && (
                      <button
                        onClick={async () => {
                          if (!confirm('Cancel this booking?')) return;
                          await cancel.mutateAsync(a.id);
                          toast.success('Cancelled');
                          refetch();
                        }}
                        className="text-xs text-red-500 hover:underline"
                      >
                        Cancel
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showCreate && (
        <NewBookingModal onClose={() => setShowCreate(false)} onCreated={() => { setShowCreate(false); refetch(); }} />
      )}
    </div>
  );
}

function NewBookingModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const create = useCreateAssignment();
  const { data: vehicles } = useTransportVehicles({ limit: 100 });
  const { data: drivers } = useTransportDrivers({ limit: 100 });
  const { data: routes } = useTransportRoutes();
  const vehicleItems = vehicles?.items ?? [];
  const driverItems = drivers?.items ?? [];
  const routeItems = (routes as any)?.items ?? (Array.isArray(routes) ? routes : []);

  const [f, setF] = useState({
    customerType: 'EXTERNAL', customerName: '', customerEmail: '', customerPhone: '',
    routeId: '', vehicleId: '', driverId: '',
    pickupLocation: '', dropoffLocation: '', scheduledAt: '',
    passengerCount: '1', price: '', paymentStatus: 'UNPAID', status: 'SCHEDULED', notes: '',
  });
  const set = (k: string, v: string) => setF((p) => ({ ...p, [k]: v }));

  const submit = async () => {
    if (!f.vehicleId || !f.scheduledAt) {
      toast.error('Vehicle and date/time are required');
      return;
    }
    try {
      await create.mutateAsync({
        vehicleId: f.vehicleId,
        driverId: f.driverId || undefined,
        routeId: f.routeId || undefined,
        customerType: f.customerType,
        customerName: f.customerName || undefined,
        customerEmail: f.customerEmail || undefined,
        customerPhone: f.customerPhone || undefined,
        pickupLocation: f.pickupLocation || undefined,
        dropoffLocation: f.dropoffLocation || undefined,
        scheduledAt: new Date(f.scheduledAt).toISOString(),
        passengerCount: Number(f.passengerCount) || 1,
        price: f.price ? Number(f.price) : undefined,
        paymentStatus: f.paymentStatus,
        status: f.status,
        notes: f.notes || undefined,
      });
      toast.success('Transport booking created');
      onCreated();
    } catch (e: any) {
      toast.error(e?.response?.data?.error?.message ?? 'Failed');
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-5 shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-gray-900">New transport booking</h2>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg"><X className="h-4 w-4" /></button>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Customer type">
            <select value={f.customerType} onChange={(e) => set('customerType', e.target.value)} className="input bg-white">
              {CUSTOMER_TYPES.map((t) => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
            </select>
          </Field>
          <Field label="Customer name">
            <input value={f.customerName} onChange={(e) => set('customerName', e.target.value)} className="input" />
          </Field>
          <Field label="Customer phone">
            <input value={f.customerPhone} onChange={(e) => set('customerPhone', e.target.value)} className="input" />
          </Field>
          <Field label="Customer email">
            <input value={f.customerEmail} onChange={(e) => set('customerEmail', e.target.value)} className="input" />
          </Field>
          <Field label="Route">
            <select value={f.routeId} onChange={(e) => set('routeId', e.target.value)} className="input bg-white">
              <option value="">—</option>
              {routeItems.map((r: any) => <option key={r.id} value={r.id}>{r.name} ({r.originCity} → {r.destCity})</option>)}
            </select>
          </Field>
          <Field label="Vehicle *">
            <select value={f.vehicleId} onChange={(e) => set('vehicleId', e.target.value)} className="input bg-white">
              <option value="">Select vehicle…</option>
              {vehicleItems.map((v: any) => <option key={v.id} value={v.id}>{v.plateNumber} ({v.type}, {v.capacity} seats)</option>)}
            </select>
          </Field>
          <Field label="Driver">
            <select value={f.driverId} onChange={(e) => set('driverId', e.target.value)} className="input bg-white">
              <option value="">—</option>
              {driverItems.map((d: any) => <option key={d.id} value={d.id}>{d.firstName} {d.lastName}</option>)}
            </select>
          </Field>
          <Field label="Passengers">
            <input type="number" min="1" value={f.passengerCount} onChange={(e) => set('passengerCount', e.target.value)} className="input" />
          </Field>
          <Field label="Pickup location">
            <input value={f.pickupLocation} onChange={(e) => set('pickupLocation', e.target.value)} className="input" />
          </Field>
          <Field label="Drop-off location">
            <input value={f.dropoffLocation} onChange={(e) => set('dropoffLocation', e.target.value)} className="input" />
          </Field>
          <Field label="Scheduled date/time *">
            <input type="datetime-local" value={f.scheduledAt} onChange={(e) => set('scheduledAt', e.target.value)} className="input" />
          </Field>
          <Field label="Price (SAR)">
            <input type="number" value={f.price} onChange={(e) => set('price', e.target.value)} className="input" />
          </Field>
          <Field label="Booking status">
            <select value={f.status} onChange={(e) => set('status', e.target.value)} className="input bg-white">
              {BOOKING_STATUSES.map((s) => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
            </select>
          </Field>
          <Field label="Payment status">
            <select value={f.paymentStatus} onChange={(e) => set('paymentStatus', e.target.value)} className="input bg-white">
              {PAYMENT_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </Field>
          <Field label="Notes" full>
            <textarea value={f.notes} onChange={(e) => set('notes', e.target.value)} rows={2} className="input resize-none" />
          </Field>
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <button onClick={onClose} className="px-4 py-2 text-sm border border-gray-200 rounded-lg">Cancel</button>
          <button onClick={submit} disabled={create.isPending} className="flex items-center gap-2 px-4 py-2 text-sm bg-brand-500 text-white rounded-lg disabled:opacity-50">
            {create.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Create booking
          </button>
        </div>
      </div>
      <style jsx>{`
        :global(.input) { width: 100%; font-size: 14px; padding: 10px 12px; border: 1px solid #e5e7eb; border-radius: 8px; outline: none; }
        :global(.input:focus) { border-color: #d4831a; box-shadow: 0 0 0 2px #fef3e6; }
      `}</style>
    </div>
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

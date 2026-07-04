'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  Plus, RefreshCw, ClipboardList, AlertCircle, Loader2, X, ArrowRight,
  Filter, Search,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import {
  useAssignments, useCreateAssignment, useUpdateAssignment, useCancelAssignment,
} from '@/hooks/use-transport';
import { useTransportVehicles, useTransportDrivers, useTransportRoutes } from '@/hooks/use-api';

const ASSIGNMENT_STATUSES = ['DRAFT', 'SCHEDULED', 'CONFIRMED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'];
const PAYMENT_STATUSES = ['UNPAID', 'PARTIAL', 'PAID', 'REFUNDED'];
const CUSTOMER_TYPES = ['PLATFORM_USER', 'OPERATOR', 'EXTERNAL'];

export function AssignmentsList() {
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

  return (
    <div className="space-y-5 pb-10">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Transport assignments</h1>
          <p className="text-sm text-gray-500 mt-0.5">{(data?.total ?? 0).toLocaleString()} assignments / bookings</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => refetch()} className="p-2 border border-gray-200 rounded-xl hover:bg-gray-50 text-gray-500">
            <RefreshCw className={cn('h-4 w-4', isLoading && 'animate-spin')} />
          </button>
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 text-sm px-4 py-2 bg-brand-500 text-white rounded-xl hover:bg-brand-600 shadow-sm shadow-brand-500/30"
          >
            <Plus className="h-4 w-4" /> New assignment
          </button>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-xl px-3 py-2.5 w-full sm:w-72">
          <Search className="h-4 w-4 text-gray-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search customer/phone…"
            className="text-sm bg-transparent flex-1 outline-none placeholder:text-gray-400"
          />
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {['ALL', ...ASSIGNMENT_STATUSES].map((s) => (
            <button
              key={s}
              onClick={() => setStatus(s)}
              className={cn(
                'text-xs px-3 py-1.5 rounded-full border transition-all font-medium',
                status === s ? 'bg-brand-500 text-white border-brand-500' : 'border-gray-200 text-gray-500 hover:border-gray-300',
              )}
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
          <p className="text-sm text-red-500">Failed to load assignments</p>
        </div>
      ) : items.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 py-16 text-center">
          <ClipboardList className="h-12 w-12 mx-auto mb-3 text-gray-200" />
          <p className="text-sm text-gray-400">No assignments yet</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs text-gray-500 bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="text-left p-3">Customer</th>
                <th className="text-left p-3">Vehicle</th>
                <th className="text-left p-3">Route</th>
                <th className="text-left p-3">Driver</th>
                <th className="text-left p-3">Scheduled</th>
                <th className="text-left p-3">Pax</th>
                <th className="text-left p-3">Price</th>
                <th className="text-left p-3">Status</th>
                <th className="text-left p-3">Payment</th>
                <th />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {items.map((a: any) => (
                <tr key={a.id} className="hover:bg-gray-50/60">
                  <td className="p-3">
                    <p className="font-medium text-gray-900">{a.customerName ?? '—'}</p>
                    <p className="text-[11px] text-gray-400">{a.customerEmail ?? a.customerPhone ?? ''}</p>
                    <p className="text-[10px] text-brand-700 mt-0.5">{a.customerType?.replace(/_/g, ' ')}</p>
                  </td>
                  <td className="p-3">
                    {a.vehicle ? (
                      <Link href={`/transport/vehicles/${a.vehicle.id}`} className="text-brand-600 hover:underline font-medium">
                        {a.vehicle.plateNumber}
                      </Link>
                    ) : '—'}
                  </td>
                  <td className="p-3">
                    {a.route ? (
                      <Link href={`/transport/routes/${a.route.id}`} className="text-brand-600 hover:underline">
                        {a.route.name}
                      </Link>
                    ) : '—'}
                  </td>
                  <td className="p-3">
                    {a.driver ? (
                      <Link href={`/transport/drivers/${a.driver.id}`} className="text-brand-600 hover:underline">
                        {a.driver.firstName} {a.driver.lastName}
                      </Link>
                    ) : '—'}
                  </td>
                  <td className="p-3 text-xs text-gray-600">{a.scheduledAt ? new Date(a.scheduledAt).toLocaleString() : '—'}</td>
                  <td className="p-3">{a.passengerCount}</td>
                  <td className="p-3 font-medium">{a.currency} {(a.priceCents / 100).toLocaleString()}</td>
                  <td className="p-3">
                    <select
                      value={a.status}
                      onChange={async (e) => {
                        await update.mutateAsync({ id: a.id, status: e.target.value });
                        refetch();
                      }}
                      className="text-xs border border-gray-200 rounded-lg px-2 py-1 bg-white"
                    >
                      {ASSIGNMENT_STATUSES.map((s) => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
                    </select>
                  </td>
                  <td className="p-3">
                    <select
                      value={a.paymentStatus}
                      onChange={async (e) => {
                        await update.mutateAsync({ id: a.id, paymentStatus: e.target.value });
                        refetch();
                      }}
                      className="text-xs border border-gray-200 rounded-lg px-2 py-1 bg-white"
                    >
                      {PAYMENT_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </td>
                  <td className="p-3 text-right">
                    {a.status !== 'CANCELLED' && (
                      <button
                        onClick={async () => {
                          if (!confirm('Cancel this assignment?')) return;
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
        <CreateAssignmentModal
          onClose={() => setShowCreate(false)}
          onCreated={() => { setShowCreate(false); refetch(); }}
        />
      )}
    </div>
  );
}

function CreateAssignmentModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const create = useCreateAssignment();
  const { data: vehicles } = useTransportVehicles({ limit: 100 });
  const { data: drivers } = useTransportDrivers({ limit: 100 });
  const { data: routes } = useTransportRoutes();
  const vehicleItems = vehicles?.items ?? [];
  const driverItems = drivers?.items ?? [];
  const routeItems = (routes as any)?.items ?? (Array.isArray(routes) ? routes : []);

  const [form, setForm] = useState({
    vehicleId: '',
    driverId: '',
    routeId: '',
    customerType: 'PLATFORM_USER',
    customerName: '',
    customerEmail: '',
    customerPhone: '',
    pickupLocation: '',
    dropoffLocation: '',
    scheduledAt: '',
    passengerCount: '1',
    price: '',
    paymentStatus: 'UNPAID',
    notes: '',
  });

  const submit = async () => {
    if (!form.vehicleId || !form.scheduledAt) {
      toast.error('Vehicle & scheduled date required');
      return;
    }
    try {
      await create.mutateAsync({
        vehicleId: form.vehicleId,
        driverId: form.driverId || undefined,
        routeId: form.routeId || undefined,
        customerType: form.customerType,
        customerName: form.customerName || undefined,
        customerEmail: form.customerEmail || undefined,
        customerPhone: form.customerPhone || undefined,
        pickupLocation: form.pickupLocation || undefined,
        dropoffLocation: form.dropoffLocation || undefined,
        scheduledAt: new Date(form.scheduledAt).toISOString(),
        passengerCount: Number(form.passengerCount) || 1,
        price: form.price ? Number(form.price) : undefined,
        paymentStatus: form.paymentStatus,
        notes: form.notes || undefined,
      });
      toast.success('Assignment created');
      onCreated();
    } catch (e: any) {
      toast.error(e?.response?.data?.error?.message ?? 'Failed');
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-5 shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-gray-900">New transport assignment</h2>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg"><X className="h-4 w-4" /></button>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Vehicle *">
            <select value={form.vehicleId} onChange={(e) => setForm({ ...form, vehicleId: e.target.value })} className="input bg-white">
              <option value="">Select vehicle…</option>
              {vehicleItems.map((v: any) => <option key={v.id} value={v.id}>{v.plateNumber} ({v.type}, {v.capacity} seats)</option>)}
            </select>
          </Field>
          <Field label="Driver">
            <select value={form.driverId} onChange={(e) => setForm({ ...form, driverId: e.target.value })} className="input bg-white">
              <option value="">—</option>
              {driverItems.map((d: any) => <option key={d.id} value={d.id}>{d.firstName} {d.lastName}</option>)}
            </select>
          </Field>
          <Field label="Route">
            <select value={form.routeId} onChange={(e) => setForm({ ...form, routeId: e.target.value })} className="input bg-white">
              <option value="">—</option>
              {routeItems.map((r: any) => <option key={r.id} value={r.id}>{r.name} ({r.originCity} → {r.destCity})</option>)}
            </select>
          </Field>
          <Field label="Customer type">
            <select value={form.customerType} onChange={(e) => setForm({ ...form, customerType: e.target.value })} className="input bg-white">
              {CUSTOMER_TYPES.map((t) => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
            </select>
          </Field>
          <Field label="Customer name">
            <input value={form.customerName} onChange={(e) => setForm({ ...form, customerName: e.target.value })} className="input" />
          </Field>
          <Field label="Customer phone">
            <input value={form.customerPhone} onChange={(e) => setForm({ ...form, customerPhone: e.target.value })} className="input" />
          </Field>
          <Field label="Customer email">
            <input value={form.customerEmail} onChange={(e) => setForm({ ...form, customerEmail: e.target.value })} className="input" />
          </Field>
          <Field label="Passenger count">
            <input type="number" min="1" value={form.passengerCount} onChange={(e) => setForm({ ...form, passengerCount: e.target.value })} className="input" />
          </Field>
          <Field label="Pickup location">
            <input value={form.pickupLocation} onChange={(e) => setForm({ ...form, pickupLocation: e.target.value })} className="input" />
          </Field>
          <Field label="Drop-off location">
            <input value={form.dropoffLocation} onChange={(e) => setForm({ ...form, dropoffLocation: e.target.value })} className="input" />
          </Field>
          <Field label="Scheduled at *">
            <input type="datetime-local" value={form.scheduledAt} onChange={(e) => setForm({ ...form, scheduledAt: e.target.value })} className="input" />
          </Field>
          <Field label="Price (SAR)">
            <input type="number" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} className="input" />
          </Field>
          <Field label="Payment status">
            <select value={form.paymentStatus} onChange={(e) => setForm({ ...form, paymentStatus: e.target.value })} className="input bg-white">
              {PAYMENT_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </Field>
          <Field label="Notes" full>
            <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} className="input resize-none" />
          </Field>
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <button onClick={onClose} className="px-4 py-2 text-sm border border-gray-200 rounded-lg">Cancel</button>
          <button onClick={submit} disabled={create.isPending} className="flex items-center gap-2 px-4 py-2 text-sm bg-brand-500 text-white rounded-lg disabled:opacity-50">
            {create.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Create assignment
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

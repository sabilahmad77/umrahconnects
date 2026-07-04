'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Loader2, AlertCircle, Map as MapIcon, Save, Edit3, Trash2, ListChecks, ArrowRight } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useRoute, useUpdateRoute, useDeleteRoute } from '@/hooks/use-transport';
import { useTransportVehicles, useTransportDrivers } from '@/hooks/use-api';

const MOVEMENT_TYPES = ['AIRPORT_PICKUP', 'AIRPORT_DROPOFF', 'MAKKAH_MADINAH', 'MADINAH_MAKKAH', 'ZIYARAT', 'LOCAL', 'MASHAER_MINA', 'MASHAER_ARAFAT', 'MASHAER_MUZDALIFAH'];
const ROUTE_STATUSES = ['DRAFT', 'ACTIVE', 'FULLY_BOOKED', 'COMPLETED', 'CANCELLED', 'INACTIVE'];

export function RouteDetail({ id }: { id: string }) {
  const router = useRouter();
  const { data: r, isLoading, error, refetch } = useRoute(id);
  const [tab, setTab] = useState<'overview' | 'edit'>('overview');

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20 text-gray-400 text-sm">
        <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading route…
      </div>
    );
  }
  if (error || !r) {
    return (
      <div className="py-20 text-center bg-white rounded-2xl border border-gray-100">
        <AlertCircle className="h-10 w-10 mx-auto mb-3 text-red-400 opacity-60" />
        <p className="text-sm text-red-500">Route not found</p>
        <Link href="/transport" className="text-xs text-brand-500 hover:underline mt-3 inline-block">← Back to transport</Link>
      </div>
    );
  }

  const seatsLeft = (r.totalSeats ?? 0) - (r.bookedSeats ?? 0);

  return (
    <div className="space-y-5 pb-10">
      <div className="flex items-center gap-3 flex-wrap">
        <button onClick={() => router.push('/transport')} className="p-2 rounded-xl border border-gray-200 hover:bg-gray-50">
          <ArrowLeft className="h-4 w-4 text-gray-500" />
        </button>
        <div className="w-12 h-12 rounded-xl bg-purple-50 flex items-center justify-center">
          <MapIcon className="h-6 w-6 text-purple-600" />
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-bold text-gray-900 truncate">{r.name}</h1>
          <p className="text-sm text-gray-500 flex items-center gap-1">
            {r.originCity} <ArrowRight className="h-3 w-3" /> {r.destCity}
          </p>
        </div>
        <span className={cn('text-[11px] font-medium px-2 py-1 rounded-full',
          r.status === 'ACTIVE' ? 'bg-green-50 text-green-700' :
          r.status === 'FULLY_BOOKED' ? 'bg-blue-50 text-blue-700' :
          r.status === 'CANCELLED' ? 'bg-red-50 text-red-700' :
          'bg-gray-100 text-gray-500')}>{r.status?.replace(/_/g, ' ')}</span>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 p-1.5 flex gap-1 overflow-x-auto">
        {(['overview', 'edit'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              'capitalize px-3 py-2 rounded-xl text-sm font-medium transition-colors',
              tab === t ? 'bg-brand-50 text-brand-700 border border-brand-100' : 'text-gray-500 hover:bg-gray-50',
            )}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="bg-white rounded-2xl border border-gray-100 p-5 lg:col-span-2 space-y-3">
            <h3 className="text-sm font-bold text-gray-900 inline-flex items-center gap-2"><ListChecks className="h-4 w-4" /> Route details</h3>
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <Field label="From" value={r.originCity} />
              <Field label="To" value={r.destCity} />
              <Field label="Pickup point" value={r.pickupPoint ?? '—'} />
              <Field label="Drop-off point" value={r.dropoffPoint ?? '—'} />
              <Field label="Departure" value={r.departureAt ? new Date(r.departureAt).toLocaleString() : '—'} />
              <Field label="Arrival" value={r.arrivalAt ? new Date(r.arrivalAt).toLocaleString() : '—'} />
              <Field label="Distance" value={r.distanceKm ? `${r.distanceKm} km` : '—'} />
              <Field label="Duration" value={r.durationMins ? `${r.durationMins} min` : '—'} />
              <Field label="Movement type" value={r.movementType ?? '—'} />
              <Field label="Price per seat" value={r.pricePerSeatCents != null ? `${r.currency ?? 'SAR'} ${(Number(r.pricePerSeatCents) / 100).toLocaleString()}` : '—'} />
              <Field label="Price per vehicle" value={r.pricePerVehicleCents != null ? `${r.currency ?? 'SAR'} ${(Number(r.pricePerVehicleCents) / 100).toLocaleString()}` : '—'} />
              <Field label="Seats" value={`${seatsLeft} / ${r.totalSeats ?? '—'}`} />
            </dl>
            {r.notes && (
              <div className="pt-3 border-t border-gray-50">
                <p className="text-xs font-semibold text-gray-600 mb-1">Notes</p>
                <p className="text-sm text-gray-700 whitespace-pre-wrap">{r.notes}</p>
              </div>
            )}
          </div>

          <div className="space-y-3">
            <div className="bg-white rounded-2xl border border-gray-100 p-5 space-y-2">
              <p className="text-xs font-semibold text-gray-500">Assigned</p>
              {r.vehicle ? (
                <Link href={`/transport/vehicles/${r.vehicle.id}`} className="block text-sm font-medium text-gray-900 hover:underline">
                  {r.vehicle.plateNumber} <span className="text-[11px] text-gray-400">({r.vehicle.type})</span>
                </Link>
              ) : <p className="text-xs text-gray-400">No vehicle assigned</p>}
              {r.driver ? (
                <Link href={`/transport/drivers/${r.driver.id}`} className="block text-sm font-medium text-gray-900 hover:underline">
                  {r.driver.firstName} {r.driver.lastName}
                </Link>
              ) : <p className="text-xs text-gray-400">No driver assigned</p>}
            </div>
            <div className="bg-white rounded-2xl border border-gray-100 p-5">
              <p className="text-xs font-semibold text-gray-500 mb-2">Recent assignments ({r.assignments?.length ?? 0})</p>
              {(r.assignments ?? []).length === 0 ? (
                <p className="text-xs text-gray-400">No assignments yet</p>
              ) : (
                <ul className="space-y-1 text-xs">
                  {r.assignments.slice(0, 5).map((a: any) => (
                    <li key={a.id}>
                      <p className="font-medium text-gray-800">{a.customerName ?? '—'}</p>
                      <p className="text-[11px] text-gray-400">{new Date(a.scheduledAt).toLocaleString()}</p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}

      {tab === 'edit' && <EditTab r={r} refetch={refetch} />}
    </div>
  );
}

function Field({ label, value }: { label: string; value: any }) {
  return (
    <div>
      <dt className="text-[11px] font-semibold text-gray-500">{label}</dt>
      <dd className="text-sm text-gray-900 font-medium">{value ?? '—'}</dd>
    </div>
  );
}

function EditTab({ r, refetch }: { r: any; refetch: () => void }) {
  const router = useRouter();
  const update = useUpdateRoute();
  const remove = useDeleteRoute();
  const { data: vehicles } = useTransportVehicles({ limit: 100 });
  const { data: drivers } = useTransportDrivers({ limit: 100 });
  const [form, setForm] = useState({
    name: r.name ?? '',
    movementType: r.movementType ?? 'AIRPORT_PICKUP',
    originCity: r.originCity ?? '',
    destCity: r.destCity ?? '',
    pickupPoint: r.pickupPoint ?? '',
    dropoffPoint: r.dropoffPoint ?? '',
    distanceKm: r.distanceKm ?? '',
    durationMins: r.durationMins ?? '',
    departureAt: r.departureAt?.slice(0, 16) ?? '',
    arrivalAt: r.arrivalAt?.slice(0, 16) ?? '',
    pricePerSeat: r.pricePerSeatCents != null ? String(Number(r.pricePerSeatCents) / 100) : '',
    pricePerVehicle: r.pricePerVehicleCents != null ? String(Number(r.pricePerVehicleCents) / 100) : '',
    currency: r.currency ?? 'SAR',
    totalSeats: r.totalSeats ?? '',
    bookedSeats: r.bookedSeats ?? 0,
    vehicleId: r.vehicleId ?? '',
    driverId: r.driverId ?? '',
    status: r.status ?? 'ACTIVE',
    notes: r.notes ?? '',
  });

  const save = async () => {
    try {
      await update.mutateAsync({
        id: r.id,
        ...form,
        distanceKm: form.distanceKm ? Number(form.distanceKm) : null,
        durationMins: form.durationMins ? Number(form.durationMins) : null,
        totalSeats: form.totalSeats ? Number(form.totalSeats) : null,
        bookedSeats: Number(form.bookedSeats || 0),
        pricePerSeat: form.pricePerSeat ? Number(form.pricePerSeat) : null,
        pricePerVehicle: form.pricePerVehicle ? Number(form.pricePerVehicle) : null,
        vehicleId: form.vehicleId || null,
        driverId: form.driverId || null,
      });
      toast.success('Route saved');
      refetch();
    } catch (e: any) {
      toast.error(e?.response?.data?.error?.message ?? 'Failed');
    }
  };

  const archive = async () => {
    if (!confirm('Archive this route?')) return;
    await remove.mutateAsync(r.id);
    toast.success('Route archived');
    router.push('/transport');
  };

  const vehicleItems = vehicles?.items ?? [];
  const driverItems = drivers?.items ?? [];

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="bg-white rounded-2xl border border-gray-100 p-5 space-y-3">
        <h3 className="text-sm font-bold text-gray-900 inline-flex items-center gap-2"><Edit3 className="h-4 w-4" /> Edit route</h3>
        <div className="grid grid-cols-2 gap-3">
          <Input label="Name" value={form.name} onChange={(v) => setForm({ ...form, name: v })} full />
          <Input label="From city" value={form.originCity} onChange={(v) => setForm({ ...form, originCity: v })} />
          <Input label="To city" value={form.destCity} onChange={(v) => setForm({ ...form, destCity: v })} />
          <Input label="Pickup point" value={form.pickupPoint} onChange={(v) => setForm({ ...form, pickupPoint: v })} />
          <Input label="Drop-off point" value={form.dropoffPoint} onChange={(v) => setForm({ ...form, dropoffPoint: v })} />
          <Input label="Departure" type="datetime-local" value={form.departureAt} onChange={(v) => setForm({ ...form, departureAt: v })} />
          <Input label="Arrival" type="datetime-local" value={form.arrivalAt} onChange={(v) => setForm({ ...form, arrivalAt: v })} />
          <Input label="Distance (km)" value={String(form.distanceKm)} onChange={(v) => setForm({ ...form, distanceKm: v as any })} type="number" />
          <Input label="Duration (min)" value={String(form.durationMins)} onChange={(v) => setForm({ ...form, durationMins: v as any })} type="number" />
          <Input label="Total seats" value={String(form.totalSeats)} onChange={(v) => setForm({ ...form, totalSeats: v as any })} type="number" />
          <Input label="Booked seats" value={String(form.bookedSeats)} onChange={(v) => setForm({ ...form, bookedSeats: v as any })} type="number" />
          <Input label={`Price per seat (${form.currency})`} value={form.pricePerSeat} onChange={(v) => setForm({ ...form, pricePerSeat: v })} type="number" />
          <Input label={`Price per vehicle (${form.currency})`} value={form.pricePerVehicle} onChange={(v) => setForm({ ...form, pricePerVehicle: v })} type="number" />
          <label className="block">
            <span className="block text-xs font-semibold text-gray-600 mb-1">Movement type</span>
            <select value={form.movementType} onChange={(e) => setForm({ ...form, movementType: e.target.value })} className="w-full text-sm px-3 py-2.5 border border-gray-200 rounded-lg bg-white">
              {MOVEMENT_TYPES.map((t) => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="block text-xs font-semibold text-gray-600 mb-1">Status</span>
            <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} className="w-full text-sm px-3 py-2.5 border border-gray-200 rounded-lg bg-white">
              {ROUTE_STATUSES.map((s) => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="block text-xs font-semibold text-gray-600 mb-1">Vehicle</span>
            <select value={form.vehicleId} onChange={(e) => setForm({ ...form, vehicleId: e.target.value })} className="w-full text-sm px-3 py-2.5 border border-gray-200 rounded-lg bg-white">
              <option value="">—</option>
              {vehicleItems.map((v: any) => <option key={v.id} value={v.id}>{v.plateNumber} ({v.type})</option>)}
            </select>
          </label>
          <label className="block">
            <span className="block text-xs font-semibold text-gray-600 mb-1">Driver</span>
            <select value={form.driverId} onChange={(e) => setForm({ ...form, driverId: e.target.value })} className="w-full text-sm px-3 py-2.5 border border-gray-200 rounded-lg bg-white">
              <option value="">—</option>
              {driverItems.map((d: any) => <option key={d.id} value={d.id}>{d.firstName} {d.lastName}</option>)}
            </select>
          </label>
          <label className="block col-span-2">
            <span className="block text-xs font-semibold text-gray-600 mb-1">Notes</span>
            <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={3} className="w-full text-sm px-3 py-2.5 border border-gray-200 rounded-lg resize-none" />
          </label>
        </div>
        <div className="flex justify-end pt-2">
          <button onClick={save} disabled={update.isPending} className="flex items-center gap-2 px-4 py-2 text-sm bg-brand-500 text-white rounded-lg disabled:opacity-50">
            {update.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save route
          </button>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-red-100 p-5">
        <h3 className="text-sm font-bold text-red-700 inline-flex items-center gap-2"><Trash2 className="h-4 w-4" /> Archive route</h3>
        <p className="text-xs text-gray-500 my-2">Hides the route from active operations.</p>
        <button onClick={archive} className="px-4 py-2 text-sm bg-red-50 hover:bg-red-100 text-red-600 rounded-lg">Archive</button>
      </div>
    </div>
  );
}

function Input({ label, value, onChange, full, type = 'text' }: { label: string; value: string; onChange: (v: string) => void; full?: boolean; type?: string }) {
  return (
    <label className={cn('block', full && 'col-span-2')}>
      <span className="block text-xs font-semibold text-gray-600 mb-1">{label}</span>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)} className="w-full text-sm px-3 py-2.5 border border-gray-200 rounded-lg outline-none focus:border-brand-400" />
    </label>
  );
}

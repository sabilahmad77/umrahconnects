'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft, Loader2, AlertCircle, Bus, Save, Edit3, Trash2,
  UserPlus, X, Calendar, Wallet, Wrench, Settings as SettingsIcon,
  ListChecks,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useVehicle, useUpdateVehicle, useDeleteVehicle, useAssignDriverToVehicle, useUnassignDriverFromVehicle } from '@/hooks/use-transport';
import { useTransportDrivers } from '@/hooks/use-api';

const VEHICLE_TYPES = ['BUS_LARGE', 'BUS_MEDIUM', 'VAN', 'SEDAN', 'SUV', 'COACH'];
const VEHICLE_STATUSES = ['AVAILABLE', 'BOOKED', 'IN_SERVICE', 'UNDER_MAINTENANCE', 'INACTIVE'];

type TabKey = 'overview' | 'edit' | 'drivers' | 'assignments';

export function VehicleDetail({ id }: { id: string }) {
  const router = useRouter();
  const { data: v, isLoading, error, refetch } = useVehicle(id);
  const [tab, setTab] = useState<TabKey>('overview');

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20 text-gray-400 text-sm">
        <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading vehicle…
      </div>
    );
  }
  if (error || !v) {
    return (
      <div className="py-20 text-center bg-white rounded-2xl border border-gray-100">
        <AlertCircle className="h-10 w-10 mx-auto mb-3 text-red-400 opacity-60" />
        <p className="text-sm text-red-500">Vehicle not found</p>
        <Link href="/transport" className="text-xs text-brand-500 hover:underline mt-3 inline-block">← Back to transport</Link>
      </div>
    );
  }

  return (
    <div className="space-y-5 pb-10">
      <div className="flex items-center gap-3 flex-wrap">
        <button onClick={() => router.push('/transport')} className="p-2 rounded-xl border border-gray-200 hover:bg-gray-50">
          <ArrowLeft className="h-4 w-4 text-gray-500" />
        </button>
        <div className="w-12 h-12 rounded-xl bg-purple-50 flex items-center justify-center">
          <Bus className="h-6 w-6 text-purple-600" />
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-bold text-gray-900 truncate">{v.name ?? v.plateNumber}</h1>
          <p className="text-sm text-gray-500">
            {v.brand ?? ''} {v.model ?? ''} {v.year ? `· ${v.year}` : ''} · Plate: {v.plateNumber}
          </p>
        </div>
        <StatusBadge status={v.status} />
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 p-1.5 flex gap-1 overflow-x-auto">
        {(['overview', 'drivers', 'assignments', 'edit'] as TabKey[]).map((t) => (
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

      {tab === 'overview' && <Overview v={v} />}
      {tab === 'drivers' && <DriversTab vehicle={v} refetch={refetch} />}
      {tab === 'assignments' && <AssignmentsTab vehicle={v} />}
      {tab === 'edit' && <EditTab vehicle={v} refetch={refetch} />}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const color = status === 'AVAILABLE' ? 'bg-green-50 text-green-700' :
    status === 'BOOKED' ? 'bg-blue-50 text-blue-700' :
    status === 'UNDER_MAINTENANCE' ? 'bg-yellow-50 text-yellow-700' :
    status === 'INACTIVE' ? 'bg-gray-100 text-gray-500' :
    'bg-blue-50 text-blue-700';
  return <span className={cn('text-[11px] font-medium px-2 py-1 rounded-full', color)}>{status?.replace(/_/g, ' ')}</span>;
}

function Overview({ v }: { v: any }) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <div className="bg-white rounded-2xl border border-gray-100 p-5 lg:col-span-2 space-y-3">
        <h3 className="text-sm font-bold text-gray-900 inline-flex items-center gap-2"><ListChecks className="h-4 w-4" /> Vehicle details</h3>
        <dl className="grid grid-cols-2 gap-3 text-sm">
          <Field label="Plate" value={v.plateNumber} />
          <Field label="Registration #" value={v.registrationNumber ?? '—'} />
          <Field label="Type" value={v.type} />
          <Field label="Brand & Model" value={`${v.brand ?? '—'} / ${v.model ?? '—'}`} />
          <Field label="Year" value={v.year ?? '—'} />
          <Field label="Total seats" value={v.capacity} />
          <Field label="Booked seats" value={v.bookedSeats ?? 0} />
          <Field label="Available seats" value={v.capacity - (v.bookedSeats ?? 0)} />
          <Field label="Luggage capacity" value={v.luggageCapacity ?? '—'} />
          <Field label="A/C" value={v.hasAc ? 'Yes' : 'No'} />
          <Field label="Licensed for Hajj" value={v.licensedForHajj ? 'Yes' : 'No'} />
          <Field label="Saudi license #" value={v.saudiLicenseNo ?? '—'} />
        </dl>

        {v.features?.length > 0 && (
          <div className="pt-3 border-t border-gray-50">
            <p className="text-xs font-semibold text-gray-600 mb-2">Features</p>
            <div className="flex flex-wrap gap-2">
              {v.features.map((f: string) => (
                <span key={f} className="text-xs bg-gray-100 text-gray-700 px-2 py-1 rounded-full">{f}</span>
              ))}
            </div>
          </div>
        )}

        {v.notes && (
          <div className="pt-3 border-t border-gray-50">
            <p className="text-xs font-semibold text-gray-600 mb-1">Notes</p>
            <p className="text-sm text-gray-700 whitespace-pre-wrap">{v.notes}</p>
          </div>
        )}
      </div>

      <div className="space-y-3">
        <div className="bg-white rounded-2xl border border-gray-100 p-5">
          <p className="text-xs font-semibold text-gray-500 mb-2 inline-flex items-center gap-1"><Wallet className="h-3.5 w-3.5" /> Recent assignments</p>
          {(v.assignments ?? []).length === 0 ? (
            <p className="text-xs text-gray-400">No assignments yet</p>
          ) : (
            <ul className="space-y-1.5 text-xs">
              {(v.assignments ?? []).slice(0, 5).map((a: any) => (
                <li key={a.id}>
                  <p className="font-medium text-gray-800">{a.route?.name ?? a.customerName ?? '—'}</p>
                  <p className="text-[11px] text-gray-400">{new Date(a.scheduledAt).toLocaleString()}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
        {v.tasreehPermits && v.tasreehPermits.length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-100 p-5">
            <p className="text-xs font-semibold text-gray-500 mb-2">Tasreeh permits</p>
            <ul className="text-xs space-y-1">
              {v.tasreehPermits.map((p: any) => (
                <li key={p.id}>
                  <span className="font-medium text-gray-800">{p.permitNumber}</span> · {p.zone} · expires {new Date(p.expiresAt).toLocaleDateString()}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
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

function DriversTab({ vehicle, refetch }: { vehicle: any; refetch: () => void }) {
  const { data: drivers } = useTransportDrivers({ limit: 100 });
  const assign = useAssignDriverToVehicle();
  const unassign = useUnassignDriverFromVehicle();
  const [selected, setSelected] = useState('');
  const driverItems = drivers?.items ?? [];
  const assigned = vehicle.drivers ?? [];

  return (
    <div className="space-y-3">
      <div className="bg-white rounded-2xl border border-gray-100 p-5">
        <h3 className="text-sm font-bold text-gray-900 mb-3 inline-flex items-center gap-2">
          <UserPlus className="h-4 w-4" /> Assign driver
        </h3>
        <div className="flex flex-col sm:flex-row gap-2">
          <select value={selected} onChange={(e) => setSelected(e.target.value)} className="flex-1 text-sm px-3 py-2.5 border border-gray-200 rounded-lg bg-white">
            <option value="">Select driver…</option>
            {driverItems.map((d: any) => (
              <option key={d.id} value={d.id}>{d.firstName} {d.lastName} — {d.phone}</option>
            ))}
          </select>
          <button
            disabled={!selected || assign.isPending}
            onClick={async () => {
              try {
                await assign.mutateAsync({ vehicleId: vehicle.id, driverId: selected, isPrimary: true });
                toast.success('Driver assigned');
                setSelected('');
                refetch();
              } catch (e: any) {
                toast.error(e?.response?.data?.error?.message ?? 'Failed');
              }
            }}
            className="flex items-center gap-2 px-4 py-2.5 text-sm bg-brand-500 text-white rounded-lg disabled:opacity-50"
          >
            {assign.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />} Assign
          </button>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100">
        <div className="p-4 border-b border-gray-100">
          <h3 className="text-sm font-bold text-gray-900">Assigned drivers ({assigned.length})</h3>
        </div>
        <ul className="divide-y divide-gray-50">
          {assigned.length === 0 ? (
            <li className="p-6 text-center text-sm text-gray-400">No drivers assigned</li>
          ) : (
            assigned.map((ad: any) => (
              <li key={ad.driverId} className="flex items-center justify-between p-4">
                <Link href={`/transport/drivers/${ad.driver.id}`} className="flex items-center gap-3 hover:underline">
                  <div className="w-10 h-10 rounded-full bg-purple-50 flex items-center justify-center text-purple-700 font-semibold">
                    {(ad.driver.firstName?.[0] ?? '?').toUpperCase()}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-900">{ad.driver.firstName} {ad.driver.lastName}</p>
                    <p className="text-[11px] text-gray-400">{ad.driver.phone}</p>
                  </div>
                </Link>
                <div className="flex items-center gap-2">
                  {ad.isPrimary && <span className="text-[11px] font-medium text-brand-700 bg-brand-50 px-2 py-1 rounded-full">Primary</span>}
                  <button
                    onClick={async () => {
                      if (!confirm('Unassign this driver?')) return;
                      await unassign.mutateAsync({ vehicleId: vehicle.id, driverId: ad.driverId });
                      toast.success('Driver unassigned');
                      refetch();
                    }}
                    className="p-1.5 rounded hover:bg-red-50 text-red-500"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </li>
            ))
          )}
        </ul>
      </div>
    </div>
  );
}

function AssignmentsTab({ vehicle }: { vehicle: any }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100">
      <div className="p-4 border-b border-gray-100">
        <h3 className="text-sm font-bold text-gray-900">Assignments history ({vehicle.assignments?.length ?? 0})</h3>
      </div>
      {(vehicle.assignments ?? []).length === 0 ? (
        <div className="py-10 text-center text-sm text-gray-400">No assignments yet</div>
      ) : (
        <ul className="divide-y divide-gray-50">
          {vehicle.assignments.map((a: any) => (
            <li key={a.id} className="p-4 text-sm">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-gray-900">{a.route?.name ?? a.customerName ?? '—'}</p>
                  <p className="text-[11px] text-gray-400">Scheduled: {new Date(a.scheduledAt).toLocaleString()}</p>
                </div>
                <span className={cn('text-[11px] font-medium px-2 py-1 rounded-full',
                  a.status === 'COMPLETED' ? 'bg-green-50 text-green-700' :
                  a.status === 'IN_PROGRESS' ? 'bg-orange-50 text-orange-700' :
                  a.status === 'CANCELLED' ? 'bg-gray-100 text-gray-500' :
                  'bg-blue-50 text-blue-700'
                )}>{a.status}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function EditTab({ vehicle, refetch }: { vehicle: any; refetch: () => void }) {
  const router = useRouter();
  const update = useUpdateVehicle();
  const remove = useDeleteVehicle();

  const [form, setForm] = useState({
    name: vehicle.name ?? '',
    brand: vehicle.brand ?? '',
    model: vehicle.model ?? '',
    year: vehicle.year ?? '',
    type: vehicle.type ?? 'BUS_LARGE',
    plateNumber: vehicle.plateNumber ?? '',
    registrationNumber: vehicle.registrationNumber ?? '',
    capacity: vehicle.capacity ?? 1,
    luggageCapacity: vehicle.luggageCapacity ?? '',
    hasAc: vehicle.hasAc ?? true,
    status: vehicle.status ?? 'AVAILABLE',
    features: (vehicle.features ?? []).join(', '),
    notes: vehicle.notes ?? '',
  });

  const save = async () => {
    try {
      await update.mutateAsync({
        id: vehicle.id,
        ...form,
        capacity: Number(form.capacity),
        luggageCapacity: form.luggageCapacity ? Number(form.luggageCapacity) : null,
        year: form.year ? Number(form.year) : null,
        features: form.features.split(',').map((s: string) => s.trim()).filter(Boolean),
      });
      toast.success('Vehicle saved');
      refetch();
    } catch (e: any) {
      toast.error(e?.response?.data?.error?.message ?? 'Failed');
    }
  };

  const archive = async () => {
    if (!confirm('Archive this vehicle? You can re-activate it later.')) return;
    await remove.mutateAsync(vehicle.id);
    toast.success('Vehicle archived');
    router.push('/transport');
  };

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="bg-white rounded-2xl border border-gray-100 p-5 space-y-3">
        <h3 className="text-sm font-bold text-gray-900 inline-flex items-center gap-2">
          <Edit3 className="h-4 w-4" /> Edit vehicle
        </h3>
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Name">
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="input" />
          </FormField>
          <FormField label="Plate number">
            <input value={form.plateNumber} onChange={(e) => setForm({ ...form, plateNumber: e.target.value })} className="input" />
          </FormField>
          <FormField label="Registration #">
            <input value={form.registrationNumber} onChange={(e) => setForm({ ...form, registrationNumber: e.target.value })} className="input" />
          </FormField>
          <FormField label="Type">
            <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} className="input bg-white">
              {VEHICLE_TYPES.map((t) => <option key={t} value={t}>{t.replace('_', ' ')}</option>)}
            </select>
          </FormField>
          <FormField label="Brand">
            <input value={form.brand} onChange={(e) => setForm({ ...form, brand: e.target.value })} className="input" />
          </FormField>
          <FormField label="Model">
            <input value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} className="input" />
          </FormField>
          <FormField label="Year">
            <input value={form.year} onChange={(e) => setForm({ ...form, year: e.target.value })} type="number" className="input" />
          </FormField>
          <FormField label="Capacity">
            <input value={form.capacity} onChange={(e) => setForm({ ...form, capacity: e.target.value as any })} type="number" min="1" className="input" />
          </FormField>
          <FormField label="Luggage capacity">
            <input value={form.luggageCapacity} onChange={(e) => setForm({ ...form, luggageCapacity: e.target.value as any })} type="number" className="input" />
          </FormField>
          <FormField label="Status">
            <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} className="input bg-white">
              {VEHICLE_STATUSES.map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
            </select>
          </FormField>
          <FormField label="A/C">
            <select value={String(form.hasAc)} onChange={(e) => setForm({ ...form, hasAc: e.target.value === 'true' })} className="input bg-white">
              <option value="true">Yes</option>
              <option value="false">No</option>
            </select>
          </FormField>
          <FormField label="Features (comma-separated)" full>
            <input value={form.features} onChange={(e) => setForm({ ...form, features: e.target.value })} className="input" placeholder="WiFi, Recliner, USB" />
          </FormField>
          <FormField label="Notes" full>
            <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={3} className="input resize-none" />
          </FormField>
        </div>
        <div className="flex justify-end pt-2">
          <button onClick={save} disabled={update.isPending} className="flex items-center gap-2 px-4 py-2 text-sm bg-brand-500 text-white rounded-lg disabled:opacity-50">
            {update.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save vehicle
          </button>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-red-100 p-5">
        <h3 className="text-sm font-bold text-red-700 inline-flex items-center gap-2"><Trash2 className="h-4 w-4" /> Archive vehicle</h3>
        <p className="text-xs text-gray-500 my-2">Hides the vehicle from active fleet. Past assignments are preserved.</p>
        <button onClick={archive} className="px-4 py-2 text-sm bg-red-50 hover:bg-red-100 text-red-600 rounded-lg">Archive</button>
      </div>

      <style jsx>{`
        :global(.input) { width: 100%; font-size: 14px; padding: 10px 12px; border: 1px solid #e5e7eb; border-radius: 8px; outline: none; }
        :global(.input:focus) { border-color: #d4831a; box-shadow: 0 0 0 2px #fef3e6; }
      `}</style>
    </div>
  );
}

function FormField({ label, children, full = false }: { label: string; children: React.ReactNode; full?: boolean }) {
  return (
    <label className={cn('block', full && 'col-span-2')}>
      <span className="block text-xs font-semibold text-gray-600 mb-1">{label}</span>
      {children}
    </label>
  );
}

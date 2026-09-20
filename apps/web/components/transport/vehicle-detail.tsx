'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Bus, Pencil, Trash2, UserPlus, ShieldCheck, ListChecks } from 'lucide-react';
import { toast } from 'sonner';
import { apiErrorMessage } from '@/lib/api-error';
import { Alert, Button, Checkbox, Input, LoadingState, QueryFailure, Select } from '@/components/ui/system';
import { tablistKeys } from '@/components/ui/tablist';
import { ConfirmDialog, type ConfirmSpec } from '@/components/ui/confirm-dialog';
import { useCapabilities } from '@/hooks/use-capabilities';
import {
  useAssignDriverToVehicle, useCreateTasreeh, useDeleteVehicle, useDriverList, useUnassignDriverFromVehicle, useVehicle,
} from '@/hooks/use-transport';
import { ReadOnlyNotice } from '@/components/dashboard/read-only-notice';
import { dateTime, humanize, shortDate } from '@/components/dashboard/workflow-ui';
import { FormField } from '@/components/hotels/hotel-form';
import { cn } from '@/lib/utils';
import { VehicleFormModal } from './fleet-forms';
import { StatusPill, VEHICLE_TONE } from './transport-tabs';
import { TripStatusBadge, driverUsable } from './trip-shared';

type TabKey = 'overview' | 'drivers' | 'trips' | 'permits';
const TAB_LABEL: Record<TabKey, string> = { overview: 'Overview', drivers: 'Drivers', trips: 'Trips', permits: 'Tasreeh permits' };
const ZONES = ['MAKKAH', 'MINA', 'ARAFAT', 'MUZDALIFAH', 'MADINAH'];

export function VehicleDetail({ id }: { id: string }) {
  const router = useRouter();
  const { data: v, isLoading, error, refetch } = useVehicle(id);
  const { ready, can } = useCapabilities();
  const canManage = can('transport:vehicle:manage');
  const remove = useDeleteVehicle();
  const [tab, setTab] = useState<TabKey>('overview');
  const [editing, setEditing] = useState(false);
  const [confirm, setConfirm] = useState<ConfirmSpec | null>(null);

  if (error) return <QueryFailure error={error} onRetry={() => refetch()} />;
  if (isLoading || !v) return <LoadingState label="Loading vehicle…" />;
  const archived = v.isActive === false || v.status === 'INACTIVE';

  return (
    <div className="space-y-5 pb-10">
      <div className="flex items-center gap-3 flex-wrap">
        <Button variant="quiet" type="button" aria-label="Back to vehicles" onClick={() => router.push('/transport/vehicles')} className="p-2 rounded-xl border border-gray-200 hover:bg-gray-50"><ArrowLeft className="h-4 w-4 text-gray-600" /></Button>
        <div className="w-12 h-12 rounded-xl bg-purple-50 flex items-center justify-center"><Bus className="h-6 w-6 text-purple-600" /></div>
        <div className="flex-1 min-w-0 basis-[calc(100%_-_140px)] sm:basis-auto">
          <h1 className="text-2xl font-bold text-gray-900">{v.plateNumber}{v.name ? ` · ${v.name}` : ''}</h1>
          <p className="text-sm text-gray-600">{humanize(v.type)}{v.brand || v.model ? ` · ${[v.brand, v.model].filter(Boolean).join(' ')}` : ''}{v.year ? ` · ${v.year}` : ''}</p>
        </div>
        <StatusPill status={archived ? 'INACTIVE' : v.status} tone={VEHICLE_TONE} />
        {canManage && !archived && (
          <div className="flex gap-2">
            <Button variant="secondary" type="button" onClick={() => setEditing(true)}><Pencil className="h-4 w-4" /> Edit</Button>
            <Button variant="quiet" type="button" className="text-red-700 hover:bg-red-50" busy={remove.isPending} onClick={() => setConfirm({
              title: `Archive ${v.plateNumber}?`, body: 'The vehicle leaves the active fleet; its trips stay on record. A vehicle with open trips cannot be archived.',
              cta: 'Archive vehicle', tone: 'danger',
              failureMessage: 'The vehicle could not be archived.',
              onConfirm: async () => {
                await remove.mutateAsync(v.id); toast.success('Vehicle archived'); router.push('/transport/vehicles');
              },
            })}><Trash2 className="h-4 w-4" /> Archive</Button>
          </div>
        )}
      </div>
      {ready && !canManage && <ReadOnlyNotice>You can view this vehicle. Changes need the fleet management permission.</ReadOnlyNotice>}

      <div role="tablist" {...tablistKeys()} aria-label="Vehicle sections" className="bg-white rounded-xl border border-gray-200 p-1.5 flex gap-1 overflow-x-auto">
        {(Object.keys(TAB_LABEL) as TabKey[]).map((t) => (
          <Button variant="quiet" type="button" role="tab" aria-selected={tab === t} key={t} onClick={() => setTab(t)}
            className={cn('px-3 py-2 rounded-xl text-sm font-medium', tab === t ? 'bg-brand-50 text-brand-700 border border-brand-100' : 'text-gray-600 hover:bg-gray-50')}>{TAB_LABEL[t]}</Button>
        ))}
      </div>

      {tab === 'overview' && (
        <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
          <h2 className="text-sm font-bold text-gray-900 inline-flex items-center gap-2"><ListChecks className="h-4 w-4" /> Vehicle details</h2>
          <dl className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
            <Detail label="Seats" value={v.capacity} />
            <Detail label="Passengers on open trips" value={v.bookedSeats} />
            <Detail label="Registration #" value={v.registrationNumber || '—'} />
            <Detail label="Luggage capacity" value={v.luggageCapacity ?? '—'} />
            <Detail label="Air-conditioned" value={v.hasAc ? 'Yes' : 'No'} />
            <Detail label="Licensed for Hajj" value={v.licensedForHajj ? 'Yes' : 'No'} />
            <Detail label="Saudi licence #" value={v.saudiLicenseNo || '—'} />
          </dl>
          {(v.features ?? []).length > 0 && <div className="flex flex-wrap gap-2 pt-2 border-t border-gray-100">{v.features.map((f: string) => <span key={f} className="text-xs bg-gray-100 text-gray-700 px-2 py-1 rounded-full">{f}</span>)}</div>}
          {v.notes && <p className="text-sm text-gray-700 whitespace-pre-wrap pt-2 border-t border-gray-100">{v.notes}</p>}
          <p className="text-xs text-gray-600">Seat counts and in-service status follow the trips; they are not typed in.</p>
        </div>
      )}
      {tab === 'drivers' && <DriversTab vehicle={v} canManage={canManage && !archived} />}
      {tab === 'trips' && (
        <div className="bg-white rounded-xl border border-gray-200">
          <div className="p-4 border-b border-gray-200 flex items-center justify-between"><h2 className="text-sm font-bold text-gray-900">Latest trips</h2><Link href="/transport/assignments" className="text-xs font-semibold text-brand-700 hover:underline">All trips →</Link></div>
          {(v.assignments ?? []).length === 0 ? <p className="py-10 text-center text-sm text-gray-600">No trips for this vehicle yet.</p> : (
            <ul className="divide-y divide-gray-100">
              {v.assignments.map((a: any) => (
                <li key={a.id} className="p-4 flex items-center justify-between gap-3 text-sm">
                  <div><p className="font-medium text-gray-900">{a.route?.name ?? a.customerName ?? 'Private transfer'}</p><p className="text-xs text-gray-600">{dateTime(a.scheduledAt)} · {a.passengerCount} pax</p></div>
                  <TripStatusBadge status={a.status} />
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {tab === 'permits' && <PermitsTab vehicle={v} canManage={can('transport:tasreeh:manage') && !archived} />}

      {editing && <VehicleFormModal vehicle={v} onClose={() => setEditing(false)} />}
      {confirm && <ConfirmDialog spec={confirm} onClose={() => setConfirm(null)} />}
    </div>
  );
}

function Detail({ label, value }: { label: string; value: React.ReactNode }) {
  return <div><dt className="text-xs font-semibold text-gray-600">{label}</dt><dd className="text-sm text-gray-900 font-medium">{value}</dd></div>;
}

function DriversTab({ vehicle, canManage }: { vehicle: any; canManage: boolean }) {
  const drivers = useDriverList({ limit: 100 });
  const assign = useAssignDriverToVehicle();
  const unassign = useUnassignDriverFromVehicle();
  const [selected, setSelected] = useState('');
  const [primary, setPrimary] = useState(true);
  const [confirm, setConfirm] = useState<ConfirmSpec | null>(null);
  const assigned = vehicle.drivers ?? [];
  const assignedIds = new Set(assigned.map((d: any) => d.driverId));
  const options = (drivers.data?.items ?? []).filter((d: any) => driverUsable(d) && !assignedIds.has(d.id));

  const doAssign = async (driverId: string, isPrimary: boolean, msg: string) => {
    try { await assign.mutateAsync({ vehicleId: vehicle.id, driverId, isPrimary }); toast.success(msg); setSelected(''); }
    catch (e) { toast.error(apiErrorMessage(e, 'The driver could not be assigned.')); }
  };

  return (
    <div className="space-y-3">
      {canManage && (
        <form className="bg-white rounded-xl border border-gray-200 p-5" onSubmit={(e) => { e.preventDefault(); if (selected) doAssign(selected, primary, 'Driver assigned'); }}>
          <h2 className="text-sm font-bold text-gray-900 mb-3 inline-flex items-center gap-2"><UserPlus className="h-4 w-4" /> Assign a driver</h2>
          {drivers.error ? <QueryFailure error={drivers.error} onRetry={() => drivers.refetch()} /> : (
            <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
              <Select aria-label="Driver to assign" value={selected} onChange={(e) => setSelected(e.target.value)} className="flex-1">
                <option value="">{drivers.isLoading ? 'Loading drivers…' : options.length ? 'Choose an active driver…' : 'No other active drivers'}</option>
                {options.map((d: any) => <option key={d.id} value={d.id}>{d.firstName} {d.lastName} — {d.phone}</option>)}
              </Select>
              <label className="flex items-center gap-2 text-sm"><Checkbox checked={primary} onChange={(e) => setPrimary(e.target.checked)} /> Primary driver</label>
              <Button type="submit" busy={assign.isPending} disabled={!selected}>Assign</Button>
            </div>
          )}
        </form>
      )}
      <div className="bg-white rounded-xl border border-gray-200">
        <div className="p-4 border-b border-gray-200"><h2 className="text-sm font-bold text-gray-900">Assigned drivers ({assigned.length})</h2></div>
        {assigned.length === 0 ? <p className="p-6 text-center text-sm text-gray-600">No drivers assigned.</p> : (
          <ul className="divide-y divide-gray-100">
            {assigned.map((ad: any) => (
              <li key={ad.driverId} className="flex items-center justify-between gap-3 p-4">
                <Link href={`/transport/drivers/${ad.driver.id}`} className="text-sm font-medium text-brand-700 hover:underline">{ad.driver.firstName} {ad.driver.lastName}<span className="block text-xs text-gray-600 font-normal">{ad.driver.phone}</span></Link>
                <div className="flex items-center gap-2">
                  {ad.isPrimary ? <span className="text-xs font-medium text-brand-700 bg-brand-50 px-2 py-1 rounded-full">Primary</span>
                    : canManage && <Button variant="quiet" type="button" className="text-xs text-brand-700 hover:underline" onClick={() => doAssign(ad.driverId, true, 'Primary driver changed')}>Make primary</Button>}
                  {canManage && (
                    <Button variant="quiet" type="button" className="text-xs text-red-700 hover:underline" onClick={() => setConfirm({
                      title: `Unassign ${ad.driver.firstName}?`, body: 'The driver is no longer linked to this vehicle. Trips already scheduled keep their driver.', cta: 'Unassign', tone: 'danger',
                      failureMessage: 'The driver could not be unassigned.',
                      onConfirm: async () => {
                        await unassign.mutateAsync({ vehicleId: vehicle.id, driverId: ad.driverId }); toast.success('Driver unassigned');
                      },
                    })}>Unassign</Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
      {confirm && <ConfirmDialog spec={confirm} onClose={() => setConfirm(null)} />}
    </div>
  );
}

function PermitsTab({ vehicle, canManage }: { vehicle: any; canManage: boolean }) {
  const create = useCreateTasreeh();
  const [form, setForm] = useState({ permitNumber: '', zone: 'MAKKAH', issueDate: '', expiryDate: '' });
  const [touched, setTouched] = useState(false);
  const [serverError, setServerError] = useState('');
  const permits = vehicle.tasreehPermits ?? [];
  const errors: Record<string, string> = {};
  if (!form.permitNumber.trim()) errors.permitNumber = 'Enter the permit number.';
  if (!form.expiryDate) errors.expiryDate = 'Enter the expiry date.';
  else if (form.issueDate && form.expiryDate < form.issueDate) errors.expiryDate = 'Expiry must be after the issue date.';
  const save = async () => {
    setTouched(true);
    if (Object.keys(errors).length || create.isPending) return;
    setServerError('');
    try {
      await create.mutateAsync({ vehicleId: vehicle.id, permitNumber: form.permitNumber.trim(), zone: form.zone, issueDate: form.issueDate || undefined, expiryDate: form.expiryDate });
      toast.success('Permit recorded');
      setForm({ permitNumber: '', zone: 'MAKKAH', issueDate: '', expiryDate: '' });
      setTouched(false);
    } catch (e) {
      setServerError(apiErrorMessage(e, 'The permit could not be recorded.'));
    }
  };
  const err = touched ? errors : {};
  return (
    <div className="space-y-3">
      <div className="bg-white rounded-xl border border-gray-200">
        <div className="p-4 border-b border-gray-200"><h2 className="text-sm font-bold text-gray-900 inline-flex items-center gap-2"><ShieldCheck className="h-4 w-4" /> Tasreeh permits</h2></div>
        {permits.length === 0 ? <p className="p-6 text-center text-sm text-gray-600">No permits recorded for this vehicle.</p> : (
          <ul className="divide-y divide-gray-100">
            {permits.map((p: any) => {
              const expired = new Date(p.expiresAt).getTime() < Date.now();
              return (
                <li key={p.id} className="p-4 flex items-center justify-between text-sm">
                  <span className="font-medium text-gray-900">{p.permitNumber} · {humanize(p.zone)}</span>
                  <span className={cn('text-xs', expired ? 'text-red-700 font-semibold' : 'text-gray-600')}>{expired ? 'Expired' : 'Valid to'} {shortDate(p.expiresAt)}</span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      {canManage ? (
        <form noValidate onSubmit={(e) => { e.preventDefault(); save(); }} className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
          <h2 className="text-sm font-bold text-gray-900">Record a permit</h2>
          {serverError && <Alert title={serverError} />}
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <FormField label="Permit number *" error={err.permitNumber}>{(p) => <Input {...p} value={form.permitNumber} onChange={(e) => setForm((f) => ({ ...f, permitNumber: e.target.value }))} />}</FormField>
            <FormField label="Zone">{(p) => <Select {...p} value={form.zone} onChange={(e) => setForm((f) => ({ ...f, zone: e.target.value }))}>{ZONES.map((z) => <option key={z} value={z}>{humanize(z)}</option>)}</Select>}</FormField>
            <FormField label="Issued">{(p) => <Input {...p} type="date" value={form.issueDate} onChange={(e) => setForm((f) => ({ ...f, issueDate: e.target.value }))} />}</FormField>
            <FormField label="Expires *" error={err.expiryDate}>{(p) => <Input {...p} type="date" value={form.expiryDate} onChange={(e) => setForm((f) => ({ ...f, expiryDate: e.target.value }))} />}</FormField>
          </div>
          <div className="flex justify-end"><Button type="submit" busy={create.isPending}>Record permit</Button></div>
        </form>
      ) : (
        <ReadOnlyNotice>Recording Tasreeh permits needs the permit management permission.</ReadOnlyNotice>
      )}
    </div>
  );
}

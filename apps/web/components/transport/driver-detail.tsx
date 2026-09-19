'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Pencil, Trash2, ListChecks } from 'lucide-react';
import { toast } from 'sonner';
import { apiErrorMessage } from '@/lib/api-error';
import { Button, LoadingState, QueryFailure } from '@/components/ui/system';
import { ConfirmDialog, type ConfirmSpec } from '@/components/ui/confirm-dialog';
import { useCapabilities } from '@/hooks/use-capabilities';
import { useDeleteDriver, useDriver } from '@/hooks/use-transport';
import { ReadOnlyNotice } from '@/components/dashboard/read-only-notice';
import { dateTime } from '@/components/dashboard/workflow-ui';
import { DriverFormModal } from './fleet-forms';
import { DRIVER_TONE, StatusPill, licenceNote } from './transport-tabs';
import { TripStatusBadge } from './trip-shared';

export function DriverDetail({ id }: { id: string }) {
  const router = useRouter();
  const { data: d, isLoading, error, refetch } = useDriver(id);
  const { ready, can } = useCapabilities();
  const canManage = can('transport:vehicle:manage');
  const remove = useDeleteDriver();
  const [editing, setEditing] = useState(false);
  const [confirm, setConfirm] = useState<ConfirmSpec | null>(null);

  if (error) return <QueryFailure error={error} onRetry={() => refetch()} />;
  if (isLoading || !d) return <LoadingState label="Loading driver…" />;
  const name = `${d.firstName ?? ''} ${d.lastName ?? ''}`.trim();
  const archived = d.isActive === false || d.status === 'INACTIVE';
  const lic = licenceNote(d.licenseExpiry);

  return (
    <div className="space-y-5 pb-10">
      <div className="flex items-center gap-3 flex-wrap">
        <Button variant="quiet" type="button" aria-label="Back to drivers" onClick={() => router.push('/transport/drivers')} className="p-2 rounded-xl border border-gray-200 hover:bg-gray-50"><ArrowLeft className="h-4 w-4 text-gray-600" /></Button>
        <div className="w-12 h-12 rounded-xl bg-blue-50 flex items-center justify-center text-blue-700 font-bold">{name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()}</div>
        <div className="flex-1 min-w-0 basis-[calc(100%_-_140px)] sm:basis-auto">
          <h1 className="text-2xl font-bold text-gray-900">{name}</h1>
          <p className="text-sm text-gray-600">{d.phone}{d.email ? ` · ${d.email}` : ''}</p>
        </div>
        <StatusPill status={archived ? 'INACTIVE' : d.status} tone={DRIVER_TONE} />
        {canManage && !archived && (
          <div className="flex gap-2">
            <Button variant="secondary" type="button" onClick={() => setEditing(true)}><Pencil className="h-4 w-4" /> Edit</Button>
            <Button variant="quiet" type="button" className="text-red-700 hover:bg-red-50" busy={remove.isPending} onClick={() => setConfirm({
              title: `Archive ${name}?`, body: 'The driver leaves the active roster; trip history stays. A driver with open trips cannot be archived.', cta: 'Archive driver', tone: 'danger',
              onConfirm: async () => {
                try { await remove.mutateAsync(d.id); toast.success('Driver archived'); router.push('/transport/drivers'); }
                catch (e) { toast.error(apiErrorMessage(e, 'The driver could not be archived.')); }
              },
            })}><Trash2 className="h-4 w-4" /> Archive</Button>
          </div>
        )}
      </div>
      {ready && !canManage && <ReadOnlyNotice>You can view this driver. Changes need the fleet management permission.</ReadOnlyNotice>}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-5 lg:col-span-2 space-y-3">
          <h2 className="text-sm font-bold text-gray-900 inline-flex items-center gap-2"><ListChecks className="h-4 w-4" /> Driver details</h2>
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <Detail label="Nationality" value={d.nationality || '—'} />
            <Detail label="ID / Iqama #" value={d.idNumber || '—'} />
            <Detail label="Licence #" value={d.licenseNumber || '—'} />
            <Detail label="Licence" value={lic ? <span className={lic.tone}>{lic.text}</span> : 'No expiry recorded'} />
            <Detail label="Languages" value={(d.languages ?? []).join(', ') || '—'} />
          </dl>
          {d.notes && <p className="text-sm text-gray-700 whitespace-pre-wrap pt-2 border-t border-gray-100">{d.notes}</p>}
        </div>
        <div className="space-y-3">
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <p className="text-xs font-semibold text-gray-600 mb-2">Vehicles</p>
            {(d.vehicles ?? []).length === 0 ? <p className="text-xs text-gray-600">Not assigned to a vehicle.</p> : (
              <ul className="space-y-1.5 text-sm">
                {d.vehicles.map((vd: any) => (
                  <li key={vd.vehicleId}><Link href={`/transport/vehicles/${vd.vehicleId}`} className="font-medium text-brand-700 hover:underline">{vd.vehicle?.plateNumber ?? 'Vehicle'}</Link>{vd.isPrimary && <span className="ml-1 text-xs text-brand-700 bg-brand-50 px-1.5 py-0.5 rounded">Primary</span>}</li>
                ))}
              </ul>
            )}
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <p className="text-xs font-semibold text-gray-600 mb-2">Latest trips</p>
            {(d.assignments ?? []).length === 0 ? <p className="text-xs text-gray-600">No trips yet.</p> : (
              <ul className="space-y-2 text-xs">
                {d.assignments.slice(0, 6).map((a: any) => (
                  <li key={a.id} className="flex items-center justify-between gap-2">
                    <span><span className="font-medium text-gray-800">{a.route?.name ?? a.customerName ?? 'Private transfer'}</span><span className="block text-gray-600">{dateTime(a.scheduledAt)}</span></span>
                    <TripStatusBadge status={a.status} />
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>

      {editing && <DriverFormModal driver={d} onClose={() => setEditing(false)} />}
      {confirm && <ConfirmDialog spec={confirm} onClose={() => setConfirm(null)} />}
    </div>
  );
}

function Detail({ label, value }: { label: string; value: React.ReactNode }) {
  return <div><dt className="text-xs font-semibold text-gray-600">{label}</dt><dd className="text-sm text-gray-900 font-medium">{value}</dd></div>;
}

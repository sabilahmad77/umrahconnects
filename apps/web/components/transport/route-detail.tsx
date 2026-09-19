'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Map as MapIcon, Pencil, Trash2, ListChecks, ArrowRight } from 'lucide-react';
import { toast } from 'sonner';
import { apiErrorMessage } from '@/lib/api-error';
import { Button, LoadingState, QueryFailure } from '@/components/ui/system';
import { ConfirmDialog, type ConfirmSpec } from '@/components/ui/confirm-dialog';
import { useCapabilities } from '@/hooks/use-capabilities';
import { useDeleteRoute, useRoute } from '@/hooks/use-transport';
import { ReadOnlyNotice } from '@/components/dashboard/read-only-notice';
import { dateTime, humanize, sar } from '@/components/dashboard/workflow-ui';
import { RouteFormModal } from './fleet-forms';
import { ROUTE_TONE, StatusPill } from './transport-tabs';
import { TripStatusBadge } from './trip-shared';

export function RouteDetail({ id }: { id: string }) {
  const router = useRouter();
  const { data: r, isLoading, error, refetch } = useRoute(id);
  const { ready, can } = useCapabilities();
  const canManage = can('transport:vehicle:manage');
  const remove = useDeleteRoute();
  const [editing, setEditing] = useState(false);
  const [confirm, setConfirm] = useState<ConfirmSpec | null>(null);

  if (error) return <QueryFailure error={error} onRetry={() => refetch()} />;
  if (isLoading || !r) return <LoadingState label="Loading route…" />;
  const left = r.totalSeats != null ? Math.max(0, r.totalSeats - r.bookedSeats) : null;

  return (
    <div className="space-y-5 pb-10">
      <div className="flex items-center gap-3 flex-wrap">
        <Button variant="quiet" type="button" aria-label="Back to routes" onClick={() => router.push('/transport/routes')} className="p-2 rounded-xl border border-gray-200 hover:bg-gray-50"><ArrowLeft className="h-4 w-4 text-gray-600" /></Button>
        <div className="w-12 h-12 rounded-xl bg-purple-50 flex items-center justify-center"><MapIcon className="h-6 w-6 text-purple-600" /></div>
        <div className="flex-1 min-w-0 basis-[calc(100%_-_140px)] sm:basis-auto">
          <h1 className="text-2xl font-bold text-gray-900">{r.name}</h1>
          <p className="text-sm text-gray-600 flex items-center gap-1">{r.originCity} <ArrowRight className="h-3 w-3" /> {r.destCity} · {humanize(r.movementType)}</p>
        </div>
        <StatusPill status={r.status} tone={ROUTE_TONE} />
        {canManage && r.status !== 'INACTIVE' && (
          <div className="flex gap-2">
            <Button variant="secondary" type="button" onClick={() => setEditing(true)}><Pencil className="h-4 w-4" /> Edit</Button>
            <Button variant="quiet" type="button" className="text-red-700 hover:bg-red-50" busy={remove.isPending} onClick={() => setConfirm({
              title: `Archive ${r.name}?`, body: 'The route stops selling seats; its trips stay on record. A route with open trips cannot be archived.', cta: 'Archive route', tone: 'danger',
              onConfirm: async () => {
                try { await remove.mutateAsync(r.id); toast.success('Route archived'); router.push('/transport/routes'); }
                catch (e) { toast.error(apiErrorMessage(e, 'The route could not be archived.')); }
              },
            })}><Trash2 className="h-4 w-4" /> Archive</Button>
          </div>
        )}
      </div>
      {ready && !canManage && <ReadOnlyNotice>You can view this route. Changes need the fleet management permission.</ReadOnlyNotice>}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-5 lg:col-span-2 space-y-3">
          <h2 className="text-sm font-bold text-gray-900 inline-flex items-center gap-2"><ListChecks className="h-4 w-4" /> Route details</h2>
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <Detail label="Pickup point" value={r.pickupPoint || '—'} />
            <Detail label="Drop-off point" value={r.dropoffPoint || '—'} />
            <Detail label="Departure" value={r.departureAt ? dateTime(r.departureAt) : 'On request'} />
            <Detail label="Arrival" value={r.arrivalAt ? dateTime(r.arrivalAt) : '—'} />
            <Detail label="Duration" value={r.durationMins ? `${r.durationMins} min` : '—'} />
            <Detail label="Distance" value={r.distanceKm ? `${r.distanceKm} km` : '—'} />
            <Detail label="Price per seat" value={r.pricePerSeatCents != null ? sar(r.pricePerSeatCents, r.currency) : '—'} />
            <Detail label="Price per vehicle" value={r.pricePerVehicleCents != null ? sar(r.pricePerVehicleCents, r.currency) : '—'} />
          </dl>
          {r.notes && <p className="text-sm text-gray-700 whitespace-pre-wrap pt-2 border-t border-gray-100">{r.notes}</p>}
        </div>
        <div className="space-y-3">
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <p className="text-xs font-semibold text-gray-600 mb-1">Seats</p>
            <p className="text-2xl font-bold text-gray-900">{r.bookedSeats}{r.totalSeats != null ? ` / ${r.totalSeats}` : ''}</p>
            <p className="text-xs text-gray-600">{left == null ? 'sold · no seat limit' : `sold · ${left} left`} — counted from the trips</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-1.5 text-sm">
            <p className="text-xs font-semibold text-gray-600">Runs with</p>
            {r.vehicle ? <Link href={`/transport/vehicles/${r.vehicle.id}`} className="block font-medium text-brand-700 hover:underline">{r.vehicle.plateNumber} ({r.vehicle.capacity} seats)</Link> : <p className="text-xs text-gray-600">No default vehicle</p>}
            {r.driver ? <Link href={`/transport/drivers/${r.driver.id}`} className="block font-medium text-brand-700 hover:underline">{r.driver.firstName} {r.driver.lastName}</Link> : <p className="text-xs text-gray-600">No default driver</p>}
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200">
        <div className="p-4 border-b border-gray-200 flex items-center justify-between"><h2 className="text-sm font-bold text-gray-900">Trips on this route ({r.assignments?.length ?? 0})</h2><Link href="/transport/assignments" className="text-xs font-semibold text-brand-700 hover:underline">All trips →</Link></div>
        {(r.assignments ?? []).length === 0 ? <p className="py-10 text-center text-sm text-gray-600">No trips booked on this route yet.</p> : (
          <ul className="divide-y divide-gray-100">
            {r.assignments.map((a: any) => (
              <li key={a.id} className="p-4 flex items-center justify-between gap-3 text-sm">
                <div><p className="font-medium text-gray-900">{a.customerName || 'Unnamed customer'} · {a.passengerCount} pax</p><p className="text-xs text-gray-600">{dateTime(a.scheduledAt)} · {a.vehicle?.plateNumber ?? '—'}</p></div>
                <TripStatusBadge status={a.status} />
              </li>
            ))}
          </ul>
        )}
      </div>

      {editing && <RouteFormModal route={r} onClose={() => setEditing(false)} />}
      {confirm && <ConfirmDialog spec={confirm} onClose={() => setConfirm(null)} />}
    </div>
  );
}

function Detail({ label, value }: { label: string; value: React.ReactNode }) {
  return <div><dt className="text-xs font-semibold text-gray-600">{label}</dt><dd className="text-sm text-gray-900 font-medium">{value}</dd></div>;
}

'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { apiErrorMessage } from '@/lib/api-error';
import { Alert, Button, Input, ModalSurface, QueryFailure, Select, Textarea } from '@/components/ui/system';
import { ConfirmDialog, type ConfirmSpec } from '@/components/ui/confirm-dialog';
import {
  ASSIGNMENT_INITIAL_STATUSES, BOOKABLE_ROUTE_STATUSES, CUSTOMER_TYPES, TRIP_ACTION_LABEL, fromLocalInput, toLocalInput,
  useCancelAssignment, useCreateAssignment, useDriverList, useRouteList, useUpdateAssignment, useVehicleList,
} from '@/hooks/use-transport';
import { FormField } from '@/components/hotels/hotel-form';
import { ModalFooter, ModalHeader, humanize } from '@/components/dashboard/workflow-ui';
import { cn } from '@/lib/utils';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const TRIP_TONE: Record<string, string> = {
  DRAFT: 'bg-gray-100 text-gray-700',
  SCHEDULED: 'bg-blue-50 text-blue-700',
  CONFIRMED: 'bg-brand-50 text-brand-700',
  IN_PROGRESS: 'bg-orange-50 text-orange-800',
  COMPLETED: 'bg-green-50 text-green-800',
  CANCELLED: 'bg-red-50 text-red-700',
};

export function TripStatusBadge({ status }: { status: string }) {
  return <span className={cn('text-xs font-medium px-2 py-1 rounded-full whitespace-nowrap', TRIP_TONE[status] ?? 'bg-gray-100 text-gray-700')}>{humanize(status)}</span>;
}

export const vehicleUsable = (v: any) => v.isActive !== false && !['INACTIVE', 'UNDER_MAINTENANCE'].includes(v.status);
export const driverUsable = (d: any) => d.isActive !== false && d.status !== 'INACTIVE';
export const seatsLeft = (r: any) => (r.totalSeats == null ? null : Math.max(0, r.totalSeats - (r.bookedSeats ?? 0)));

/** The moves the server allows for this trip; cancelling asks first. */
export function TripActions({ trip, onEdit }: { trip: any; onEdit?: () => void }) {
  const update = useUpdateAssignment();
  const cancel = useCancelAssignment();
  const [confirm, setConfirm] = useState<ConfirmSpec | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const move = async (to: string) => {
    setBusy(to);
    try {
      if (to === 'CANCELLED') await cancel.mutateAsync(trip.id);
      else await update.mutateAsync({ id: trip.id, status: to });
      toast.success(`Trip ${humanize(to).toLowerCase()}`);
    } catch (e) {
      toast.error(apiErrorMessage(e, 'The trip could not be updated.'));
    } finally {
      setBusy(null);
    }
  };
  const moves: string[] = trip.allowedTransitions ?? [];
  return (
    <div className="flex flex-wrap gap-1.5">
      {moves.map((to) => (
        <Button key={to} type="button" variant={to === 'CANCELLED' ? 'quiet' : 'secondary'} busy={busy === to} disabled={!!busy}
          className={cn('text-xs px-2.5 py-1 min-h-0', to === 'CANCELLED' && 'text-red-700 hover:underline')}
          onClick={() => to === 'CANCELLED'
            ? setConfirm({
                title: 'Cancel this trip?',
                body: 'The trip is closed and its seats go back to the vehicle and route. This cannot be undone.',
                cta: 'Cancel trip', tone: 'danger', onConfirm: () => move(to),
              })
            : move(to)}>
          {TRIP_ACTION_LABEL[to] ?? humanize(to)}
        </Button>
      ))}
      {onEdit && !['COMPLETED', 'CANCELLED'].includes(trip.status) && (
        <Button type="button" variant="quiet" className="text-xs px-2.5 py-1 min-h-0 text-brand-700 hover:underline" onClick={onEdit}>Edit</Button>
      )}
      {confirm && <ConfirmDialog spec={confirm} onClose={() => setConfirm(null)} />}
    </div>
  );
}

/** Create or edit a trip. Seats, clashes and availability are re-checked by the server. */
export function TripModal({ trip, onClose }: { trip?: any; onClose: () => void }) {
  const create = useCreateAssignment();
  const update = useUpdateAssignment();
  const pending = create.isPending || update.isPending;
  const vehicles = useVehicleList({ limit: 100 });
  const drivers = useDriverList({ limit: 100 });
  const routes = useRouteList({ limit: 100 });
  const underWay = trip?.status === 'IN_PROGRESS';
  const [form, setForm] = useState({
    vehicleId: trip?.vehicleId ?? '', driverId: trip?.driverId ?? '', routeId: trip?.routeId ?? '',
    scheduledAt: toLocalInput(trip?.scheduledAt), passengerCount: String(trip?.passengerCount ?? 1),
    customerType: trip?.customerType ?? 'PLATFORM_USER', customerName: trip?.customerName ?? '',
    customerPhone: trip?.customerPhone ?? '', customerEmail: trip?.customerEmail ?? '',
    pickupLocation: trip?.pickupLocation ?? '', dropoffLocation: trip?.dropoffLocation ?? '',
    price: trip ? String((trip.priceCents ?? 0) / 100) : '', status: 'SCHEDULED', notes: trip?.notes ?? '',
  });
  const [touched, setTouched] = useState(false);
  const [serverError, setServerError] = useState('');
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const vehicleOptions = (vehicles.data?.items ?? []).filter((v: any) => vehicleUsable(v) || v.id === trip?.vehicleId);
  const driverOptions = (drivers.data?.items ?? []).filter((d: any) => driverUsable(d) || d.id === trip?.driverId);
  const routeOptions = (routes.data?.items ?? []).filter((r: any) => BOOKABLE_ROUTE_STATUSES.includes(r.status) || r.id === trip?.routeId);
  const vehicle = (vehicles.data?.items ?? []).find((v: any) => v.id === form.vehicleId);
  const route = (routes.data?.items ?? []).find((r: any) => r.id === form.routeId);
  const pax = Number(form.passengerCount);
  // A trip being edited already holds its own seats on its route.
  const routeRoom = route ? (seatsLeft(route) == null ? null : seatsLeft(route)! + (trip?.routeId === route.id ? trip.passengerCount : 0)) : null;

  const errors: Record<string, string> = {};
  if (!form.vehicleId) errors.vehicleId = 'Choose the vehicle.';
  if (!form.scheduledAt || !fromLocalInput(form.scheduledAt)) errors.scheduledAt = 'Choose the pickup date and time.';
  if (!/^\d+$/.test(form.passengerCount) || pax < 1 || pax > 500) errors.passengerCount = 'Between 1 and 500 passengers.';
  else if (vehicle && pax > vehicle.capacity) errors.passengerCount = `Vehicle ${vehicle.plateNumber} seats ${vehicle.capacity}.`;
  else if (routeRoom != null && pax > routeRoom) errors.passengerCount = `Only ${routeRoom} seat(s) left on this route.`;
  if (form.customerEmail && !EMAIL.test(form.customerEmail.trim())) errors.customerEmail = 'Enter a valid email address.';
  if (form.price && !/^\d+(\.\d{1,2})?$/.test(form.price)) errors.price = 'Enter an amount such as 150 or 150.50.';

  const save = async () => {
    setTouched(true);
    if (Object.keys(errors).length || pending) return;
    setServerError('');
    const body: Record<string, any> = {
      customerType: form.customerType, customerName: form.customerName.trim(), customerPhone: form.customerPhone.trim(),
      customerEmail: form.customerEmail.trim() || null, pickupLocation: form.pickupLocation.trim(),
      dropoffLocation: form.dropoffLocation.trim(), price: form.price ? Number(form.price) : 0, notes: form.notes.trim(),
    };
    if (!underWay) {
      Object.assign(body, {
        vehicleId: form.vehicleId, driverId: form.driverId || null, routeId: form.routeId || null,
        scheduledAt: fromLocalInput(form.scheduledAt), passengerCount: pax,
      });
    }
    try {
      if (trip) {
        await update.mutateAsync({ id: trip.id, ...body });
        toast.success('Trip saved');
      } else {
        await create.mutateAsync({
          ...body, status: form.status, customerEmail: body.customerEmail ?? undefined,
          driverId: body.driverId ?? undefined, routeId: body.routeId ?? undefined,
        });
        toast.success('Trip scheduled');
      }
      onClose();
    } catch (e) {
      setServerError(apiErrorMessage(e, 'The trip could not be saved.'));
    }
  };

  const err = touched ? errors : {};
  const listError = vehicles.error || drivers.error || routes.error;
  const heading = trip ? 'Edit trip' : 'New trip';
  return (
    <ModalSurface busy={pending} title={heading} onClose={onClose}>
      <form noValidate onSubmit={(e) => { e.preventDefault(); save(); }} className="bg-white rounded-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-5 shadow-xl">
        <ModalHeader title={heading} onClose={onClose} busy={pending} />
        {serverError && <div className="mb-3"><Alert title={serverError} /></div>}
        {underWay && <div className="mb-3"><Alert tone="info" title="This trip is under way: vehicle, driver, route, time and passengers are fixed until it completes." /></div>}
        {listError ? <QueryFailure error={listError} onRetry={() => { vehicles.refetch(); drivers.refetch(); routes.refetch(); }} /> : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <FormField label="Vehicle *" error={err.vehicleId}>{(p) => (
              <Select {...p} value={form.vehicleId} onChange={set('vehicleId')} disabled={underWay}>
                <option value="">{vehicles.isLoading ? 'Loading vehicles…' : 'Choose a vehicle…'}</option>
                {vehicleOptions.map((v: any) => <option key={v.id} value={v.id}>{v.plateNumber} · {humanize(v.type)} · {v.capacity} seats</option>)}
              </Select>
            )}</FormField>
            <FormField label="Driver">{(p) => (
              <Select {...p} value={form.driverId} onChange={set('driverId')} disabled={underWay}>
                <option value="">No driver yet</option>
                {driverOptions.map((d: any) => <option key={d.id} value={d.id}>{d.firstName} {d.lastName}{d.status === 'OFF_DUTY' ? ' (off duty)' : ''}</option>)}
              </Select>
            )}</FormField>
            <FormField label="Route" hint={route ? (routeRoom == null ? 'Unlimited seats' : `${routeRoom} seat(s) left`) : 'Optional — shared departures sell seats on a route'}>{(p) => (
              <Select {...p} value={form.routeId} onChange={set('routeId')} disabled={underWay}>
                <option value="">Private transfer (no route)</option>
                {routeOptions.map((r: any) => <option key={r.id} value={r.id}>{r.name} ({r.originCity} → {r.destCity}){seatsLeft(r) != null ? ` · ${seatsLeft(r)} left` : ''}</option>)}
              </Select>
            )}</FormField>
            <FormField label="Pickup date & time *" error={err.scheduledAt}>{(p) => <Input {...p} type="datetime-local" value={form.scheduledAt} onChange={set('scheduledAt')} disabled={underWay} />}</FormField>
            <FormField label="Passengers *" error={err.passengerCount}>{(p) => <Input {...p} type="number" min={1} max={500} value={form.passengerCount} onChange={set('passengerCount')} disabled={underWay} />}</FormField>
            <FormField label="Customer type">{(p) => <Select {...p} value={form.customerType} onChange={set('customerType')}>{CUSTOMER_TYPES.map((t) => <option key={t} value={t}>{humanize(t)}</option>)}</Select>}</FormField>
            <FormField label="Customer name">{(p) => <Input {...p} value={form.customerName} onChange={set('customerName')} />}</FormField>
            <FormField label="Customer phone">{(p) => <Input {...p} type="tel" value={form.customerPhone} onChange={set('customerPhone')} />}</FormField>
            <FormField label="Customer email" error={err.customerEmail}>{(p) => <Input {...p} type="email" value={form.customerEmail} onChange={set('customerEmail')} />}</FormField>
            <FormField label="Price (SAR)" error={err.price}>{(p) => <Input {...p} type="number" min={0} step="0.01" value={form.price} onChange={set('price')} />}</FormField>
            <FormField label="Pickup location">{(p) => <Input {...p} value={form.pickupLocation} onChange={set('pickupLocation')} />}</FormField>
            <FormField label="Drop-off location">{(p) => <Input {...p} value={form.dropoffLocation} onChange={set('dropoffLocation')} />}</FormField>
            {!trip && (
              <FormField label="Record as">{(p) => <Select {...p} value={form.status} onChange={set('status')}>{ASSIGNMENT_INITIAL_STATUSES.map((s) => <option key={s} value={s}>{humanize(s)}</option>)}</Select>}</FormField>
            )}
            <FormField label="Notes" full>{(p) => <Textarea {...p} rows={2} value={form.notes} onChange={set('notes')} />}</FormField>
          </div>
        )}
        <p className="text-xs text-gray-600 mt-3">Trips do not track payments: bill customers with an invoice in Finance, where the money is recorded.</p>
        <ModalFooter onClose={onClose} pending={pending} cta={trip ? 'Save trip' : 'Schedule trip'} />
      </form>
    </ModalSurface>
  );
}

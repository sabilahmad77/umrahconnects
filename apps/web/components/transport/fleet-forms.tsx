'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { apiErrorMessage } from '@/lib/api-error';
import { Alert, Checkbox, Input, ModalSurface, Select, Textarea } from '@/components/ui/system';
import {
  DRIVER_MANUAL_STATUSES, ROUTE_MANUAL_STATUSES, VEHICLE_MANUAL_STATUSES, fromLocalInput, toLocalInput,
  useCreateDriver, useCreateRoute, useCreateVehicle, useDriverList, useUpdateDriver, useUpdateRoute, useUpdateVehicle, useVehicleList,
} from '@/hooks/use-transport';
import { FormField } from '@/components/hotels/hotel-form';
import { ModalFooter, ModalHeader, humanize } from '@/components/dashboard/workflow-ui';

/*
 * Vehicle, driver and route forms (create and edit). Validation mirrors the
 * server DTOs (platform/api/src/modules/transport/dto/transport.dto.ts); the
 * server still re-checks everything, including seats and availability.
 */

// The canonical TransportType enum (checked against schema.prisma by tests/server-contracts.test.ts).
export const VEHICLE_TYPES = ['BUS_SMALL', 'BUS_MEDIUM', 'BUS_LARGE', 'VAN', 'PRIVATE_CAR'];
export const MOVEMENT_TYPES = ['AIRPORT_PICKUP', 'AIRPORT_DROPOFF', 'MAKKAH_MADINAH', 'MADINAH_MAKKAH', 'ZIYARAT', 'LOCAL', 'MASHAER_MINA', 'MASHAER_ARAFAT', 'MASHAER_MUZDALIFAH'];
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MONEY = /^\d+(\.\d{1,2})?$/;
const int = (v: string) => /^\d+$/.test(v);
const csv = (v: string) => v.split(',').map((s) => s.trim()).filter(Boolean);
/** Create payloads leave empty optional fields out; edits send them empty so they are really cleared. */
const stripEmpty = (o: Record<string, any>) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== null && v !== '' && v !== undefined));

type Change = React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>;

// ─── Vehicle ────────────────────────────────────────────────────────────
export function VehicleFormModal({ vehicle, onClose }: { vehicle?: any; onClose: () => void }) {
  const create = useCreateVehicle();
  const update = useUpdateVehicle();
  const pending = create.isPending || update.isPending;
  const [form, setForm] = useState({
    plateNumber: vehicle?.plateNumber ?? '', type: vehicle?.type ?? 'BUS_LARGE', capacity: String(vehicle?.capacity ?? ''),
    name: vehicle?.name ?? '', brand: vehicle?.brand ?? '', model: vehicle?.model ?? '', year: vehicle?.year ? String(vehicle.year) : '',
    registrationNumber: vehicle?.registrationNumber ?? '', luggageCapacity: vehicle?.luggageCapacity != null ? String(vehicle.luggageCapacity) : '',
    hasAc: vehicle?.hasAc ?? true, licensedForHajj: vehicle?.licensedForHajj ?? false, saudiLicenseNo: vehicle?.saudiLicenseNo ?? '',
    status: vehicle && VEHICLE_MANUAL_STATUSES.includes(vehicle.status) ? vehicle.status : 'AVAILABLE',
    features: (vehicle?.features ?? []).join(', '), notes: vehicle?.notes ?? '',
  });
  const [touched, setTouched] = useState(false);
  const [serverError, setServerError] = useState('');
  const set = (k: keyof typeof form) => (e: Change) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const onTrip = vehicle?.status === 'IN_SERVICE';

  const errors: Record<string, string> = {};
  if (!form.plateNumber.trim()) errors.plateNumber = 'Enter the plate number.';
  if (!int(form.capacity) || Number(form.capacity) < 1 || Number(form.capacity) > 100) errors.capacity = 'Between 1 and 100 seats.';
  if (form.year && (!int(form.year) || Number(form.year) < 1950 || Number(form.year) > 2100)) errors.year = 'A year between 1950 and 2100.';
  if (form.luggageCapacity && (!int(form.luggageCapacity) || Number(form.luggageCapacity) > 10000)) errors.luggageCapacity = 'Whole number of bags.';

  const save = async () => {
    setTouched(true);
    if (Object.keys(errors).length || pending) return;
    setServerError('');
    const body: Record<string, any> = {
      plateNumber: form.plateNumber.trim(), type: form.type, capacity: Number(form.capacity), name: form.name.trim(),
      brand: form.brand.trim(), model: form.model.trim(), year: form.year ? Number(form.year) : null,
      registrationNumber: form.registrationNumber.trim(), luggageCapacity: form.luggageCapacity ? Number(form.luggageCapacity) : null,
      hasAc: form.hasAc, features: csv(form.features), notes: form.notes.trim(),
    };
    if (!onTrip) body.status = form.status;
    try {
      if (vehicle) await update.mutateAsync({ id: vehicle.id, ...body });
      else await create.mutateAsync(stripEmpty({ ...body, licensedForHajj: form.licensedForHajj, saudiLicenseNo: form.saudiLicenseNo.trim() }));
      toast.success(vehicle ? 'Vehicle saved' : 'Vehicle added');
      onClose();
    } catch (e) {
      setServerError(apiErrorMessage(e, 'The vehicle could not be saved.'));
    }
  };
  const err = touched ? errors : {};
  const heading = vehicle ? `Edit ${vehicle.plateNumber}` : 'Add vehicle';
  return (
    <ModalSurface busy={pending} title={heading} onClose={onClose}>
      <form noValidate onSubmit={(e) => { e.preventDefault(); save(); }} className="bg-white rounded-xl w-full max-w-lg p-5 shadow-xl max-h-[90vh] overflow-y-auto">
        <ModalHeader title={heading} onClose={onClose} busy={pending} />
        {serverError && <div className="mb-3"><Alert title={serverError} /></div>}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <FormField label="Plate number *" error={err.plateNumber}>{(p) => <Input {...p} value={form.plateNumber} onChange={set('plateNumber')} placeholder="MKA-3421" />}</FormField>
          <FormField label="Type *">{(p) => <Select {...p} value={form.type} onChange={set('type')}>{VEHICLE_TYPES.map((t) => <option key={t} value={t}>{humanize(t)}</option>)}</Select>}</FormField>
          <FormField label="Seats *" error={err.capacity}>{(p) => <Input {...p} type="number" min={1} max={100} value={form.capacity} onChange={set('capacity')} />}</FormField>
          <FormField label="Display name">{(p) => <Input {...p} value={form.name} onChange={set('name')} />}</FormField>
          <FormField label="Make">{(p) => <Input {...p} value={form.brand} onChange={set('brand')} placeholder="Mercedes" />}</FormField>
          <FormField label="Model">{(p) => <Input {...p} value={form.model} onChange={set('model')} placeholder="Tourismo" />}</FormField>
          <FormField label="Year" error={err.year}>{(p) => <Input {...p} type="number" min={1950} max={2100} value={form.year} onChange={set('year')} />}</FormField>
          <FormField label="Registration number">{(p) => <Input {...p} value={form.registrationNumber} onChange={set('registrationNumber')} />}</FormField>
          <FormField label="Luggage capacity (bags)" error={err.luggageCapacity}>{(p) => <Input {...p} type="number" min={0} value={form.luggageCapacity} onChange={set('luggageCapacity')} />}</FormField>
          {onTrip ? (
            <p className="text-xs text-gray-600 self-end">Status: in service — it returns to available when the trip completes.</p>
          ) : (
            <FormField label="Status">{(p) => <Select {...p} value={form.status} onChange={set('status')}>{VEHICLE_MANUAL_STATUSES.map((s) => <option key={s} value={s}>{humanize(s)}</option>)}</Select>}</FormField>
          )}
          <label className="flex items-center gap-2 text-sm"><Checkbox checked={form.hasAc} onChange={(e) => setForm((f) => ({ ...f, hasAc: e.target.checked }))} /> Air-conditioned</label>
          {!vehicle && <label className="flex items-center gap-2 text-sm"><Checkbox checked={form.licensedForHajj} onChange={(e) => setForm((f) => ({ ...f, licensedForHajj: e.target.checked }))} /> Licensed for Hajj</label>}
          {!vehicle && <FormField label="Saudi licence number">{(p) => <Input {...p} value={form.saudiLicenseNo} onChange={set('saudiLicenseNo')} />}</FormField>}
          <FormField label="Features" hint="Separate with commas" full>{(p) => <Input {...p} value={form.features} onChange={set('features')} placeholder="WiFi, USB, reclining seats" />}</FormField>
          <FormField label="Notes" full>{(p) => <Textarea {...p} rows={2} value={form.notes} onChange={set('notes')} />}</FormField>
        </div>
        <ModalFooter onClose={onClose} pending={pending} cta={vehicle ? 'Save vehicle' : 'Add vehicle'} />
      </form>
    </ModalSurface>
  );
}

// ─── Driver ─────────────────────────────────────────────────────────────
export function DriverFormModal({ driver, onClose }: { driver?: any; onClose: () => void }) {
  const create = useCreateDriver();
  const update = useUpdateDriver();
  const pending = create.isPending || update.isPending;
  const [form, setForm] = useState({
    firstName: driver?.firstName ?? '', lastName: driver?.lastName ?? '', phone: driver?.phone ?? '', email: driver?.email ?? '',
    nationality: driver?.nationality ?? '', idNumber: driver?.idNumber ?? '', licenseNumber: driver?.licenseNumber ?? '',
    licenseExpiry: driver?.licenseExpiry?.slice(0, 10) ?? '', languages: (driver?.languages ?? []).join(', '),
    status: driver && DRIVER_MANUAL_STATUSES.includes(driver.status) ? driver.status : 'AVAILABLE', notes: driver?.notes ?? '',
  });
  const [touched, setTouched] = useState(false);
  const [serverError, setServerError] = useState('');
  const set = (k: keyof typeof form) => (e: Change) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const onTrip = driver?.status === 'ON_TRIP';

  const errors: Record<string, string> = {};
  if (!form.firstName.trim()) errors.firstName = 'Enter the first name.';
  if (!form.lastName.trim()) errors.lastName = 'Enter the last name.';
  if (!form.phone.trim()) errors.phone = 'Enter a phone number.';
  if (form.email && !EMAIL.test(form.email.trim())) errors.email = 'Enter a valid email address.';
  if (form.nationality && !/^[A-Za-z]{2}$/.test(form.nationality)) errors.nationality = 'Use the 2-letter country code.';
  if (csv(form.languages).some((l) => l.length > 10)) errors.languages = 'Use language codes such as ar, en, ur.';

  const save = async () => {
    setTouched(true);
    if (Object.keys(errors).length || pending) return;
    setServerError('');
    const body: Record<string, any> = {
      firstName: form.firstName.trim(), lastName: form.lastName.trim(), phone: form.phone.trim(), email: form.email.trim() || null,
      nationality: form.nationality.trim() || null, idNumber: form.idNumber.trim(), licenseNumber: form.licenseNumber.trim(),
      licenseExpiry: form.licenseExpiry || null, languages: csv(form.languages), notes: form.notes.trim(),
    };
    if (!onTrip) body.status = form.status;
    try {
      if (driver) await update.mutateAsync({ id: driver.id, ...body });
      else await create.mutateAsync(stripEmpty(body));
      toast.success(driver ? 'Driver saved' : 'Driver added');
      onClose();
    } catch (e) {
      setServerError(apiErrorMessage(e, 'The driver could not be saved.'));
    }
  };
  const err = touched ? errors : {};
  const heading = driver ? `Edit ${driver.firstName} ${driver.lastName}` : 'Add driver';
  return (
    <ModalSurface busy={pending} title={heading} onClose={onClose}>
      <form noValidate onSubmit={(e) => { e.preventDefault(); save(); }} className="bg-white rounded-xl w-full max-w-lg p-5 shadow-xl max-h-[90vh] overflow-y-auto">
        <ModalHeader title={heading} onClose={onClose} busy={pending} />
        {serverError && <div className="mb-3"><Alert title={serverError} /></div>}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <FormField label="First name *" error={err.firstName}>{(p) => <Input {...p} value={form.firstName} onChange={set('firstName')} />}</FormField>
          <FormField label="Last name *" error={err.lastName}>{(p) => <Input {...p} value={form.lastName} onChange={set('lastName')} />}</FormField>
          <FormField label="Phone *" error={err.phone}>{(p) => <Input {...p} type="tel" value={form.phone} onChange={set('phone')} placeholder="+966 5…" />}</FormField>
          <FormField label="Email" error={err.email}>{(p) => <Input {...p} type="email" value={form.email} onChange={set('email')} />}</FormField>
          <FormField label="Nationality" error={err.nationality} hint="2-letter code">{(p) => <Input {...p} maxLength={2} value={form.nationality} onChange={set('nationality')} />}</FormField>
          <FormField label="ID / Iqama number">{(p) => <Input {...p} value={form.idNumber} onChange={set('idNumber')} />}</FormField>
          <FormField label="Licence number">{(p) => <Input {...p} value={form.licenseNumber} onChange={set('licenseNumber')} />}</FormField>
          <FormField label="Licence expiry" hint="Trips after this date are refused">{(p) => <Input {...p} type="date" value={form.licenseExpiry} onChange={set('licenseExpiry')} />}</FormField>
          <FormField label="Languages" error={err.languages} hint="Codes separated by commas">{(p) => <Input {...p} value={form.languages} onChange={set('languages')} placeholder="ar, en, ur" />}</FormField>
          {onTrip ? (
            <p className="text-xs text-gray-600 self-end">Status: on a trip — it returns to available when the trip completes.</p>
          ) : (
            <FormField label="Status">{(p) => <Select {...p} value={form.status} onChange={set('status')}>{DRIVER_MANUAL_STATUSES.map((s) => <option key={s} value={s}>{humanize(s)}</option>)}</Select>}</FormField>
          )}
          <FormField label="Notes" full>{(p) => <Textarea {...p} rows={2} value={form.notes} onChange={set('notes')} />}</FormField>
        </div>
        <ModalFooter onClose={onClose} pending={pending} cta={driver ? 'Save driver' : 'Add driver'} />
      </form>
    </ModalSurface>
  );
}

// ─── Route ──────────────────────────────────────────────────────────────
export function RouteFormModal({ route, onClose }: { route?: any; onClose: () => void }) {
  const create = useCreateRoute();
  const update = useUpdateRoute();
  const pending = create.isPending || update.isPending;
  const vehicles = useVehicleList({ limit: 100 });
  const drivers = useDriverList({ limit: 100 });
  const [form, setForm] = useState({
    name: route?.name ?? '', movementType: route?.movementType ?? 'AIRPORT_PICKUP', originCity: route?.originCity ?? '',
    destCity: route?.destCity ?? '', pickupPoint: route?.pickupPoint ?? '', dropoffPoint: route?.dropoffPoint ?? '',
    departureAt: toLocalInput(route?.departureAt), arrivalAt: toLocalInput(route?.arrivalAt),
    durationMins: route?.durationMins != null ? String(route.durationMins) : '', distanceKm: route?.distanceKm != null ? String(route.distanceKm) : '',
    totalSeats: route?.totalSeats != null ? String(route.totalSeats) : '',
    pricePerSeat: route?.pricePerSeatCents != null ? String(route.pricePerSeatCents / 100) : '',
    pricePerVehicle: route?.pricePerVehicleCents != null ? String(route.pricePerVehicleCents / 100) : '',
    vehicleId: route?.vehicleId ?? '', driverId: route?.driverId ?? '',
    status: route && ROUTE_MANUAL_STATUSES.includes(route.status) ? route.status : 'ACTIVE', notes: route?.notes ?? '',
  });
  const [touched, setTouched] = useState(false);
  const [serverError, setServerError] = useState('');
  const set = (k: keyof typeof form) => (e: Change) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const vehicle = (vehicles.data?.items ?? []).find((v: any) => v.id === form.vehicleId);
  const sold = route?.bookedSeats ?? 0;
  const fullyBooked = route?.status === 'FULLY_BOOKED';

  const errors: Record<string, string> = {};
  if (!form.name.trim()) errors.name = 'Enter a route name.';
  if (!form.originCity.trim()) errors.originCity = 'Enter where the route starts.';
  if (!form.destCity.trim()) errors.destCity = 'Enter where the route ends.';
  if (form.totalSeats) {
    if (!int(form.totalSeats) || Number(form.totalSeats) > 10000) errors.totalSeats = 'Whole number of seats.';
    else if (Number(form.totalSeats) < sold) errors.totalSeats = `${sold} seat(s) are already sold.`;
    else if (vehicle && Number(form.totalSeats) > vehicle.capacity) errors.totalSeats = `Vehicle ${vehicle.plateNumber} has ${vehicle.capacity} seats.`;
  }
  if (form.durationMins && (!int(form.durationMins) || Number(form.durationMins) > 10000)) errors.durationMins = 'Whole minutes.';
  if (form.distanceKm && (!int(form.distanceKm) || Number(form.distanceKm) > 10000)) errors.distanceKm = 'Whole kilometres.';
  if (form.pricePerSeat && !MONEY.test(form.pricePerSeat)) errors.pricePerSeat = 'Enter an amount such as 75 or 75.50.';
  if (form.pricePerVehicle && !MONEY.test(form.pricePerVehicle)) errors.pricePerVehicle = 'Enter an amount such as 900.';
  if (form.departureAt && form.arrivalAt && form.arrivalAt < form.departureAt) errors.arrivalAt = 'Arrival must be after departure.';

  const save = async () => {
    setTouched(true);
    if (Object.keys(errors).length || pending) return;
    setServerError('');
    const body: Record<string, any> = {
      name: form.name.trim(), movementType: form.movementType, originCity: form.originCity.trim(), destCity: form.destCity.trim(),
      pickupPoint: form.pickupPoint.trim(), dropoffPoint: form.dropoffPoint.trim(),
      departureAt: fromLocalInput(form.departureAt), arrivalAt: fromLocalInput(form.arrivalAt),
      durationMins: form.durationMins ? Number(form.durationMins) : null, distanceKm: form.distanceKm ? Number(form.distanceKm) : null,
      totalSeats: form.totalSeats ? Number(form.totalSeats) : null,
      pricePerSeat: form.pricePerSeat ? Number(form.pricePerSeat) : null, pricePerVehicle: form.pricePerVehicle ? Number(form.pricePerVehicle) : null,
      vehicleId: form.vehicleId || null, driverId: form.driverId || null, notes: form.notes.trim(),
    };
    if (!fullyBooked || form.status !== 'ACTIVE') body.status = form.status;
    try {
      if (route) await update.mutateAsync({ id: route.id, ...body });
      else await create.mutateAsync(stripEmpty(body));
      toast.success(route ? 'Route saved' : 'Route added');
      onClose();
    } catch (e) {
      setServerError(apiErrorMessage(e, 'The route could not be saved.'));
    }
  };
  const err = touched ? errors : {};
  const heading = route ? `Edit ${route.name}` : 'Add route';
  return (
    <ModalSurface busy={pending} title={heading} onClose={onClose}>
      <form noValidate onSubmit={(e) => { e.preventDefault(); save(); }} className="bg-white rounded-xl w-full max-w-2xl p-5 shadow-xl max-h-[90vh] overflow-y-auto">
        <ModalHeader title={heading} onClose={onClose} busy={pending} />
        {serverError && <div className="mb-3"><Alert title={serverError} /></div>}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <FormField label="Route name *" error={err.name} full>{(p) => <Input {...p} value={form.name} onChange={set('name')} placeholder="JED Airport → Makkah hotels" />}</FormField>
          <FormField label="From *" error={err.originCity}>{(p) => <Input {...p} value={form.originCity} onChange={set('originCity')} placeholder="Jeddah" />}</FormField>
          <FormField label="To *" error={err.destCity}>{(p) => <Input {...p} value={form.destCity} onChange={set('destCity')} placeholder="Makkah" />}</FormField>
          <FormField label="Movement type">{(p) => <Select {...p} value={form.movementType} onChange={set('movementType')}>{MOVEMENT_TYPES.map((m) => <option key={m} value={m}>{humanize(m)}</option>)}</Select>}</FormField>
          {fullyBooked ? (
            <p className="text-xs text-gray-600 self-end">Status: fully booked — it reopens when seats free up.</p>
          ) : (
            <FormField label="Status">{(p) => <Select {...p} value={form.status} onChange={set('status')}>{ROUTE_MANUAL_STATUSES.map((s) => <option key={s} value={s}>{humanize(s)}</option>)}</Select>}</FormField>
          )}
          <FormField label="Pickup point">{(p) => <Input {...p} value={form.pickupPoint} onChange={set('pickupPoint')} />}</FormField>
          <FormField label="Drop-off point">{(p) => <Input {...p} value={form.dropoffPoint} onChange={set('dropoffPoint')} />}</FormField>
          <FormField label="Departure">{(p) => <Input {...p} type="datetime-local" value={form.departureAt} onChange={set('departureAt')} />}</FormField>
          <FormField label="Arrival" error={err.arrivalAt}>{(p) => <Input {...p} type="datetime-local" value={form.arrivalAt} onChange={set('arrivalAt')} />}</FormField>
          <FormField label="Duration (minutes)" error={err.durationMins} hint="Used to spot overlapping trips">{(p) => <Input {...p} type="number" min={0} value={form.durationMins} onChange={set('durationMins')} />}</FormField>
          <FormField label="Distance (km)" error={err.distanceKm}>{(p) => <Input {...p} type="number" min={0} value={form.distanceKm} onChange={set('distanceKm')} />}</FormField>
          <FormField label="Seats for sale" error={err.totalSeats} hint={route ? `${sold} sold — counted by the server` : 'Leave empty for no seat limit'}>{(p) => <Input {...p} type="number" min={0} value={form.totalSeats} onChange={set('totalSeats')} />}</FormField>
          <FormField label="Price per seat (SAR)" error={err.pricePerSeat}>{(p) => <Input {...p} type="number" min={0} step="0.01" value={form.pricePerSeat} onChange={set('pricePerSeat')} />}</FormField>
          <FormField label="Price per vehicle (SAR)" error={err.pricePerVehicle}>{(p) => <Input {...p} type="number" min={0} step="0.01" value={form.pricePerVehicle} onChange={set('pricePerVehicle')} />}</FormField>
          <FormField label="Default vehicle">{(p) => (
            <Select {...p} value={form.vehicleId} onChange={set('vehicleId')}>
              <option value="">None</option>
              {(vehicles.data?.items ?? []).filter((v: any) => v.isActive !== false || v.id === route?.vehicleId).map((v: any) => <option key={v.id} value={v.id}>{v.plateNumber} ({v.capacity} seats)</option>)}
            </Select>
          )}</FormField>
          <FormField label="Default driver">{(p) => (
            <Select {...p} value={form.driverId} onChange={set('driverId')}>
              <option value="">None</option>
              {(drivers.data?.items ?? []).filter((d: any) => d.isActive !== false || d.id === route?.driverId).map((d: any) => <option key={d.id} value={d.id}>{d.firstName} {d.lastName}</option>)}
            </Select>
          )}</FormField>
          <FormField label="Notes" full>{(p) => <Textarea {...p} rows={2} value={form.notes} onChange={set('notes')} />}</FormField>
        </div>
        <ModalFooter onClose={onClose} pending={pending} cta={route ? 'Save route' : 'Add route'} />
      </form>
    </ModalSurface>
  );
}

'use client';

import { useId } from 'react';
import { Input, Select, Textarea } from '@/components/ui/system';
import { HOTEL_STATUSES } from '@/hooks/use-hotels';
import { cn } from '@/lib/utils';

/*
 * The hotel form shared by "Add hotel" and the hotel's Edit tab. Validation
 * mirrors the server DTO (platform/api/src/modules/hotels/dto/hotel.dto.ts) so a
 * user sees the problem next to the field instead of a 400 after submitting.
 */

export const HOTEL_CITIES = ['MAKKAH', 'MADINAH', 'JEDDAH', 'RIYADH', 'TAIF'];
const HH_MM = /^([01]\d|2[0-3]):[0-5]\d$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface HotelForm {
  name: string; city: string; country: string; area: string; address: string; postalCode: string;
  starRating: string; distanceToHaram: string; description: string; amenities: string;
  contactPerson: string; phone: string; email: string; checkInTime: string; checkOutTime: string;
  cancellationPolicy: string; status: string; notes: string;
}

export const emptyHotelForm = (): HotelForm => ({
  name: '', city: 'MAKKAH', country: 'SA', area: '', address: '', postalCode: '', starRating: '', distanceToHaram: '',
  description: '', amenities: '', contactPerson: '', phone: '', email: '', checkInTime: '15:00', checkOutTime: '12:00',
  cancellationPolicy: '', status: 'ACTIVE', notes: '',
});

export const hotelFormFromHotel = (h: any): HotelForm => ({
  name: h.name ?? '', city: h.city ?? 'MAKKAH', country: h.country ?? 'SA', area: h.area ?? '', address: h.address ?? '',
  postalCode: h.postalCode ?? '', starRating: h.starRating ? String(h.starRating) : '',
  distanceToHaram: h.distanceToHaram != null ? String(h.distanceToHaram) : '', description: h.description ?? '',
  amenities: (h.amenities ?? []).join(', '), contactPerson: h.contactPerson ?? '', phone: h.phone ?? '', email: h.email ?? '',
  checkInTime: h.checkInTime ?? '', checkOutTime: h.checkOutTime ?? '', cancellationPolicy: h.cancellationPolicy ?? '',
  status: h.status ?? 'ACTIVE', notes: h.notes ?? '',
});

export function hotelFormErrors(f: HotelForm): Record<string, string> {
  const e: Record<string, string> = {};
  if (!f.name.trim()) e.name = 'Enter the hotel name.';
  if (!f.city.trim()) e.city = 'Choose the city.';
  if (!/^[A-Za-z]{2}$/.test(f.country.trim())) e.country = 'Use the 2-letter country code, for example SA.';
  if (f.distanceToHaram && (!/^\d+$/.test(f.distanceToHaram) || Number(f.distanceToHaram) > 1_000_000)) e.distanceToHaram = 'Enter whole metres (0 or more).';
  if (f.email && !EMAIL.test(f.email.trim())) e.email = 'Enter a valid email address.';
  if (f.checkInTime && !HH_MM.test(f.checkInTime)) e.checkInTime = 'Use 24-hour time, for example 15:00.';
  if (f.checkOutTime && !HH_MM.test(f.checkOutTime)) e.checkOutTime = 'Use 24-hour time, for example 12:00.';
  return e;
}

const list = (text: string) => text.split(',').map((s) => s.trim()).filter(Boolean);

/** Create payload: empty optional fields are left out. */
export function hotelPayload(f: HotelForm) {
  const opt = (v: string) => (v.trim() ? v.trim() : undefined);
  return {
    name: f.name.trim(), city: f.city.trim(), country: f.country.trim().toUpperCase(),
    area: opt(f.area), address: opt(f.address), postalCode: opt(f.postalCode),
    starRating: f.starRating ? Number(f.starRating) : undefined,
    distanceToHaram: f.distanceToHaram ? Number(f.distanceToHaram) : undefined,
    description: opt(f.description), amenities: list(f.amenities), contactPerson: opt(f.contactPerson),
    phone: opt(f.phone), email: opt(f.email), checkInTime: opt(f.checkInTime), checkOutTime: opt(f.checkOutTime),
    cancellationPolicy: opt(f.cancellationPolicy), status: f.status, notes: opt(f.notes),
  };
}

/** Update payload: an emptied optional field is sent empty so it is really cleared. */
export function hotelUpdatePayload(f: HotelForm) {
  return {
    name: f.name.trim(), city: f.city.trim(), country: f.country.trim().toUpperCase(),
    area: f.area.trim(), address: f.address.trim(), postalCode: f.postalCode.trim(),
    starRating: f.starRating ? Number(f.starRating) : 0,
    distanceToHaram: f.distanceToHaram ? Number(f.distanceToHaram) : null,
    description: f.description.trim(), amenities: list(f.amenities), contactPerson: f.contactPerson.trim(),
    phone: f.phone.trim(), email: f.email.trim(), checkInTime: f.checkInTime.trim(), checkOutTime: f.checkOutTime.trim(),
    cancellationPolicy: f.cancellationPolicy.trim(), notes: f.notes.trim(),
  };
}

export function FormField({ label, error, full, children, hint }: { label: string; error?: string; full?: boolean; hint?: string; children: (props: { id: string; 'aria-invalid'?: boolean; 'aria-describedby'?: string }) => React.ReactNode }) {
  const id = useId();
  const described = error ? `${id}-error` : hint ? `${id}-hint` : undefined;
  return (
    <div className={cn(full && 'sm:col-span-2')}>
      <label htmlFor={id} className="block text-xs font-semibold text-gray-700 mb-1">{label}</label>
      {children({ id, 'aria-invalid': error ? true : undefined, 'aria-describedby': described })}
      {error ? (
        <p id={`${id}-error`} role="alert" className="text-xs text-red-700 mt-1">{error}</p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-xs text-gray-600 mt-1">{hint}</p>
      ) : null}
    </div>
  );
}

export function HotelFormFields({ form, setForm, errors, showStatus = true }: {
  form: HotelForm; setForm: (updater: (f: HotelForm) => HotelForm) => void; errors: Record<string, string>; showStatus?: boolean;
}) {
  const set = (k: keyof HotelForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const value = e.target.value;
    setForm((f) => ({ ...f, [k]: value }));
  };
  const cities = HOTEL_CITIES.includes(form.city.toUpperCase()) || !form.city ? HOTEL_CITIES : [form.city, ...HOTEL_CITIES];
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <FormField label="Hotel name *" error={errors.name} full>{(p) => <Input {...p} value={form.name} onChange={set('name')} placeholder="Makkah Grand Tower" />}</FormField>
      <FormField label="City *" error={errors.city}>{(p) => (
        <Select {...p} value={cities.includes(form.city) ? form.city : form.city.toUpperCase()} onChange={set('city')}>
          {cities.map((c) => <option key={c} value={c}>{c.charAt(0) + c.slice(1).toLowerCase()}</option>)}
        </Select>
      )}</FormField>
      <FormField label="Country code *" error={errors.country} hint="2 letters, e.g. SA">{(p) => <Input {...p} value={form.country} maxLength={2} onChange={set('country')} />}</FormField>
      <FormField label="Area / district">{(p) => <Input {...p} value={form.area} onChange={set('area')} placeholder="Ajyad" />}</FormField>
      <FormField label="Postal code">{(p) => <Input {...p} value={form.postalCode} onChange={set('postalCode')} />}</FormField>
      <FormField label="Address" full>{(p) => <Input {...p} value={form.address} onChange={set('address')} />}</FormField>
      <FormField label="Star rating">{(p) => (
        <Select {...p} value={form.starRating} onChange={set('starRating')}>
          <option value="">Not rated</option>
          {[1, 2, 3, 4, 5].map((n) => <option key={n} value={String(n)}>{n} star{n > 1 ? 's' : ''}</option>)}
        </Select>
      )}</FormField>
      <FormField label="Distance to the Haram (m)" error={errors.distanceToHaram}>{(p) => <Input {...p} type="number" min={0} step={1} value={form.distanceToHaram} onChange={set('distanceToHaram')} />}</FormField>
      <FormField label="Check-in time" error={errors.checkInTime}>{(p) => <Input {...p} type="time" value={form.checkInTime} onChange={set('checkInTime')} />}</FormField>
      <FormField label="Check-out time" error={errors.checkOutTime}>{(p) => <Input {...p} type="time" value={form.checkOutTime} onChange={set('checkOutTime')} />}</FormField>
      <FormField label="Contact person">{(p) => <Input {...p} value={form.contactPerson} onChange={set('contactPerson')} />}</FormField>
      <FormField label="Phone">{(p) => <Input {...p} type="tel" value={form.phone} onChange={set('phone')} placeholder="+966 12 …" />}</FormField>
      <FormField label="Reservations email" error={errors.email}>{(p) => <Input {...p} type="email" value={form.email} onChange={set('email')} />}</FormField>
      {showStatus && (
        <FormField label="Status">{(p) => (
          <Select {...p} value={form.status} onChange={set('status')}>
            {HOTEL_STATUSES.map((s) => <option key={s} value={s}>{s.charAt(0) + s.slice(1).toLowerCase()}</option>)}
          </Select>
        )}</FormField>
      )}
      <FormField label="Amenities" hint="Separate with commas" full>{(p) => <Input {...p} value={form.amenities} onChange={set('amenities')} placeholder="wifi, breakfast, prayer room" />}</FormField>
      <FormField label="Description" full>{(p) => <Textarea {...p} rows={2} value={form.description} onChange={set('description')} />}</FormField>
      <FormField label="Cancellation policy" full>{(p) => <Textarea {...p} rows={2} value={form.cancellationPolicy} onChange={set('cancellationPolicy')} />}</FormField>
      <FormField label="Internal notes" full>{(p) => <Textarea {...p} rows={2} value={form.notes} onChange={set('notes')} />}</FormField>
    </div>
  );
}

'use client';

import { useState } from 'react';
import { Button, Input, Select, Textarea } from '@/components/ui/system';
import { ImageUploader } from '@/components/ui/file-upload-images';
import {
  centsToInput,
  compactAttributes,
  CURRENCIES,
  LISTING_CATEGORIES,
  PRICING_MODEL_LABEL,
  PRICING_MODELS,
  toCents,
} from './listing-rules';

export type ListingIntent = 'draft' | 'publish' | 'save';

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold text-gray-600">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-gray-600">{hint}</span>}
    </label>
  );
}

const str = (v: unknown) => (v === undefined || v === null ? '' : String(v));

/**
 * Create / edit form for a listing. Money is typed in major units and sent as
 * `priceCents`; images are uploaded as they are picked and saved as URLs;
 * category details are stored as flat values.
 */
export function ListingForm({
  mode,
  vendors = [],
  initial,
  busy,
  onSubmit,
  onCancel,
}: {
  mode: 'create' | 'edit';
  vendors?: any[];
  initial?: any;
  busy: boolean;
  onSubmit: (dto: Record<string, unknown>, intent: ListingIntent) => Promise<void>;
  onCancel?: () => void;
}) {
  const a = initial?.attributes ?? {};
  const [vendorId, setVendorId] = useState<string>(initial?.vendorId ?? vendors[0]?.id ?? '');
  const [title, setTitle] = useState(str(initial?.name));
  const [category, setCategory] = useState<string>(
    LISTING_CATEGORIES.some((c) => c.value === initial?.type) ? initial.type : 'hotel_room',
  );
  const [price, setPrice] = useState(initial?.priceCents ? centsToInput(initial.priceCents) : '');
  const [currency, setCurrency] = useState(str(initial?.currency) || 'SAR');
  const [pricingModel, setPricingModel] = useState(str(initial?.pricingModel).toUpperCase() || 'PER_PERSON');
  const [city, setCity] = useState(str(initial?.city ?? a.city));
  const [capacity, setCapacity] = useState(str(a.maxCapacity));
  const [description, setDescription] = useState(str(initial?.description));
  const [details, setDetails] = useState<Record<string, string>>({
    roomType: str(a.roomType),
    starRating: str(a.starRating),
    distanceToHaram: str(a.distanceToHaram),
    vehicleType: str(a.vehicleType),
    seats: str(a.seats ?? a.seatCapacity),
    routeFrom: str(a.routeFrom),
    routeTo: str(a.routeTo),
    visaType: str(a.visaType),
    processingDays: str(a.processingDays),
    languages: Array.isArray(a.languages) ? a.languages.join(', ') : str(a.languages),
    mealsPerDay: str(a.mealsPerDay),
    durationDays: str(a.durationDays),
  });
  const [includes, setIncludes] = useState<string[]>(Array.isArray(a.includes) ? a.includes.map(String) : []);
  const [images, setImages] = useState<string[]>(initial?.imageUrls ?? []);
  const [uploading, setUploading] = useState(false);
  const [problems, setProblems] = useState<string[]>([]);

  const cat = LISTING_CATEGORIES.find((c) => c.value === category) ?? LISTING_CATEGORIES[0];
  const detail = (key: string) => ({
    value: details[key] ?? '',
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setDetails((d) => ({ ...d, [key]: e.target.value })),
  });
  const num = (v: string) => (v.trim() && Number.isFinite(Number(v)) ? Number(v) : undefined);

  const build = (): Record<string, unknown> | null => {
    const errs: string[] = [];
    if (!title.trim()) errs.push('Enter a title.');
    const priceCents = price.trim() ? toCents(price) : 0;
    if (priceCents === null) errs.push('Enter the price as a number with at most two decimals, e.g. 1250.50.');
    const cap = capacity.trim() ? Number(capacity) : undefined;
    if (cap !== undefined && (!Number.isInteger(cap) || cap < 1)) errs.push('Capacity must be a whole number of at least 1.');
    if (mode === 'create' && !vendorId) errs.push('Choose the seller profile this listing belongs to.');
    setProblems(errs);
    if (errs.length) return null;

    const byCategory: Record<string, Record<string, unknown>> = {
      hotel_room: { roomType: details.roomType, starRating: num(details.starRating), distanceToHaram: num(details.distanceToHaram) },
      transport_service: { vehicleType: details.vehicleType, seats: num(details.seats), routeFrom: details.routeFrom.trim(), routeTo: details.routeTo.trim() },
      visa_service: { visaType: details.visaType, processingDays: num(details.processingDays) },
      guide_service: { languages: details.languages.split(',').map((s) => s.trim()).filter(Boolean) },
      catering: { mealsPerDay: num(details.mealsPerDay) },
      other: { durationDays: num(details.durationDays), includes },
    };
    return {
      ...(mode === 'create' ? { vendorId } : {}),
      title: title.trim(),
      category,
      priceCents,
      currency,
      pricingModel,
      city: city.trim(),
      ...(cap !== undefined ? { maxCapacity: cap } : {}),
      description: description.trim(),
      attributes: compactAttributes(byCategory[category] ?? {}),
      imageUrls: images,
    };
  };

  const submit = async (intent: ListingIntent) => {
    const dto = build();
    if (!dto) return;
    await onSubmit(intent === 'save' ? dto : { ...dto, status: intent === 'publish' ? 'PUBLISHED' : 'DRAFT' }, intent);
  };

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        void submit(mode === 'create' ? 'draft' : 'save');
      }}
      noValidate
    >
      {mode === 'create' && vendors.length > 1 && (
        <Field label="Seller profile *">
          <Select value={vendorId} onChange={(e) => setVendorId(e.target.value)}>
            {vendors.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </Select>
        </Field>
      )}
      {mode === 'create' && vendors.length === 1 && (
        <p className="text-xs text-gray-600">
          Seller shown to travelers: <strong className="text-gray-900">{vendors[0].name}</strong>
        </p>
      )}

      <Field label="Title *">
        <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={cat.placeholder} maxLength={255} required />
      </Field>

      <Field label="Category *">
        <Select value={category} onChange={(e) => setCategory(e.target.value)}>
          {LISTING_CATEGORIES.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </Select>
      </Field>

      <div className="grid gap-3 sm:grid-cols-3">
        <Field label={`Price (${currency})`} hint="Leave empty for “price on request”.">
          <Input inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="1250.00" />
        </Field>
        <Field label="Currency">
          <Select value={currency} onChange={(e) => setCurrency(e.target.value)}>
            {CURRENCIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Pricing">
          <Select value={pricingModel} onChange={(e) => setPricingModel(e.target.value)}>
            {PRICING_MODELS.map((m) => (
              <option key={m} value={m}>
                {PRICING_MODEL_LABEL[m]}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      {!['PER_PERSON', 'PER_GROUP'].includes(pricingModel) && (
        <p className="text-xs text-gray-600">Travelers cannot book {PRICING_MODEL_LABEL[pricingModel]} prices directly; they send an inquiry instead.</p>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="City">
          <Input value={city} onChange={(e) => setCity(e.target.value)} placeholder="Makkah" maxLength={100} />
        </Field>
        <Field label="Capacity (largest party)">
          <Input inputMode="numeric" value={capacity} onChange={(e) => setCapacity(e.target.value)} placeholder="4" />
        </Field>
      </div>

      {category === 'hotel_room' && (
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Room type">
            <Select {...detail('roomType')}>
              <option value="">—</option>
              {['single', 'double', 'triple', 'quad', 'suite'].map((r) => (
                <option key={r} value={r}>
                  {r[0].toUpperCase() + r.slice(1)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Hotel stars">
            <Select {...detail('starRating')}>
              <option value="">—</option>
              {[3, 4, 5].map((n) => (
                <option key={n} value={n}>
                  {n} stars
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Distance to Haram (m)">
            <Input inputMode="numeric" {...detail('distanceToHaram')} placeholder="200" />
          </Field>
        </div>
      )}
      {category === 'transport_service' && (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Vehicle">
            <Select {...detail('vehicleType')}>
              <option value="">—</option>
              {['coach', 'van', 'sedan', 'suv'].map((v) => (
                <option key={v} value={v}>
                  {v[0].toUpperCase() + v.slice(1)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Seats">
            <Input inputMode="numeric" {...detail('seats')} placeholder="45" />
          </Field>
          <Field label="From">
            <Input {...detail('routeFrom')} placeholder="Jeddah airport" />
          </Field>
          <Field label="To">
            <Input {...detail('routeTo')} placeholder="Makkah" />
          </Field>
        </div>
      )}
      {category === 'visa_service' && (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Visa type">
            <Select {...detail('visaType')}>
              <option value="">—</option>
              {['UMRAH', 'HAJJ', 'VISIT'].map((v) => (
                <option key={v} value={v}>
                  {v[0] + v.slice(1).toLowerCase()}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Processing time (days)">
            <Input inputMode="numeric" {...detail('processingDays')} placeholder="7" />
          </Field>
        </div>
      )}
      {category === 'guide_service' && (
        <Field label="Languages" hint="Separate with commas.">
          <Input {...detail('languages')} placeholder="Arabic, English, Urdu" />
        </Field>
      )}
      {category === 'catering' && (
        <Field label="Meals per day">
          <Input inputMode="numeric" {...detail('mealsPerDay')} placeholder="3" />
        </Field>
      )}
      {category === 'other' && (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Duration (days)">
            <Input inputMode="numeric" {...detail('durationDays')} placeholder="14" />
          </Field>
          <fieldset className="text-xs">
            <legend className="mb-1 font-semibold text-gray-600">Includes</legend>
            <div className="flex flex-wrap gap-3 pt-1">
              {['hotel', 'transport', 'visa', 'meals'].map((k) => (
                <label key={k} className="inline-flex items-center gap-1.5">
                  <input
                    type="checkbox"
                    checked={includes.includes(k)}
                    onChange={(e) => setIncludes((list) => (e.target.checked ? [...list, k] : list.filter((x) => x !== k)))}
                  />
                  {k[0].toUpperCase() + k.slice(1)}
                </label>
              ))}
            </div>
          </fieldset>
        </div>
      )}

      <Field label="Description">
        <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} placeholder="What does this listing include?" maxLength={10000} />
      </Field>

      <ImageUploader label="Photos" value={images} onChange={setImages} savedUrls={initial?.imageUrls ?? []} onBusyChange={setUploading} disabled={busy} />

      {problems.length > 0 && (
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          {problems.map((p) => (
            <p key={p}>{p}</p>
          ))}
        </div>
      )}
      {uploading && <p className="text-xs text-gray-600" aria-live="polite">Wait for the uploads to finish before saving.</p>}

      <div className="flex flex-wrap justify-end gap-2 pt-1">
        {onCancel && (
          <Button variant="secondary" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
        )}
        {mode === 'create' ? (
          <>
            <Button variant="secondary" busy={busy} disabled={uploading} onClick={() => void submit('draft')}>
              Save as draft
            </Button>
            <Button busy={busy} disabled={uploading} onClick={() => void submit('publish')}>
              Publish now
            </Button>
          </>
        ) : (
          <Button type="submit" busy={busy} disabled={uploading}>
            Save changes
          </Button>
        )}
      </div>
    </form>
  );
}

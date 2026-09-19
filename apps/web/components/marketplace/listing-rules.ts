/**
 * Marketplace rules the UI must agree with the API on. Each list here mirrors a
 * server literal; tests/marketplace-rules.test.ts reads the API source and fails
 * when the two drift apart, so a control can never offer a value the server
 * refuses.
 */

/** Mirrors LISTING_TRANSITIONS in platform/api/src/modules/marketplace/listing-rules.ts. */
export const LISTING_TRANSITIONS: Record<string, string[]> = {
  DRAFT: ['PUBLISHED', 'ARCHIVED'],
  PUBLISHED: ['PAUSED', 'ARCHIVED'],
  PAUSED: ['PUBLISHED', 'DRAFT', 'ARCHIVED'],
  ARCHIVED: ['DRAFT'],
};

export function listingTransitions(status?: string): string[] {
  return LISTING_TRANSITIONS[String(status ?? '').toUpperCase()] ?? [];
}

/** How each target status is offered to a seller. */
export const TRANSITION_LABEL: Record<string, string> = {
  PUBLISHED: 'Publish',
  PAUSED: 'Unpublish',
  DRAFT: 'Move to drafts',
  ARCHIVED: 'Archive',
};

export const STATUS_LABEL: Record<string, string> = {
  DRAFT: 'Draft',
  PUBLISHED: 'Published',
  PAUSED: 'Unpublished',
  ARCHIVED: 'Archived',
};

/** Mirrors the ListingCategory enum of the API. */
export const LISTING_CATEGORIES = [
  { value: 'hotel_room', label: 'Hotel room', placeholder: 'Deluxe room, 200 m from the Haram' },
  { value: 'transport_service', label: 'Transport', placeholder: 'Airport transfer JED → Makkah (45-seat coach)' },
  { value: 'visa_service', label: 'Visa service', placeholder: 'Umrah visa, 7-day processing' },
  { value: 'guide_service', label: 'Guide', placeholder: 'Licensed mutawif (Arabic/English/Urdu)' },
  { value: 'catering', label: 'Catering', placeholder: 'Halal full board (3 meals a day)' },
  { value: 'other', label: 'Package / other', placeholder: '14-day Umrah package' },
] as const;

export function categoryLabel(type?: string): string {
  const t = String(type ?? '').toLowerCase();
  const direct = LISTING_CATEGORIES.find((c) => c.value === t);
  if (direct) return direct.label;
  if (t.includes('hotel') || t.includes('room')) return 'Hotel room';
  if (t.includes('transport')) return 'Transport';
  if (t.includes('visa')) return 'Visa service';
  if (t.includes('guide')) return 'Guide';
  if (t.includes('cater')) return 'Catering';
  return 'Package / other';
}

/** Mirrors PRICING_MODELS in the API's marketplace DTOs. */
export const PRICING_MODELS = ['PER_PERSON', 'PER_GROUP', 'PER_NIGHT', 'PER_TRIP', 'FLAT'] as const;
export const PRICING_MODEL_LABEL: Record<string, string> = {
  PER_PERSON: 'per person',
  PER_GROUP: 'per group',
  PER_NIGHT: 'per night',
  PER_TRIP: 'per trip',
  FLAT: 'flat price',
};

export const CURRENCIES = ['SAR', 'USD', 'EUR', 'GBP', 'AED', 'IDR', 'PKR', 'MYR', 'INR', 'TRY'] as const;

/** Mirrors LISTING_SORTS in the API. */
export const LISTING_SORTS = [
  { value: 'newest', label: 'Newest first' },
  { value: 'price_asc', label: 'Price: low to high' },
  { value: 'price_desc', label: 'Price: high to low' },
  { value: 'name', label: 'Name A–Z' },
  { value: 'oldest', label: 'Oldest first' },
] as const;

/**
 * Money is entered in major units (e.g. SAR) and sent in minor units (cents).
 * Parsing is exact (no float multiplication): "1250.5" → 125050. Returns null
 * for anything that is not a non-negative amount with at most two decimals.
 */
export function toCents(input: string | number | null | undefined): number | null {
  const raw = String(input ?? '').trim().replace(/,/g, '');
  const m = /^(\d{1,9})(?:\.(\d{1,2}))?$/.exec(raw);
  if (!m) return null;
  return Number(m[1]) * 100 + Number((m[2] ?? '').padEnd(2, '0'));
}

/** Cents → the major-unit text a form field shows ("125050" → "1250.50"; whole amounts without decimals). */
export function centsToInput(cents: number | string | null | undefined): string {
  const n = Number(cents);
  if (!Number.isSafeInteger(n) || n < 0) return '';
  const major = Math.floor(n / 100);
  const minor = n % 100;
  return minor ? `${major}.${String(minor).padStart(2, '0')}` : String(major);
}

/** "SAR 1,250.50" — cents in, formatted major units out. */
export function formatMoney(cents: number | string | null | undefined, currency = 'SAR'): string {
  const n = Number(cents);
  if (!Number.isFinite(n)) return '—';
  const major = n / 100;
  return `${currency} ${major.toLocaleString('en-US', {
    minimumFractionDigits: n % 100 ? 2 : 0,
    maximumFractionDigits: 2,
  })}`;
}

/** Listing price text for cards and headers; 0 means the seller prices on request. */
export function listingPriceLabel(l: { priceCents?: number | string | null; currency?: string; pricingModel?: string }) {
  const cents = Number(l.priceCents ?? 0);
  if (!cents) return 'Price on request';
  const unit = PRICING_MODEL_LABEL[String(l.pricingModel ?? '').toUpperCase()];
  return `${formatMoney(cents, l.currency ?? 'SAR')}${unit ? ` ${unit}` : ''}`;
}

/** The API computes a booking total only for these models (others go through an inquiry). */
export function isDirectlyBookable(l: { priceCents?: number | string | null; pricingModel?: string }) {
  return Number(l.priceCents ?? 0) > 0 && ['PER_PERSON', 'PER_GROUP'].includes(String(l.pricingModel ?? '').toUpperCase());
}

/** Mirrors IMAGE_TYPES / IMAGE_MAX_BYTES of the API's StorageService and MAX_LISTING_IMAGES. */
export const IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] as const;
export const IMAGE_MAX_BYTES = 5 * 1024 * 1024;
export const MAX_LISTING_IMAGES = 12;

const IMAGE_EXTENSIONS = /\.(jpe?g|png|webp|gif)$/i;

/**
 * The same checks the server makes, done before anything is sent, so the user
 * learns about a wrong file immediately. The server still decides by content.
 */
export function imageFileProblem(file: { name: string; size: number; type: string }): string | null {
  const typeOk = (IMAGE_MIME_TYPES as readonly string[]).includes(file.type) || (!file.type && IMAGE_EXTENSIONS.test(file.name));
  if (!typeOk) return `${file.name} is not a JPEG, PNG, WebP or GIF image.`;
  if (file.size === 0) return `${file.name} is empty.`;
  if (file.size > IMAGE_MAX_BYTES) {
    return `${file.name} is ${(file.size / 1024 / 1024).toFixed(1)} MB. Images must be 5 MB or smaller.`;
  }
  return null;
}

/** Category details are stored as flat values; empty ones are dropped. */
export function compactAttributes(input: Record<string, unknown>): Record<string, string | number | boolean | string[]> {
  const out: Record<string, string | number | boolean | string[]> = {};
  for (const [k, v] of Object.entries(input)) {
    if (v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0)) continue;
    if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') out[k] = v;
    else if (Array.isArray(v)) out[k] = v.map(String);
  }
  return out;
}

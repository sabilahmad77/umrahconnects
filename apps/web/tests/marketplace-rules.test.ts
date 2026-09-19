import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  centsToInput,
  compactAttributes,
  formatMoney,
  IMAGE_MAX_BYTES,
  IMAGE_MIME_TYPES,
  imageFileProblem,
  isDirectlyBookable,
  LISTING_CATEGORIES,
  LISTING_SORTS,
  LISTING_TRANSITIONS,
  listingPriceLabel,
  listingTransitions,
  MAX_LISTING_IMAGES,
  PRICING_MODELS,
  toCents,
} from '../components/marketplace/listing-rules';

/** The web must never offer a value, transition or limit the marketplace API does not accept. */
const API = join(__dirname, '..', '..', '..', 'platform', 'api', 'src');
const read = (p: string) => readFileSync(join(API, p), 'utf8');
const quoted = (src: string) => [...src.matchAll(/'([A-Za-z_]+)'/g)].map((m) => m[1]);

describe('marketplace contract with the API', () => {
  it('listing status transitions mirror the server literal', () => {
    const grab = (src: string) => src.match(/LISTING_TRANSITIONS: Record<string, string\[\]> = \{([\s\S]*?)\};/)?.[1].replace(/\s/g, '');
    const server = grab(read('modules/marketplace/listing-rules.ts'));
    const web = grab(readFileSync(join(__dirname, '..', 'components/marketplace/listing-rules.ts'), 'utf8'));
    expect(server).toBeTruthy();
    expect(web).toBe(server);
    expect(listingTransitions('published')).toEqual(LISTING_TRANSITIONS.PUBLISHED);
    expect(listingTransitions('unknown')).toEqual([]);
  });

  it('categories, pricing models and sorts are exactly the server enums', () => {
    const dto = read('modules/marketplace/dto/create-listing.dto.ts');
    const categories = [...dto.matchAll(/^\s+[A-Z_]+ = '([a-z_]+)',$/gm)].map((m) => m[1]);
    expect(LISTING_CATEGORIES.map((c) => c.value).sort()).toEqual(
      categories.filter((c) => !['per_person', 'per_night', 'per_trip', 'flat'].includes(c)).sort(),
    );
    const models = read('modules/marketplace/dto/marketplace.dto.ts').match(/PRICING_MODELS = \[([^\]]*)\]/)?.[1] ?? '';
    expect([...PRICING_MODELS]).toEqual(quoted(models));
    const sorts = read('modules/marketplace/listing-rules.ts').match(/LISTING_SORTS = \[([^\]]*)\]/)?.[1] ?? '';
    expect(LISTING_SORTS.map((s) => s.value).sort()).toEqual(quoted(sorts).sort());
  });

  it('image rules match the storage service and the listing limit', () => {
    const storage = read('modules/storage/storage.service.ts');
    expect(storage).toContain(`IMAGE_MAX_BYTES = ${IMAGE_MAX_BYTES / 1024 / 1024} * 1024 * 1024`);
    const types = quoted(storage.match(/IMAGE_TYPES: SniffedType\[\] = \[([^\]]*)\]/)?.[1] ?? '');
    expect(IMAGE_MIME_TYPES.map((m) => m.replace('image/', '')).sort()).toEqual(types.sort());
    expect(read('modules/storage/media-registry.service.ts')).toContain(`MAX_LISTING_IMAGES = ${MAX_LISTING_IMAGES}`);
  });
});

describe('money: major units in forms, cents on the wire', () => {
  it('parses exactly without float drift', () => {
    expect(toCents('1250.5')).toBe(125_050);
    expect(toCents('19.99')).toBe(1_999);
    expect(toCents('1,250')).toBe(125_000);
    expect(toCents('0')).toBe(0);
    for (const bad of ['', '-5', '1.234', 'abc', '1e3', '12.']) expect(toCents(bad), bad).toBeNull();
  });

  it('round-trips and formats', () => {
    expect(centsToInput(125_050)).toBe('1250.50');
    expect(centsToInput(125_000)).toBe('1250');
    expect(formatMoney(125_050, 'SAR')).toBe('SAR 1,250.50');
    expect(formatMoney(45_000, 'USD')).toBe('USD 450');
    expect(listingPriceLabel({ priceCents: 45_000, currency: 'SAR', pricingModel: 'PER_GROUP' })).toBe('SAR 450 per group');
    expect(listingPriceLabel({ priceCents: 0 })).toBe('Price on request');
  });

  it('offers direct booking only where the server computes a total', () => {
    expect(isDirectlyBookable({ priceCents: 100, pricingModel: 'PER_PERSON' })).toBe(true);
    expect(isDirectlyBookable({ priceCents: 100, pricingModel: 'PER_NIGHT' })).toBe(false);
    expect(isDirectlyBookable({ priceCents: 0, pricingModel: 'PER_GROUP' })).toBe(false);
  });
});

describe('image files are checked before upload', () => {
  it('names the problem the way the user can fix it', () => {
    expect(imageFileProblem({ name: 'room.png', size: 1000, type: 'image/png' })).toBeNull();
    expect(imageFileProblem({ name: 'notes.txt', size: 10, type: 'text/plain' })).toBe('notes.txt is not a JPEG, PNG, WebP or GIF image.');
    expect(imageFileProblem({ name: 'scan.pdf', size: 10, type: 'application/pdf' })).toMatch(/not a JPEG/);
    expect(imageFileProblem({ name: 'big.jpg', size: 6 * 1024 * 1024, type: 'image/jpeg' })).toBe('big.jpg is 6.0 MB. Images must be 5 MB or smaller.');
    expect(imageFileProblem({ name: 'empty.png', size: 0, type: 'image/png' })).toBe('empty.png is empty.');
  });

  it('stores only flat category details', () => {
    expect(compactAttributes({ a: '', b: 3, c: ['x'], d: [], e: undefined, f: false })).toEqual({ b: 3, c: ['x'], f: false });
  });
});

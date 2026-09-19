import { describe, expect, it } from 'vitest';
import {
  assertListingTransition,
  CATEGORY_TYPES,
  listingOrderBy,
  normalizeAttributes,
  normalizePricingModel,
  pageWindow,
  priceCentsFrom,
} from './listing-rules';
import { ListingCategory } from './dto/create-listing.dto';
import { PRICING_MODELS } from './dto/marketplace.dto';

describe('listing rules', () => {
  it('allows only the documented status transitions', () => {
    expect(() => assertListingTransition('DRAFT', 'PUBLISHED')).not.toThrow();
    expect(() => assertListingTransition('PUBLISHED', 'PAUSED')).not.toThrow();
    expect(() => assertListingTransition('PAUSED', 'PUBLISHED')).not.toThrow();
    expect(() => assertListingTransition('ARCHIVED', 'DRAFT')).not.toThrow();
    expect(() => assertListingTransition('PUBLISHED', 'PUBLISHED')).not.toThrow();
    expect(() => assertListingTransition('ARCHIVED', 'PUBLISHED')).toThrow(/cannot be changed/);
    expect(() => assertListingTransition('PUBLISHED', 'DRAFT')).toThrow(/cannot be changed/);
  });

  it('keeps money in integer cents without float drift', () => {
    expect(priceCentsFrom({ priceCents: 125_050 })).toBe(125_050n);
    expect(priceCentsFrom({ priceFrom: 1250.5 })).toBe(125_050n);
    expect(priceCentsFrom({ priceFrom: 19.99 })).toBe(1_999n);
    expect(priceCentsFrom({})).toBeUndefined();
  });

  it('normalizes pricing models and refuses unknown ones', () => {
    expect(normalizePricingModel('per_night', PRICING_MODELS)).toBe('PER_NIGHT');
    expect(() => normalizePricingModel('per_hour', PRICING_MODELS)).toThrow(/pricingModel/);
  });

  it('stores only flat category details', () => {
    expect(normalizeAttributes({ roomType: 'suite', stars: 5, breakfast: true, includes: ['hotel', 'visa'] })).toEqual({
      roomType: 'suite',
      stars: 5,
      breakfast: true,
      includes: ['hotel', 'visa'],
    });
    expect(() => normalizeAttributes({ includes: { hotel: true } })).toThrow(/short list/);
    expect(() => normalizeAttributes({ 'bad key': 1 })).toThrow(/not a valid name/);
    expect(() => normalizeAttributes([])).toThrow(/must be an object/);
  });

  it('pages safely and sorts deterministically', () => {
    expect(pageWindow(0, 1000)).toEqual({ page: 1, limit: 50, skip: 0 });
    expect(pageWindow(3, 10)).toEqual({ page: 3, limit: 10, skip: 20 });
    expect(listingOrderBy('price_asc')[0]).toEqual({ priceCents: 'asc' });
    expect(listingOrderBy(undefined)[0]).toEqual({ createdAt: 'desc' });
  });

  it('maps every API category to the stored types it covers', () => {
    for (const c of Object.values(ListingCategory)) expect(CATEGORY_TYPES[c]).toContain(c);
    expect(CATEGORY_TYPES.guide_service).toContain('guide');
  });
});

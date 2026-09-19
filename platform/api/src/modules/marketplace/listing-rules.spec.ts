import { describe, expect, it } from 'vitest';
import { ForbiddenException } from '@nestjs/common';
import {
  assertListingTransition,
  assertOwnerMayChangeStatus,
  CATEGORY_TYPES,
  listingCapacity,
  PUBLIC_LISTING,
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

  it('a platform takedown blocks every owner status change and names the reason (F2)', () => {
    expect(() => assertOwnerMayChangeStatus({ moderationStatus: 'CLEAR' })).not.toThrow();
    const down = { moderationStatus: 'TAKEN_DOWN', moderationReason: 'Misleading photos' };
    expect(() => assertOwnerMayChangeStatus(down)).toThrow(ForbiddenException);
    expect(() => assertOwnerMayChangeStatus(down)).toThrow(/taken down by the platform: Misleading photos/);
    expect(() => assertOwnerMayChangeStatus({ moderationStatus: 'TAKEN_DOWN' })).toThrow(/^This listing was taken down by the platform\. /);
  });

  it('public listings exclude taken-down ones and suspended sellers', () => {
    expect(PUBLIC_LISTING).toMatchObject({ isActive: true, status: 'PUBLISHED', moderationStatus: 'CLEAR' });
    expect(PUBLIC_LISTING.vendor).toEqual({ status: { notIn: ['SUSPENDED', 'DELISTED'] } });
  });

  it('reads a listing capacity from its category details', () => {
    expect(listingCapacity({ maxCapacity: 4 })).toBe(4);
    expect(listingCapacity({ seats: '12' })).toBe(12);
    expect(listingCapacity({ maxCapacity: 0 })).toBeNull();
    expect(listingCapacity(null)).toBeNull();
    expect(listingCapacity([3])).toBeNull();
  });
});

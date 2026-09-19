import { BadRequestException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

/**
 * Listing lifecycle a seller may drive. Publishing is reversible (PAUSED is
 * "unpublished"); archiving is the soft delete, and an archived listing comes
 * back only as a DRAFT to be reviewed and published again.
 * apps/web/components/marketplace/listing-rules.ts mirrors this literal and a
 * web test compares the two.
 */
export const LISTING_TRANSITIONS: Record<string, string[]> = {
  DRAFT: ['PUBLISHED', 'ARCHIVED'],
  PUBLISHED: ['PAUSED', 'ARCHIVED'],
  PAUSED: ['PUBLISHED', 'DRAFT', 'ARCHIVED'],
  ARCHIVED: ['DRAFT'],
};

export function assertListingTransition(from: string, to: string) {
  const current = String(from ?? '').toUpperCase();
  if (current === to) return;
  if (!(LISTING_TRANSITIONS[current] ?? []).includes(to)) {
    throw new BadRequestException(`A ${current.toLowerCase()} listing cannot be changed to ${to.toLowerCase()}`);
  }
}

/** Categories accepted by the API, and the stored `type` values each one covers (older rows used short names). */
export const CATEGORY_TYPES: Record<string, string[]> = {
  hotel_room: ['hotel_room', 'hotel', 'HOTEL_ROOM'],
  transport_service: ['transport_service', 'transport'],
  visa_service: ['visa_service', 'visa'],
  guide_service: ['guide_service', 'guide'],
  catering: ['catering'],
  other: ['other', 'package'],
};

export const LISTING_SORTS = ['newest', 'oldest', 'price_asc', 'price_desc', 'name'] as const;
export type ListingSort = (typeof LISTING_SORTS)[number];

export function listingOrderBy(sort?: string): Prisma.ListingOrderByWithRelationInput[] {
  switch (sort) {
    case 'oldest':
      return [{ createdAt: 'asc' }, { id: 'asc' }];
    case 'price_asc':
      return [{ priceCents: 'asc' }, { createdAt: 'desc' }, { id: 'asc' }];
    case 'price_desc':
      return [{ priceCents: 'desc' }, { createdAt: 'desc' }, { id: 'asc' }];
    case 'name':
      return [{ name: 'asc' }, { id: 'asc' }];
    default:
      return [{ createdAt: 'desc' }, { id: 'asc' }];
  }
}

/** Page and limit as used: page ≥ 1, limit clamped to 1..50. */
export function pageWindow(page?: number, limit?: number) {
  const p = Math.max(1, Math.floor(Number(page) || 1));
  const l = Math.min(50, Math.max(1, Math.floor(Number(limit) || 20)));
  return { page: p, limit: l, skip: (p - 1) * l };
}

/** Cents from `priceCents` (minor units) or the legacy `priceFrom` (major units). */
export function priceCentsFrom(dto: { priceCents?: number; priceFrom?: number }): bigint | undefined {
  if (dto.priceCents != null) return BigInt(Math.round(Number(dto.priceCents)));
  if (dto.priceFrom != null) return BigInt(Math.round(Number(dto.priceFrom) * 100));
  return undefined;
}

/** `per_person` / `PER_PERSON` → PER_PERSON; unknown values are refused. */
export function normalizePricingModel(v: unknown, allowed: readonly string[]): string {
  const m = String(v ?? '').trim().toUpperCase();
  if (!allowed.includes(m)) {
    throw new BadRequestException(`pricingModel must be one of: ${allowed.join(', ')}`);
  }
  return m;
}

type AttrValue = string | number | boolean | null | (string | number)[];

/**
 * Category details are displayed as a flat list of "label: value" pairs, so
 * only flat values are stored: strings, numbers, booleans and short lists.
 * Nested objects used to render as "[object Object]".
 */
export function normalizeAttributes(input: unknown): Record<string, AttrValue> {
  if (input == null) return {};
  if (typeof input !== 'object' || Array.isArray(input)) throw new BadRequestException('attributes must be an object');
  const entries = Object.entries(input as Record<string, unknown>).filter(([, v]) => v !== undefined);
  if (entries.length > 30) throw new BadRequestException('attributes can have at most 30 entries');
  const out: Record<string, AttrValue> = {};
  for (const [key, value] of entries) {
    if (!/^[A-Za-z][A-Za-z0-9_]{0,39}$/.test(key)) {
      throw new BadRequestException(`attributes.${key.slice(0, 40)} is not a valid name`);
    }
    const scalar = (v: unknown) =>
      (typeof v === 'string' && v.length <= 500) ||
      (typeof v === 'number' && Number.isFinite(v)) ||
      typeof v === 'boolean' ||
      v === null;
    const ok = Array.isArray(value)
      ? value.length <= 20 && value.every((v) => (typeof v === 'string' || typeof v === 'number') && scalar(v))
      : scalar(value);
    if (!ok) throw new BadRequestException(`attributes.${key} must be text, a number, yes/no, or a short list`);
    out[key] = value as AttrValue;
  }
  return out;
}

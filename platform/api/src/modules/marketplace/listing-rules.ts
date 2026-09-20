import { BadRequestException, ForbiddenException } from '@nestjs/common';
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

/**
 * Platform moderation (F2). `moderationStatus` is written only by the platform
 * (platform:marketplace:moderate): a TAKEN_DOWN listing is archived, never
 * appears on a public route, and its owner cannot publish, restore or otherwise
 * move it — only a platform restore clears the decision. The owner still sees
 * the listing, with the reason, and may correct its content meanwhile.
 */
export const MODERATION_CLEAR = 'CLEAR';
export const MODERATION_TAKEN_DOWN = 'TAKEN_DOWN';

/** Sellers that have been suspended or delisted by the platform are not shown to anyone else. */
export const VISIBLE_VENDOR: Prisma.VendorWhereInput = { status: { notIn: ['SUSPENDED', 'DELISTED'] } };

/** Listings the platform has not taken down — required everywhere a listing is shown to others. */
export const NOT_TAKEN_DOWN: Prisma.ListingWhereInput = { moderationStatus: MODERATION_CLEAR };

/**
 * Only live listings of sellers in good standing, not taken down by the platform,
 * are public — and only those can be booked, asked about or quoted, directly or
 * through an accepted marketplace offer.
 */
export const PUBLIC_LISTING: Prisma.ListingWhereInput = {
  isActive: true,
  status: 'PUBLISHED',
  ...NOT_TAKEN_DOWN,
  vendor: VISIBLE_VENDOR,
};

export function assertOwnerMayChangeStatus(listing: { moderationStatus?: string | null; moderationReason?: string | null }) {
  if (listing.moderationStatus === MODERATION_TAKEN_DOWN) {
    const reason = listing.moderationReason?.trim();
    throw new ForbiddenException(
      `This listing was taken down by the platform${reason ? `: ${reason}` : ''}. Only the platform can restore it — contact support to have it reviewed.`,
    );
  }
}

/**
 * D-005: a PLATFORM account administers the platform and never acts as a customer or a
 * seller. Its capabilities already exclude every tenant capability, so this is defence in
 * depth with a message that explains the refusal instead of a bare 403.
 */
export function assertNotPlatformAccount(principal: { tenantType?: string } | undefined) {
  if (principal?.tenantType === 'PLATFORM') {
    throw new ForbiddenException(
      'A platform administration account cannot act as a customer or a seller on the marketplace.',
    );
  }
}

/** A listing's capacity (people per booking) from its category details, or null when it sets none. */
export function listingCapacity(attributes: unknown): number | null {
  if (!attributes || typeof attributes !== 'object' || Array.isArray(attributes)) return null;
  const a = attributes as Record<string, unknown>;
  for (const key of ['maxCapacity', 'capacity', 'maxGuests', 'maxOccupancy', 'seats']) {
    const n = Number(a[key]);
    if (Number.isInteger(n) && n >= 1) return n;
  }
  return null;
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

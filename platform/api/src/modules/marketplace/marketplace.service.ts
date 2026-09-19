import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, TenantType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { MediaRegistryService } from '../storage/media-registry.service';
import { AuditService } from '../audit/audit.service';
import type { Principal } from '../auth/principal';
import { requireId } from '../../common/tenant-scope';
import {
  CreateListingBookingDto,
  CreateListingInquiryDto,
  MAX_PARTY_SIZE,
  PRICING_MODELS,
  UpdateListingBookingDto,
} from './dto/marketplace.dto';
import { CreateListingDto } from './dto/create-listing.dto';
import { UpdateListingDto } from './dto/update-listing.dto';
import { MyListingsQueryDto, QueryListingDto } from './dto/query-listing.dto';
import { CreateVendorDto, UpdateVendorDto } from './dto/create-vendor.dto';
import { CreateQuoteDto, RespondQuoteDto } from './dto/create-quote.dto';
import {
  assertListingTransition,
  CATEGORY_TYPES,
  listingOrderBy,
  normalizeAttributes,
  normalizePricingModel,
  pageWindow,
  priceCentsFrom,
} from './listing-rules';

/** Vendor fields that are safe to expose on public routes (never KYC documents or contact details). */
const PUBLIC_VENDOR_SELECT = {
  id: true,
  name: true,
  nameAr: true,
  type: true,
  status: true,
  description: true,
  city: true,
  country: true,
  rating: true,
  ratingCount: true,
  logoUrl: true,
  images: true,
  verifiedAt: true,
  createdAt: true,
} as const;

/** A seller's own view of its profile: contact details included, KYC material never. */
const OWN_VENDOR_SELECT = {
  ...PUBLIC_VENDOR_SELECT,
  email: true,
  phone: true,
  website: true,
  address: true,
  updatedAt: true,
} as const;

/** Sellers that have been suspended or delisted by the platform are not shown to anyone else. */
const VISIBLE_VENDOR: Prisma.VendorWhereInput = { status: { notIn: ['SUSPENDED', 'DELISTED'] } };

/** Only live listings of sellers in good standing are public. */
const PUBLIC_LISTING: Prisma.ListingWhereInput = { isActive: true, status: 'PUBLISHED', vendor: VISIBLE_VENDOR };

/** Allowed provider-driven booking status transitions. PAID / REFUNDED are set by the payments module. */
const BOOKING_TRANSITIONS: Record<string, string[]> = {
  PENDING: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['COMPLETED', 'CANCELLED'],
  PAID: ['COMPLETED'],
  COMPLETED: [],
  CANCELLED: [],
  REFUNDED: [],
};

/** Booking states that prove the customer actually transacted with the vendor. */
const VERIFYING_BOOKING_STATUSES = ['CONFIRMED', 'PAID', 'COMPLETED'];

const toPublicVendor = <T extends { verifiedAt?: Date | null; status?: string }>(v: T) => {
  const { verifiedAt, ...rest } = v as any;
  return { ...rest, verified: !!verifiedAt || v.status === 'VERIFIED' };
};

/** The public face of a listing: no internal flags, counts or organization ids. */
function toPublicListing(l: any) {
  return {
    id: l.id,
    vendorId: l.vendorId,
    type: l.type,
    name: l.name,
    nameAr: l.nameAr,
    description: l.description,
    priceCents: Number(l.priceCents),
    currency: l.currency,
    pricingModel: l.pricingModel,
    attributes: l.attributes ?? {},
    imageUrls: l.imageUrls ?? [],
    city: l.city ?? null,
    status: l.status,
    createdAt: l.createdAt,
    updatedAt: l.updatedAt,
    ...(l.vendor ? { vendor: toPublicVendor(l.vendor) } : {}),
  };
}

/** The owner's view: the whole row with money as numbers. */
function toOwnerListing(l: any) {
  return { ...l, priceCents: Number(l.priceCents), ...(l.vendor ? { vendor: toPublicVendor(l.vendor) } : {}) };
}

const dateOnly = (iso: string) => iso.slice(0, 10);

/** CreateVendorDto.type → Vendor.type (TenantType). OTHER keeps the caller organization's type. */
const VENDOR_TYPE_TO_TENANT_TYPE: Record<string, string> = {
  HOTEL: 'VENDOR_HOTEL',
  TRANSPORT: 'VENDOR_TRANSPORT',
  GUIDE: 'VENDOR_GUIDE',
  CATERING: 'VENDOR_CATERING',
  VISA_AGENT: 'VENDOR_VISA',
};

const insensitive = (value: string) => ({ contains: value, mode: 'insensitive' as const });

@Injectable()
export class MarketplaceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly media: MediaRegistryService,
    private readonly audit: AuditService,
  ) {}

  // ── Ownership helpers ────────────────────────────────────────────────────────

  /** A listing whose vendor belongs to `tenantId`; foreign/unknown ids → 404. */
  async findOwnedListing(tenantId: string, id: string) {
    const safeId = requireId(id, 'Listing');
    if (!tenantId) throw new NotFoundException('Listing not found');
    const listing = await this.prisma.listing.findFirst({ where: { id: safeId, vendor: { tenantId } } });
    if (!listing) throw new NotFoundException('Listing not found');
    return listing;
  }

  /** The seller profile a new listing belongs to: the one named (if it is the caller's), else the first. */
  private async resolveOwnVendor(tenantId: string, vendorId?: string, type?: string) {
    if (vendorId) {
      const vendor = await this.prisma.vendor.findFirst({
        where: { id: requireId(vendorId, 'Vendor'), tenantId },
        select: { id: true },
      });
      if (!vendor) throw new NotFoundException('Vendor not found');
      return vendor.id;
    }
    const first = await this.prisma.vendor.findFirst({
      where: { tenantId, ...(type ? { type: type as TenantType } : {}) },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    });
    if (first) return first.id;
    // API clients that skip the seller-profile step get one built from the organization profile.
    return (await this.createVendorFromTenant(tenantId, type)).id;
  }

  private async createVendorFromTenant(tenantId: string, type?: string) {
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) throw new NotFoundException('Organization not found');
    return this.prisma.vendor.create({
      data: {
        tenantId,
        type: (type as TenantType) ?? tenant.type,
        name: tenant.name,
        email: tenant.email,
        phone: tenant.phone ?? undefined,
        country: tenant.country ?? 'SA',
        status: 'PENDING_KYC',
        kycDocuments: [],
        images: [],
      },
    });
  }

  // ── Listings: public catalogue ────────────────────────────────────────────────

  private searchConditions(query: { search?: string; category?: string }): Prisma.ListingWhereInput[] {
    const and: Prisma.ListingWhereInput[] = [];
    if (query.category) and.push({ type: { in: CATEGORY_TYPES[query.category] ?? [query.category] } });
    const q = query.search?.trim();
    if (q) {
      and.push({
        OR: [
          { name: insensitive(q) },
          { nameAr: insensitive(q) },
          { description: insensitive(q) },
          { city: insensitive(q) },
          { vendor: { name: insensitive(q) } },
        ],
      });
    }
    return and;
  }

  async searchListings(query: QueryListingDto) {
    const { page, limit, skip } = pageWindow(query.page, query.limit);
    const and: Prisma.ListingWhereInput[] = [PUBLIC_LISTING, ...this.searchConditions(query)];
    if (query.vendorId) and.push({ vendorId: query.vendorId });
    if (query.city) and.push({ city: insensitive(query.city.trim()) });
    if (query.currency) and.push({ currency: query.currency });
    if (query.minPriceCents != null || query.maxPriceCents != null) {
      if (query.minPriceCents != null && query.maxPriceCents != null && query.minPriceCents > query.maxPriceCents) {
        throw new BadRequestException('The minimum price cannot be higher than the maximum price');
      }
      and.push({
        priceCents: {
          ...(query.minPriceCents != null ? { gte: BigInt(query.minPriceCents) } : {}),
          ...(query.maxPriceCents != null ? { lte: BigInt(query.maxPriceCents) } : {}),
        },
      });
    }
    const where: Prisma.ListingWhereInput = { AND: and };
    const [rows, total] = await Promise.all([
      this.prisma.listing.findMany({
        where,
        skip,
        take: limit,
        orderBy: listingOrderBy(query.sort),
        include: { vendor: { select: PUBLIC_VENDOR_SELECT } },
      }),
      this.prisma.listing.count({ where }),
    ]);
    return {
      items: rows.map(toPublicListing),
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  }

  async findPublicListing(id: string) {
    const listing = await this.prisma.listing.findFirst({
      where: { ...PUBLIC_LISTING, id: requireId(id, 'Listing') },
      include: { vendor: { select: PUBLIC_VENDOR_SELECT } },
    });
    if (!listing) throw new NotFoundException('Listing not found');
    return toPublicListing(listing);
  }

  // ── Listings: the seller's own ────────────────────────────────────────────────

  async myListings(tenantId: string, query: MyListingsQueryDto) {
    const { page, limit, skip } = pageWindow(query.page, query.limit);
    const and: Prisma.ListingWhereInput[] = [{ vendor: { tenantId } }, ...this.searchConditions(query)];
    if (query.status) and.push({ status: query.status });
    const where: Prisma.ListingWhereInput = { AND: and };
    const [rows, total] = await Promise.all([
      this.prisma.listing.findMany({
        where,
        skip,
        take: limit,
        orderBy: listingOrderBy(query.sort),
        include: {
          vendor: { select: PUBLIC_VENDOR_SELECT },
          _count: { select: { inquiries: true, bookings: true, quotes: true } },
        },
      }),
      this.prisma.listing.count({ where }),
    ]);
    return {
      items: rows.map(toOwnerListing),
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  }

  async myListing(tenantId: string, id: string) {
    await this.findOwnedListing(tenantId, id);
    const listing = await this.prisma.listing.findUniqueOrThrow({
      where: { id },
      include: {
        vendor: { select: PUBLIC_VENDOR_SELECT },
        _count: { select: { inquiries: true, bookings: true, quotes: true } },
      },
    });
    return toOwnerListing(listing);
  }

  async createListing(tenantId: string, dto: CreateListingDto) {
    const vendorId = await this.resolveOwnVendor(tenantId, dto.vendorId, dto.vendorType);
    const attributes = normalizeAttributes(dto.attributes);
    const city = dto.city?.trim() || (typeof attributes.city === 'string' ? attributes.city.trim() : '');
    if (city) attributes.city = city;
    if (dto.maxCapacity != null) attributes.maxCapacity = dto.maxCapacity;
    const imageUrls = dto.imageUrls ?? [];
    await this.media.assertListingImages(tenantId, imageUrls);

    const listing = await this.prisma.listing.create({
      data: {
        vendorId,
        type: dto.category,
        name: dto.title.trim(),
        nameAr: dto.titleAr,
        description: dto.description,
        priceCents: priceCentsFrom(dto) ?? 0n,
        currency: dto.currency ?? 'SAR',
        pricingModel: normalizePricingModel(dto.pricingModel ?? dto.unit ?? 'PER_PERSON', PRICING_MODELS),
        attributes: attributes as Prisma.InputJsonObject,
        imageUrls,
        city: city ? city.slice(0, 100) : null,
        status: dto.status ?? 'PUBLISHED',
        isActive: true,
      },
      include: { vendor: { select: PUBLIC_VENDOR_SELECT } },
    });
    return toOwnerListing(listing);
  }

  async updateListing(tenantId: string, id: string, dto: UpdateListingDto) {
    const existing = await this.findOwnedListing(tenantId, id);
    const data: Prisma.ListingUpdateInput = {};

    const name = dto.name ?? dto.title;
    if (name !== undefined) data.name = name.trim();
    const nameAr = dto.nameAr ?? dto.titleAr;
    if (nameAr !== undefined) data.nameAr = nameAr || null;
    if (dto.description !== undefined) data.description = dto.description;
    if (dto.category !== undefined) data.type = dto.category;
    const price = priceCentsFrom(dto);
    if (price !== undefined) data.priceCents = price;
    if (dto.currency !== undefined) data.currency = dto.currency;
    if (dto.pricingModel !== undefined || dto.unit !== undefined) {
      data.pricingModel = normalizePricingModel(dto.pricingModel ?? dto.unit, PRICING_MODELS);
    }

    // Category details replace the old ones when sent; city and capacity are merged in.
    let attributes: Record<string, unknown> | undefined =
      dto.attributes !== undefined ? normalizeAttributes(dto.attributes) : undefined;
    if (dto.city !== undefined || dto.maxCapacity !== undefined) {
      attributes = { ...((attributes ?? existing.attributes ?? {}) as Record<string, unknown>) };
      if (dto.maxCapacity != null) attributes.maxCapacity = dto.maxCapacity;
      if (dto.city !== undefined) {
        const city = dto.city?.trim() ?? '';
        if (city) attributes.city = city;
        else delete attributes.city;
      }
    }
    if (attributes) {
      data.attributes = attributes as Prisma.InputJsonObject;
      data.city = typeof attributes.city === 'string' && attributes.city ? attributes.city.slice(0, 100) : null;
    }

    if (dto.imageUrls !== undefined) {
      await this.media.assertListingImages(tenantId, dto.imageUrls, existing.imageUrls);
      data.imageUrls = dto.imageUrls;
    }
    if (dto.status !== undefined) {
      assertListingTransition(existing.status, dto.status);
      data.status = dto.status;
      // `isActive` is the soft-delete flag: only an archived listing is inactive.
      data.isActive = dto.status !== 'ARCHIVED';
    }

    const listing = await this.prisma.listing.update({
      where: { id: existing.id },
      data,
      include: {
        vendor: { select: PUBLIC_VENDOR_SELECT },
        _count: { select: { inquiries: true, bookings: true, quotes: true } },
      },
    });
    return toOwnerListing(listing);
  }

  /** Soft delete: the listing leaves the catalogue; its inquiries, quotes and bookings stay. */
  async archiveListing(tenantId: string, id: string) {
    const existing = await this.findOwnedListing(tenantId, id);
    if (existing.status === 'ARCHIVED' && !existing.isActive) return toOwnerListing(existing);
    const listing = await this.prisma.listing.update({
      where: { id: existing.id },
      data: { status: 'ARCHIVED', isActive: false },
    });
    return toOwnerListing(listing);
  }

  // ── Inquiries (lightweight contact-vendor request) ──────────────────────────
  async createInquiry(listingId: string, userId: string | null, dto: CreateListingInquiryDto) {
    const listing = await this.prisma.listing.findFirst({
      where: { ...PUBLIC_LISTING, id: requireId(listingId, 'Listing') },
      include: { vendor: true },
    });
    if (!listing) throw new NotFoundException('Listing not found');
    const inq = await this.prisma.listingInquiry.create({
      data: {
        listingId: listing.id,
        fromUserId: userId && userId.length === 36 ? userId : null,
        fromName: dto.name ?? dto.fromName,
        fromEmail: dto.email ?? dto.fromEmail,
        fromPhone: dto.phone ?? dto.fromPhone,
        message: dto.message ?? '',
        partySize: dto.partySize,
        startDate: dto.startDate ? new Date(dto.startDate) : undefined,
        endDate: dto.endDate ? new Date(dto.endDate) : undefined,
        status: 'NEW',
      },
    });
    // Best-effort notification to the seller's organization.
    if (listing.vendor.tenantId) {
      const adminUser = await this.prisma.user.findFirst({
        where: { tenantId: listing.vendor.tenantId },
        orderBy: { createdAt: 'asc' },
      });
      if (adminUser) {
        await this.notifications.fire({
          recipientUserId: adminUser.id,
          actorUserId: userId ?? undefined,
          tenantId: listing.vendor.tenantId,
          type: 'REQUEST_OFFER',
          title: `New inquiry on "${listing.name}"`,
          body: dto.message?.slice(0, 200),
          link: `/marketplace/${listing.id}`,
          data: { listingId: listing.id, inquiryId: inq.id },
        });
      }
    }
    return inq;
  }

  /** Inquiries on one listing, or on every listing of the organization. */
  async listInquiries(filter: { listingId?: string; tenantId?: string }) {
    const where: Prisma.ListingInquiryWhereInput = {};
    if (filter.listingId) where.listingId = filter.listingId;
    if (filter.tenantId) where.listing = { vendor: { tenantId: filter.tenantId } };
    return this.prisma.listingInquiry.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: { listing: { select: { id: true, name: true, type: true, vendorId: true } } },
    });
  }

  async respondInquiry(tenantId: string, id: string, response: string, status: string = 'RESPONDED') {
    const safeId = requireId(id, 'Inquiry');
    if (!tenantId) throw new NotFoundException('Inquiry not found');
    const inquiry = await this.prisma.listingInquiry.findFirst({
      where: { id: safeId, listing: { vendor: { tenantId } } },
      select: { id: true },
    });
    if (!inquiry) throw new NotFoundException('Inquiry not found');
    return this.prisma.listingInquiry.update({
      where: { id: safeId },
      data: { response, status: status ?? 'RESPONDED', respondedAt: new Date() },
    });
  }

  // ── Bookings on a listing ────────────────────────────────────────────────
  async createBooking(listingId: string, customerUserId: string, dto: CreateListingBookingDto) {
    const listing = await this.prisma.listing.findFirst({
      where: { ...PUBLIC_LISTING, id: requireId(listingId, 'Listing') },
    });
    if (!listing) throw new NotFoundException('Listing not found');

    const partySize = dto.partySize ?? 1;
    const capacity = this.listingCapacity(listing.attributes);
    const maxParty = capacity != null ? Math.min(capacity, MAX_PARTY_SIZE) : MAX_PARTY_SIZE;
    if (!Number.isInteger(partySize) || partySize < 1 || partySize > maxParty) {
      throw new BadRequestException(`partySize must be a whole number between 1 and ${maxParty}`);
    }

    // Dates: start must not be in the past (one day of grace for time zones), end ≥ start.
    if (dto.endDate && !dto.startDate) throw new BadRequestException('startDate is required when endDate is given');
    if (dto.startDate) {
      const earliest = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      if (dateOnly(dto.startDate) < earliest) throw new BadRequestException('startDate cannot be in the past');
    }
    if (dto.startDate && dto.endDate && dateOnly(dto.endDate) < dateOnly(dto.startDate)) {
      throw new BadRequestException('endDate cannot be before startDate');
    }

    // Server-computed total from the listing's pricing model; client totals are never trusted.
    const price = BigInt(listing.priceCents);
    const model = String(listing.pricingModel ?? '').toUpperCase();
    let totalAmountCents: bigint;
    if (price <= 0n) {
      throw new BadRequestException('This listing has no set price. Send an inquiry or a service request instead.');
    } else if (model === 'PER_PERSON') {
      totalAmountCents = price * BigInt(partySize);
    } else if (model === 'PER_GROUP') {
      totalAmountCents = price;
    } else {
      throw new BadRequestException(
        `Listings priced ${model || 'this way'} cannot be booked directly. Send an inquiry or a service request to get a quote.`,
      );
    }
    if (dto.totalAmountCents != null && BigInt(dto.totalAmountCents) !== totalAmountCents) {
      throw new BadRequestException('The booking total has changed. Refresh the listing and try again.');
    }

    const booking = await this.prisma.listingBooking.create({
      data: {
        listingId: listing.id,
        customerUserId,
        customerName: dto.customerName ?? dto.name ?? 'Customer',
        customerEmail: dto.customerEmail ?? dto.email,
        customerPhone: dto.customerPhone ?? dto.phone,
        startDate: dto.startDate ? new Date(dto.startDate) : undefined,
        endDate: dto.endDate ? new Date(dto.endDate) : undefined,
        partySize,
        totalAmountCents,
        currency: listing.currency,
        status: 'PENDING',
        paymentStatus: 'UNPAID',
        notes: dto.notes,
      },
    });
    return { ...booking, totalAmountCents: Number((booking as any).totalAmountCents) };
  }

  private listingCapacity(attributes: unknown): number | null {
    if (!attributes || typeof attributes !== 'object' || Array.isArray(attributes)) return null;
    const a = attributes as Record<string, unknown>;
    for (const key of ['maxCapacity', 'capacity', 'maxGuests', 'maxOccupancy', 'seats']) {
      const n = Number(a[key]);
      if (Number.isInteger(n) && n >= 1) return n;
    }
    return null;
  }

  /** Bookings on one listing, of every listing of an organization, or placed by a user. */
  async listBookings(filter: { listingId?: string; tenantId?: string; userId?: string }) {
    const where: Prisma.ListingBookingWhereInput = {};
    if (filter.listingId) where.listingId = filter.listingId;
    if (filter.userId) where.customerUserId = filter.userId;
    if (filter.tenantId) where.listing = { vendor: { tenantId: filter.tenantId } };
    const items = await this.prisma.listingBooking.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: { listing: { select: { id: true, name: true, type: true, vendorId: true } } },
    });
    return items.map((b: any) => ({ ...b, totalAmountCents: Number(b.totalAmountCents) }));
  }

  async updateBooking(tenantId: string, id: string, dto: UpdateListingBookingDto) {
    if (dto.paymentStatus !== undefined) {
      throw new BadRequestException('paymentStatus cannot be set here; it is updated by the payments module');
    }
    if (dto.totalAmountCents !== undefined) {
      throw new BadRequestException('totalAmountCents cannot be changed; it is computed from the listing');
    }
    const safeId = requireId(id, 'Booking');
    if (!tenantId) throw new NotFoundException('Booking not found');
    const existing = await this.prisma.listingBooking.findFirst({
      where: { id: safeId, listing: { vendor: { tenantId } } },
    });
    if (!existing) throw new NotFoundException('Booking not found');

    const data: any = {};
    if (dto.status !== undefined && dto.status !== existing.status) {
      const from = String(existing.status).toUpperCase();
      const allowed = BOOKING_TRANSITIONS[from] ?? [];
      if (!allowed.includes(dto.status)) {
        throw new BadRequestException(
          dto.status === 'PAID' || dto.status === 'REFUNDED'
            ? `${dto.status} is set by the payments module`
            : `Cannot change a ${from} booking to ${dto.status}`,
        );
      }
      data.status = dto.status;
    }
    if (dto.notes !== undefined) data.notes = dto.notes;
    if (dto.customerName !== undefined) data.customerName = dto.customerName;
    if (dto.customerEmail !== undefined) data.customerEmail = dto.customerEmail;
    if (dto.customerPhone !== undefined) data.customerPhone = dto.customerPhone;
    const start = dto.startDate !== undefined ? dto.startDate : existing.startDate?.toISOString();
    const end = dto.endDate !== undefined ? dto.endDate : existing.endDate?.toISOString();
    if (start && end && dateOnly(end) < dateOnly(start)) {
      throw new BadRequestException('endDate cannot be before startDate');
    }
    if (dto.startDate !== undefined) data.startDate = new Date(dto.startDate);
    if (dto.endDate !== undefined) data.endDate = new Date(dto.endDate);

    const booking = await this.prisma.listingBooking.update({ where: { id: safeId }, data });
    return { ...booking, totalAmountCents: Number((booking as any).totalAmountCents) };
  }

  /**
   * The customer cancels their own booking. Allowed only while the provider has
   * not confirmed it and no money has moved: status PENDING, payment UNPAID, and
   * no captured, authorised or in-flight payment (a checkout opened in the last
   * 24 hours could still be completed, so it blocks too). Anything else is a
   * conversation with the provider (refunds belong to the payments module).
   */
  async cancelOwnBooking(user: Principal, id: string) {
    const safeId = requireId(id, 'Booking');
    const booking = await this.prisma.listingBooking.findFirst({
      where: { id: safeId, customerUserId: user.sub },
      include: { listing: { select: { name: true, vendor: { select: { tenantId: true } } } } },
    });
    if (!booking) throw new NotFoundException('Booking not found');
    if (booking.status === 'CANCELLED') throw new ConflictException('This booking is already cancelled');
    if (booking.paymentStatus !== 'UNPAID') {
      throw new ConflictException(
        `This booking is ${booking.paymentStatus === 'PARTIAL' ? 'partially paid' : booking.paymentStatus.toLowerCase()}. Contact the provider to cancel and arrange a refund.`,
      );
    }
    if (booking.status !== 'PENDING') {
      throw new ConflictException(`A ${booking.status.toLowerCase()} booking can only be cancelled by the provider. Contact them.`);
    }
    const blocking = await this.prisma.payment.findFirst({
      where: {
        listingBookingId: booking.id,
        OR: [
          { status: { in: ['PROCESSING', 'AUTHORIZED', 'COMPLETED', 'PARTIALLY_REFUNDED', 'DISPUTED'] } },
          { status: 'PENDING', createdAt: { gt: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
        ],
      },
      select: { status: true },
    });
    if (blocking) {
      throw new ConflictException(
        ['COMPLETED', 'PARTIALLY_REFUNDED', 'DISPUTED'].includes(blocking.status)
          ? 'A payment is recorded for this booking. Contact the provider to cancel and arrange a refund.'
          : 'A payment for this booking has been started. Let it finish or expire, or contact the provider.',
      );
    }

    // Conditional update: a confirmation or payment landing meanwhile wins.
    const res = await this.prisma.listingBooking.updateMany({
      where: { id: booking.id, customerUserId: user.sub, status: 'PENDING', paymentStatus: 'UNPAID' },
      data: { status: 'CANCELLED' },
    });
    if (res.count !== 1) throw new ConflictException('This booking changed meanwhile. Refresh and try again.');

    await this.audit.log({
      tenantId: booking.listing.vendor.tenantId ?? undefined,
      actorId: user.sub,
      actorEmail: user.email ?? undefined,
      action: 'UPDATE',
      namespace: 'marketplace',
      resource: 'listing_booking',
      resourceId: booking.id,
      beforeState: { status: booking.status, paymentStatus: booking.paymentStatus },
      afterState: { status: 'CANCELLED', paymentStatus: booking.paymentStatus },
      metadata: { cancelledBy: 'customer' },
    });
    const providerTenantId = booking.listing.vendor.tenantId;
    if (providerTenantId) {
      const recipient = await this.prisma.user.findFirst({ where: { tenantId: providerTenantId }, orderBy: { createdAt: 'asc' } });
      if (recipient) {
        await this.notifications.fire({
          recipientUserId: recipient.id,
          actorUserId: user.sub,
          tenantId: providerTenantId,
          type: 'BOOKING_STATUS',
          title: `Booking cancelled by the customer`,
          body: `The booking for "${booking.listing.name}" was cancelled before confirmation.`,
          link: `/marketplace/${booking.listingId}`,
          data: { listingBookingId: booking.id },
        });
      }
    }
    const updated = await this.prisma.listingBooking.findUniqueOrThrow({ where: { id: booking.id } });
    return { ...updated, totalAmountCents: Number(updated.totalAmountCents) };
  }

  // ── Vendors (seller profiles) ─────────────────────────────────────────────────

  async findAllVendors(type?: string, city?: string) {
    const where: Prisma.VendorWhereInput = { ...VISIBLE_VENDOR };
    if (type) {
      if (!(Object.values(TenantType) as string[]).includes(type)) throw new BadRequestException('Unknown vendor type');
      where.type = type as TenantType;
    }
    if (city) where.city = insensitive(city);
    const items = await this.prisma.vendor.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      select: {
        ...PUBLIC_VENDOR_SELECT,
        _count: { select: { listings: { where: { isActive: true, status: 'PUBLISHED' } }, ratings: true } },
      },
    });
    return items.map(toPublicVendor);
  }

  async findOneVendor(id: string) {
    const vendor = await this.prisma.vendor.findFirst({
      where: { ...VISIBLE_VENDOR, id: requireId(id, 'Vendor') },
      select: {
        ...PUBLIC_VENDOR_SELECT,
        listings: { where: { isActive: true, status: 'PUBLISHED' }, orderBy: { createdAt: 'desc' } },
        _count: { select: { ratings: true } },
      },
    });
    if (!vendor) throw new NotFoundException(`Vendor ${id} not found`);
    const { listings, ...rest } = vendor as any;
    return { ...toPublicVendor(rest), listings: listings.map(toPublicListing) };
  }

  /** Every seller profile of the caller's organization, oldest (primary) first. */
  async findMyVendors(tenantId: string) {
    const items = await this.prisma.vendor.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'asc' },
      select: { ...OWN_VENDOR_SELECT, _count: { select: { listings: true } } },
    });
    return items.map(toPublicVendor);
  }

  /** The organization's primary seller profile, or null when it has not created one yet. */
  async findMyVendor(tenantId: string) {
    return (await this.findMyVendors(tenantId))[0] ?? null;
  }

  async createVendor(tenantId: string, dto: CreateVendorDto) {
    // The public vendor type (HOTEL, TRANSPORT, …) maps onto the organization type the column stores.
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { type: true, email: true, country: true },
    });
    if (!tenant) throw new NotFoundException('Organization not found');
    const type = VENDOR_TYPE_TO_TENANT_TYPE[String(dto.type ?? '').toUpperCase()] ?? tenant.type;
    const vendor = await this.prisma.vendor.create({
      data: {
        name: dto.name.trim(),
        nameAr: dto.nameAr,
        type: type as TenantType,
        email: dto.email ?? tenant.email,
        phone: dto.phone,
        country: dto.country ?? tenant.country ?? 'SA',
        city: dto.city,
        website: dto.website,
        description: dto.description,
        status: 'PENDING_KYC',
        tenantId,
        kycDocuments: [],
        images: [],
      },
      select: OWN_VENDOR_SELECT,
    });
    return toPublicVendor(vendor);
  }

  async updateVendor(tenantId: string, id: string, dto: UpdateVendorDto) {
    const vendor = await this.prisma.vendor.findFirst({ where: { id: requireId(id, 'Vendor'), tenantId } });
    if (!vendor) throw new NotFoundException('Vendor not found');
    const data: Prisma.VendorUpdateInput = {};
    if (dto.name !== undefined) data.name = dto.name.trim();
    if (dto.nameAr !== undefined) data.nameAr = dto.nameAr || null;
    if (dto.type !== undefined) {
      data.type = (VENDOR_TYPE_TO_TENANT_TYPE[dto.type] ?? vendor.type) as TenantType;
    }
    for (const key of ['email', 'phone', 'country', 'city', 'website', 'description'] as const) {
      if (dto[key] !== undefined) (data as any)[key] = dto[key];
    }
    const updated = await this.prisma.vendor.update({ where: { id: vendor.id }, data, select: OWN_VENDOR_SELECT });
    return toPublicVendor(updated);
  }

  /**
   * One rating per user per vendor (a repeat submission updates the existing rating).
   * `isVerified` is derived from the caller's own confirmed/completed bookings with the vendor.
   * VendorRating has no user column, so the user is keyed through `bookingRef` (unique with vendor+tenant).
   */
  async rateVendor(tenantId: string, vendorId: string, userId: string, score: number, review?: string) {
    const vendor = await this.prisma.vendor.findUnique({
      where: { id: requireId(vendorId, 'Vendor') },
      select: { id: true, tenantId: true },
    });
    if (!vendor) throw new NotFoundException('Vendor not found');
    if (vendor.tenantId && vendor.tenantId === tenantId) {
      throw new ForbiddenException('You cannot rate your own organization');
    }
    const verifiedBooking = await this.prisma.listingBooking.findFirst({
      where: { customerUserId: userId, listing: { vendorId }, status: { in: VERIFYING_BOOKING_STATUSES } },
      select: { id: true },
    });
    const isVerified = !!verifiedBooking;
    const bookingRef = `user:${userId}`;

    const existing = await this.prisma.vendorRating.findFirst({ where: { vendorId, tenantId, bookingRef } });
    const rating = existing
      ? await this.prisma.vendorRating.update({
          where: { id: existing.id },
          data: { score, review: review ?? null, isVerified },
        })
      : await this.prisma.vendorRating.create({ data: { vendorId, tenantId, score, review, bookingRef, isVerified } });

    const agg = await this.prisma.vendorRating.aggregate({ where: { vendorId }, _avg: { score: true }, _count: true });
    await this.prisma.vendor.update({
      where: { id: vendorId },
      data: { rating: agg._avg?.score ?? 0, ratingCount: agg._count },
    });
    return rating;
  }

  // ── Quotes (an organization asks a seller for a price) ────────────────────────

  private normalizeQuote(q: any) {
    return { ...q, offeredPriceCents: q.offeredPriceCents != null ? Number(q.offeredPriceCents) : null };
  }

  async requestQuote(tenantId: string, dto: CreateQuoteDto) {
    const listing = await this.prisma.listing.findFirst({
      where: { ...PUBLIC_LISTING, id: requireId(dto.listingId, 'Listing') },
      select: { id: true, vendorId: true, currency: true, vendor: { select: { tenantId: true } } },
    });
    if (!listing || (dto.vendorId && dto.vendorId !== listing.vendorId)) {
      throw new NotFoundException('Listing not found for this vendor');
    }
    if (listing.vendor.tenantId === tenantId) {
      throw new ForbiddenException('You cannot request a quote from your own organization');
    }
    const legacyDates = dto.requestedDates ?? {};
    const startDate = dto.startDate ?? (typeof legacyDates.from === 'string' ? legacyDates.from : undefined);
    const endDate = dto.endDate ?? (typeof legacyDates.to === 'string' ? legacyDates.to : undefined);
    if (startDate && endDate && dateOnly(endDate) < dateOnly(startDate)) {
      throw new BadRequestException('endDate cannot be before startDate');
    }
    const requirements: Record<string, unknown> = {};
    if (dto.requirements?.trim()) requirements.text = dto.requirements.trim();
    if (dto.requestedPax != null) requirements.pax = dto.requestedPax;
    if (startDate) requirements.startDate = dateOnly(startDate);
    if (endDate) requirements.endDate = dateOnly(endDate);
    const quote = await this.prisma.quote.create({
      data: {
        tenantId,
        vendorId: listing.vendorId,
        listingId: listing.id,
        status: 'PENDING',
        requirements: requirements as Prisma.InputJsonObject,
        currency: listing.currency,
      },
    });
    return this.normalizeQuote(quote);
  }

  createQuote = this.requestQuote.bind(this);

  /** Quotes the caller's organization has asked for. */
  async findMyQuotes(tenantId: string) {
    const items = await this.prisma.quote.findMany({
      where: { tenantId },
      orderBy: { requestedAt: 'desc' },
      include: {
        vendor: { select: { id: true, name: true, city: true } },
        listing: { select: { id: true, name: true, type: true } },
      },
    });
    return items.map((q) => this.normalizeQuote(q));
  }

  /** Quotes other organizations have asked the caller's seller profiles for. */
  async findIncomingQuotes(tenantId: string) {
    const items = await this.prisma.quote.findMany({
      where: { vendor: { tenantId } },
      orderBy: { requestedAt: 'desc' },
      include: {
        vendor: { select: { id: true, name: true } },
        listing: { select: { id: true, name: true, type: true } },
      },
    });
    const requesters = await this.prisma.tenant.findMany({
      where: { id: { in: [...new Set(items.map((q) => q.tenantId))] } },
      select: { id: true, name: true },
    });
    const names = new Map(requesters.map((t) => [t.id, t.name]));
    return items.map((q) => ({ ...this.normalizeQuote(q), requesterName: names.get(q.tenantId) ?? null }));
  }

  /** Only the quoted vendor's organization may respond, and only while the quote is open. */
  async respondToQuote(tenantId: string, id: string, dto: RespondQuoteDto) {
    const safeId = requireId(id, 'Quote');
    if (!tenantId) throw new NotFoundException('Quote not found');
    const quote = await this.prisma.quote.findFirst({ where: { id: safeId, vendor: { tenantId } } });
    if (!quote) throw new NotFoundException('Quote not found');
    if (!['PENDING', 'OFFERED'].includes(quote.status)) {
      throw new ConflictException(`Quote is already ${quote.status.toLowerCase()}`);
    }
    const cents =
      dto.offeredPriceCents != null
        ? BigInt(dto.offeredPriceCents)
        : dto.quotedPrice != null
          ? BigInt(Math.round(Number(dto.quotedPrice) * 100))
          : null;
    if (cents == null || cents <= 0n) throw new BadRequestException('Enter a price greater than zero');
    if (dto.validUntil && new Date(dto.validUntil).getTime() <= Date.now()) {
      throw new BadRequestException('validUntil must be in the future');
    }
    const updated = await this.prisma.quote.update({
      where: { id: safeId },
      data: {
        status: 'OFFERED',
        offeredPriceCents: cents,
        currency: dto.currency ?? undefined,
        validUntil: dto.validUntil ? new Date(dto.validUntil) : undefined,
        notes: dto.notes,
        respondedAt: new Date(),
      },
    });
    return this.normalizeQuote(updated);
  }

  /** Only the requesting organization may accept, and only an offered, unexpired quote. */
  async acceptQuote(tenantId: string, id: string) {
    const safeId = requireId(id, 'Quote');
    if (!tenantId) throw new NotFoundException('Quote not found');
    const quote = await this.prisma.quote.findFirst({ where: { id: safeId, tenantId } });
    if (!quote) throw new NotFoundException('Quote not found');
    if (quote.status !== 'OFFERED') throw new ConflictException('Only an offered quote can be accepted');
    if (quote.validUntil && quote.validUntil.getTime() < Date.now()) {
      throw new ConflictException('This quote has expired');
    }
    const res = await this.prisma.quote.updateMany({
      where: { id: safeId, tenantId, status: 'OFFERED' },
      data: { status: 'ACCEPTED', acceptedAt: new Date() },
    });
    if (res.count !== 1) throw new ConflictException('Quote is no longer open');
    return this.normalizeQuote(await this.prisma.quote.findUniqueOrThrow({ where: { id: safeId } }));
  }

  /** The requesting organization declines (or withdraws) a quote that is still open. */
  async rejectQuote(tenantId: string, id: string) {
    const safeId = requireId(id, 'Quote');
    if (!tenantId) throw new NotFoundException('Quote not found');
    const quote = await this.prisma.quote.findFirst({ where: { id: safeId, tenantId } });
    if (!quote) throw new NotFoundException('Quote not found');
    const res = await this.prisma.quote.updateMany({
      where: { id: safeId, tenantId, status: { in: ['PENDING', 'OFFERED'] } },
      data: { status: 'REJECTED', rejectedAt: new Date() },
    });
    if (res.count !== 1) throw new ConflictException(`Quote is already ${quote.status.toLowerCase()}`);
    return this.normalizeQuote(await this.prisma.quote.findUniqueOrThrow({ where: { id: safeId } }));
  }
}

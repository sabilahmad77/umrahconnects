import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { requireId } from '../../common/tenant-scope';
import {
  CreateListingBookingDto,
  CreateListingInquiryDto,
  LISTING_STATUSES,
  MAX_PARTY_SIZE,
  PRICING_MODELS,
  UpdateListingBookingDto,
} from './dto/marketplace.dto';

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

const dateOnly = (iso: string) => iso.slice(0, 10);

/** CreateVendorDto.type → Vendor.type (TenantType). OTHER keeps the caller organization's type. */
const VENDOR_TYPE_TO_TENANT_TYPE: Record<string, string> = {
  HOTEL: 'VENDOR_HOTEL',
  TRANSPORT: 'VENDOR_TRANSPORT',
  GUIDE: 'VENDOR_GUIDE',
  CATERING: 'VENDOR_CATERING',
  VISA_AGENT: 'VENDOR_VISA',
};

@Injectable()
export class MarketplaceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
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

  // ── Listings ──────────────────────────────────────────────────────────────────

  async findAllListings(query: any, _tenantId?: string) {
    const { page = 1, limit = 20, type, category, search, vendorId, status, includeInactive } = query;
    const skip = (+page - 1) * +limit;
    // Public catalogue: only live listings. Owners manage drafts through /marketplace/listings/mine.
    const where: any = { isActive: true, status: 'PUBLISHED' };
    void includeInactive;
    if (type) where.type = type;
    if (category) where.type = category;
    if (vendorId) where.vendorId = vendorId;
    void status;
    if (search) where.OR = [
      { name: { contains: search, mode: 'insensitive' } },
      { description: { contains: search, mode: 'insensitive' } },
    ];
    const [items, total] = await Promise.all([
      this.prisma.listing.findMany({
        where, skip, take: +limit, orderBy: { createdAt: 'desc' },
        include: {
          vendor: { select: { id: true, name: true, nameAr: true, rating: true, status: true, city: true, country: true, logoUrl: true } },
          _count: { select: { inquiries: true, bookings: true, quotes: true } },
        },
      }),
      this.prisma.listing.count({ where }),
    ]);
    return { items: items.map((i: any) => ({ ...i, priceCents: Number(i.priceCents) })), total, page: +page, limit: +limit, totalPages: Math.ceil(total / +limit) };
  }

  async findOneListing(id: string) {
    const listing = await this.prisma.listing.findFirst({
      where: { id: requireId(id, 'Listing'), isActive: true, status: 'PUBLISHED' },
      include: {
        vendor: { select: PUBLIC_VENDOR_SELECT },
        _count: { select: { inquiries: true, bookings: true } },
      },
    });
    if (!listing) throw new NotFoundException(`Listing ${id} not found`);
    return { ...listing, vendor: toPublicVendor(listing.vendor), priceCents: Number(listing.priceCents) };
  }

  async createListing(tenantId: string, dto: any) {
    const name = dto.name ?? dto.title ?? '';
    if (!name) throw new BadRequestException('Listing name/title is required');

    // The vendor must be the caller organization's own vendor record.
    let vendorId: string;
    if (dto.vendorId) {
      const vendor = await this.prisma.vendor.findFirst({
        where: { id: requireId(dto.vendorId, 'Vendor'), tenantId },
        select: { id: true },
      });
      if (!vendor) throw new NotFoundException('Vendor not found');
      vendorId = vendor.id;
    } else {
      vendorId = (await this.findVendorForTenant(tenantId, dto.vendorType)).id;
    }

    const priceCentsRaw = dto.priceCents != null
      ? Number(dto.priceCents)
      : dto.priceFrom != null
        ? Number(dto.priceFrom) * 100
        : 0;

    const attributes: Record<string, any> = { ...(dto.attributes ?? {}) };
    if (dto.city) attributes.city = dto.city;
    if (dto.maxCapacity != null) attributes.maxCapacity = Number(dto.maxCapacity);

    const listing = await this.prisma.listing.create({
      data: {
        vendorId,
        type: dto.type ?? dto.category ?? 'other',
        name,
        nameAr: dto.nameAr ?? dto.titleAr,
        description: dto.description,
        priceCents: BigInt(Math.round(priceCentsRaw)),
        currency: dto.currency ?? 'SAR',
        pricingModel: this.normalizePricingModel(dto.pricingModel ?? dto.unit ?? 'PER_PERSON'),
        attributes,
        imageUrls: dto.imageUrls ?? [],
        status: this.normalizeListingStatus(dto.status ?? 'PUBLISHED'),
        isActive: dto.isActive ?? true,
      },
    });
    return { ...listing, priceCents: Number((listing as any).priceCents) };
  }

  async updateListing(tenantId: string, id: string, dto: any) {
    await this.findOwnedListing(tenantId, id);
    const data: any = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.title !== undefined) data.name = dto.title;
    if (dto.nameAr !== undefined) data.nameAr = dto.nameAr;
    if (dto.description !== undefined) data.description = dto.description;
    if (dto.isActive !== undefined) data.isActive = dto.isActive;
    if (dto.status !== undefined) data.status = this.normalizeListingStatus(dto.status);
    if (dto.priceCents !== undefined) data.priceCents = BigInt(Math.round(Number(dto.priceCents)));
    if (dto.priceFrom !== undefined) data.priceCents = BigInt(Math.round(Number(dto.priceFrom) * 100));
    if (dto.currency !== undefined) data.currency = dto.currency;
    if (dto.pricingModel !== undefined) data.pricingModel = this.normalizePricingModel(dto.pricingModel);
    else if (dto.unit !== undefined) data.pricingModel = this.normalizePricingModel(dto.unit);
    if (dto.attributes !== undefined) data.attributes = dto.attributes;
    if (dto.imageUrls !== undefined) data.imageUrls = dto.imageUrls;
    if (dto.type !== undefined) data.type = dto.type;
    if (dto.category !== undefined) data.type = dto.category;
    const listing = await this.prisma.listing.update({ where: { id }, data });
    return { ...listing, priceCents: Number((listing as any).priceCents) };
  }

  async deactivateListing(tenantId: string, id: string) {
    await this.findOwnedListing(tenantId, id);
    return this.prisma.listing.update({ where: { id }, data: { isActive: false, status: 'ARCHIVED' } });
  }

  private normalizePricingModel(v: unknown): string {
    const m = String(v ?? '').trim().toUpperCase();
    if (!(PRICING_MODELS as readonly string[]).includes(m)) {
      throw new BadRequestException(`pricingModel must be one of: ${PRICING_MODELS.join(', ')}`);
    }
    return m;
  }

  private normalizeListingStatus(v: unknown): string {
    const s = String(v ?? '').trim().toUpperCase();
    if (!(LISTING_STATUSES as readonly string[]).includes(s)) {
      throw new BadRequestException(`status must be one of: ${LISTING_STATUSES.join(', ')}`);
    }
    return s;
  }

  // ── Inquiries (lightweight contact-vendor request) ──────────────────────────
  async createInquiry(listingId: string, userId: string | null, dto: CreateListingInquiryDto) {
    const listing = await this.prisma.listing.findUnique({ where: { id: listingId }, include: { vendor: true } });
    if (!listing) throw new NotFoundException('Listing not found');
    const inq = await this.prisma.listingInquiry.create({
      data: {
        listingId,
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
    // Best-effort notification to vendor's tenant
    if (listing.vendor.tenantId) {
      // Find the vendor tenant's first admin user to notify
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
          link: `/marketplace/${listingId}`,
          data: { listingId, inquiryId: inq.id },
        });
      }
    }
    return inq;
  }

  async listInquiries(filter: { listingId?: string; vendorId?: string; userId?: string }) {
    const where: any = {};
    if (filter.listingId) where.listingId = filter.listingId;
    if (filter.userId) where.fromUserId = filter.userId;
    if (filter.vendorId) where.listing = { vendorId: filter.vendorId };
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
    const listing = await this.prisma.listing.findUnique({ where: { id: requireId(listingId, 'Listing') } });
    if (!listing || !listing.isActive || String(listing.status).toUpperCase() !== 'PUBLISHED') {
      throw new NotFoundException('Listing not found');
    }

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

  async listBookings(filter: { listingId?: string; vendorId?: string; userId?: string }) {
    const where: any = {};
    if (filter.listingId) where.listingId = filter.listingId;
    if (filter.userId) where.customerUserId = filter.userId;
    if (filter.vendorId) where.listing = { vendorId: filter.vendorId };
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

  // ── Vendors ───────────────────────────────────────────────────────────────────

  async findAllVendors(type?: string, city?: string) {
    const where: any = {};
    if (type) where.type = type;
    if (city) where.city = { contains: city, mode: 'insensitive' };
    const items = await this.prisma.vendor.findMany({
      where, orderBy: { createdAt: 'desc' },
      select: { ...PUBLIC_VENDOR_SELECT, _count: { select: { listings: true, ratings: true } } },
    });
    return items.map(toPublicVendor);
  }

  async findOneVendor(id: string) {
    const vendor = await this.prisma.vendor.findFirst({
      where: { id: requireId(id, 'Vendor') },
      select: {
        ...PUBLIC_VENDOR_SELECT,
        listings: { where: { isActive: true } },
        _count: { select: { ratings: true } },
      },
    });
    if (!vendor) throw new NotFoundException(`Vendor ${id} not found`);
    return toPublicVendor(vendor);
  }

  async findVendorForTenant(tenantId: string, type?: string) {
    // Locate or auto-create a Vendor record for the current operator/tenant so they can create listings.
    let vendor = await this.prisma.vendor.findFirst({ where: { tenantId, ...(type ? { type: type as any } : {}) } });
    if (vendor) return vendor;
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    vendor = await this.prisma.vendor.create({
      data: {
        tenantId,
        type: (type as any) ?? (tenant?.type as any) ?? 'OPERATOR',
        name: tenant?.name ?? 'Vendor',
        email: tenant?.email ?? `vendor+${tenantId.slice(0, 8)}@umrahconnects.com`,
        phone: tenant?.phone ?? undefined,
        country: tenant?.country ?? 'SA',
        status: 'PENDING_KYC',
        kycDocuments: [],
        images: [],
      },
    });
    return vendor;
  }

  async createVendor(tenantId: string, dto: any) {
    // The public vendor type (HOTEL, TRANSPORT, …) maps onto the organization type the column stores.
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId }, select: { type: true } });
    const type = VENDOR_TYPE_TO_TENANT_TYPE[String(dto.type ?? '').toUpperCase()] ?? tenant?.type;
    if (!type) throw new BadRequestException('Unknown vendor type');
    return this.prisma.vendor.create({
      data: {
        name: dto.name, nameAr: dto.nameAr, type: type as any,
        email: dto.email ?? `vendor+${Date.now()}@umrahconnects.com`,
        phone: dto.phone, country: dto.country ?? 'SA', city: dto.city,
        description: dto.description, status: 'PENDING_KYC',
        tenantId,
        kycDocuments: [], images: [],
      },
    });
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
      ? await this.prisma.vendorRating.update({ where: { id: existing.id }, data: { score, review: review ?? null, isVerified } })
      : await this.prisma.vendorRating.create({ data: { vendorId, tenantId, score, review, bookingRef, isVerified } });

    const agg = await this.prisma.vendorRating.aggregate({ where: { vendorId }, _avg: { score: true }, _count: true });
    await this.prisma.vendor.update({
      where: { id: vendorId },
      data: { rating: agg._avg?.score ?? 0, ratingCount: agg._count },
    });
    return rating;
  }

  // ── Quotes ───────────────────────────────────────────────────────────────────

  async requestQuote(tenantId: string, dto: any) {
    const vendorId = requireId(dto.vendorId, 'Vendor');
    const listingId = requireId(dto.listingId, 'Listing');
    const listing = await this.prisma.listing.findFirst({
      where: { id: listingId, vendorId, isActive: true },
      select: { id: true },
    });
    if (!listing) throw new NotFoundException('Listing not found for this vendor');
    return this.prisma.quote.create({
      data: { tenantId, vendorId, listingId, status: 'PENDING', requirements: dto.requirements ?? {}, currency: dto.currency ?? 'SAR', notes: dto.notes },
    });
  }

  createQuote = this.requestQuote.bind(this);

  async findMyQuotes(tenantId: string) {
    const items = await this.prisma.quote.findMany({
      where: { tenantId },
      orderBy: { requestedAt: 'desc' },
      include: {
        vendor: { select: { id: true, name: true, city: true } },
        listing: { select: { id: true, name: true, type: true } },
      },
    });
    return items.map((q: any) => ({ ...q, offeredPriceCents: q.offeredPriceCents ? Number(q.offeredPriceCents) : null }));
  }

  /** Only the quoted vendor's organization may respond, and only while the quote is open. */
  async respondToQuote(tenantId: string, id: string, dto: any) {
    const safeId = requireId(id, 'Quote');
    if (!tenantId) throw new NotFoundException('Quote not found');
    const quote = await this.prisma.quote.findFirst({ where: { id: safeId, vendor: { tenantId } } });
    if (!quote) throw new NotFoundException('Quote not found');
    if (!['PENDING', 'OFFERED'].includes(quote.status)) {
      throw new ConflictException(`Quote is already ${quote.status.toLowerCase()}`);
    }
    if (dto.validUntil && new Date(dto.validUntil).getTime() <= Date.now()) {
      throw new BadRequestException('validUntil must be in the future');
    }
    return this.prisma.quote.update({
      where: { id: safeId },
      data: {
        status: 'OFFERED',
        offeredPriceCents: dto.quotedPrice != null ? BigInt(Math.round(Number(dto.quotedPrice) * 100)) : undefined,
        currency: dto.currency ?? undefined,
        validUntil: dto.validUntil ? new Date(dto.validUntil) : undefined,
        notes: dto.notes,
        respondedAt: new Date(),
      },
    });
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
    return this.prisma.quote.findUnique({ where: { id: safeId } });
  }
}

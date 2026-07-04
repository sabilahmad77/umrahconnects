import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class MarketplaceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  // ── Listings ──────────────────────────────────────────────────────────────────

  async findAllListings(query: any, tenantId?: string) {
    const { page = 1, limit = 20, type, category, search, vendorId, status, includeInactive } = query;
    const skip = (+page - 1) * +limit;
    const where: any = {};
    if (!includeInactive) where.isActive = true;
    if (type) where.type = type;
    if (category) where.type = category;
    if (vendorId) where.vendorId = vendorId;
    if (status) where.status = status;
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
      where: { id },
      include: {
        vendor: true,
        _count: { select: { inquiries: true, bookings: true } },
      },
    });
    if (!listing) throw new NotFoundException(`Listing ${id} not found`);
    return { ...listing, priceCents: Number((listing as any).priceCents) };
  }

  async createListing(vendorIdOrTenant: string, dto: any) {
    const name = dto.name ?? dto.title ?? '';
    if (!name) throw new Error('Listing name/title is required');

    let vendorId = dto.vendorId ?? vendorIdOrTenant;
    if (!vendorId) throw new Error('vendorId is required');
    const vendor = await this.prisma.vendor.findFirst({ where: { id: vendorId } });
    if (!vendor) throw new Error('Vendor not found for this listing');

    const priceCentsRaw = dto.priceCents != null
      ? Number(dto.priceCents)
      : dto.priceFrom != null
        ? Number(dto.priceFrom) * 100
        : 0;

    const attributes: Record<string, any> = { ...(dto.attributes ?? {}) };
    if (dto.city) attributes.city = dto.city;

    const listing = await this.prisma.listing.create({
      data: {
        vendorId,
        type: dto.type ?? dto.category ?? 'other',
        name,
        nameAr: dto.nameAr ?? dto.titleAr,
        description: dto.description,
        priceCents: BigInt(Math.round(priceCentsRaw)),
        currency: dto.currency ?? 'SAR',
        pricingModel: dto.pricingModel ?? dto.unit ?? 'PER_PERSON',
        attributes,
        imageUrls: dto.imageUrls ?? [],
        status: (dto.status ?? 'PUBLISHED').toUpperCase(),
        isActive: dto.isActive ?? true,
      },
    });
    return { ...listing, priceCents: Number((listing as any).priceCents) };
  }

  async updateListing(tenantId: string, id: string, dto: any) {
    const data: any = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.title !== undefined) data.name = dto.title;
    if (dto.description !== undefined) data.description = dto.description;
    if (dto.isActive !== undefined) data.isActive = dto.isActive;
    if (dto.status !== undefined) data.status = String(dto.status).toUpperCase();
    if (dto.priceCents !== undefined) data.priceCents = BigInt(dto.priceCents);
    if (dto.priceFrom !== undefined) data.priceCents = BigInt(Math.round(Number(dto.priceFrom) * 100));
    if (dto.currency !== undefined) data.currency = dto.currency;
    if (dto.pricingModel !== undefined) data.pricingModel = dto.pricingModel;
    if (dto.attributes !== undefined) data.attributes = dto.attributes;
    if (dto.imageUrls !== undefined) data.imageUrls = dto.imageUrls;
    if (dto.type !== undefined) data.type = dto.type;
    if (dto.category !== undefined) data.type = dto.category;
    const listing = await this.prisma.listing.update({ where: { id }, data });
    return { ...listing, priceCents: Number((listing as any).priceCents) };
  }

  async deactivateListing(tenantId: string, id: string) {
    return this.prisma.listing.update({ where: { id }, data: { isActive: false, status: 'ARCHIVED' } });
  }

  // ── Inquiries (lightweight contact-vendor request) ──────────────────────────
  async createInquiry(listingId: string, userId: string | null, dto: any) {
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

  async respondInquiry(id: string, response: string, status: string = 'RESPONDED') {
    return this.prisma.listingInquiry.update({
      where: { id },
      data: { response, status, respondedAt: new Date() },
    });
  }

  // ── Bookings on a listing ────────────────────────────────────────────────
  async createBooking(listingId: string, customerUserId: string | null, dto: any) {
    const listing = await this.prisma.listing.findUnique({ where: { id: listingId } });
    if (!listing) throw new NotFoundException('Listing not found');
    const partySize = dto.partySize ?? 1;
    const totalAmountCents = dto.totalAmountCents != null
      ? BigInt(dto.totalAmountCents)
      : BigInt(Number(listing.priceCents) * partySize);
    const booking = await this.prisma.listingBooking.create({
      data: {
        listingId,
        customerUserId: customerUserId && customerUserId.length === 36 ? customerUserId : null,
        customerName: dto.customerName ?? dto.name ?? 'Customer',
        customerEmail: dto.customerEmail ?? dto.email,
        customerPhone: dto.customerPhone ?? dto.phone,
        startDate: dto.startDate ? new Date(dto.startDate) : undefined,
        endDate: dto.endDate ? new Date(dto.endDate) : undefined,
        partySize,
        totalAmountCents,
        currency: dto.currency ?? listing.currency,
        status: (dto.status ?? 'PENDING').toUpperCase(),
        paymentStatus: (dto.paymentStatus ?? 'UNPAID').toUpperCase(),
        notes: dto.notes,
      },
    });
    return { ...booking, totalAmountCents: Number((booking as any).totalAmountCents) };
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

  async updateBooking(id: string, dto: any) {
    const data: any = {};
    if (dto.status !== undefined) data.status = String(dto.status).toUpperCase();
    if (dto.paymentStatus !== undefined) data.paymentStatus = String(dto.paymentStatus).toUpperCase();
    if (dto.notes !== undefined) data.notes = dto.notes;
    if (dto.customerName !== undefined) data.customerName = dto.customerName;
    if (dto.customerEmail !== undefined) data.customerEmail = dto.customerEmail;
    if (dto.customerPhone !== undefined) data.customerPhone = dto.customerPhone;
    if (dto.partySize !== undefined) data.partySize = dto.partySize;
    if (dto.totalAmountCents !== undefined) data.totalAmountCents = BigInt(dto.totalAmountCents);
    if (dto.startDate !== undefined) data.startDate = dto.startDate ? new Date(dto.startDate) : null;
    if (dto.endDate !== undefined) data.endDate = dto.endDate ? new Date(dto.endDate) : null;
    const booking = await this.prisma.listingBooking.update({ where: { id }, data });
    return { ...booking, totalAmountCents: Number((booking as any).totalAmountCents) };
  }

  // ── Vendors ───────────────────────────────────────────────────────────────────

  async findAllVendors(tenantId: string, type?: string, city?: string) {
    const where: any = {};
    if (type) where.type = type;
    if (city) where.city = { contains: city, mode: 'insensitive' };
    const items = await this.prisma.vendor.findMany({
      where, orderBy: { createdAt: 'desc' },
      include: { _count: { select: { listings: true, ratings: true } } },
    });
    return items;
  }

  async findOneVendor(tenantId: string, id: string) {
    const vendor = await this.prisma.vendor.findFirst({
      where: { id },
      include: { listings: { where: { isActive: true } }, _count: { select: { ratings: true } } },
    });
    if (!vendor) throw new NotFoundException(`Vendor ${id} not found`);
    return vendor;
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
    return this.prisma.vendor.create({
      data: {
        name: dto.name, nameAr: dto.nameAr, type: dto.type,
        email: dto.email ?? `vendor+${Date.now()}@umrahconnects.com`,
        phone: dto.phone, country: dto.country ?? 'SA', city: dto.city,
        description: dto.description, status: 'PENDING_KYC',
        tenantId,
        kycDocuments: [], images: [],
      },
    });
  }

  async rateVendor(tenantId: string, vendorId: string, userId: string, score: number, review?: string, bookingRef?: string, isVerified?: boolean) {
    const rating = await this.prisma.vendorRating.create({
      data: { vendorId, tenantId, score: score ?? 5, review, bookingRef, isVerified: isVerified ?? false },
    });
    const agg = await this.prisma.vendorRating.aggregate({ where: { vendorId }, _avg: { score: true }, _count: true });
    await this.prisma.vendor.update({
      where: { id: vendorId },
      data: { rating: agg._avg?.score ?? 0, ratingCount: agg._count },
    });
    return rating;
  }

  // ── Quotes ───────────────────────────────────────────────────────────────────

  async requestQuote(tenantId: string, dto: any) {
    return this.prisma.quote.create({
      data: { tenantId, vendorId: dto.vendorId, listingId: dto.listingId, status: 'PENDING', requirements: dto.requirements ?? {}, currency: dto.currency ?? 'SAR', notes: dto.notes },
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

  async respondToQuote(tenantId: string, id: string, dto: any) {
    return this.prisma.quote.update({
      where: { id },
      data: {
        status: 'OFFERED',
        offeredPriceCents: dto.price ? BigInt(Math.round(dto.price * 100)) : undefined,
        validUntil: dto.validUntil ? new Date(dto.validUntil) : undefined,
        notes: dto.notes,
        respondedAt: new Date(),
      },
    });
  }

  async acceptQuote(tenantId: string, id: string) {
    return this.prisma.quote.update({ where: { id }, data: { status: 'ACCEPTED', acceptedAt: new Date() } });
  }
}

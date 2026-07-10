import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';

const BOOKING_STATUSES = [
  'DRAFT', 'CONFIRMED', 'PARTIALLY_PAID', 'FULLY_PAID', 'VISA_PROCESSING',
  'TRAVELING', 'COMPLETED', 'CANCELLED', 'REFUNDED',
] as const;
// Friendly aliases the UI / callers may send → canonical enum value
const BOOKING_STATUS_ALIASES: Record<string, string> = {
  ENQUIRY: 'DRAFT', INQUIRY: 'DRAFT', NEW: 'DRAFT', PENDING: 'DRAFT',
  QUOTATION: 'DRAFT', QUOTE: 'DRAFT', IN_TRAVEL: 'TRAVELING', DONE: 'COMPLETED',
  DEPOSIT_PAID: 'PARTIALLY_PAID', PAID: 'FULLY_PAID',
};
function normalizeBookingStatus(raw?: string): string {
  if (!raw) return 'DRAFT';
  const up = String(raw).toUpperCase().replace(/[\s-]+/g, '_');
  if ((BOOKING_STATUSES as readonly string[]).includes(up)) return up;
  if (BOOKING_STATUS_ALIASES[up]) return BOOKING_STATUS_ALIASES[up];
  throw new BadRequestException(`Invalid booking status "${raw}". Allowed: ${BOOKING_STATUSES.join(', ')}`);
}

@Injectable()
export class BookingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  private normalizeBigInt(obj: any): any {
    if (!obj) return obj;
    const result = { ...obj };
    for (const key of ['totalAmountCents', 'paidAmountCents', 'discountCents', 'taxCents', 'priceCents', 'basePriceCents']) {
      if (result[key] !== undefined) result[key] = Number(result[key]);
    }
    if (result.pilgrims) result.pilgrims = result.pilgrims.map((p: any) => ({ ...p, priceCents: p.priceCents ? Number(p.priceCents) : null }));
    return result;
  }

  // ── Bookings ──────────────────────────────────────────────────────────────────

  async findAll(tenantId: string, query: any) {
    const { status, packageId, page = 1, limit = 20 } = query;
    const skip = (+page - 1) * +limit;
    const where: any = { tenantId };
    if (status) where.status = status;
    if (packageId) where.packageId = packageId;
    const [items, total] = await Promise.all([
      this.prisma.booking.findMany({
        where, skip, take: +limit, orderBy: { createdAt: 'desc' },
        include: {
          package: { select: { id: true, name: true, tripType: true } },
          pilgrims: { select: { id: true, pilgrimId: true } },
        },
      }),
      this.prisma.booking.count({ where }),
    ]);
    return { items: items.map(i => this.normalizeBigInt(i)), total, page: +page, limit: +limit, totalPages: Math.ceil(total / +limit) };
  }

  // Aliases used by controller
  findAllBookings = this.findAll.bind(this);

  async findOne(tenantId: string, id: string) {
    const booking = await this.prisma.booking.findFirst({
      where: { id, tenantId },
      include: { package: true, pilgrims: true },
    });
    if (!booking) throw new NotFoundException('Booking not found');
    return this.normalizeBigInt(booking);
  }

  findOneBooking = this.findOne.bind(this);

  async create(tenantId: string, createdBy: string | null, dto: any) {
    const bookingRef = `UC-${new Date().getFullYear()}-${Math.random().toString().slice(2, 7)}`;
    const pkg = await this.prisma.package.findFirst({ where: { id: dto.packageId, tenantId } });
    const pricePerPax = pkg ? Number((pkg as any).basePriceCents ?? 0) : 0;

    // Accept several shapes for pilgrim list — DTO uses `pilgrims[]`, callers
    // may also send `pilgrimIds[]`. Lead pilgrim is included automatically.
    const pilgrimIds: string[] = Array.isArray(dto.pilgrimIds)
      ? dto.pilgrimIds
      : Array.isArray(dto.pilgrims)
        ? dto.pilgrims.map((p: any) => p?.pilgrimId).filter(Boolean)
        : [];
    // `pilgrimId` is an accepted client alias for leadPilgrimId
    const leadId = dto.leadPilgrimId ?? dto.pilgrimId;
    if (leadId && !pilgrimIds.includes(leadId)) {
      pilgrimIds.unshift(leadId);
    }
    const pilgrimCount = Math.max(pilgrimIds.length, dto.paxAdult ?? 1);

    // Prefer the explicit totalAmount the caller passed, else compute from package
    const totalAmountCents = dto.totalAmount != null
      ? BigInt(Math.round(Number(dto.totalAmount) * 100))
      : dto.totalAmountCents != null
        ? BigInt(Math.round(Number(dto.totalAmountCents)))
        : BigInt(pricePerPax * pilgrimCount);
    const paidAmountCents = dto.depositAmount != null
      ? BigInt(Math.round(Number(dto.depositAmount) * 100))
      : BigInt(0);

    // Empty-string createdBy was the cause of "INTERNAL_ERROR" (invalid UUID)
    const safeCreatedBy = createdBy && createdBy.length === 36 ? createdBy : null;

    const status = normalizeBookingStatus(dto.status);

    const booking = await this.prisma.booking.create({
      data: {
        tenantId,
        bookingRef,
        packageId: dto.packageId,
        createdBy: safeCreatedBy,
        status: status as any,
        currency: dto.currency ?? 'SAR',
        totalAmountCents,
        paidAmountCents,
        discountCents: BigInt(0),
        taxCents: BigInt(0),
        departureDate: dto.departureDate ? new Date(dto.departureDate) : undefined,
        returnDate: dto.returnDate ? new Date(dto.returnDate) : undefined,
        notes: dto.notes,
        pilgrims: pilgrimIds.length > 0
          ? { create: pilgrimIds.map((pilgrimId: string) => ({ tenantId, pilgrimId })) }
          : undefined,
      },
      include: { package: { select: { id: true, name: true } }, pilgrims: true },
    });

    // Notification engine: booking-created event for the creator
    if (safeCreatedBy) {
      this.notifications.fire({
        tenantId,
        recipientUserId: safeCreatedBy,
        type: 'BOOKING_CREATED',
        title: 'Booking created',
        body: `Booking ${bookingRef} was created (${booking.currency} ${(Number(totalAmountCents) / 100).toLocaleString()}).`,
        link: `/bookings/${booking.id}`,
      }).catch(() => undefined);
    }
    return this.normalizeBigInt(booking);
  }

  createBooking(tenantId: string, dto: any) {
    return this.create(tenantId, dto.createdBy ?? null, dto);
  }

  async updateBooking(tenantId: string, id: string, dto: any) {
    await this.findOne(tenantId, id);
    const data: any = {};
    if (dto.notes !== undefined) data.notes = dto.notes;
    if (dto.departureDate) data.departureDate = new Date(dto.departureDate);
    if (dto.returnDate) data.returnDate = new Date(dto.returnDate);
    const booking = await this.prisma.booking.update({ where: { id }, data });
    return this.normalizeBigInt(booking);
  }

  async updateStatus(tenantId: string, id: string, status: string) {
    await this.findOne(tenantId, id);
    const booking = await this.prisma.booking.update({
      where: { id },
      data: { status: status as any, cancelledAt: status === 'CANCELLED' ? new Date() : undefined },
    });
    // Notification engine: status-change event for the booking creator
    if (booking.createdBy) {
      this.notifications.fire({
        tenantId,
        recipientUserId: booking.createdBy,
        type: 'BOOKING_STATUS',
        title: `Booking ${status.toLowerCase().replace(/_/g, ' ')}`,
        body: `Booking ${booking.bookingRef} status changed to ${status}.`,
        link: `/bookings/${booking.id}`,
      }).catch(() => undefined);
    }
    return this.normalizeBigInt(booking);
  }

  updateBookingStatus(tenantId: string, id: string, dto: any) {
    return this.updateStatus(tenantId, id, dto.status);
  }

  // ── Assignment actions ─────────────────────────────────────────────────
  async assignGroup(tenantId: string, id: string, groupId: string | null) {
    await this.findOne(tenantId, id);
    if (groupId) {
      const grp = await this.prisma.tripGroup.findFirst({ where: { id: groupId, tenantId } });
      if (!grp) throw new NotFoundException('Group not found in this tenant');
    }
    return this.normalizeBigInt(await this.prisma.booking.update({ where: { id }, data: { groupId } }));
  }

  async assignPackage(tenantId: string, id: string, packageId: string) {
    await this.findOne(tenantId, id);
    const pkg = await this.prisma.package.findFirst({ where: { id: packageId, tenantId } });
    if (!pkg) throw new NotFoundException('Package not found');
    return this.normalizeBigInt(await this.prisma.booking.update({ where: { id }, data: { packageId } }));
  }

  async setPayment(tenantId: string, id: string, dto: { paidAmount?: number; paidAmountCents?: number; status?: string }) {
    await this.findOne(tenantId, id);
    const data: any = {};
    if (dto.paidAmount != null) data.paidAmountCents = BigInt(Math.round(Number(dto.paidAmount) * 100));
    if (dto.paidAmountCents != null) data.paidAmountCents = BigInt(dto.paidAmountCents);
    if (dto.status !== undefined) data.status = dto.status as any;
    return this.normalizeBigInt(await this.prisma.booking.update({ where: { id }, data }));
  }

  async cancel(tenantId: string, id: string, reason?: string) {
    await this.findOne(tenantId, id);
    return this.normalizeBigInt(await this.prisma.booking.update({
      where: { id },
      data: { status: 'CANCELLED' as any, cancelledAt: new Date(), cancellationReason: reason },
    }));
  }

  /**
   * Generate a Finance invoice from a booking.
   * Reuses the booking's totalAmount/currency/notes and links via `bookingId`.
   * Adds a single line item describing the package.
   */
  async generateInvoice(tenantId: string, bookingId: string) {
    const booking = await this.findOne(tenantId, bookingId);
    // Reuse existing invoice if one was already generated
    const existing = await this.prisma.invoice.findFirst({ where: { tenantId, bookingId } });
    if (existing) {
      return {
        ...existing,
        subtotalCents: Number((existing as any).subtotalCents),
        taxCents: Number((existing as any).taxCents),
        discountCents: Number((existing as any).discountCents),
        totalCents: Number((existing as any).totalCents),
        paidCents: Number((existing as any).paidCents),
      };
    }
    // Find a name for the issued-to party
    let issuedToName = 'Customer';
    const leadPilgrimId = (booking as any).pilgrims?.[0]?.pilgrimId;
    if (leadPilgrimId) {
      const pilgrim = await this.prisma.pilgrim.findUnique({ where: { id: leadPilgrimId } });
      if (pilgrim) {
        issuedToName = [pilgrim.firstNameEn, pilgrim.lastNameEn].filter(Boolean).join(' ').trim()
          || pilgrim.firstNameAr
          || 'Customer';
      }
    }
    const invoiceRef = `INV-${new Date().getFullYear()}-${Math.random().toString().slice(2, 7)}`;
    const issuedAt = new Date();
    const dueAt = new Date();
    dueAt.setDate(dueAt.getDate() + 14);
    const totalCents = Number(booking.totalAmountCents ?? 0);
    const paidCents = Number(booking.paidAmountCents ?? 0);
    const pilgrimCount = (booking as any).pilgrims?.length ?? 1;
    const invoice = await this.prisma.invoice.create({
      data: {
        tenantId,
        invoiceRef,
        bookingId,
        type: 'CUSTOMER',
        issuedToName,
        issuedAt,
        dueAt,
        currency: booking.currency,
        subtotalCents: BigInt(totalCents),
        taxCents: BigInt(0),
        discountCents: BigInt(0),
        totalCents: BigInt(totalCents),
        paidCents: BigInt(paidCents),
        lineItems: [
          {
            description: (booking as any).package?.name ?? 'Package',
            qty: pilgrimCount,
            unitPriceCents: pilgrimCount > 0 ? Math.round(totalCents / pilgrimCount) : totalCents,
            totalCents,
          },
        ],
        status: 'DRAFT',
        notes: booking.notes,
      },
    });
    return {
      ...invoice,
      subtotalCents: Number((invoice as any).subtotalCents),
      taxCents: Number((invoice as any).taxCents),
      discountCents: Number((invoice as any).discountCents),
      totalCents: Number((invoice as any).totalCents),
      paidCents: Number((invoice as any).paidCents),
    };
  }

  /**
   * Attach a pilgrim to a booking (creates a BookingPilgrim).
   */
  async addPilgrim(tenantId: string, bookingId: string, pilgrimId: string) {
    await this.findOne(tenantId, bookingId);
    const existing = await this.prisma.bookingPilgrim.findFirst({ where: { bookingId, pilgrimId } });
    if (existing) return existing;
    return this.prisma.bookingPilgrim.create({ data: { tenantId, bookingId, pilgrimId } });
  }

  async removePilgrim(tenantId: string, bookingId: string, pilgrimId: string) {
    await this.findOne(tenantId, bookingId);
    await this.prisma.bookingPilgrim.deleteMany({ where: { bookingId, pilgrimId } });
    return { success: true };
  }

  // ── Packages ──────────────────────────────────────────────────────────────────

  async findPackages(tenantId: string, query: any = {}) {
    const { type, page = 1, limit = 20 } = query;
    const skip = (+page - 1) * +limit;
    const where: any = { tenantId };
    if (type) where.tripType = type;
    const [items, total] = await Promise.all([
      this.prisma.package.findMany({ where, skip, take: +limit, orderBy: { createdAt: 'desc' }, include: { _count: { select: { bookings: true } } } }),
      this.prisma.package.count({ where }),
    ]);
    return { items: items.map(i => this.normalizeBigInt(i)), total, page: +page, limit: +limit, totalPages: Math.ceil(total / +limit) };
  }

  findAllPackages(tenantId: string) {
    return this.findPackages(tenantId);
  }

  async findPackage(tenantId: string, id: string) {
    const pkg = await this.prisma.package.findFirst({ where: { id, tenantId } });
    if (!pkg) throw new NotFoundException('Package not found');
    return this.normalizeBigInt(pkg);
  }

  findOnePackage = this.findPackage.bind(this);

  async createPackage(tenantId: string, dto: any) {
    const pkg = await this.prisma.package.create({
      data: {
        tenantId, name: dto.name, nameAr: dto.nameAr,
        tripType: dto.tripType ?? dto.type ?? 'UMRAH',
        durationDays: dto.durationDays ?? 14,
        departureDate: dto.departureDate ? new Date(dto.departureDate) : undefined,
        returnDate: dto.returnDate ? new Date(dto.returnDate) : undefined,
        basePriceCents: BigInt(Math.round((dto.priceAdult ?? dto.basePriceCents ?? dto.basePrice ?? 0) * (dto.priceAdult ? 100 : 1))),
        currency: dto.currency ?? 'SAR',
        maxCapacity: dto.maxCapacity ?? 40,
        includes: {},
        isPublished: false,
      },
    });
    return this.normalizeBigInt(pkg);
  }

  async updatePackage(tenantId: string, id: string, dto: any) {
    await this.findPackage(tenantId, id);
    // BP-03: map EVERY editable field — previously most fields (durationDays,
    // price, description, dates…) were silently dropped: 200 with no change.
    const data: any = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.nameAr !== undefined) data.nameAr = dto.nameAr;
    if (dto.description !== undefined) data.description = dto.description;
    if (dto.descriptionAr !== undefined) data.descriptionAr = dto.descriptionAr;
    if (dto.tier !== undefined) data.tier = dto.tier;
    if (dto.tripType !== undefined) data.tripType = dto.tripType;
    if (dto.type !== undefined) data.tripType = dto.type; // UI alias
    if (dto.durationDays !== undefined) data.durationDays = Number(dto.durationDays);
    if (dto.departureDate !== undefined) data.departureDate = dto.departureDate ? new Date(dto.departureDate) : null;
    if (dto.returnDate !== undefined) data.returnDate = dto.returnDate ? new Date(dto.returnDate) : null;
    if (dto.priceAdult !== undefined) data.basePriceCents = BigInt(Math.round(Number(dto.priceAdult) * 100));
    if (dto.basePriceCents !== undefined) data.basePriceCents = BigInt(Math.round(Number(dto.basePriceCents)));
    if (dto.currency !== undefined) data.currency = dto.currency;
    if (dto.maxCapacity !== undefined) data.maxCapacity = Number(dto.maxCapacity);
    if (dto.includes !== undefined) data.includes = dto.includes;
    if (dto.isPublished !== undefined) data.isPublished = dto.isPublished;
    const pkg = await this.prisma.package.update({ where: { id }, data });
    return this.normalizeBigInt(pkg);
  }

  async getStats(tenantId: string) {
    const statuses = ['DRAFT', 'CONFIRMED', 'PARTIALLY_PAID', 'FULLY_PAID', 'CANCELLED', 'COMPLETED', 'VISA_PROCESSING', 'TRAVELING'];
    const counts = await Promise.all(statuses.map(s => this.prisma.booking.count({ where: { tenantId, status: s as any } })));
    const byStatus: Record<string, number> = {};
    statuses.forEach((s, i) => { byStatus[s] = counts[i]; });
    return { total: counts.reduce((a, b) => a + b, 0), byStatus };
  }

  // alias
  getBookingStats = this.getStats.bind(this);
}

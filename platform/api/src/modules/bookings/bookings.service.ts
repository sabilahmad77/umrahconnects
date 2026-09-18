import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { BOOKING_STATUS_TRANSITIONS, DERIVED_BOOKING_STATUSES, derivedBookingStatus } from './booking-money';
import { NotificationsService } from '../notifications/notifications.service';
import { assertAllOwned, findOwned, requireId } from '../../common/tenant-scope';

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

/** A return date before the departure date is refused (400) instead of stored. */
function assertDateOrder(departure?: string | Date | null, ret?: string | Date | null) {
  if (departure && ret && new Date(ret).getTime() < new Date(departure).getTime()) {
    throw new BadRequestException('The return date cannot be before the departure date');
  }
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
    const { status, packageId, search, page = 1, limit = 20 } = query;
    const skip = (+page - 1) * +limit;
    const where: any = { tenantId };
    // Aliases (ENQUIRY, PENDING…) resolve to the stored enum instead of failing in the database.
    if (status) where.status = normalizeBookingStatus(status);
    if (packageId) where.packageId = packageId;
    if (search) {
      where.OR = [
        { bookingRef: { contains: search, mode: 'insensitive' } },
        { package: { name: { contains: search, mode: 'insensitive' } } },
      ];
    }
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
    // A supplied packageId must belong to the caller's tenant — never persist an
    // id we could not resolve (previously a failed lookup was ignored).
    const pkg = dto.packageId
      ? await findOwned<any>(this.prisma.package, dto.packageId, tenantId, 'Package', { deletedAt: null })
      : null;
    const pricePerPax = pkg ? Number(pkg.basePriceCents ?? 0) : 0;

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
    // Every pilgrim linked to the booking must be a live pilgrim of this tenant.
    await assertAllOwned(this.prisma.pilgrim, pilgrimIds, tenantId, 'Pilgrim', { deletedAt: null });
    const uniquePilgrimIds = [...new Set(pilgrimIds)];
    const pilgrimCount = Math.max(uniquePilgrimIds.length, dto.paxAdult ?? 1);

    // Prefer the explicit totalAmount the caller passed, else compute from package
    const totalAmountCents = dto.totalAmount != null
      ? BigInt(Math.round(Number(dto.totalAmount) * 100))
      : dto.totalAmountCents != null
        ? BigInt(Math.round(Number(dto.totalAmountCents)))
        : BigInt(pricePerPax * pilgrimCount);
    const paidAmountCents = dto.depositAmount != null
      ? BigInt(Math.round(Number(dto.depositAmount) * 100))
      : BigInt(0);
    if (totalAmountCents < BigInt(0) || paidAmountCents < BigInt(0)) {
      throw new BadRequestException('Amounts must not be negative');
    }
    if (paidAmountCents > totalAmountCents) {
      throw new BadRequestException('depositAmount must not exceed the booking total');
    }
    assertDateOrder(dto.departureDate, dto.returnDate);

    // Empty-string createdBy was the cause of "INTERNAL_ERROR" (invalid UUID)
    const safeCreatedBy = createdBy && createdBy.length === 36 ? createdBy : null;

    // A deposit taken at creation moves the booking into its payment phase; the
    // paid statuses themselves are never chosen by the caller.
    const requested = normalizeBookingStatus(dto.status);
    const status = derivedBookingStatus(requested, paidAmountCents, totalAmountCents, paidAmountCents);

    const booking = await this.prisma.booking.create({
      data: {
        tenantId,
        bookingRef,
        packageId: pkg ? pkg.id : null,
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
        pilgrims: uniquePilgrimIds.length > 0
          ? { create: uniquePilgrimIds.map((pilgrimId: string) => ({ tenantId, pilgrimId })) }
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

  // createdBy is server-owned: never taken from the request body.
  createBooking(tenantId: string, dto: any, createdBy: string | null = null) {
    return this.create(tenantId, createdBy, dto);
  }

  async updateBooking(tenantId: string, id: string, dto: any) {
    const current = await this.findOne(tenantId, id);
    const data: any = {};
    if (dto.notes !== undefined) data.notes = dto.notes;
    if (dto.departureDate) data.departureDate = new Date(dto.departureDate);
    if (dto.returnDate) data.returnDate = new Date(dto.returnDate);
    assertDateOrder(data.departureDate ?? current.departureDate, data.returnDate ?? current.returnDate);
    const booking = await this.prisma.booking.update({ where: { id }, data });
    return this.normalizeBigInt(booking);
  }

  /**
   * Manual lifecycle move. Payment statuses are derived from money events and
   * cancellation has its own endpoint (and capability), so neither is accepted here.
   */
  async updateStatus(tenantId: string, id: string, status: string) {
    const current = await this.findOne(tenantId, id);
    if (status === current.status) return current;
    if ((DERIVED_BOOKING_STATUSES as readonly string[]).includes(status)) {
      throw new BadRequestException(
        `${status} is derived from recorded payments — record the payment on the booking's invoice instead`,
      );
    }
    if (status === 'CANCELLED') {
      throw new BadRequestException('Cancel a booking with POST /bookings/:id/cancel');
    }
    const allowed = BOOKING_STATUS_TRANSITIONS[String(current.status)] ?? [];
    if (!allowed.includes(status)) {
      throw new BadRequestException(`A ${current.status} booking cannot move to ${status}`);
    }
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
    return this.updateStatus(tenantId, id, normalizeBookingStatus(dto.status));
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
    const pkg = await this.prisma.package.findFirst({ where: { id: packageId, tenantId, deletedAt: null } });
    if (!pkg) throw new NotFoundException('Package not found');
    return this.normalizeBigInt(await this.prisma.booking.update({ where: { id }, data: { packageId } }));
  }

  /**
   * Kept for older clients. The paid amount is server-owned: it moves only with
   * payments recorded on the booking's invoice (finance:payment:process), never
   * by typing a number here. A status in the body follows the lifecycle rules.
   */
  async setPayment(tenantId: string, id: string, dto: { paidAmount?: number; paidAmountCents?: number; status?: string }) {
    const booking = await this.findOne(tenantId, id);
    if (dto.paidAmount != null || dto.paidAmountCents != null) {
      throw new BadRequestException(
        "The paid amount is derived from recorded payments. Record the payment on the booking's invoice.",
      );
    }
    if (dto.status === undefined || dto.status === null) return booking;
    return this.updateStatus(tenantId, id, normalizeBookingStatus(dto.status));
  }

  async cancel(tenantId: string, id: string, reason?: string) {
    const current = await this.findOne(tenantId, id);
    if (current.status === 'CANCELLED') return current;
    if (['COMPLETED', 'REFUNDED'].includes(String(current.status))) {
      throw new BadRequestException(`A ${current.status} booking cannot be cancelled`);
    }
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
    if (['CANCELLED', 'REFUNDED'].includes(String(booking.status))) {
      throw new BadRequestException(`A ${booking.status} booking cannot be invoiced`);
    }
    // Reuse the booking's live invoice; a voided or cancelled one is replaced.
    const existing = await this.prisma.invoice.findFirst({
      where: { tenantId, bookingId, status: { notIn: ['VOID', 'CANCELLED'] as any } },
      orderBy: { createdAt: 'desc' },
    });
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
      // Tenant-scoped: never copy another tenant's pilgrim name onto an invoice.
      const pilgrim = await this.prisma.pilgrim.findFirst({ where: { id: leadPilgrimId, tenantId } });
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
    const pilgrimCount = (booking as any).pilgrims?.length ?? 1;
    const invoice = await this.prisma.$transaction(async (tx) => {
      const created = await tx.invoice.create({
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
          paidCents: BigInt(0),
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
      // Money already received for the booking moves onto the invoice as
      // payments, so the invoice's paid total is backed by payment records
      // (and a card payment can never collect it a second time).
      const settled = { in: ['COMPLETED', 'PARTIALLY_REFUNDED'] as any };
      await tx.payment.updateMany({
        where: { tenantId, bookingId, invoiceId: null, status: settled },
        data: { invoiceId: created.id },
      });
      const backed = await tx.payment.aggregate({
        where: { tenantId, bookingId, status: settled },
        _sum: { amountCents: true, refundedCents: true },
      });
      const backedCents = BigInt(backed._sum.amountCents ?? 0) - BigInt(backed._sum.refundedCents ?? 0);
      const carried = BigInt(booking.paidAmountCents ?? 0) - backedCents;
      if (carried > BigInt(0)) {
        await tx.payment.create({
          data: {
            tenantId,
            invoiceId: created.id,
            bookingId,
            amountCents: carried,
            currency: booking.currency,
            gateway: 'booking_deposit',
            gatewayRef: booking.bookingRef,
            status: 'COMPLETED',
            paidAt: new Date(),
            idempotencyKey: `deposit-${bookingId}-${randomUUID()}`,
          },
        });
      }
      const onInvoice = await tx.payment.aggregate({
        where: { invoiceId: created.id, status: settled },
        _sum: { amountCents: true, refundedCents: true },
      });
      const paid = BigInt(onInvoice._sum.amountCents ?? 0) - BigInt(onInvoice._sum.refundedCents ?? 0);
      return tx.invoice.update({ where: { id: created.id }, data: { paidCents: paid < BigInt(0) ? BigInt(0) : paid } });
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
    requireId(pilgrimId, 'Pilgrim');
    await findOwned(this.prisma.pilgrim, pilgrimId, tenantId, 'Pilgrim', { deletedAt: null }, { id: true });
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
    const where: any = { tenantId, deletedAt: null };
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
    const pkg = await this.prisma.package.findFirst({ where: { id, tenantId, deletedAt: null } });
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

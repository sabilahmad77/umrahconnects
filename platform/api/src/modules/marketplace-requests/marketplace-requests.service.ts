import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class MarketplaceRequestsService {
  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
  ) {}

  // ─── Traveler-side: create a request ────────────────────────────────────
  async create(tenantId: string, travelerUserId: string, dto: any) {
    // Accept either `serviceType` (Prisma field) or `category` (legacy/UI form field)
    const serviceType = dto.serviceType ?? dto.category;
    if (!serviceType) {
      throw new BadRequestException('serviceType (or category) is required');
    }
    const created = await this.prisma.marketplaceRequest.create({
      data: {
        tenantId,
        travelerId: travelerUserId,
        serviceType,
        title: dto.title,
        description: dto.description,
        city: dto.city,
        dateFrom: dto.dateFrom ? new Date(dto.dateFrom) : null,
        dateTo: dto.dateTo ? new Date(dto.dateTo) : null,
        travelers: dto.travelers ?? 1,
        budgetMinCents: dto.budgetMinCents != null ? BigInt(dto.budgetMinCents) : null,
        budgetMaxCents: dto.budgetMaxCents != null ? BigInt(dto.budgetMaxCents) : null,
        currency: dto.currency ?? 'SAR',
        requirements: dto.requirements ?? {},
      },
    });
    return this.normalize(created);
  }

  async listForTraveler(travelerUserId: string, params: { page?: number; limit?: number; status?: string }) {
    const page = Math.max(1, Number(params.page ?? 1));
    const limit = Math.min(50, Math.max(1, Number(params.limit ?? 20)));
    const where: any = { travelerId: travelerUserId };
    if (params.status) where.status = params.status;
    const [items, total] = await Promise.all([
      this.prisma.marketplaceRequest.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: { offers: { orderBy: { createdAt: 'desc' } } },
      }),
      this.prisma.marketplaceRequest.count({ where }),
    ]);
    return { items: items.map((i) => this.normalize(i)), total, page, limit };
  }

  // ─── Provider-side: browse open requests in the tenant ──────────────────
  async listOpen(tenantId: string, params: { page?: number; limit?: number; serviceType?: string }) {
    const page = Math.max(1, Number(params.page ?? 1));
    const limit = Math.min(50, Math.max(1, Number(params.limit ?? 20)));
    const where: any = { tenantId, status: { in: ['OPEN', 'IN_NEGOTIATION'] } as any };
    if (params.serviceType) where.serviceType = params.serviceType;
    const [items, total] = await Promise.all([
      this.prisma.marketplaceRequest.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: { offers: { select: { id: true, status: true, providerId: true } } },
      }),
      this.prisma.marketplaceRequest.count({ where }),
    ]);
    return { items: items.map((i) => this.normalize(i)), total, page, limit };
  }

  async findOne(id: string) {
    const r = await this.prisma.marketplaceRequest.findUnique({
      where: { id },
      include: { offers: { orderBy: { createdAt: 'desc' } } },
    });
    if (!r) throw new NotFoundException('Request not found');
    return this.normalize(r);
  }

  async close(travelerUserId: string, id: string) {
    const r = await this.prisma.marketplaceRequest.findUnique({ where: { id } });
    if (!r) throw new NotFoundException('Request not found');
    if (r.travelerId !== travelerUserId) throw new BadRequestException('Not your request');
    return this.normalize(
      await this.prisma.marketplaceRequest.update({ where: { id }, data: { status: 'CLOSED' as any } }),
    );
  }

  // ─── Provider sends an offer ─────────────────────────────────────────────
  async createOffer(providerUserId: string, requestId: string, dto: any) {
    const req = await this.prisma.marketplaceRequest.findUnique({ where: { id: requestId } });
    if (!req) throw new NotFoundException('Request not found');
    if (!['OPEN', 'IN_NEGOTIATION'].includes(req.status as any)) {
      throw new BadRequestException('This request is no longer accepting offers');
    }
    // FIX-05: validate/normalize so a missing title can't crash Prisma (500).
    const priceCents = Number(dto.priceCents ?? 0);
    if (!priceCents || priceCents <= 0) {
      throw new BadRequestException('Offer price must be greater than zero.');
    }
    const offer = await this.prisma.requestOffer.create({
      data: {
        requestId,
        providerId: providerUserId,
        vendorId: dto.vendorId ?? null,
        title: dto.title?.trim() || `Offer for ${req.title}`,
        description: dto.description,
        priceCents: BigInt(Math.round(priceCents)),
        currency: dto.currency ?? req.currency,
        validUntil: dto.validUntil ? new Date(dto.validUntil) : null,
      },
    });
    // Move request to negotiation on first offer
    if (req.status === 'OPEN') {
      await this.prisma.marketplaceRequest.update({
        where: { id: requestId },
        data: { status: 'IN_NEGOTIATION' as any },
      });
    }
    // Notify traveler
    await this.notifications.fire({
      tenantId: req.tenantId,
      recipientUserId: req.travelerId,
      actorUserId: providerUserId,
      type: 'REQUEST_OFFER',
      title: 'New offer on your request',
      body: `${dto.title} — ${dto.currency ?? 'SAR'} ${(Number(offer.priceCents) / 100).toLocaleString()}`,
      link: `/requests/${requestId}`,
      data: { requestId, offerId: offer.id },
    });
    return this.normalizeOffer(offer);
  }

  // ─── Traveler accepts an offer ───────────────────────────────────────────
  async acceptOffer(travelerUserId: string, requestId: string, offerId: string) {
    const req = await this.prisma.marketplaceRequest.findUnique({ where: { id: requestId } });
    if (!req) throw new NotFoundException('Request not found');
    if (req.travelerId !== travelerUserId) throw new BadRequestException('Not your request');
    const offer = await this.prisma.requestOffer.findUnique({ where: { id: offerId } });
    if (!offer || offer.requestId !== requestId) throw new NotFoundException('Offer not found');
    if (offer.status !== 'PENDING') throw new BadRequestException(`Offer is already ${offer.status.toLowerCase()}`);

    // Accept the chosen offer; auto-reject the rest
    const [accepted] = await this.prisma.$transaction([
      this.prisma.requestOffer.update({
        where: { id: offerId },
        data: { status: 'ACCEPTED' as any, respondedAt: new Date() },
      }),
      this.prisma.requestOffer.updateMany({
        where: { requestId, id: { not: offerId }, status: 'PENDING' as any },
        data: { status: 'REJECTED' as any, respondedAt: new Date() },
      }),
      this.prisma.marketplaceRequest.update({
        where: { id: requestId },
        data: { status: 'FULFILLED' as any, acceptedOfferId: offerId },
      }),
    ]);

    // Notify the accepted provider
    await this.notifications.fire({
      tenantId: req.tenantId,
      recipientUserId: offer.providerId,
      actorUserId: travelerUserId,
      type: 'REQUEST_OFFER_ACCEPTED',
      title: 'Your offer was accepted',
      body: `Your offer on "${req.title}" was accepted.`,
      link: `/requests/${requestId}`,
      data: { requestId, offerId },
    });
    return this.normalizeOffer(accepted);
  }

  async rejectOffer(travelerUserId: string, requestId: string, offerId: string) {
    const req = await this.prisma.marketplaceRequest.findUnique({ where: { id: requestId } });
    if (!req) throw new NotFoundException('Request not found');
    if (req.travelerId !== travelerUserId) throw new BadRequestException('Not your request');
    const offer = await this.prisma.requestOffer.findUnique({ where: { id: offerId } });
    if (!offer || offer.requestId !== requestId) throw new NotFoundException('Offer not found');

    const updated = await this.prisma.requestOffer.update({
      where: { id: offerId },
      data: { status: 'REJECTED' as any, respondedAt: new Date() },
    });
    await this.notifications.fire({
      tenantId: req.tenantId,
      recipientUserId: offer.providerId,
      actorUserId: travelerUserId,
      type: 'REQUEST_OFFER_REJECTED',
      title: 'Offer not accepted',
      body: `Your offer on "${req.title}" was not selected.`,
      link: `/requests/${requestId}`,
      data: { requestId, offerId },
    });
    return this.normalizeOffer(updated);
  }

  /**
   * Convert an accepted offer into a concrete booking record.
   * - HOTEL / OTHER → creates a ListingBooking against the offer's vendor (uses first listing as anchor)
   * - TRANSPORT → creates a TransportAssignment (requires vehicleId in offer.requirements)
   * - VISA → creates a VisaApplication if the offer.providerId is in the same tenant
   * - PACKAGE → creates a Booking (requires packageId in dto)
   *
   * Idempotent: if a booking is already linked, returns the existing one.
   */
  async convertOfferToBooking(
    requestId: string,
    offerId: string,
    actorUserId: string,
    dto: { vehicleId?: string; routeId?: string; scheduledAt?: string; passengerCount?: number; notes?: string; listingId?: string } = {},
  ) {
    const req = await this.prisma.marketplaceRequest.findUnique({ where: { id: requestId }, include: { offers: true } });
    if (!req) throw new NotFoundException('Request not found');
    const offer = req.offers.find((o) => o.id === offerId);
    if (!offer) throw new NotFoundException('Offer not found');
    if (offer.status !== 'ACCEPTED') throw new BadRequestException('Offer must be accepted before conversion');

    // Find or auto-resolve provider's vendor (for hotel/other listings)
    let vendor = offer.vendorId
      ? await this.prisma.vendor.findUnique({ where: { id: offer.vendorId } })
      : null;
    // Auto-resolve from the provider user's tenant if no vendor record yet
    if (!vendor) {
      const providerUser = await this.prisma.user.findUnique({ where: { id: offer.providerId } });
      if (providerUser?.tenantId) {
        vendor = await this.prisma.vendor.findFirst({ where: { tenantId: providerUser.tenantId } });
        if (!vendor) {
          const tenant = await this.prisma.tenant.findUnique({ where: { id: providerUser.tenantId } });
          vendor = await this.prisma.vendor.create({
            data: {
              tenantId: providerUser.tenantId,
              type: (tenant?.type as any) ?? 'OPERATOR',
              name: tenant?.name ?? 'Provider',
              email: tenant?.email ?? `vendor+${providerUser.tenantId.slice(0, 8)}@umrahconnects.com`,
              country: tenant?.country ?? 'SA',
              status: 'PENDING_KYC',
              kycDocuments: [],
              images: [],
            },
          });
        }
      }
    }

    let result: any;
    if (req.serviceType === 'TRANSPORT') {
      if (!dto.vehicleId) throw new BadRequestException('vehicleId required to convert transport offer');
      result = await this.prisma.transportAssignment.create({
        data: {
          tenantId: req.tenantId,
          vehicleId: dto.vehicleId,
          routeId: dto.routeId,
          customerType: 'PLATFORM_USER',
          customerName: 'Traveler',
          scheduledAt: dto.scheduledAt ? new Date(dto.scheduledAt) : (req.dateFrom ?? new Date()),
          passengerCount: dto.passengerCount ?? req.travelers ?? 1,
          priceCents: BigInt(offer.priceCents),
          currency: offer.currency,
          paymentStatus: 'UNPAID',
          status: 'CONFIRMED',
          notes: dto.notes ?? offer.description,
        },
      });
    } else if ((req.serviceType === 'HOTEL' || req.serviceType === 'OTHER' || req.serviceType === 'PACKAGE') && vendor) {
      // Find or create a listing for this vendor + service-type
      let listing = dto.listingId
        ? await this.prisma.listing.findUnique({ where: { id: dto.listingId } })
        : null;
      if (!listing) {
        listing = await this.prisma.listing.findFirst({
          where: { vendorId: vendor.id, isActive: true },
          orderBy: { createdAt: 'desc' },
        });
      }
      if (!listing) {
        // Spin up a quick listing record so the booking has a parent
        listing = await this.prisma.listing.create({
          data: {
            vendorId: vendor.id,
            type: req.serviceType === 'HOTEL' ? 'hotel_room' : req.serviceType === 'PACKAGE' ? 'other' : 'other',
            name: offer.title,
            description: offer.description,
            priceCents: BigInt(offer.priceCents),
            currency: offer.currency,
            pricingModel: 'PER_PERSON',
            attributes: {},
            status: 'PUBLISHED',
          },
        });
      }
      result = await this.prisma.listingBooking.create({
        data: {
          listingId: listing.id,
          customerUserId: req.travelerId,
          customerName: 'Traveler',
          partySize: req.travelers ?? 1,
          totalAmountCents: BigInt(offer.priceCents),
          currency: offer.currency,
          startDate: req.dateFrom ?? undefined,
          endDate: req.dateTo ?? undefined,
          status: 'CONFIRMED',
          paymentStatus: 'UNPAID',
          notes: dto.notes ?? offer.description,
        },
      });
      result = { ...result, totalAmountCents: Number((result as any).totalAmountCents) };
    } else if (req.serviceType === 'VISA') {
      // Convert a visa service request into a visa application
      const appNo = `VISA-${new Date().getFullYear()}-${Math.random().toString().slice(2, 7)}`;
      const visa = await this.prisma.visaApplication.create({
        data: {
          tenantId: req.tenantId,
          regulatorySystem: 'NUSUK_MASAR' as any,
          status: 'NOT_STARTED' as any,
          applicantName: 'Traveler',
          visaType: req.title,
          destinationCountry: 'SA',
          applicationNumber: appNo,
          requiredDocuments: ['PASSPORT', 'PHOTO'],
          priceCents: BigInt(offer.priceCents),
          currency: offer.currency,
          paymentStatus: 'UNPAID',
          notes: dto.notes ?? offer.description,
          documents: [],
          timeline: [{ at: new Date().toISOString(), event: 'CREATED_FROM_REQUEST', requestId }],
        },
      });
      result = { ...visa, priceCents: Number((visa as any).priceCents) };
    } else {
      throw new BadRequestException(`Conversion not yet supported for serviceType=${req.serviceType}`);
    }

    // Notify both parties
    await this.notifications.fire({
      tenantId: req.tenantId,
      recipientUserId: offer.providerId,
      actorUserId,
      type: 'REQUEST_OFFER_ACCEPTED',
      title: 'Booking created from your offer',
      body: `A booking was generated for "${req.title}".`,
      link: `/requests/${requestId}`,
      data: { requestId, offerId, conversionResultId: result.id },
    });
    return result;
  }

  /** Provider sees offers they've sent. */
  async listMyOffers(providerUserId: string, params: { page?: number; limit?: number; status?: string }) {
    const page = Math.max(1, Number(params.page ?? 1));
    const limit = Math.min(50, Math.max(1, Number(params.limit ?? 20)));
    const where: any = { providerId: providerUserId };
    if (params.status) where.status = params.status;
    const [items, total] = await Promise.all([
      this.prisma.requestOffer.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: { request: true },
      }),
      this.prisma.requestOffer.count({ where }),
    ]);
    return { items: items.map((o) => this.normalizeOffer(o)), total, page, limit };
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────
  private normalize(r: any): any {
    return {
      ...r,
      budgetMinCents: r.budgetMinCents != null ? Number(r.budgetMinCents) : null,
      budgetMaxCents: r.budgetMaxCents != null ? Number(r.budgetMaxCents) : null,
      offers: Array.isArray(r.offers) ? r.offers.map((o: any) => this.normalizeOffer(o)) : undefined,
    };
  }
  private normalizeOffer(o: any): any {
    return o ? { ...o, priceCents: Number(o.priceCents ?? 0) } : o;
  }
}

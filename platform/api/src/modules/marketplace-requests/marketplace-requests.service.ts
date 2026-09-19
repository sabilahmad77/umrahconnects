import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { OfferStatus, Prisma, RequestServiceType, RequestStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { SystemScoped } from '../../prisma/db-context';
import { NotificationsService } from '../notifications/notifications.service';
import { RbacService } from '../rbac/rbac.service';
import { COMMUNITY_TENANT_SLUG } from '../rbac/catalog';
import { findOwned } from '../../common/tenant-scope';
import type { Principal } from '../auth/principal';
import { listingCapacity, PUBLIC_LISTING } from '../marketplace/listing-rules';
import { MAX_PARTY_SIZE } from '../marketplace/dto/marketplace.dto';
import { checkTrip, recountSeats, withoutUntrackedPayment } from '../transport/transport-workflow';
import { ConvertOfferDto, CreateMarketplaceRequestDto, CreateOfferDto } from './dto/marketplace-requests.dto';

/** Request states in which providers may browse and make offers. */
const ACCEPTING_OFFERS: RequestStatus[] = ['OPEN', 'IN_NEGOTIATION'];

/** Provider organization type → the service type it serves (operators see every type). */
const SERVICE_TYPE_BY_TENANT_TYPE: Record<string, RequestServiceType> = {
  VENDOR_HOTEL: 'HOTEL',
  VENDOR_TRANSPORT: 'TRANSPORT',
  VENDOR_VISA: 'VISA',
  VENDOR_GUIDE: 'GUIDE',
  VENDOR_CATERING: 'CATERING',
};

/** Key inside `requirements` that records a completed conversion (guards against double conversion). */
const CONVERSION_KEY = '_conversion';

const asObject = (v: unknown): Record<string, any> =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, any>) : {};

function parseEnum<T extends string>(values: Record<string, T>, v: string | undefined, label: string): T | undefined {
  if (v === undefined || v === '') return undefined;
  const up = String(v).toUpperCase() as T;
  if (!Object.values(values).includes(up)) throw new BadRequestException(`Invalid ${label} "${v}"`);
  return up;
}

@Injectable()
export class MarketplaceRequestsService {
  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
    private rbac: RbacService,
  ) {}

  // ─── Traveler-side: create a request ────────────────────────────────────
  async create(tenantId: string, travelerUserId: string, dto: CreateMarketplaceRequestDto) {
    // Accept either `serviceType` (Prisma field) or `category` (legacy/UI form field)
    const serviceType = dto.serviceType ?? dto.category;
    if (!serviceType) {
      throw new BadRequestException('serviceType (or category) is required');
    }
    if (dto.dateFrom && dto.dateTo && dto.dateTo.slice(0, 10) < dto.dateFrom.slice(0, 10)) {
      throw new BadRequestException('dateTo cannot be before dateFrom');
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
        requirements: (dto.requirements ?? {}) as Prisma.InputJsonValue,
      },
    });
    return this.normalize(created);
  }

  async listForTraveler(travelerUserId: string, params: { page?: number; limit?: number; status?: string }) {
    const page = Math.max(1, Number(params.page ?? 1));
    const limit = Math.min(50, Math.max(1, Number(params.limit ?? 20)));
    const where: any = { travelerId: travelerUserId };
    const status = parseEnum(RequestStatus, params.status, 'status');
    if (status) where.status = status;
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
    return { items: await this.attachSellers(items.map((i) => this.normalize(i))), total, page, limit };
  }

  // ─── Provider-side: browse open requests of OTHER organizations ─────────
  async listOpen(provider: Principal, params: { page?: number; limit?: number; serviceType?: string }) {
    const page = Math.max(1, Number(params.page ?? 1) || 1);
    const limit = Math.min(50, Math.max(1, Number(params.limit ?? 20) || 20));
    const serviceType =
      parseEnum(RequestServiceType, params.serviceType, 'serviceType') ??
      SERVICE_TYPE_BY_TENANT_TYPE[provider.tenantType];
    const where: Prisma.MarketplaceRequestWhereInput = {
      tenantId: { not: provider.tenantId },
      status: { in: ACCEPTING_OFFERS },
      ...(serviceType ? { serviceType } : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.marketplaceRequest.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        // Only the caller's own offers — never other providers' offers.
        include: {
          offers: { where: { providerId: provider.sub }, select: { id: true, status: true, providerId: true } },
          _count: { select: { offers: true } },
        },
      }),
      this.prisma.marketplaceRequest.count({ where }),
    ]);
    return { items: items.map((i) => this.normalize(i)), total, page, limit };
  }

  /**
   * Visible to: the requester; staff of the requester's organization unless it is the shared
   * traveler community; providers who made an offer (their own offers only); and providers
   * holding marketplace:listing:manage while the request accepts offers (no offers shown).
   */
  async findOne(id: string, user: Principal) {
    return (await this.attachSellers([await this.findVisible(id, user)]))[0];
  }

  private async findVisible(id: string, user: Principal) {
    const r = await this.prisma.marketplaceRequest.findUnique({
      where: { id },
      include: { offers: { orderBy: { createdAt: 'desc' } } },
    });
    if (!r) throw new NotFoundException('Request not found');
    if (r.travelerId === user.sub) return this.normalize(r);

    if (r.tenantId === user.tenantId) {
      const tenant = await this.prisma.tenant.findUnique({ where: { id: r.tenantId }, select: { slug: true } });
      if (tenant && tenant.slug !== COMMUNITY_TENANT_SLUG) return this.normalize(r);
      throw new NotFoundException('Request not found');
    }

    const ownOffers = r.offers.filter((o) => o.providerId === user.sub);
    if (ownOffers.length) return this.normalize({ ...r, offers: ownOffers });

    if (
      ACCEPTING_OFFERS.includes(r.status) &&
      (await this.rbac.userHasPermissions(user.sub, user.tenantId, ['marketplace:listing:manage']))
    ) {
      return this.normalize({ ...r, offers: [] });
    }
    throw new NotFoundException('Request not found');
  }

  async close(travelerUserId: string, id: string) {
    const r = await this.prisma.marketplaceRequest.findUnique({ where: { id } });
    if (!r || r.travelerId !== travelerUserId) throw new NotFoundException('Request not found');
    return this.normalize(
      await this.prisma.marketplaceRequest.update({ where: { id }, data: { status: 'CLOSED' as any } }),
    );
  }

  // ─── Provider sends an offer ─────────────────────────────────────────────
  async createOffer(provider: Principal, requestId: string, dto: CreateOfferDto) {
    const providerUserId = provider.sub;
    const req = await this.prisma.marketplaceRequest.findUnique({ where: { id: requestId } });
    if (!req) throw new NotFoundException('Request not found');
    if (req.tenantId === provider.tenantId || req.travelerId === providerUserId) {
      throw new ForbiddenException("You cannot make an offer on your own organization's request");
    }
    if (!ACCEPTING_OFFERS.includes(req.status)) {
      throw new BadRequestException('This request is no longer accepting offers');
    }
    // The optional vendor link must be one of the caller organization's vendors.
    const vendorId = dto.vendorId
      ? (await findOwned<{ id: string }>(this.prisma.vendor, dto.vendorId, provider.tenantId, 'Vendor', {}, { id: true })).id
      : null;
    if (dto.validUntil && new Date(dto.validUntil).getTime() <= Date.now()) {
      throw new BadRequestException('validUntil must be in the future');
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
        vendorId,
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
      body: `${offer.title} — ${offer.currency} ${(Number(offer.priceCents) / 100).toLocaleString()}`,
      link: `/requests/${requestId}`,
      data: { requestId, offerId: offer.id },
    });
    return this.normalizeOffer(offer);
  }

  // ─── Traveler accepts an offer ───────────────────────────────────────────
  async acceptOffer(travelerUserId: string, requestId: string, offerId: string) {
    const req = await this.prisma.marketplaceRequest.findUnique({ where: { id: requestId } });
    if (!req || req.travelerId !== travelerUserId) throw new NotFoundException('Request not found');
    if (!['OPEN', 'IN_NEGOTIATION'].includes(String(req.status))) {
      throw new BadRequestException(`Request is ${String(req.status).toLowerCase()} and can no longer accept offers`);
    }
    if (req.expiresAt && req.expiresAt < new Date()) throw new BadRequestException('Request has expired');
    const offer = await this.prisma.requestOffer.findUnique({ where: { id: offerId } });
    if (!offer || offer.requestId !== requestId) throw new NotFoundException('Offer not found');
    if (offer.status !== 'PENDING') throw new BadRequestException(`Offer is already ${offer.status.toLowerCase()}`);
    if (offer.validUntil && offer.validUntil < new Date()) throw new BadRequestException('Offer has expired');

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
    if (!req || req.travelerId !== travelerUserId) throw new NotFoundException('Request not found');
    if (!['OPEN', 'IN_NEGOTIATION'].includes(String(req.status))) {
      throw new BadRequestException(`Request is ${String(req.status).toLowerCase()} and can no longer accept offers`);
    }
    if (req.expiresAt && req.expiresAt < new Date()) throw new BadRequestException('Request has expired');
    const offer = await this.prisma.requestOffer.findUnique({ where: { id: offerId } });
    if (!offer || offer.requestId !== requestId) throw new NotFoundException('Offer not found');
    if (offer.status !== 'PENDING') throw new BadRequestException(`Offer is already ${offer.status.toLowerCase()}`);
    if (offer.validUntil && offer.validUntil < new Date()) throw new BadRequestException('Offer has expired');

    const res = await this.prisma.requestOffer.updateMany({
      where: { id: offerId, status: OfferStatus.PENDING },
      data: { status: OfferStatus.REJECTED, respondedAt: new Date() },
    });
    if (res.count !== 1) throw new ConflictException('Offer is no longer pending');
    const updated = await this.prisma.requestOffer.findUnique({ where: { id: offerId } });
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
   * Convert an accepted offer into a concrete booking record. Only the requester may convert,
   * only the ACCEPTED offer of the request, and only once. Everything is created inside the
   * PROVIDER's organization, from the provider's own vehicles / routes / listings, through the
   * same availability rules as the provider's own screens (F14):
   * - HOTEL / OTHER / PACKAGE → ListingBooking. A chosen listing must be live on the
   *   marketplace (published, not taken down, seller in good standing) and hold the party
   *   (its capacity, as for a direct booking). Listings carry no room inventory — the
   *   provider assigns rooms in its hotel workflow — so there is no room to double-book here.
   * - TRANSPORT → TransportAssignment, checked and counted by the transport workflow
   *   (vehicle active and large enough, route selling with seats left, no vehicle clash),
   *   with the vehicle and route rows locked so parallel bookings cannot oversell.
   * - VISA → VisaApplication in the provider's organization
   */
  // R05: the traveler's request creates rows in the PROVIDER organization (transport assignment,
  // visa application), so this is system-scoped; the checks below (request owner, accepted offer,
  // provider-owned references) are what keep it safe.
  @SystemScoped('marketplace.offer-conversion')
  async convertOfferToBooking(requestId: string, offerId: string, actorUserId: string, dto: ConvertOfferDto = {}) {
    const req = await this.prisma.marketplaceRequest.findUnique({ where: { id: requestId }, include: { offers: true } });
    if (!req) throw new NotFoundException('Request not found');
    const offer = req.offers.find((o) => o.id === offerId);
    // The requester converts; for TRANSPORT the offering provider may too, because
    // only the provider knows which of its vehicles will run the trip.
    const isRequester = req.travelerId === actorUserId;
    const isTransportProvider = req.serviceType === 'TRANSPORT' && offer?.providerId === actorUserId;
    if (!isRequester && !isTransportProvider) throw new NotFoundException('Request not found');
    if (!offer) throw new NotFoundException('Offer not found');
    if (offer.status !== 'ACCEPTED' || (req.acceptedOfferId && req.acceptedOfferId !== offerId)) {
      throw new BadRequestException('Offer must be accepted before conversion');
    }
    if (asObject(req.requirements)[CONVERSION_KEY]) {
      throw new ConflictException('This offer has already been converted');
    }

    // The provider's organization is the one that fulfils the booking.
    const providerUser = await this.prisma.user.findUnique({ where: { id: offer.providerId }, select: { tenantId: true } });
    if (!providerUser?.tenantId) throw new ConflictException('The provider of this offer is no longer available');
    const providerTenantId = providerUser.tenantId;

    // Resolve the provider's vendor: the offer's vendor only if it belongs to the provider organization.
    let vendor = offer.vendorId
      ? await this.prisma.vendor.findFirst({ where: { id: offer.vendorId, tenantId: providerTenantId } })
      : null;
    if (!vendor) vendor = await this.prisma.vendor.findFirst({ where: { tenantId: providerTenantId } });

    const isListingType = req.serviceType === 'HOTEL' || req.serviceType === 'OTHER' || req.serviceType === 'PACKAGE';
    if (!isListingType && req.serviceType !== 'TRANSPORT' && req.serviceType !== 'VISA') {
      throw new BadRequestException(`Conversion not yet supported for serviceType=${req.serviceType}`);
    }

    // Validate client-supplied references against the provider organization before writing anything.
    if (req.serviceType === 'TRANSPORT') {
      if (!dto.vehicleId) throw new BadRequestException('vehicleId required to convert transport offer');
      await findOwned(this.prisma.vehicle, dto.vehicleId, providerTenantId, 'Vehicle', {}, { id: true });
      if (dto.routeId) await findOwned(this.prisma.transportRoute, dto.routeId, providerTenantId, 'Route', {}, { id: true });
    }
    let chosenListing: { id: string } | null = null;
    if (isListingType && dto.listingId) {
      if (!vendor) throw new NotFoundException('Listing not found');
      // The same listings a traveler could book directly: live, not taken down, the provider's own.
      const live = await this.prisma.listing.findFirst({
        where: { AND: [PUBLIC_LISTING, { id: dto.listingId, vendor: { tenantId: providerTenantId } }] },
        select: { id: true, attributes: true },
      });
      if (!live) throw new NotFoundException('Listing not found');
      const partySize = req.travelers ?? 1;
      const capacity = listingCapacity(live.attributes);
      const maxParty = capacity != null ? Math.min(capacity, MAX_PARTY_SIZE) : MAX_PARTY_SIZE;
      if (partySize > maxParty) {
        throw new BadRequestException(`This listing takes at most ${maxParty} people; the request is for ${partySize}`);
      }
      chosenListing = { id: live.id };
    }
    if (isListingType && req.dateFrom && req.dateTo && req.dateTo < req.dateFrom) {
      throw new BadRequestException("The request's end date is before its start date");
    }

    if (isListingType && !vendor) {
      // Auto-create the provider's vendor record so the booking has a parent.
      const tenant = await this.prisma.tenant.findUnique({ where: { id: providerTenantId } });
      vendor = await this.prisma.vendor.create({
        data: {
          tenantId: providerTenantId,
          type: (tenant?.type as any) ?? 'OPERATOR',
          name: tenant?.name ?? 'Provider',
          email: tenant?.email ?? `vendor+${providerTenantId.slice(0, 8)}@umrahconnects.com`,
          country: tenant?.country ?? 'SA',
          status: 'PENDING_KYC',
          kycDocuments: [],
          images: [],
        },
      });
    }

    const result: any = await this.prisma.$transaction(async (tx) => {
      // Serialize conversions of the same request and re-check the one-time marker under the lock.
      await tx.$queryRaw`SELECT id FROM marketplace.marketplace_requests WHERE id = ${requestId}::uuid FOR UPDATE`;
      const fresh = await tx.marketplaceRequest.findUnique({ where: { id: requestId }, select: { requirements: true } });
      const requirements = asObject(fresh?.requirements);
      if (requirements[CONVERSION_KEY]) throw new ConflictException('This offer has already been converted');

      let created: any;
      let kind: string;
      if (req.serviceType === 'TRANSPORT') {
        kind = 'TRANSPORT_ASSIGNMENT';
        const trip = {
          vehicleId: dto.vehicleId!,
          driverId: null,
          routeId: dto.routeId ?? null,
          scheduledAt: dto.scheduledAt ? new Date(dto.scheduledAt) : (req.dateFrom ?? new Date()),
          seats: dto.passengerCount ?? req.travelers ?? 1,
        };
        // The transport workflow's own checks, on locked vehicle / route rows (F14).
        await checkTrip(tx, providerTenantId, trip, { vehicleChanged: true, driverChanged: true, routeChanged: true, clashes: true });
        created = await tx.transportAssignment.create({
          data: {
            tenantId: providerTenantId,
            vehicleId: trip.vehicleId,
            routeId: trip.routeId ?? undefined,
            customerType: 'PLATFORM_USER',
            customerName: 'Traveler',
            scheduledAt: trip.scheduledAt,
            passengerCount: trip.seats,
            priceCents: BigInt(offer.priceCents),
            currency: offer.currency,
            status: 'CONFIRMED',
            notes: dto.notes ?? offer.description,
          },
        });
        // Seat counters and FULLY_BOOKED follow the trips, exactly as for a trip booked by the provider.
        await recountSeats(tx, providerTenantId, [created.vehicleId], [created.routeId]);
        created = { ...withoutUntrackedPayment(created), priceCents: Number(created.priceCents) };
      } else if (isListingType) {
        kind = 'LISTING_BOOKING';
        let listing: { id: string } | null = chosenListing;
        if (!listing) {
          // No listing chosen: record the negotiated service as a private, archived
          // listing of the provider. It never appears in the public catalogue (a
          // private offer must not become a public product) and the booking is not
          // attached to some unrelated listing the provider happens to have.
          listing = await tx.listing.create({
            data: {
              vendorId: vendor!.id,
              type: req.serviceType === 'HOTEL' ? 'hotel_room' : 'other',
              name: offer.title,
              description: offer.description,
              priceCents: BigInt(offer.priceCents),
              currency: offer.currency,
              pricingModel: 'PER_GROUP',
              attributes: { source: 'request_offer', requestId, offerId },
              status: 'ARCHIVED',
              isActive: false,
            },
            select: { id: true },
          });
        }
        const booking = await tx.listingBooking.create({
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
        created = { ...booking, totalAmountCents: Number(booking.totalAmountCents) };
      } else {
        kind = 'VISA_APPLICATION';
        const appNo = `VISA-${new Date().getFullYear()}-${Math.random().toString().slice(2, 7)}`;
        const visa = await tx.visaApplication.create({
          data: {
            tenantId: providerTenantId,
            regulatorySystem: 'NUSUK_MASAR' as any,
            status: 'NOT_STARTED' as any,
            applicantName: 'Traveler',
            visaType: req.title,
            destinationCountry: 'SA',
            applicationNumber: appNo,
            requiredDocuments: ['PASSPORT', 'PHOTO'],
            priceCents: BigInt(offer.priceCents),
            currency: offer.currency,
            notes: dto.notes ?? offer.description,
            documents: [],
            timeline: [{ at: new Date().toISOString(), event: 'CREATED_FROM_REQUEST', requestId }],
          },
        });
        created = { ...withoutUntrackedPayment(visa), priceCents: Number((visa as any).priceCents) };
      }

      await tx.marketplaceRequest.update({
        where: { id: requestId },
        data: {
          requirements: {
            ...requirements,
            [CONVERSION_KEY]: { offerId, kind, resultId: created.id, at: new Date().toISOString() },
          } as Prisma.InputJsonValue,
        },
      });
      return created;
    });

    // Notify the provider
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
    const status = parseEnum(OfferStatus, params.status, 'status');
    if (status) where.status = status;
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

  /**
   * Adds `seller` to every offer: the offer's seller profile when it has one,
   * otherwise the provider's organization — so a traveler compares real sellers
   * instead of anonymous user ids.
   */
  private async attachSellers(requests: any[]): Promise<any[]> {
    const offers = requests.flatMap((r) => (Array.isArray(r?.offers) ? r.offers : []));
    if (!offers.length) return requests;
    const vendorIds = [...new Set(offers.map((o: any) => o.vendorId).filter(Boolean))] as string[];
    const providerIds = [...new Set(offers.map((o: any) => o.providerId).filter(Boolean))] as string[];
    const [vendors, providers] = await Promise.all([
      vendorIds.length
        ? this.prisma.vendor.findMany({
            where: { id: { in: vendorIds } },
            select: { id: true, name: true, status: true, verifiedAt: true },
          })
        : Promise.resolve([]),
      this.prisma.user.findMany({
        where: { id: { in: providerIds } },
        select: { id: true, tenant: { select: { name: true } } },
      }),
    ]);
    const vendorById = new Map(vendors.map((v) => [v.id, v]));
    const orgByUser = new Map(providers.map((u) => [u.id, u.tenant?.name ?? null]));
    const seller = (o: any) => {
      const v = o.vendorId ? vendorById.get(o.vendorId) : undefined;
      if (v) return { name: v.name, vendorId: v.id, verified: !!v.verifiedAt || v.status === 'VERIFIED' };
      const org = orgByUser.get(o.providerId);
      return org ? { name: org, vendorId: null, verified: false } : null;
    };
    return requests.map((r) =>
      Array.isArray(r?.offers) ? { ...r, offers: r.offers.map((o: any) => ({ ...o, seller: seller(o) })) } : r,
    );
  }
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

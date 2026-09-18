import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type { Principal } from '../auth/principal';
import { displayName } from '../pilgrims/account-links/link-rules';
import { TravelerLinksService } from './traveler-links.service';
import { presentTrip, TravelerTripView } from './traveler-trip.presenter';

const MAX_ROWS = 20;

/**
 * Booking, group and visa status for exactly the pilgrim records the caller is
 * actively linked to. Every query is pinned to the link's organization AND
 * pilgrim, and selects only the fields the presenter publishes.
 */
@Injectable()
export class TravelerTripsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly links: TravelerLinksService,
  ) {}

  async tripsFor(principal: Principal): Promise<TravelerTripView[]> {
    const active = await this.links.activeLinks(principal);
    return Promise.all(
      active.map(async ({ link, organizationName }) => {
        const tenantId = link.tenantId;
        const pilgrimId = link.pilgrimId;
        const [bookings, visas] = await Promise.all([
          this.prisma.booking.findMany({
            where: { tenantId, pilgrims: { some: { pilgrimId, tenantId } } },
            select: {
              bookingRef: true,
              status: true,
              departureDate: true,
              returnDate: true,
              groupId: true,
              package: { select: { name: true, tripType: true, durationDays: true } },
            },
            orderBy: { createdAt: 'desc' },
            take: MAX_ROWS,
          }),
          this.prisma.visaApplication.findMany({
            where: { tenantId, pilgrimId },
            select: {
              status: true,
              visaType: true,
              submittedAt: true,
              approvedAt: true,
              rejectedAt: true,
              expiresAt: true,
              updatedAt: true,
            },
            orderBy: { createdAt: 'desc' },
            take: MAX_ROWS,
          }),
        ]);
        const groupIds = [...new Set(bookings.map((b) => b.groupId).filter((id): id is string => !!id))];
        const groups = groupIds.length
          ? await this.prisma.tripGroup.findMany({
              where: { id: { in: groupIds }, tenantId },
              select: { id: true, name: true, status: true, departureDate: true, returnDate: true },
            })
          : [];
        return presentTrip({
          linkId: link.id,
          linkedAt: link.acceptedAt,
          organizationName,
          travelerName: displayName(link.pilgrim.firstNameEn, link.pilgrim.lastNameEn),
          travelerStatus: link.pilgrim.status,
          bookings,
          groups,
          visas,
        });
      }),
    );
  }
}

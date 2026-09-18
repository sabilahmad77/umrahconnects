/**
 * What a linked traveler may see about their own trip (P06, D-022).
 *
 * Status-only by design: statuses, dates and the names needed to recognise the
 * trip. No passport or national id numbers, no medical or internal notes, no
 * prices, payments, documents, staff or other travelers. Every field is copied
 * explicitly, so a new column on a source table can never leak through here.
 */

export interface TripBookingSource {
  bookingRef: string;
  status: string;
  departureDate: Date | null;
  returnDate: Date | null;
  groupId: string | null;
  package: { name: string; tripType: string; durationDays: number } | null;
}

export interface TripGroupSource {
  id: string;
  name: string;
  status: string;
  departureDate: Date | null;
  returnDate: Date | null;
}

export interface TripVisaSource {
  status: string;
  visaType: string | null;
  submittedAt: Date | null;
  approvedAt: Date | null;
  rejectedAt: Date | null;
  expiresAt: Date | null;
  updatedAt: Date;
}

export interface TravelerTripView {
  linkId: string;
  linkedAt: Date | null;
  organization: { name: string };
  traveler: { name: string; status: string };
  bookings: {
    bookingRef: string;
    status: string;
    departureDate: Date | null;
    returnDate: Date | null;
    package: { name: string; tripType: string; durationDays: number } | null;
    group: { name: string; status: string; departureDate: Date | null; returnDate: Date | null } | null;
  }[];
  visas: {
    status: string;
    visaType: string | null;
    submittedAt: Date | null;
    decidedAt: Date | null;
    validUntil: Date | null;
    updatedAt: Date;
  }[];
}

export function presentTrip(input: {
  linkId: string;
  linkedAt: Date | null;
  organizationName: string;
  travelerName: string;
  travelerStatus: string;
  bookings: TripBookingSource[];
  groups: TripGroupSource[];
  visas: TripVisaSource[];
}): TravelerTripView {
  const groups = new Map(input.groups.map((g) => [g.id, g]));
  return {
    linkId: input.linkId,
    linkedAt: input.linkedAt,
    organization: { name: input.organizationName },
    traveler: { name: input.travelerName, status: input.travelerStatus },
    bookings: input.bookings.map((b) => {
      const group = b.groupId ? groups.get(b.groupId) : undefined;
      return {
        bookingRef: b.bookingRef,
        status: b.status,
        departureDate: b.departureDate,
        returnDate: b.returnDate,
        package: b.package
          ? { name: b.package.name, tripType: b.package.tripType, durationDays: b.package.durationDays }
          : null,
        group: group
          ? { name: group.name, status: group.status, departureDate: group.departureDate, returnDate: group.returnDate }
          : null,
      };
    }),
    visas: input.visas.map((v) => ({
      status: v.status,
      visaType: v.visaType,
      submittedAt: v.submittedAt,
      decidedAt: v.approvedAt ?? v.rejectedAt ?? null,
      // A visa's expiry only means something once it has been granted.
      validUntil: v.status === 'APPROVED' || v.status === 'EXPIRED' ? v.expiresAt : null,
      updatedAt: v.updatedAt,
    })),
  };
}

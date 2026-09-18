import { describe, expect, it } from 'vitest';
import { presentTrip } from './traveler-trip.presenter';

const SENSITIVE = [
  'passport', 'nationalId', 'medical', 'notes', 'price', 'amount', 'paid', 'document', 'email', 'phone',
  'tenantId', 'pilgrimId', 'createdBy', 'applicantPassport', 'externalRef', 'rejectionReason', 'riskScore',
];

describe('traveler trip presenter', () => {
  it('publishes statuses and dates only, even when the sources carry sensitive columns', () => {
    const day = (d: string) => new Date(`2026-10-${d}T00:00:00Z`);
    const leakyBooking: any = {
      bookingRef: 'QA-2026-A0001', status: 'CONFIRMED', departureDate: day('01'), returnDate: day('15'), groupId: 'g1',
      package: { name: 'Autumn Umrah 14 nights', tripType: 'UMRAH', durationDays: 14, basePriceCents: 900000n },
      totalAmountCents: 900000n, paidAmountCents: 1n, notes: 'internal', tenantId: 't', createdBy: 'u',
    };
    const leakyVisa: any = {
      status: 'APPROVED', visaType: 'UMRAH', submittedAt: day('02'), approvedAt: day('05'), rejectedAt: null,
      expiresAt: day('30'), updatedAt: day('05'), applicantPassport: 'QA-P-000101', rejectionReason: 'x',
      riskScore: 3, externalRef: 'NUSUK-1', notes: 'internal', priceCents: 30000n,
    };
    const leakyGroup: any = {
      id: 'g1', name: 'October group A', status: 'CONFIRMED', departureDate: day('01'), returnDate: day('15'),
      emergencyContact: { phone: '+966500000000' }, briefingNotes: 'internal',
    };
    const view = presentTrip({
      linkId: 'l1', linkedAt: day('01'), organizationName: 'Org A', travelerName: 'Amina Rahman',
      travelerStatus: 'VISA_APPROVED', bookings: [leakyBooking], groups: [leakyGroup], visas: [leakyVisa],
    });

    expect(view.bookings[0]).toEqual({
      bookingRef: 'QA-2026-A0001', status: 'CONFIRMED', departureDate: day('01'), returnDate: day('15'),
      package: { name: 'Autumn Umrah 14 nights', tripType: 'UMRAH', durationDays: 14 },
      group: { name: 'October group A', status: 'CONFIRMED', departureDate: day('01'), returnDate: day('15') },
    });
    expect(view.visas[0]).toEqual({
      status: 'APPROVED', visaType: 'UMRAH', submittedAt: day('02'), decidedAt: day('05'), validUntil: day('30'), updatedAt: day('05'),
    });
    const json = JSON.stringify(view, (_k, v) => (typeof v === 'bigint' ? v.toString() : v));
    for (const key of SENSITIVE) expect(json, key).not.toMatch(new RegExp(`"${key}`, 'i'));
    expect(json).not.toContain('QA-P-000101');
    expect(json).not.toContain('internal');
  });

  it('shows a visa validity date only once the visa has been granted', () => {
    const base = { submittedAt: null, approvedAt: null, rejectedAt: null, expiresAt: new Date('2026-12-01'), updatedAt: new Date() };
    const view = presentTrip({
      linkId: 'l', linkedAt: null, organizationName: 'O', travelerName: 'T', travelerStatus: 'BOOKED', bookings: [], groups: [],
      visas: [{ ...base, status: 'SUBMITTED', visaType: null }, { ...base, status: 'APPROVED', visaType: 'UMRAH' }],
    });
    expect(view.visas.map((v) => v.validUntil)).toEqual([null, new Date('2026-12-01')]);
  });

  it('drops a group reference that does not resolve inside the organization', () => {
    const view = presentTrip({
      linkId: 'l', linkedAt: null, organizationName: 'O', travelerName: 'T', travelerStatus: 'BOOKED', groups: [], visas: [],
      bookings: [{ bookingRef: 'R', status: 'DRAFT', departureDate: null, returnDate: null, groupId: 'foreign', package: null }],
    });
    expect(view.bookings[0].group).toBeNull();
  });
});

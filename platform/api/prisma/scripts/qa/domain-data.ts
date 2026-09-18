import type { Prisma, PrismaClient } from '@prisma/client';
import type { QaOrgRef, QaUserRef } from './identities';
import { COMMUNITY_ORG, QA_EMAIL_DOMAIN } from './fixtures';

/**
 * Synthetic, internally consistent domain data for the Engineering 100 QA
 * fixtures (D08 / AUD-028): every booking has its travelers and a total equal to
 * package price × travelers; BOOKED/VISA_* travelers have bookings and LEAD /
 * PROSPECT ones do not; invoices match their bookings and completed payments;
 * hotels have room types and rooms; routes count the seats their trips use;
 * marketplace listings belong to the provider organization that sells them.
 *
 * All names are invented, every document number starts with "QA-", every email
 * is on the reserved .test domain. Nothing here links a traveler account to a
 * pilgrim record — that only happens through an invitation the traveler accepts.
 *
 * Idempotent: rows are found by natural keys (booking/invoice refs, passport
 * numbers, plate numbers, names) and reset to the values below on every run.
 */

const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const at = (iso: string) => new Date(iso);
const cents = (sar: number) => BigInt(Math.round(sar * 100));

type Orgs = Record<string, QaOrgRef>;
type Users = Record<string, QaUserRef>;

async function upsert<T extends { id: string }>(
  find: () => Promise<T | null>,
  create: () => Promise<T>,
  update: (id: string) => Promise<T>,
): Promise<T> {
  const row = await find();
  return row ? update(row.id) : create();
}

// ── Operators ──────────────────────────────────────────────────────────────

interface PilgrimSeed {
  passport: string;
  first: string;
  last: string;
  gender: 'MALE' | 'FEMALE';
  dob: string;
  nationality: string;
  status: 'LEAD' | 'PROSPECT' | 'BOOKED' | 'DOCUMENTS_PENDING' | 'VISA_PENDING' | 'VISA_APPROVED';
  email?: string;
  city: string;
}

async function seedPilgrims(prisma: PrismaClient, tenantId: string, createdBy: string, list: PilgrimSeed[]) {
  const out: Record<string, { id: string; name: string; passport: string; nationality: string }> = {};
  for (const p of list) {
    const data = {
      tenantId,
      status: p.status,
      firstNameEn: p.first,
      lastNameEn: p.last,
      gender: p.gender,
      dateOfBirth: day(p.dob),
      nationality: p.nationality,
      country: p.nationality,
      city: p.city,
      email: p.email ?? null,
      passportNumber: p.passport,
      passportExpiry: day('2031-06-30'),
      passportCountry: p.nationality,
      nationalId: `QA-N-${p.passport.slice(-5)}`,
      preferredLanguage: p.nationality === 'SA' ? 'ar' : 'en',
      tags: ['qa-fixture'],
      deletedAt: null,
      createdBy,
    };
    const row = await upsert(
      () => prisma.pilgrim.findFirst({ where: { tenantId, passportNumber: p.passport } }),
      () => prisma.pilgrim.create({ data }),
      (id) => prisma.pilgrim.update({ where: { id }, data }),
    );
    out[p.passport] = { id: row.id, name: `${p.first} ${p.last}`, passport: p.passport, nationality: p.nationality };
  }
  return out;
}

interface PackageSeed {
  name: string;
  tier: string;
  days: number;
  depart: string;
  ret: string;
  priceSar: number;
  capacity: number;
  description: string;
}

async function seedPackage(prisma: PrismaClient, tenantId: string, createdBy: string, p: PackageSeed) {
  const data = {
    tenantId,
    name: p.name,
    description: p.description,
    tier: p.tier,
    tripType: 'UMRAH',
    durationDays: p.days,
    departureDate: day(p.depart),
    returnDate: day(p.ret),
    basePriceCents: cents(p.priceSar),
    currency: 'SAR',
    maxCapacity: p.capacity,
    includes: { visa: true, flight: false, hotel_makkah: true, hotel_madinah: true, transport: true, meals: false, guide: true },
    isPublished: true,
    deletedAt: null,
    createdBy,
  };
  return upsert(
    () => prisma.package.findFirst({ where: { tenantId, name: p.name } }),
    () => prisma.package.create({ data }),
    (id) => prisma.package.update({ where: { id }, data }),
  );
}

interface BookingSeed {
  ref: string;
  pkg: { id: string; basePriceCents: bigint; departureDate: Date | null; returnDate: Date | null };
  pilgrimIds: string[];
  status: 'CONFIRMED' | 'PARTIALLY_PAID';
  paidCents: bigint;
  groupId?: string;
}

async function seedBooking(prisma: PrismaClient, tenantId: string, createdBy: string, b: BookingSeed) {
  const total = b.pkg.basePriceCents * BigInt(b.pilgrimIds.length);
  const data = {
    tenantId,
    packageId: b.pkg.id,
    status: b.status,
    totalAmountCents: total,
    paidAmountCents: b.paidCents,
    currency: 'SAR',
    departureDate: b.pkg.departureDate,
    returnDate: b.pkg.returnDate,
    groupId: b.groupId ?? null,
    createdBy,
  };
  const booking = await upsert(
    () => prisma.booking.findUnique({ where: { bookingRef: b.ref } }),
    () => prisma.booking.create({ data: { bookingRef: b.ref, ...data } }),
    (id) => prisma.booking.update({ where: { id }, data }),
  );
  // Exactly these travelers, each at the package price.
  await prisma.bookingPilgrim.deleteMany({ where: { bookingId: booking.id, pilgrimId: { notIn: b.pilgrimIds } } });
  for (const pilgrimId of b.pilgrimIds) {
    await prisma.bookingPilgrim.upsert({
      where: { bookingId_pilgrimId: { bookingId: booking.id, pilgrimId } },
      create: { tenantId, bookingId: booking.id, pilgrimId, priceCents: b.pkg.basePriceCents, currency: 'SAR', roomType: 'QUAD' },
      update: { tenantId, priceCents: b.pkg.basePriceCents, currency: 'SAR' },
    });
  }
  return { ...booking, totalAmountCents: total };
}

async function seedInvoice(
  prisma: PrismaClient,
  tenantId: string,
  createdBy: string,
  inv: { ref: string; booking: { id: string; totalAmountCents: bigint }; pilgrimId: string; issuedTo: string; line: string; travelers: number; unitCents: bigint; paidCents: bigint; issued: string; due: string },
) {
  const status = inv.paidCents >= inv.booking.totalAmountCents ? 'PAID' : inv.paidCents > 0n ? 'PARTIALLY_PAID' : 'ISSUED';
  const data = {
    tenantId,
    status: status as 'PAID' | 'PARTIALLY_PAID' | 'ISSUED',
    type: 'CUSTOMER',
    bookingId: inv.booking.id,
    pilgrimId: inv.pilgrimId,
    issuedToName: inv.issuedTo,
    subtotalCents: inv.booking.totalAmountCents,
    taxCents: 0n,
    discountCents: 0n,
    totalCents: inv.booking.totalAmountCents,
    paidCents: inv.paidCents,
    currency: 'SAR',
    issuedAt: day(inv.issued),
    dueAt: day(inv.due),
    paidAt: status === 'PAID' ? at(`${inv.issued}T09:00:00Z`) : null,
    lineItems: [{ description: inv.line, quantity: inv.travelers, unitPriceCents: Number(inv.unitCents), totalCents: Number(inv.booking.totalAmountCents) }],
    notes: 'Local QA fixture invoice.',
    createdBy,
  };
  const invoice = await upsert(
    () => prisma.invoice.findUnique({ where: { invoiceRef: inv.ref } }),
    () => prisma.invoice.create({ data: { invoiceRef: inv.ref, ...data } }),
    (id) => prisma.invoice.update({ where: { id }, data }),
  );
  // One completed bank transfer covering exactly the paid amount (the same shape the finance module records).
  const key = `qa-seed-${inv.ref.toLowerCase()}`;
  if (inv.paidCents > 0n) {
    const payment = {
      tenantId,
      invoiceId: invoice.id,
      bookingId: inv.booking.id,
      pilgrimId: inv.pilgrimId,
      status: 'COMPLETED' as const,
      amountCents: inv.paidCents,
      currency: 'SAR',
      gateway: 'bank_transfer',
      gatewayRef: `QA-TRF-${inv.ref.slice(-4)}`,
      paidAt: at(`${inv.issued}T09:00:00Z`),
    };
    await prisma.payment.upsert({ where: { idempotencyKey: key }, create: { idempotencyKey: key, ...payment }, update: payment });
  } else {
    await prisma.payment.deleteMany({ where: { idempotencyKey: key } });
  }
  return invoice;
}

interface VisaSeed {
  appNo: string;
  pilgrim?: { id: string; name: string; passport: string; nationality: string };
  applicant?: { name: string; passport: string; nationality: string };
  bookingId?: string;
  operatorId?: string;
  status: 'NOT_STARTED' | 'DOCUMENTS_COLLECTING' | 'SUBMITTED' | 'UNDER_REVIEW' | 'APPROVED';
  submitted?: string;
  approved?: string;
  requiredDocuments?: string[];
  officer: string;
}

async function seedVisa(prisma: PrismaClient, tenantId: string, createdBy: string, v: VisaSeed) {
  const who = v.pilgrim ?? v.applicant!;
  const timeline: { at: string; event: string; by: string }[] = [{ at: `${v.submitted ?? '2026-09-10'}T08:00:00Z`, event: 'CREATED', by: 'qa-seed' }];
  if (v.submitted) timeline.push({ at: `${v.submitted}T10:00:00Z`, event: 'SUBMITTED', by: 'qa-seed' });
  if (v.approved) timeline.push({ at: `${v.approved}T12:00:00Z`, event: 'APPROVED', by: 'qa-seed' });
  const data = {
    tenantId,
    pilgrimId: v.pilgrim?.id ?? null,
    bookingId: v.bookingId ?? null,
    operatorId: v.operatorId ?? null,
    status: v.status,
    regulatorySystem: 'NUSUK_MASAR' as const,
    applicantName: who.name,
    applicantPassport: who.passport,
    applicantNationality: who.nationality,
    visaType: 'UMRAH',
    destinationCountry: 'SA',
    serviceCountry: who.nationality,
    requiredDocuments: v.requiredDocuments ?? ['PASSPORT', 'PHOTO', 'VACCINATION'],
    assignedOfficer: v.officer,
    priceCents: cents(300),
    currency: 'SAR',
    paymentStatus: 'UNPAID',
    submittedAt: v.submitted ? at(`${v.submitted}T10:00:00Z`) : null,
    approvedAt: v.approved ? at(`${v.approved}T12:00:00Z`) : null,
    expiresAt: v.approved ? day('2027-01-31') : null,
    externalRef: v.approved ? `QA-NUSUK-${v.appNo.slice(-4)}` : null,
    timeline,
    createdBy,
  };
  return upsert(
    () => prisma.visaApplication.findFirst({ where: { tenantId, applicationNumber: v.appNo } }),
    () => prisma.visaApplication.create({ data: { applicationNumber: v.appNo, ...data } }),
    (id) => prisma.visaApplication.update({ where: { id }, data }),
  );
}

async function seedGroup(prisma: PrismaClient, tenantId: string, owner: string, g: { name: string; depart: string; ret: string; capacity: number; enrolled: number; description: string }) {
  const data = {
    tenantId,
    name: g.name,
    description: g.description,
    visibility: 'PRIVATE',
    tripType: 'UMRAH',
    season: 'AUTUMN_2026',
    departureDate: day(g.depart),
    returnDate: day(g.ret),
    capacity: g.capacity,
    enrolledCount: g.enrolled,
    status: 'CONFIRMED',
    createdBy: owner,
  };
  const group = await upsert(
    () => prisma.tripGroup.findFirst({ where: { tenantId, name: g.name } }),
    () => prisma.tripGroup.create({ data }),
    (id) => prisma.tripGroup.update({ where: { id }, data }),
  );
  await prisma.groupMember.upsert({
    where: { groupId_userId: { groupId: group.id, userId: owner } },
    create: { groupId: group.id, userId: owner, role: 'OWNER', status: 'ACTIVE' },
    update: { role: 'OWNER', status: 'ACTIVE' },
  });
  return group;
}

async function seedOperatorA(prisma: PrismaClient, orgs: Orgs, users: Users) {
  const tenantId = orgs.operatorA.id;
  const admin = users.operatorAdminA.id;
  const autumn = await seedPackage(prisma, tenantId, admin, {
    name: 'Autumn Umrah — 14 nights', tier: 'STANDARD', days: 14, depart: '2026-10-20', ret: '2026-11-03', priceSar: 8500, capacity: 40,
    description: 'Nine nights in Makkah and five in Madinah, 4-star hotels within 700 m of the Haram, airport and intercity coach transfers, visa processing and a group guide.',
  });
  await seedPackage(prisma, tenantId, admin, {
    name: 'Ramadan Umrah — 10 nights', tier: 'PREMIUM', days: 10, depart: '2027-02-18', ret: '2027-02-28', priceSar: 12500, capacity: 30,
    description: 'Last ten nights of Ramadan in Makkah, 5-star hotel within 300 m of Masjid al-Haram, suhoor and iftar included.',
  });
  const p = await seedPilgrims(prisma, tenantId, admin, [
    { passport: 'QA-P-A0001', first: 'Amina', last: 'Rahman', gender: 'FEMALE', dob: '1990-04-12', nationality: 'GB', status: 'VISA_PENDING', city: 'Birmingham', email: `traveler.a@${QA_EMAIL_DOMAIN}` },
    { passport: 'QA-P-A0002', first: 'Yusuf', last: 'Rahman', gender: 'MALE', dob: '1987-11-02', nationality: 'GB', status: 'DOCUMENTS_PENDING', city: 'Birmingham' },
    { passport: 'QA-P-A0003', first: 'Fatima', last: 'Idris', gender: 'FEMALE', dob: '1975-01-23', nationality: 'NG', status: 'VISA_PENDING', city: 'Kano' },
    { passport: 'QA-P-A0004', first: 'Hamza', last: 'Ali', gender: 'MALE', dob: '1969-08-30', nationality: 'NG', status: 'VISA_APPROVED', city: 'Kano' },
    { passport: 'QA-P-A0005', first: 'Khadija', last: 'Noor', gender: 'FEMALE', dob: '1996-06-15', nationality: 'MY', status: 'PROSPECT', city: 'Kuala Lumpur' },
    { passport: 'QA-P-A0006', first: 'Ibrahim', last: 'Saleh', gender: 'MALE', dob: '1982-02-09', nationality: 'EG', status: 'LEAD', city: 'Cairo' },
  ]);
  // Mahram relationship for the first family.
  await prisma.pilgrim.update({ where: { id: p['QA-P-A0001'].id }, data: { mahramId: p['QA-P-A0002'].id } });

  const group = await seedGroup(prisma, tenantId, admin, {
    name: 'Autumn Umrah group — October 2026', depart: '2026-10-20', ret: '2026-11-03', capacity: 40, enrolled: 2,
    description: 'Travelers on the 20 October departure of the Autumn Umrah package.',
  });
  const b1 = await seedBooking(prisma, tenantId, admin, {
    ref: 'QA-2026-A0001', pkg: autumn, pilgrimIds: [p['QA-P-A0001'].id, p['QA-P-A0002'].id], status: 'PARTIALLY_PAID', paidCents: cents(8500), groupId: group.id,
  });
  const b2 = await seedBooking(prisma, tenantId, admin, {
    ref: 'QA-2026-A0002', pkg: autumn, pilgrimIds: [p['QA-P-A0003'].id, p['QA-P-A0004'].id], status: 'CONFIRMED', paidCents: 0n, groupId: group.id,
  });
  await prisma.package.update({ where: { id: autumn.id }, data: { bookedCount: 4 } });

  await seedInvoice(prisma, tenantId, users.financeA.id, {
    ref: 'INV-QA-A-0001', booking: b1, pilgrimId: p['QA-P-A0001'].id, issuedTo: 'Amina Rahman', line: 'Autumn Umrah — 14 nights, 2 travelers',
    travelers: 2, unitCents: autumn.basePriceCents, paidCents: cents(8500), issued: '2026-09-05', due: '2026-10-05',
  });
  await seedInvoice(prisma, tenantId, users.financeA.id, {
    ref: 'INV-QA-A-0002', booking: b2, pilgrimId: p['QA-P-A0003'].id, issuedTo: 'Fatima Idris', line: 'Autumn Umrah — 14 nights, 2 travelers',
    travelers: 2, unitCents: autumn.basePriceCents, paidCents: 0n, issued: '2026-09-12', due: '2026-10-12',
  });

  const officer = 'Idris Malik';
  await seedVisa(prisma, tenantId, admin, { appNo: 'QA-VISA-A-0001', pilgrim: p['QA-P-A0001'], bookingId: b1.id, status: 'SUBMITTED', submitted: '2026-09-14', officer });
  await seedVisa(prisma, tenantId, admin, { appNo: 'QA-VISA-A-0002', pilgrim: p['QA-P-A0002'], bookingId: b1.id, status: 'DOCUMENTS_COLLECTING', officer });
  await seedVisa(prisma, tenantId, admin, { appNo: 'QA-VISA-A-0003', pilgrim: p['QA-P-A0003'], bookingId: b2.id, status: 'UNDER_REVIEW', submitted: '2026-09-11', officer });
  await seedVisa(prisma, tenantId, admin, { appNo: 'QA-VISA-A-0004', pilgrim: p['QA-P-A0004'], bookingId: b2.id, status: 'APPROVED', submitted: '2026-09-02', approved: '2026-09-09', officer });
  return ['Operator A: 2 packages, 6 travelers, 2 bookings (4 travelers), 1 group, 2 invoices, 4 visa cases'];
}

async function seedOperatorB(prisma: PrismaClient, orgs: Orgs, users: Users) {
  const tenantId = orgs.operatorB.id;
  const admin = users.operatorAdminB.id;
  const winter = await seedPackage(prisma, tenantId, admin, {
    name: 'Winter Umrah — 10 nights', tier: 'ECONOMY', days: 10, depart: '2026-12-10', ret: '2026-12-20', priceSar: 7200, capacity: 45,
    description: 'Six nights in Makkah and four in Madinah, 3-star hotels with shuttle, coach transfers and visa processing.',
  });
  const p = await seedPilgrims(prisma, tenantId, admin, [
    { passport: 'QA-P-B0001', first: 'Bilal', last: 'Hamid', gender: 'MALE', dob: '1985-03-19', nationality: 'PK', status: 'BOOKED', city: 'Lahore', email: `traveler.b@${QA_EMAIL_DOMAIN}` },
    { passport: 'QA-P-B0002', first: 'Sana', last: 'Tariq', gender: 'FEMALE', dob: '1992-12-01', nationality: 'PK', status: 'PROSPECT', city: 'Lahore' },
  ]);
  const b1 = await seedBooking(prisma, tenantId, admin, { ref: 'QA-2026-B0001', pkg: winter, pilgrimIds: [p['QA-P-B0001'].id], status: 'CONFIRMED', paidCents: 0n });
  await prisma.package.update({ where: { id: winter.id }, data: { bookedCount: 1 } });
  await seedInvoice(prisma, tenantId, admin, {
    ref: 'INV-QA-B-0001', booking: b1, pilgrimId: p['QA-P-B0001'].id, issuedTo: 'Bilal Hamid', line: 'Winter Umrah — 10 nights, 1 traveler',
    travelers: 1, unitCents: winter.basePriceCents, paidCents: 0n, issued: '2026-09-15', due: '2026-11-10',
  });
  await seedVisa(prisma, tenantId, admin, { appNo: 'QA-VISA-B-0001', pilgrim: p['QA-P-B0001'], bookingId: b1.id, status: 'NOT_STARTED', officer: 'Tariq Siddiqui' });
  return ['Operator B: 1 package, 2 travelers, 1 booking, 1 invoice, 1 visa case'];
}

// ── Marketplace sellers ────────────────────────────────────────────────────

async function seedVendor(prisma: PrismaClient, org: QaOrgRef, type: 'VENDOR_HOTEL' | 'VENDOR_TRANSPORT' | 'VENDOR_VISA', city: string, description: string) {
  const data = {
    tenantId: org.id,
    type,
    name: org.name,
    description,
    email: `sales@${org.slug}.${QA_EMAIL_DOMAIN}`,
    country: 'SA',
    city,
    status: 'VERIFIED' as const,
    verifiedAt: at('2026-09-01T09:00:00Z'),
  };
  return upsert(
    () => prisma.vendor.findFirst({ where: { tenantId: org.id, type } }),
    () => prisma.vendor.create({ data }),
    (id) => prisma.vendor.update({ where: { id }, data }),
  );
}

async function seedListing(
  prisma: PrismaClient,
  vendorId: string,
  l: { name: string; type: string; priceSar: number; model: 'PER_PERSON' | 'PER_NIGHT' | 'PER_GROUP'; description: string; attributes: Prisma.InputJsonObject },
) {
  const data = {
    vendorId,
    type: l.type,
    name: l.name,
    description: l.description,
    priceCents: cents(l.priceSar),
    currency: 'SAR',
    pricingModel: l.model,
    attributes: l.attributes,
    imageUrls: [],
    status: 'PUBLISHED',
    isActive: true,
  };
  return upsert(
    () => prisma.listing.findFirst({ where: { vendorId, name: l.name } }),
    () => prisma.listing.create({ data }),
    (id) => prisma.listing.update({ where: { id }, data }),
  );
}

// ── Hotels ─────────────────────────────────────────────────────────────────

async function seedHotel(
  prisma: PrismaClient,
  tenantId: string,
  vendorId: string,
  h: { name: string; city: 'MAKKAH' | 'MADINAH'; area: string; stars: number; distance: number; types: { name: string; occupancy: number; bed: string; priceSar: number; rooms: string[] }[] },
) {
  const totalRooms = h.types.reduce((n, t) => n + t.rooms.length, 0);
  const data = {
    tenantId,
    vendorId,
    name: h.name,
    city: h.city,
    country: 'SA',
    area: h.area,
    starRating: h.stars,
    distanceToHaram: h.distance,
    amenities: ['wifi', 'restaurant', 'prayer_area', 'elevator', 'air_conditioning'],
    description: `${h.stars}-star hotel in ${h.area}, ${h.distance} m from the ${h.city === 'MAKKAH' ? 'Masjid al-Haram' : 'Masjid an-Nabawi'}.`,
    checkInTime: '15:00',
    checkOutTime: '12:00',
    cancellationPolicy: 'Free cancellation up to 14 days before arrival; 50% after that.',
    totalRooms,
    status: 'ACTIVE',
    isVerified: true,
  };
  const hotel = await upsert(
    () => prisma.hotel.findFirst({ where: { tenantId, name: h.name } }),
    () => prisma.hotel.create({ data }),
    (id) => prisma.hotel.update({ where: { id }, data }),
  );
  const rooms: Record<string, { id: string; priceCents: bigint }> = {};
  for (const t of h.types) {
    const typeData = { hotelId: hotel.id, name: t.name, occupancy: t.occupancy, bedConfig: t.bed, basePriceCents: cents(t.priceSar), totalCount: t.rooms.length, status: 'ACTIVE', amenities: ['wifi', 'air_conditioning'] };
    const type = await upsert(
      () => prisma.roomType.findFirst({ where: { hotelId: hotel.id, name: t.name } }),
      () => prisma.roomType.create({ data: typeData }),
      (id) => prisma.roomType.update({ where: { id }, data: typeData }),
    );
    for (const number of t.rooms) {
      const roomData = {
        tenantId,
        hotelId: hotel.id,
        roomTypeId: type.id,
        roomNumber: number,
        floor: number.slice(0, number.length - 2),
        capacity: t.occupancy,
        bedType: t.bed,
        bedCount: t.occupancy,
        availableBeds: t.occupancy,
        pricePerNightCents: cents(t.priceSar),
        status: 'AVAILABLE',
      };
      const room = await upsert(
        () => prisma.room.findFirst({ where: { hotelId: hotel.id, roomNumber: number } }),
        () => prisma.room.create({ data: roomData }),
        (id) => prisma.room.update({ where: { id }, data: roomData }),
      );
      rooms[number] = { id: room.id, priceCents: roomData.pricePerNightCents };
    }
  }
  return { hotel, rooms };
}

async function seedHotelA(prisma: PrismaClient, orgs: Orgs, users: Users) {
  const org = orgs.hotelA;
  const vendor = await seedVendor(prisma, org, 'VENDOR_HOTEL', 'Makkah', 'Family-run hotels a short walk from Masjid al-Haram.');
  const { hotel, rooms } = await seedHotel(prisma, org.id, vendor.id, {
    name: 'Qasr Al-Haram Ajyad', city: 'MAKKAH', area: 'Ajyad', stars: 4, distance: 450,
    types: [
      { name: 'Double room', occupancy: 2, bed: '1 king bed', priceSar: 650, rooms: ['301', '302', '303', '304'] },
      { name: 'Quad room', occupancy: 4, bed: '4 single beds', priceSar: 980, rooms: ['401', '402', '403'] },
    ],
  });
  await seedHotel(prisma, org.id, vendor.id, {
    name: 'Qasr Al-Haram Misfalah', city: 'MAKKAH', area: 'Misfalah', stars: 3, distance: 900,
    types: [{ name: 'Triple room', occupancy: 3, bed: '3 single beds', priceSar: 520, rooms: ['201', '202', '203'] }],
  });
  // A contracted block for Operator A's October departure, and one confirmed group reservation.
  const allotment = {
    tenantId: org.id, hotelId: hotel.id, contractType: 'ALLOTMENT' as const, checkIn: day('2026-10-21'), checkOut: day('2026-10-30'),
    totalRooms: 3, bookedRooms: 1, rateCents: cents(900), currency: 'SAR', notes: 'Block for Al-Noor Umrah Services, October departure.',
  };
  await upsert(
    () => prisma.allotment.findFirst({ where: { tenantId: org.id, hotelId: hotel.id, checkIn: allotment.checkIn } }),
    () => prisma.allotment.create({ data: allotment }),
    (id) => prisma.allotment.update({ where: { id }, data: allotment }),
  );
  const nights = 9;
  const reservation = {
    tenantId: org.id, hotelId: hotel.id, roomId: rooms['401'].id, guestName: 'Al-Noor Umrah Services — October group', guestEmail: `groups@qa-operator-a.${QA_EMAIL_DOMAIN}`,
    guestNationality: 'SA', source: 'OPERATOR', checkIn: day('2026-10-21'), checkOut: day('2026-10-30'), guests: 4,
    totalAmountCents: rooms['401'].priceCents * BigInt(nights), currency: 'SAR', status: 'CONFIRMED', paymentStatus: 'UNPAID', notes: 'QA fixture reservation.',
  };
  await upsert(
    () => prisma.hotelBooking.findFirst({ where: { tenantId: org.id, hotelId: hotel.id, guestName: reservation.guestName } }),
    () => prisma.hotelBooking.create({ data: reservation }),
    (id) => prisma.hotelBooking.update({ where: { id }, data: reservation }),
  );
  await seedListing(prisma, vendor.id, {
    name: 'Double room in Ajyad, 450 m from Masjid al-Haram', type: 'hotel_room', priceSar: 650, model: 'PER_NIGHT',
    description: 'Quiet double room with a king bed, breakfast available, elevator access.', attributes: { city: 'Makkah', hotel: 'Qasr Al-Haram Ajyad', distanceToHaramMeters: 450 },
  });
  await seedListing(prisma, vendor.id, {
    name: 'Quad room for families and small groups', type: 'hotel_room', priceSar: 980, model: 'PER_NIGHT',
    description: 'Four single beds, suitable for families or groups of four.', attributes: { city: 'Makkah', hotel: 'Qasr Al-Haram Ajyad', distanceToHaramMeters: 450 },
  });
  void users;
  return ['Hotel A: 2 hotels, 3 room types, 10 rooms, 1 allotment, 1 reservation, 2 listings'];
}

async function seedHotelB(prisma: PrismaClient, orgs: Orgs, users: Users) {
  const org = orgs.hotelB;
  const vendor = await seedVendor(prisma, org, 'VENDOR_HOTEL', 'Madinah', 'Garden-view hotels close to Masjid an-Nabawi.');
  await seedHotel(prisma, org.id, vendor.id, {
    name: 'Taibah Garden Madinah', city: 'MADINAH', area: 'Central Area', stars: 4, distance: 300,
    types: [
      { name: 'Double room', occupancy: 2, bed: '2 single beds', priceSar: 540, rooms: ['501', '502'] },
      { name: 'Family suite', occupancy: 5, bed: '1 king bed and 3 single beds', priceSar: 1150, rooms: ['601', '602'] },
    ],
  });
  await seedListing(prisma, vendor.id, {
    name: 'Family suite near Masjid an-Nabawi', type: 'hotel_room', priceSar: 1150, model: 'PER_NIGHT',
    description: 'Suite for up to five guests, 300 m from Masjid an-Nabawi.', attributes: { city: 'Madinah', hotel: 'Taibah Garden Madinah', distanceToHaramMeters: 300 },
  });
  // A traveler request this hotel has answered with an offer.
  const travelerA = users.travelerA;
  const request = {
    tenantId: travelerA.tenantId, travelerId: travelerA.id, serviceType: 'HOTEL' as const, title: 'Family room in Madinah for 4 nights',
    description: 'Two adults and two children, close to Masjid an-Nabawi, arriving from Makkah by coach.', city: 'Madinah',
    dateFrom: at('2026-10-29T12:00:00Z'), dateTo: at('2026-11-02T12:00:00Z'), travelers: 4, budgetMinCents: cents(3000), budgetMaxCents: cents(5000),
    currency: 'SAR', status: 'OPEN' as const,
  };
  const req = await upsert(
    () => prisma.marketplaceRequest.findFirst({ where: { travelerId: travelerA.id, title: request.title } }),
    () => prisma.marketplaceRequest.create({ data: request }),
    (id) => prisma.marketplaceRequest.update({ where: { id }, data: request }),
  );
  const offer = {
    requestId: req.id, providerId: users.hotelB.id, vendorId: vendor.id, title: 'Family suite, 4 nights, breakfast included',
    description: 'Suite 601 on the sixth floor, walking distance to Masjid an-Nabawi.', priceCents: cents(4600), currency: 'SAR',
    validUntil: at('2026-10-15T23:59:00Z'), status: 'PENDING' as const,
  };
  await upsert(
    () => prisma.requestOffer.findFirst({ where: { requestId: req.id, providerId: users.hotelB.id } }),
    () => prisma.requestOffer.create({ data: offer }),
    (id) => prisma.requestOffer.update({ where: { id }, data: offer }),
  );
  return ['Hotel B: 1 hotel, 2 room types, 4 rooms, 1 listing, 1 offer on a traveler request'];
}

// ── Transport ──────────────────────────────────────────────────────────────

async function seedFleet(
  prisma: PrismaClient,
  tenantId: string,
  vendorId: string,
  fleet: {
    vehicles: { plate: string; type: 'BUS_LARGE' | 'BUS_MEDIUM' | 'VAN'; name: string; model: string; year: number; capacity: number }[];
    drivers: { license: string; first: string; last: string; phone: string; nationality: string }[];
  },
) {
  const vehicles: Record<string, { id: string; capacity: number }> = {};
  for (const v of fleet.vehicles) {
    const data = {
      tenantId, vendorId, type: v.type, name: v.name, brand: v.model.split(' ')[0], plateNumber: v.plate, registrationNumber: `QA-REG-${v.plate.slice(-4)}`,
      capacity: v.capacity, bookedSeats: 0, luggageCapacity: Math.round(v.capacity * 1.5), hasAc: true, licensedForHajj: v.type !== 'VAN',
      model: v.model, year: v.year, features: ['air_conditioning', 'gps', 'usb_charging'], status: 'AVAILABLE', isActive: true,
    };
    const row = await upsert(
      () => prisma.vehicle.findFirst({ where: { tenantId, plateNumber: v.plate } }),
      () => prisma.vehicle.create({ data }),
      (id) => prisma.vehicle.update({ where: { id }, data }),
    );
    vehicles[v.plate] = { id: row.id, capacity: v.capacity };
  }
  const drivers: Record<string, string> = {};
  for (const d of fleet.drivers) {
    const data = {
      tenantId, vendorId, firstName: d.first, lastName: d.last, phone: d.phone, email: null, nationality: d.nationality,
      idNumber: `QA-ID-${d.license.slice(-4)}`, languages: ['ar', 'en', 'ur'], licenseNumber: d.license, licenseExpiry: day('2029-03-31'),
      status: 'AVAILABLE', isActive: true,
    };
    const row = await upsert(
      () => prisma.driver.findFirst({ where: { tenantId, licenseNumber: d.license } }),
      () => prisma.driver.create({ data }),
      (id) => prisma.driver.update({ where: { id }, data }),
    );
    drivers[d.license] = row.id;
  }
  return { vehicles, drivers };
}

async function seedRoute(
  prisma: PrismaClient,
  tenantId: string,
  r: { name: string; movement: 'AIRPORT_PICKUP' | 'MAKKAH_MADINAH'; from: string; to: string; pickup: string; dropoff: string; km: number; mins: number; departAt: string; seatSar: number; vehicle: { id: string; capacity: number }; driverId: string },
) {
  const data = {
    tenantId, name: r.name, movementType: r.movement, originCity: r.from, destCity: r.to, pickupPoint: r.pickup, dropoffPoint: r.dropoff,
    distanceKm: r.km, durationMins: r.mins, departureAt: at(r.departAt), arrivalAt: new Date(at(r.departAt).getTime() + r.mins * 60_000),
    pricePerSeatCents: cents(r.seatSar), currency: 'SAR', totalSeats: r.vehicle.capacity, bookedSeats: 0, vehicleId: r.vehicle.id, driverId: r.driverId, status: 'ACTIVE',
  };
  return upsert(
    () => prisma.transportRoute.findFirst({ where: { tenantId, name: r.name } }),
    () => prisma.transportRoute.create({ data }),
    (id) => prisma.transportRoute.update({ where: { id }, data }),
  );
}

async function seedTransportA(prisma: PrismaClient, orgs: Orgs) {
  const org = orgs.transportA;
  const vendor = await seedVendor(prisma, org, 'VENDOR_TRANSPORT', 'Jeddah', 'Airport transfers and intercity coaches between Jeddah, Makkah and Madinah.');
  const { vehicles, drivers } = await seedFleet(prisma, org.id, vendor.id, {
    vehicles: [
      { plate: 'QA 1001', type: 'BUS_LARGE', name: 'Coach 1', model: 'Mercedes-Benz Tourismo', year: 2023, capacity: 49 },
      { plate: 'QA 1002', type: 'BUS_MEDIUM', name: 'Coach 2', model: 'Toyota Coaster', year: 2022, capacity: 30 },
      { plate: 'QA 1003', type: 'VAN', name: 'Van 1', model: 'Toyota HiAce', year: 2024, capacity: 14 },
    ],
    drivers: [
      { license: 'QA-DL-0101', first: 'Abdullah', last: 'Qasim', phone: '+966500000101', nationality: 'SA' },
      { license: 'QA-DL-0102', first: 'Naveed', last: 'Akhtar', phone: '+966500000102', nationality: 'PK' },
      { license: 'QA-DL-0103', first: 'Hassan', last: 'Mahmoud', phone: '+966500000103', nationality: 'EG' },
    ],
  });
  for (const [plate, license] of [['QA 1001', 'QA-DL-0101'], ['QA 1002', 'QA-DL-0102'], ['QA 1003', 'QA-DL-0103']] as const) {
    await prisma.vehicleDriver.upsert({
      where: { vehicleId_driverId: { vehicleId: vehicles[plate].id, driverId: drivers[license] } },
      create: { vehicleId: vehicles[plate].id, driverId: drivers[license], isPrimary: true },
      update: { isPrimary: true },
    });
  }
  const airport = await seedRoute(prisma, org.id, {
    name: 'Jeddah Airport (KAIA) to Makkah hotels', movement: 'AIRPORT_PICKUP', from: 'Jeddah', to: 'Makkah', pickup: 'KAIA Hajj & Umrah terminal',
    dropoff: 'Ajyad hotel district', km: 95, mins: 90, departAt: '2026-10-21T08:00:00Z', seatSar: 95, vehicle: vehicles['QA 1001'], driverId: drivers['QA-DL-0101'],
  });
  await seedRoute(prisma, org.id, {
    name: 'Makkah to Madinah intercity coach', movement: 'MAKKAH_MADINAH', from: 'Makkah', to: 'Madinah', pickup: 'Ajyad hotel district',
    dropoff: 'Central Area, Madinah', km: 450, mins: 300, departAt: '2026-10-30T06:00:00Z', seatSar: 140, vehicle: vehicles['QA 1002'], driverId: drivers['QA-DL-0102'],
  });
  // Operator A's group on the airport route: the route's booked seats equal the trip's passengers.
  const passengers = 4;
  const trip = {
    tenantId: org.id, vehicleId: vehicles['QA 1001'].id, routeId: airport.id, driverId: drivers['QA-DL-0101'], customerType: 'OPERATOR',
    customerName: 'Al-Noor Umrah Services — October group', customerEmail: `groups@qa-operator-a.${QA_EMAIL_DOMAIN}`, pickupLocation: 'KAIA Hajj & Umrah terminal',
    dropoffLocation: 'Qasr Al-Haram Ajyad', scheduledAt: at('2026-10-21T08:00:00Z'), passengerCount: passengers, priceCents: cents(95) * BigInt(passengers),
    currency: 'SAR', paymentStatus: 'UNPAID', status: 'CONFIRMED', notes: 'QA fixture transfer.',
  };
  await upsert(
    () => prisma.transportAssignment.findFirst({ where: { tenantId: org.id, routeId: airport.id, customerName: trip.customerName } }),
    () => prisma.transportAssignment.create({ data: trip }),
    (id) => prisma.transportAssignment.update({ where: { id }, data: trip }),
  );
  await prisma.transportRoute.update({ where: { id: airport.id }, data: { bookedSeats: passengers } });
  await seedListing(prisma, vendor.id, {
    name: 'Jeddah Airport to Makkah transfer (per seat)', type: 'transport_service', priceSar: 95, model: 'PER_PERSON',
    description: 'Shared air-conditioned coach from the Hajj & Umrah terminal to Makkah hotels.', attributes: { city: 'Jeddah', from: 'Jeddah Airport', to: 'Makkah' },
  });
  await seedListing(prisma, vendor.id, {
    name: 'Makkah to Madinah coach seat', type: 'transport_service', priceSar: 140, model: 'PER_PERSON',
    description: 'Intercity coach seat, about five hours with one rest stop.', attributes: { city: 'Makkah', from: 'Makkah', to: 'Madinah' },
  });
  return ['Transport A: 3 vehicles, 3 drivers, 2 routes, 1 trip, 2 listings'];
}

async function seedTransportB(prisma: PrismaClient, orgs: Orgs) {
  const org = orgs.transportB;
  const vendor = await seedVendor(prisma, org, 'VENDOR_TRANSPORT', 'Makkah', 'Private cars and vans for families.');
  const { vehicles, drivers } = await seedFleet(prisma, org.id, vendor.id, {
    vehicles: [{ plate: 'QA 2001', type: 'VAN', name: 'Family van', model: 'Hyundai H-1', year: 2023, capacity: 11 }],
    drivers: [{ license: 'QA-DL-0201', first: 'Waleed', last: 'Amin', phone: '+966500000201', nationality: 'SA' }],
  });
  await prisma.vehicleDriver.upsert({
    where: { vehicleId_driverId: { vehicleId: vehicles['QA 2001'].id, driverId: drivers['QA-DL-0201'] } },
    create: { vehicleId: vehicles['QA 2001'].id, driverId: drivers['QA-DL-0201'], isPrimary: true },
    update: { isPrimary: true },
  });
  await seedRoute(prisma, org.id, {
    name: 'Makkah to Madinah private van', movement: 'MAKKAH_MADINAH', from: 'Makkah', to: 'Madinah', pickup: 'Any Makkah hotel',
    dropoff: 'Any Madinah hotel', km: 450, mins: 270, departAt: '2026-11-05T07:00:00Z', seatSar: 160, vehicle: vehicles['QA 2001'], driverId: drivers['QA-DL-0201'],
  });
  await seedListing(prisma, vendor.id, {
    name: 'Private van, Makkah to Madinah (per seat)', type: 'transport_service', priceSar: 160, model: 'PER_PERSON',
    description: 'Door-to-door van for families, up to eleven seats.', attributes: { city: 'Makkah', from: 'Makkah', to: 'Madinah' },
  });
  return ['Transport B: 1 vehicle, 1 driver, 1 route, 1 listing'];
}

// ── Visa agencies ──────────────────────────────────────────────────────────

async function seedVisaAgency(prisma: PrismaClient, org: QaOrgRef, officer: QaUserRef, cases: VisaSeed[], ticket?: { number: string; subject: string; description: string }) {
  const vendor = await seedVendor(prisma, org, 'VENDOR_VISA', 'Riyadh', 'Umrah visa processing through Nusuk, with document checks.');
  for (const c of cases) {
    const visa = await seedVisa(prisma, org.id, officer.id, c);
    if (c.status === 'DOCUMENTS_COLLECTING') {
      for (const [type, name] of [['PASSPORT', 'Passport copy (bio page)'], ['PHOTO', 'Personal photo, white background']] as const) {
        const doc = { tenantId: org.id, applicationId: visa.id, name, type, status: 'MISSING' as const, url: null, version: 0, createdBy: officer.id };
        await upsert(
          () => prisma.visaDocument.findFirst({ where: { tenantId: org.id, applicationId: visa.id, type } }),
          () => prisma.visaDocument.create({ data: doc }),
          (id) => prisma.visaDocument.update({ where: { id }, data: doc }),
        );
      }
    }
  }
  if (ticket) {
    const data = {
      tenantId: org.id, subject: ticket.subject, description: ticket.description, category: 'DOCUMENT_ISSUE' as const, priority: 'NORMAL' as const,
      status: 'OPEN' as const, requesterName: 'Al-Noor Umrah Services', requesterEmail: `visa@qa-operator-a.${QA_EMAIL_DOMAIN}`,
      assigneeId: officer.id, assigneeName: `${officer.firstName} ${officer.lastName}`, dueAt: at('2026-09-25T12:00:00Z'), createdBy: officer.id,
    };
    await upsert(
      () => prisma.visaServiceRequest.findFirst({ where: { tenantId: org.id, ticketNumber: ticket.number } }),
      () => prisma.visaServiceRequest.create({ data: { ticketNumber: ticket.number, ...data } }),
      (id) => prisma.visaServiceRequest.update({ where: { id }, data }),
    );
  }
  await seedListing(prisma, vendor.id, {
    name: `Umrah visa processing — ${org.name}`, type: 'visa_service', priceSar: 300, model: 'PER_PERSON',
    description: 'Nusuk e-visa application, document review and status updates.', attributes: { city: 'Riyadh', turnaroundDays: 5 },
  });
}

// ── Traveler marketplace activity ──────────────────────────────────────────

async function seedTravelerActivity(prisma: PrismaClient, users: Users) {
  const listing = await prisma.listing.findFirst({ where: { name: 'Jeddah Airport to Makkah transfer (per seat)', vendor: { name: 'Rahala Coaches' } } });
  if (!listing) return;
  const partySize = 2;
  const booking = {
    listingId: listing.id, customerUserId: users.travelerA.id, customerName: 'Amina Rahman', customerEmail: users.travelerA.email,
    startDate: day('2026-10-21'), endDate: day('2026-10-21'), partySize, totalAmountCents: listing.priceCents * BigInt(partySize),
    currency: 'SAR', status: 'PENDING', paymentStatus: 'UNPAID', notes: 'Arriving on the morning flight.',
  };
  await upsert(
    () => prisma.listingBooking.findFirst({ where: { listingId: listing.id, customerUserId: users.travelerA.id } }),
    () => prisma.listingBooking.create({ data: booking }),
    (id) => prisma.listingBooking.update({ where: { id }, data: booking }),
  );
}

export async function seedQaDomainData(prisma: PrismaClient, orgs: Orgs, users: Users): Promise<string[]> {
  if (!orgs[COMMUNITY_ORG]) throw new Error('Community organization missing');
  const lines = [
    ...(await seedOperatorA(prisma, orgs, users)),
    ...(await seedOperatorB(prisma, orgs, users)),
    ...(await seedHotelA(prisma, orgs, users)),
    ...(await seedHotelB(prisma, orgs, users)),
    ...(await seedTransportA(prisma, orgs)),
    ...(await seedTransportB(prisma, orgs)),
  ];
  await seedVisaAgency(prisma, orgs.visaA, users.visaA, [
    { appNo: 'QA-VISA-V-0001', applicant: { name: 'Rashid Anwar', passport: 'QA-P-V0001', nationality: 'PK' }, operatorId: orgs.operatorA.id, status: 'SUBMITTED', submitted: '2026-09-13', officer: 'Mariam Saleh' },
    { appNo: 'QA-VISA-V-0002', applicant: { name: 'Salma Rashid', passport: 'QA-P-V0002', nationality: 'PK' }, operatorId: orgs.operatorA.id, status: 'DOCUMENTS_COLLECTING', officer: 'Mariam Saleh' },
    { appNo: 'QA-VISA-V-0003', applicant: { name: 'Adam Yusuf', passport: 'QA-P-V0003', nationality: 'ZA' }, status: 'APPROVED', submitted: '2026-09-01', approved: '2026-09-08', officer: 'Mariam Saleh' },
  ], { number: 'QA-VSR-0001', subject: 'Photo rejected for Salma Rashid — new photo needed', description: 'The Nusuk portal rejected the photo (background not white). Waiting for a new photo from the operator.' });
  await seedVisaAgency(prisma, orgs.visaB, users.visaB, [
    { appNo: 'QA-VISA-W-0001', applicant: { name: 'Nadia Karim', passport: 'QA-P-W0001', nationality: 'BD' }, status: 'UNDER_REVIEW', submitted: '2026-09-12', officer: 'Zaid Karim' },
  ]);
  lines.push('Visa agency A: 3 visa cases, 2 document requests, 1 service ticket, 1 listing', 'Visa agency B: 1 visa case, 1 listing');
  await seedTravelerActivity(prisma, users);
  lines.push('Traveler A: 1 marketplace booking (2 seats), 1 open hotel request with an offer from Hotel B');
  return lines;
}

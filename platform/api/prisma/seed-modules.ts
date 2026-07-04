/**
 * Supplemental seed — Hotels, Transport, Finance, Compliance, Groups, Marketplace
 * Run after the main seed: npx ts-node prisma/seed-modules.ts
 */

import {
  PrismaClient,
  InvoiceStatus,
  VisaStatus,
  RegulatorySystem,
  TenantType,
} from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding modules (hotels, transport, finance, compliance, groups)...\n');

  const tenant = await prisma.tenant.findUnique({ where: { slug: 'al-haramain-ksa' } });
  if (!tenant) throw new Error('KSA tenant not found — run main seed first');

  const adminUser = await prisma.user.findFirst({ where: { tenantId: tenant.id } });
  if (!adminUser) throw new Error('Admin user not found');

  const pilgrims = await prisma.pilgrim.findMany({ where: { tenantId: tenant.id } });
  const booking  = await prisma.booking.findFirst({ where: { tenantId: tenant.id } });

  // ── HOTELS ─────────────────────────────────────────────────────────────────
  console.log('🏨 Seeding hotels...');

  const h1 = await prisma.hotel.create({
    data: {
      tenantId:        tenant.id,
      name:            'Makkah Clock Royal Tower',
      nameAr:          'برج ساعة مكة الملكي',
      city:            'MAKKAH',
      country:         'SA',
      starRating:      5,
      distanceToHaram: 200,
      amenities:       ['wifi', 'pool', 'spa', 'gym', 'restaurant', 'valet'],
      isVerified:      true,
      description:     '5-star luxury hotel directly overlooking the Masjid al-Haram. Premium Zamzam Tower suites with Kaaba views.',
    },
  });

  const h2 = await prisma.hotel.create({
    data: {
      tenantId:        tenant.id,
      name:            'Hilton Suites Makkah',
      nameAr:          'هيلتون سويتس مكة',
      city:            'MAKKAH',
      country:         'SA',
      starRating:      4,
      distanceToHaram: 600,
      amenities:       ['wifi', 'restaurant', 'shuttle', 'laundry'],
      isVerified:      true,
      description:     'Premium suites 600m from the Haram. Shuttle service every 30 minutes.',
    },
  });

  const h3 = await prisma.hotel.create({
    data: {
      tenantId:        tenant.id,
      name:            'Anwar Al Madinah Movenpick',
      nameAr:          'أنوار المدينة موفنبيك',
      city:            'MADINAH',
      country:         'SA',
      starRating:      5,
      distanceToHaram: 100,
      amenities:       ['wifi', 'pool', 'restaurant', 'gym', 'meeting_rooms'],
      isVerified:      true,
      description:     'Iconic Madinah hotel 100m from Masjid an-Nabawi.',
    },
  });

  // Room types (RoomType only has: hotelId, name, occupancy, bedConfig, amenities, images)
  await prisma.roomType.createMany({
    data: [
      { hotelId: h1.id, name: 'Standard Double',  occupancy: 2, bedConfig: '1 King Bed',  amenities: ['haram_view', 'wifi', 'minibar'] },
      { hotelId: h1.id, name: 'Superior Suite',    occupancy: 4, bedConfig: '2 King Beds', amenities: ['kaaba_view', 'lounge', 'butler'] },
      { hotelId: h2.id, name: 'Deluxe Twin',       occupancy: 2, bedConfig: '2 Twin Beds', amenities: ['wifi', 'ac'] },
      { hotelId: h2.id, name: 'Family Suite',      occupancy: 6, bedConfig: '3 Beds',      amenities: ['kitchenette', 'wifi'] },
      { hotelId: h3.id, name: 'Standard Room',     occupancy: 2, bedConfig: '1 Queen Bed', amenities: ['masjid_view', 'wifi'] },
      { hotelId: h3.id, name: 'Executive Room',    occupancy: 2, bedConfig: '1 King Bed',  amenities: ['masjid_view', 'lounge_access', 'wifi'] },
    ],
  });

  console.log('   ✓ 3 hotels + 6 room types created\n');

  // ── TRANSPORT ──────────────────────────────────────────────────────────────
  console.log('🚌 Seeding transport...');

  const v1 = await prisma.vehicle.create({
    data: {
      tenantId:        tenant.id,
      type:            'BUS_LARGE',
      plateNumber:     'KSA-12345-A',
      capacity:        45,
      licensedForHajj: true,
      saudiLicenseNo:  'SL-2024-001',
      model:           'Mercedes-Benz Tourismo',
      year:            2023,
      features:        ['ac', 'gps', 'usb_charging', 'wifi'],
      isActive:        true,
    },
  });

  const v2 = await prisma.vehicle.create({
    data: {
      tenantId:        tenant.id,
      type:            'BUS_LARGE',
      plateNumber:     'KSA-67890-B',
      capacity:        45,
      licensedForHajj: true,
      saudiLicenseNo:  'SL-2024-002',
      model:           'Volvo 9700',
      year:            2022,
      features:        ['ac', 'gps', 'reclining_seats'],
      isActive:        true,
    },
  });

  const v3 = await prisma.vehicle.create({
    data: {
      tenantId:        tenant.id,
      type:            'VAN',
      plateNumber:     'KSA-11111-C',
      capacity:        14,
      licensedForHajj: false,
      model:           'Toyota HiAce',
      year:            2024,
      features:        ['ac', 'gps'],
      isActive:        true,
    },
  });

  const v4 = await prisma.vehicle.create({
    data: {
      tenantId:        tenant.id,
      type:            'BUS_MEDIUM',
      plateNumber:     'KSA-22222-D',
      capacity:        30,
      licensedForHajj: true,
      saudiLicenseNo:  'SL-2024-003',
      model:           'Hyundai Starex',
      year:            2023,
      features:        ['ac', 'gps', 'wheelchair_accessible'],
      isActive:        true,
    },
  });

  // Drivers
  const d1 = await prisma.driver.create({
    data: {
      tenantId:      tenant.id,
      firstName:     'Abdullah',
      lastName:      'Al-Ghamdi',
      phone:         '+966501111111',
      languages:     ['ar', 'en'],
      licenseNumber: 'SA-DL-2024-001',
      isActive:      true,
    },
  });

  const d2 = await prisma.driver.create({
    data: {
      tenantId:      tenant.id,
      firstName:     'Mohammed',
      lastName:      'Al-Zahrani',
      phone:         '+966502222222',
      languages:     ['ar'],
      licenseNumber: 'SA-DL-2024-002',
      isActive:      true,
    },
  });

  const d3 = await prisma.driver.create({
    data: {
      tenantId:      tenant.id,
      firstName:     'Khalid',
      lastName:      'Al-Qahtani',
      phone:         '+966503333333',
      languages:     ['ar', 'id'],
      licenseNumber: 'SA-DL-2024-003',
      isActive:      true,
    },
  });

  // Link drivers to vehicles
  await prisma.vehicleDriver.createMany({
    data: [
      { vehicleId: v1.id, driverId: d1.id, isPrimary: true },
      { vehicleId: v2.id, driverId: d2.id, isPrimary: true },
      { vehicleId: v3.id, driverId: d3.id, isPrimary: true },
      { vehicleId: v4.id, driverId: d1.id, isPrimary: false },
    ],
  });

  // Routes (TransportRoute has: tenantId, name, movementType, originCity, destCity, distanceKm, durationMins, notes)
  await prisma.transportRoute.createMany({
    data: [
      {
        tenantId:     tenant.id,
        name:         'Jeddah Airport → Makkah Hotels',
        movementType: 'AIRPORT_PICKUP',
        originCity:   'Jeddah',
        destCity:     'Makkah',
        distanceKm:   85,
        durationMins: 90,
        notes:        'Meets pilgrims at Jeddah King Abdulaziz Airport arrivals hall',
      },
      {
        tenantId:     tenant.id,
        name:         'Makkah → Madinah Express',
        movementType: 'MAKKAH_MADINAH',
        originCity:   'Makkah',
        destCity:     'Madinah',
        distanceKm:   420,
        durationMins: 300,
        notes:        'Departure from Makkah hotel zone after Fajr prayer',
      },
      {
        tenantId:     tenant.id,
        name:         'Makkah → Mina (Hajj Mashaa\'er)',
        movementType: 'MASHAER_MINA',
        originCity:   'Makkah',
        destCity:     'Mina',
        distanceKm:   8,
        durationMins: 45,
        notes:        'Hajj 8 Dhul Hijjah movement — all pilgrims',
      },
    ],
  });

  console.log('   ✓ 4 vehicles + 3 drivers + 3 routes created\n');

  // ── VISA APPLICATIONS ──────────────────────────────────────────────────────
  console.log('📋 Seeding visa applications...');

  if (pilgrims.length > 0) {
    const visaItems = [
      { status: VisaStatus.APPROVED,              pilgrim: pilgrims[0], extRef: 'NUSUK-2026-00101', approvedAt: new Date('2026-02-10') },
      { status: VisaStatus.APPROVED,              pilgrim: pilgrims[1], extRef: 'NUSUK-2026-00102', approvedAt: new Date('2026-02-11') },
      { status: VisaStatus.SUBMITTED,             pilgrim: pilgrims[2], extRef: 'NUSUK-2026-00103', approvedAt: undefined },
      { status: VisaStatus.DOCUMENTS_COLLECTING,  pilgrim: pilgrims[3], extRef: undefined,           approvedAt: undefined },
      { status: VisaStatus.REJECTED,              pilgrim: pilgrims[4], extRef: 'NUSUK-2026-00104',  approvedAt: undefined },
    ];

    for (const v of visaItems) {
      await prisma.visaApplication.create({
        data: {
          tenantId:         tenant.id,
          pilgrimId:        v.pilgrim.id,
          bookingId:        booking?.id ?? undefined,
          status:           v.status,
          regulatorySystem: RegulatorySystem.NUSUK_MASAR,
          externalRef:      v.extRef ?? undefined,
          submittedAt:      v.status !== VisaStatus.DOCUMENTS_COLLECTING ? new Date('2026-02-01') : undefined,
          approvedAt:       v.approvedAt ?? undefined,
          rejectedAt:       v.status === VisaStatus.REJECTED ? new Date('2026-02-12') : undefined,
          expiresAt:        v.status === VisaStatus.APPROVED ? new Date('2026-04-01') : undefined,
          rejectionCode:    v.status === VisaStatus.REJECTED ? 'DOC_EXPIRED' : undefined,
          rejectionReason:  v.status === VisaStatus.REJECTED ? 'Passport expires within 6 months of travel date' : undefined,
          documents: [
            { type: 'PASSPORT', status: v.status === VisaStatus.DOCUMENTS_COLLECTING ? 'MISSING' : 'UPLOADED' },
          ],
          timeline: [
            { event: 'CREATED', timestamp: '2026-01-20T10:00:00Z', actor: adminUser.id },
            ...(v.status !== VisaStatus.DOCUMENTS_COLLECTING
              ? [{ event: 'SUBMITTED', timestamp: '2026-02-01T09:00:00Z', actor: adminUser.id }]
              : []),
            ...(v.approvedAt
              ? [{ event: 'APPROVED', timestamp: v.approvedAt.toISOString(), actor: 'NUSUK_SYSTEM' }]
              : []),
            ...(v.status === VisaStatus.REJECTED
              ? [{ event: 'REJECTED', timestamp: '2026-02-12T14:00:00Z', actor: 'NUSUK_SYSTEM', reason: 'DOC_EXPIRED' }]
              : []),
          ],
        },
      });
    }
  }

  console.log('   ✓ 5 visa applications created\n');

  // ── FINANCE ────────────────────────────────────────────────────────────────
  console.log('💰 Seeding finance...');

  // Use upsert to handle idempotency
  const inv1 = await prisma.invoice.upsert({
    where:  { invoiceRef: 'INV-2026-00001' },
    update: {},
    create: {
      tenantId: tenant.id, invoiceRef: 'INV-2026-00001',
      status: InvoiceStatus.PAID, type: 'CUSTOMER',
      bookingId: booking?.id, pilgrimId: pilgrims[0]?.id,
      issuedToName: 'Ahmad Hassan',
      issuedToAddress: { city: 'Jakarta', country: 'ID' },
      subtotalCents: BigInt(850000), taxCents: BigInt(0), discountCents: BigInt(0),
      totalCents: BigInt(850000), paidCents: BigInt(850000), currency: 'SAR',
      issuedAt: new Date('2026-01-15'), dueAt: new Date('2026-02-01'),
      lineItems: [{ description: 'Ramadan VIP Package — 14 nights', qty: 1, unitPriceCents: 850000, totalCents: 850000 }],
      createdBy: adminUser.id,
    },
  });

  const existingPay1 = await prisma.payment.findUnique({ where: { idempotencyKey: 'pay-inv1-fixed' } });
  if (!existingPay1) {
    await prisma.payment.create({
      data: {
        tenantId: tenant.id, invoiceId: inv1.id,
        amountCents: BigInt(850000), currency: 'SAR',
        gateway: 'bank_transfer', gatewayRef: 'TRF-2026-00001',
        status: 'COMPLETED', idempotencyKey: 'pay-inv1-fixed',
        paidAt: new Date('2026-01-20'),
      },
    });
  }

  const inv2 = await prisma.invoice.upsert({
    where:  { invoiceRef: 'INV-2026-00002' },
    update: {},
    create: {
      tenantId: tenant.id, invoiceRef: 'INV-2026-00002',
      status: InvoiceStatus.PARTIALLY_PAID, type: 'CUSTOMER',
      pilgrimId: pilgrims[1]?.id,
      issuedToName: 'Siti Rahmawati',
      issuedToAddress: { city: 'Jakarta', country: 'ID' },
      subtotalCents: BigInt(850000), taxCents: BigInt(0), discountCents: BigInt(42500),
      totalCents: BigInt(807500), paidCents: BigInt(400000), currency: 'SAR',
      issuedAt: new Date('2026-01-20'), dueAt: new Date('2026-02-15'),
      lineItems: [
        { description: 'Ramadan VIP Package', qty: 1, unitPriceCents: 850000, totalCents: 850000 },
        { description: 'Early Bird Discount (5%)', qty: 1, unitPriceCents: -42500, totalCents: -42500 },
      ],
      createdBy: adminUser.id,
    },
  });

  const existingPay2 = await prisma.payment.findUnique({ where: { idempotencyKey: 'pay-inv2-fixed' } });
  if (!existingPay2) {
    await prisma.payment.create({
      data: {
        tenantId: tenant.id, invoiceId: inv2.id,
        amountCents: BigInt(400000), currency: 'SAR',
        gateway: 'bank_transfer', gatewayRef: 'TRF-2026-00002',
        status: 'COMPLETED', idempotencyKey: 'pay-inv2-fixed',
        paidAt: new Date('2026-01-25'),
      },
    });
  }

  await prisma.invoice.upsert({
    where:  { invoiceRef: 'INV-2026-00003' },
    update: {},
    create: {
      tenantId: tenant.id, invoiceRef: 'INV-2026-00003',
      status: InvoiceStatus.ISSUED, type: 'CUSTOMER',
      issuedToName: 'Umar Farooq',
      issuedToAddress: { city: 'Lahore', country: 'PK' },
      subtotalCents: BigInt(850000), taxCents: BigInt(0), discountCents: BigInt(0),
      totalCents: BigInt(850000), paidCents: BigInt(0), currency: 'SAR',
      issuedAt: new Date('2026-01-22'), dueAt: new Date('2026-02-20'),
      lineItems: [{ description: 'Ramadan VIP Package — 14 nights', qty: 1, unitPriceCents: 850000, totalCents: 850000 }],
      createdBy: adminUser.id,
    },
  });

  const inv4 = await prisma.invoice.upsert({
    where:  { invoiceRef: 'INV-2026-00004' },
    update: {},
    create: {
      tenantId: tenant.id, invoiceRef: 'INV-2026-00004',
      status: InvoiceStatus.PAID, type: 'CUSTOMER',
      issuedToName: 'Fatima Al-Zahrani',
      issuedToAddress: { city: 'Riyadh', country: 'SA' },
      subtotalCents: BigInt(850000), taxCents: BigInt(0), discountCents: BigInt(0),
      totalCents: BigInt(850000), paidCents: BigInt(850000), currency: 'SAR',
      issuedAt: new Date('2026-01-10'), dueAt: new Date('2026-01-31'),
      lineItems: [{ description: 'Ramadan VIP Package', qty: 1, unitPriceCents: 850000, totalCents: 850000 }],
      createdBy: adminUser.id,
    },
  });

  const existingPay4 = await prisma.payment.findUnique({ where: { idempotencyKey: 'pay-inv4-fixed' } });
  if (!existingPay4) {
    await prisma.payment.create({
      data: {
        tenantId: tenant.id, invoiceId: inv4.id,
        amountCents: BigInt(850000), currency: 'SAR',
        gateway: 'cash', gatewayRef: 'CASH-2026-00001',
        status: 'COMPLETED', idempotencyKey: 'pay-inv4-fixed',
        paidAt: new Date('2026-01-12'),
      },
    });
  }

  await prisma.invoice.upsert({
    where:  { invoiceRef: 'INV-2026-00005' },
    update: {},
    create: {
      tenantId: tenant.id, invoiceRef: 'INV-2026-00005',
      status: InvoiceStatus.DRAFT, type: 'CUSTOMER',
      issuedToName: 'Abubakar Suleiman',
      issuedToAddress: { city: 'Lagos', country: 'NG' },
      subtotalCents: BigInt(850000), taxCents: BigInt(0), discountCents: BigInt(0),
      totalCents: BigInt(850000), paidCents: BigInt(0), currency: 'SAR',
      issuedAt: new Date('2026-01-25'), dueAt: new Date('2026-02-25'),
      lineItems: [{ description: 'Ramadan VIP Package', qty: 1, unitPriceCents: 850000, totalCents: 850000 }],
      createdBy: adminUser.id,
    },
  });

  console.log('   ✓ 5 invoices + 3 payments created\n');

  // ── TRIP GROUPS ─────────────────────────────────────────────────────────────
  console.log('👥 Seeding trip groups...');

  await prisma.tripGroup.create({
    data: {
      tenantId:      tenant.id,
      name:          'Ramadan Group A — Makkah Priority',
      tripType:      'UMRAH',
      season:        'RAMADAN_2026',
      departureDate: new Date('2026-03-01'),
      returnDate:    new Date('2026-03-15'),
      capacity:      40,
      enrolledCount: 5,
      status:        'CONFIRMED',
      itinerary: [
        { day: 1, location: 'Makkah', activities: ["Umrah (Tawaf + Sa'i)", 'Check-in Makkah Clock Tower'] },
        { day: 7, location: 'Madinah', activities: ['Travel to Madinah', 'Arbain begins'] },
        { day: 14, location: 'Jeddah', activities: ['Depart from Jeddah Airport'] },
      ],
      briefingNotes:    'VIP room allocation confirmed at Makkah Clock Tower.',
      emergencyContact: { name: 'Mohammed Al-Qahtani', phone: '+966501234567' },
    },
  });

  await prisma.tripGroup.create({
    data: {
      tenantId:      tenant.id,
      name:          'Ramadan Group B — Economy Package',
      tripType:      'UMRAH',
      season:        'RAMADAN_2026',
      departureDate: new Date('2026-03-08'),
      returnDate:    new Date('2026-03-20'),
      capacity:      30,
      enrolledCount: 0,
      status:        'PLANNING',
      itinerary:     [],
      briefingNotes: 'Budget group — economy hotels. Awaiting pilgrim registrations.',
    },
  });

  await prisma.tripGroup.create({
    data: {
      tenantId:      tenant.id,
      name:          'Hajj Delegation 1447H',
      tripType:      'HAJJ',
      season:        'HAJJ_1447',
      departureDate: new Date('2026-06-01'),
      returnDate:    new Date('2026-06-20'),
      capacity:      200,
      enrolledCount: 0,
      status:        'PLANNING',
      itinerary:     [],
      briefingNotes: 'Hajj 1447H — Registration opens Feb 2026.',
    },
  });

  console.log('   ✓ 3 trip groups created\n');

  // ── MARKETPLACE ─────────────────────────────────────────────────────────────
  console.log('🛒 Seeding marketplace...');

  const vendor = await prisma.vendor.create({
    data: {
      tenantId: tenant.id,
      type:     TenantType.MU_ASSASA,
      status:   'VERIFIED' as any,
      name:     'Al-Haramain Ground Services',
      email:    'vendors@alharamain.sa',
      phone:    '+966501234567',
      country:  'SA',
      city:     'Makkah',
      description: 'Licensed Saudi Mu\'assasa with 20+ years experience providing ground services for Umrah and Hajj pilgrims.',
    },
  });

  await prisma.listing.createMany({
    data: [
      {
        vendorId:     vendor.id,
        type:         'hotel_room',
        name:         'VIP Room — Makkah Clock Tower (200m from Haram)',
        description:  'Prime location 200m from Masjid al-Haram. 5-star facilities, Kaaba view rooms available.',
        priceCents:   BigInt(60000),
        currency:     'SAR',
        pricingModel: 'PER_NIGHT',
        attributes:   { city: 'MAKKAH', starRating: 5, distanceToHaram: 200, capacity: 2 },
        isActive:     true,
      },
      {
        vendorId:     vendor.id,
        type:         'transport_service',
        name:         'Airport Transfer — Jeddah to Makkah (45-seat coach)',
        description:  'Licensed 45-seat coach with professional driver. Meets pilgrims at arrivals.',
        priceCents:   BigInt(15000),
        currency:     'SAR',
        pricingModel: 'PER_GROUP',
        attributes:   { capacity: 45, route: 'JED-MKK', vehicleType: 'BUS_LARGE' },
        isActive:     true,
      },
      {
        vendorId:     vendor.id,
        type:         'guide',
        name:         'Licensed Mutawif Guide (Arabic/English/Indonesian)',
        description:  'Government-licensed Mutawif with 15+ years experience. Trilingual.',
        priceCents:   BigInt(5000),
        currency:     'SAR',
        pricingModel: 'PER_PERSON',
        attributes:   { languages: ['ar', 'en', 'id'], maxGroupSize: 40 },
        isActive:     true,
      },
    ],
  });

  console.log('   ✓ 1 vendor + 3 listings created\n');

  console.log('═══════════════════════════════════════════════════════');
  console.log('✅  Module seed complete!');
  console.log('═══════════════════════════════════════════════════════');
  console.log('  Hotels:     3 (Makkah ×2, Madinah ×1)');
  console.log('  Vehicles:   4 (2×BUS_LARGE, 1×VAN, 1×BUS_MEDIUM)');
  console.log('  Drivers:    3');
  console.log('  Routes:     3');
  console.log('  Visas:      5 (2 approved, 1 submitted, 1 collecting, 1 rejected)');
  console.log('  Invoices:   5 (2 paid, 1 partial, 1 issued, 1 draft)');
  console.log('  Groups:     3 (2 Umrah, 1 Hajj)');
  console.log('  Listings:   3 (hotel, transport, guide)');
  console.log('═══════════════════════════════════════════════════════');
}

main()
  .catch((e) => {
    console.error('❌ Module seed failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

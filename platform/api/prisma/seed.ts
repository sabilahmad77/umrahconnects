/**
 * Umrah Connects — Database Seed Script
 *
 * Creates three operator personas:
 *   1. KSA Mu'assasa    — Al-Haramain Services (ground handler, Makkah)
 *   2. Indonesian PPIU  — PT Baitussalam Tours (Jakarta)
 *   3. Pakistani Operator — Kaaba Travel (Karachi)
 *
 * Each tenant gets:
 *   - Admin user (email + password: Admin@1234)
 *   - System roles + permissions
 *   - 5 sample pilgrims
 *   - 1 package
 *   - 1 booking
 */

import { Prisma, PrismaClient, TenantType, TenantStatus, TenantTier, UserStatus, Gender, PilgrimStatus, BookingStatus } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();
const ADMIN_PASSWORD = 'Admin@1234';
const BCRYPT_ROUNDS = 10;

// ── Idempotency helpers (AUD-028 / D08) ──────────────────────────────────────
// The seed can run again on an existing database: records are found by their
// natural keys (tenant + phone, tenant + package name, booking ref) and every
// booking is linked to the travelers it was priced for, so a booking never
// shows "0 pilgrims" and a BOOKED traveler always has a booking.

async function ensurePilgrim(data: Prisma.PilgrimUncheckedCreateInput) {
  const existing = await prisma.pilgrim.findFirst({ where: { tenantId: data.tenantId, phone: data.phone ?? undefined, deletedAt: null } });
  // Every seeded traveler is in a booking: a LEAD/PROSPECT status contradicts that and is corrected.
  // Later statuses (visa progress set by seed-modules or by real workflows) are left alone.
  if (existing) {
    if (existing.status === 'LEAD' || existing.status === 'PROSPECT') {
      return prisma.pilgrim.update({ where: { id: existing.id }, data: { status: data.status } });
    }
    return existing;
  }
  return prisma.pilgrim.create({ data });
}

async function ensurePackage(data: Prisma.PackageUncheckedCreateInput) {
  const existing = await prisma.package.findFirst({ where: { tenantId: data.tenantId, name: data.name } });
  return existing ?? prisma.package.create({ data });
}

/** The booking plus exactly one BookingPilgrim row per traveler, each at the package price. */
async function ensureBooking(data: Prisma.BookingUncheckedCreateInput, pilgrimIds: string[], priceCents: bigint) {
  // eng100-fx3: booking references are unique per organization, not platform-wide.
  const booking = await prisma.booking.upsert({
    where: { tenantId_bookingRef: { tenantId: data.tenantId, bookingRef: data.bookingRef } },
    create: data,
    update: {},
  });
  for (const pilgrimId of pilgrimIds) {
    await prisma.bookingPilgrim.upsert({
      where: { bookingId_pilgrimId: { bookingId: booking.id, pilgrimId } },
      create: { tenantId: booking.tenantId, bookingId: booking.id, pilgrimId, priceCents, currency: booking.currency },
      update: {},
    });
  }
  return booking;
}

async function main() {
  console.log('🌱 Seeding Umrah Connects database...\n');

  const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, BCRYPT_ROUNDS);

  // ================================================================
  // 1. PERMISSIONS — seed the full catalog
  // ================================================================
  console.log('📋 Seeding permissions...');
  const permissionDefs = [
    { namespace: 'core', resource: 'tenant', action: 'read' },
    { namespace: 'core', resource: 'tenant', action: 'update' },
    { namespace: 'core', resource: 'user', action: 'read' },
    { namespace: 'core', resource: 'user', action: 'create' },
    { namespace: 'core', resource: 'user', action: 'update' },
    { namespace: 'core', resource: 'user', action: 'delete' },
    { namespace: 'core', resource: 'role', action: 'read' },
    { namespace: 'core', resource: 'role', action: 'manage' },
    { namespace: 'crm', resource: 'pilgrim', action: 'read' },
    { namespace: 'crm', resource: 'pilgrim', action: 'create' },
    { namespace: 'crm', resource: 'pilgrim', action: 'update' },
    { namespace: 'crm', resource: 'pilgrim', action: 'delete' },
    { namespace: 'crm', resource: 'pilgrim', action: 'export' },
    { namespace: 'crm', resource: 'document', action: 'upload' },
    { namespace: 'booking', resource: 'package', action: 'read' },
    { namespace: 'booking', resource: 'package', action: 'manage' },
    { namespace: 'booking', resource: 'booking', action: 'read' },
    { namespace: 'booking', resource: 'booking', action: 'create' },
    { namespace: 'booking', resource: 'booking', action: 'update' },
    { namespace: 'booking', resource: 'booking', action: 'cancel' },
    { namespace: 'hotel', resource: 'allotment', action: 'read' },
    { namespace: 'hotel', resource: 'allotment', action: 'manage' },
    { namespace: 'hotel', resource: 'room', action: 'assign' },
    { namespace: 'visa', resource: 'application', action: 'read' },
    { namespace: 'visa', resource: 'application', action: 'submit' },
    { namespace: 'visa', resource: 'application', action: 'manage' },
    { namespace: 'transport', resource: 'vehicle', action: 'read' },
    { namespace: 'transport', resource: 'vehicle', action: 'manage' },
    { namespace: 'transport', resource: 'assignment', action: 'manage' },
    { namespace: 'finance', resource: 'invoice', action: 'read' },
    { namespace: 'finance', resource: 'invoice', action: 'create' },
    { namespace: 'finance', resource: 'invoice', action: 'approve' },
    { namespace: 'finance', resource: 'payment', action: 'read' },
    { namespace: 'finance', resource: 'payment', action: 'process' },
    { namespace: 'finance', resource: 'report', action: 'read' },
    { namespace: 'social', resource: 'post', action: 'read' },
    { namespace: 'social', resource: 'post', action: 'create' },
    { namespace: 'marketplace', resource: 'listing', action: 'read' },
    { namespace: 'marketplace', resource: 'listing', action: 'manage' },
  ];

  const permissions = await Promise.all(
    permissionDefs.map((p) =>
      prisma.permission.upsert({
        where: { namespace_resource_action: p },
        create: p,
        update: {},
      }),
    ),
  );
  console.log(`   ✓ ${permissions.length} permissions upserted\n`);

  // ================================================================
  // 2. TENANT: KSA Mu'assasa — Al-Haramain Services
  // ================================================================
  console.log('🕋 Creating KSA Mu\'assasa — Al-Haramain Services...');
  const ksaTenant = await prisma.tenant.upsert({
    where: { slug: 'al-haramain-ksa' },
    create: {
      slug: 'al-haramain-ksa',
      name: 'Al-Haramain Ground Services',
      nameAr: 'خدمات الحرمين الأرضية',
      type: TenantType.MU_ASSASA,
      status: TenantStatus.ACTIVE,
      tier: TenantTier.SCALE,
      email: 'admin@alharamain.sa',
      phone: '+966501234567',
      country: 'SA',
      licenseNumber: 'KSA-MU-2024-001',
      licenseCountry: 'SA',
      timezone: 'Asia/Riyadh',
      locale: 'ar',
      currency: 'SAR',
      settings: { features: ['hotel', 'transport', 'visa', 'finance', 'social'] },
    },
    update: { status: TenantStatus.ACTIVE },
  });

  const ksaAdminRole = await prisma.role.upsert({
    where: { tenantId_name: { tenantId: ksaTenant.id, name: 'Operator Admin' } },
    create: {
      tenantId: ksaTenant.id,
      name: 'Operator Admin',
      description: 'Full access to all operator features',
      isSystem: true,
    },
    update: {},
  });

  // Assign all permissions to admin role
  await Promise.all(
    permissions.map((p) =>
      prisma.rolePermission.upsert({
        where: { roleId_permissionId: { roleId: ksaAdminRole.id, permissionId: p.id } },
        create: { roleId: ksaAdminRole.id, permissionId: p.id },
        update: {},
      }),
    ),
  );

  const ksaAdmin = await prisma.user.upsert({
    where: { tenantId_email: { tenantId: ksaTenant.id, email: 'admin@alharamain.sa' } },
    create: {
      tenantId: ksaTenant.id,
      email: 'admin@alharamain.sa',
      passwordHash,
      firstName: 'Mohammed',
      lastName: 'Al-Qahtani',
      firstNameAr: 'محمد',
      lastNameAr: 'القحطاني',
      status: UserStatus.ACTIVE,
      emailVerifiedAt: new Date(),
      locale: 'ar',
    },
    update: { status: UserStatus.ACTIVE },
  });

  await prisma.userRole.upsert({
    where: { userId_roleId: { userId: ksaAdmin.id, roleId: ksaAdminRole.id } },
    create: { userId: ksaAdmin.id, roleId: ksaAdminRole.id },
    update: {},
  });

  // KSA Pilgrims (mix of nationalities)
  const ksaPilgrims = [
    { firstNameEn: 'Ahmad', lastNameEn: 'Hassan', nationality: 'ID', country: 'ID', gender: Gender.MALE, phone: '+6281234567890', priorUmrahCount: 2 },
    { firstNameEn: 'Siti', lastNameEn: 'Rahmawati', nationality: 'ID', country: 'ID', gender: Gender.FEMALE, phone: '+6289876543210', priorUmrahCount: 1 },
    { firstNameEn: 'Umar', lastNameEn: 'Farooq', nationality: 'PK', country: 'PK', gender: Gender.MALE, phone: '+923001234567', priorUmrahCount: 0 },
    { firstNameEn: 'Fatima', lastNameEn: 'Al-Zahrani', nationality: 'SA', country: 'SA', gender: Gender.FEMALE, phone: '+966509876543', priorUmrahCount: 5 },
    { firstNameEn: 'Abubakar', lastNameEn: 'Suleiman', nationality: 'NG', country: 'NG', gender: Gender.MALE, phone: '+2348012345678', priorUmrahCount: 0 },
  ];

  const ksaPilgrimsIds: string[] = [];
  for (const pilgrimData of ksaPilgrims) {
    const pilgrim = await ensurePilgrim({
        tenantId: ksaTenant.id,
        status: PilgrimStatus.BOOKED,
        dateOfBirth: new Date('1985-03-15'),
        preferredLanguage: pilgrimData.nationality === 'SA' ? 'ar' : pilgrimData.nationality === 'ID' ? 'id' : 'en',
        ...pilgrimData,
    });
    ksaPilgrimsIds.push(pilgrim.id);
  }

  // KSA Package
  const ksaPackage = await ensurePackage({
      tenantId: ksaTenant.id,
      name: 'Ramadan VIP Umrah Package 2026',
      nameAr: 'باقة عمرة رمضان VIP 2026',
      tier: 'VIP',
      tripType: 'UMRAH',
      durationDays: 14,
      departureDate: new Date('2026-03-01'),
      returnDate: new Date('2026-03-15'),
      basePriceCents: BigInt(850000),  // 8,500 SAR
      currency: 'SAR',
      maxCapacity: 40,
      bookedCount: 5,
      includes: { visa: true, flight: false, hotel_makkah: true, hotel_madinah: true, transport: true, meals: true, guide: true },
      isPublished: true,
      createdBy: ksaAdmin.id,
  });

  // KSA Booking
  await ensureBooking({
      tenantId: ksaTenant.id,
      bookingRef: 'UC-2026-00001',
      packageId: ksaPackage.id,
      status: BookingStatus.CONFIRMED,
      totalAmountCents: BigInt(4250000),  // 42,500 SAR for 5 pilgrims
      paidAmountCents: BigInt(2125000),   // 50% paid
      currency: 'SAR',
      departureDate: new Date('2026-03-01'),
      returnDate: new Date('2026-03-15'),
      createdBy: ksaAdmin.id,
  }, ksaPilgrimsIds, ksaPackage.basePriceCents);

  console.log(`   ✓ Tenant: ${ksaTenant.slug} | Admin: admin@alharamain.sa | Password: Admin@1234\n`);

  // ================================================================
  // 3. TENANT: Indonesian PPIU — PT Baitussalam Tours
  // ================================================================
  console.log('🇮🇩 Creating Indonesian PPIU — PT Baitussalam Tours...');
  const idTenant = await prisma.tenant.upsert({
    where: { slug: 'baitussalam-id' },
    create: {
      slug: 'baitussalam-id',
      name: 'PT Baitussalam Tours & Travel',
      type: TenantType.OPERATOR,
      status: TenantStatus.ACTIVE,
      tier: TenantTier.GROWTH,
      email: 'admin@baitussalam.co.id',
      phone: '+62211234567',
      country: 'ID',
      licenseNumber: 'ID-PPIU-2024-789',
      licenseCountry: 'ID',
      timezone: 'Asia/Jakarta',
      locale: 'id',
      currency: 'IDR',
      settings: { features: ['crm', 'booking', 'visa', 'finance', 'social'], regulatorySystem: 'SISKOPATUH' },
    },
    update: { status: TenantStatus.ACTIVE },
  });

  const idAdminRole = await prisma.role.upsert({
    where: { tenantId_name: { tenantId: idTenant.id, name: 'Operator Admin' } },
    create: {
      tenantId: idTenant.id,
      name: 'Operator Admin',
      description: 'Full access to all operator features',
      isSystem: true,
    },
    update: {},
  });

  await Promise.all(
    permissions.map((p) =>
      prisma.rolePermission.upsert({
        where: { roleId_permissionId: { roleId: idAdminRole.id, permissionId: p.id } },
        create: { roleId: idAdminRole.id, permissionId: p.id },
        update: {},
      }),
    ),
  );

  const idAdmin = await prisma.user.upsert({
    where: { tenantId_email: { tenantId: idTenant.id, email: 'admin@baitussalam.co.id' } },
    create: {
      tenantId: idTenant.id,
      email: 'admin@baitussalam.co.id',
      passwordHash,
      firstName: 'Budi',
      lastName: 'Santoso',
      status: UserStatus.ACTIVE,
      emailVerifiedAt: new Date(),
      locale: 'id',
      timezone: 'Asia/Jakarta',
    },
    update: { status: UserStatus.ACTIVE },
  });

  await prisma.userRole.upsert({
    where: { userId_roleId: { userId: idAdmin.id, roleId: idAdminRole.id } },
    create: { userId: idAdmin.id, roleId: idAdminRole.id },
    update: {},
  });

  // Indonesian Pilgrims
  const idPilgrims = [
    { firstNameEn: 'Hendra', lastNameEn: 'Wijaya', gender: Gender.MALE, phone: '+6281311111111', priorUmrahCount: 0 },
    { firstNameEn: 'Dewi', lastNameEn: 'Kusuma', gender: Gender.FEMALE, phone: '+6281322222222', priorUmrahCount: 1 },
    { firstNameEn: 'Rizki', lastNameEn: 'Pratama', gender: Gender.MALE, phone: '+6281333333333', priorUmrahCount: 0 },
    { firstNameEn: 'Nurul', lastNameEn: 'Hikmah', gender: Gender.FEMALE, phone: '+6281344444444', priorUmrahCount: 2 },
    { firstNameEn: 'Agus', lastNameEn: 'Setiawan', gender: Gender.MALE, phone: '+6281355555555', priorUmrahCount: 0 },
  ];

  const idPilgrimsIds: string[] = [];
  for (const pilgrimData of idPilgrims) {
    const pilgrim = await ensurePilgrim({
        tenantId: idTenant.id,
        status: PilgrimStatus.VISA_PENDING,
        nationality: 'ID',
        country: 'ID',
        dateOfBirth: new Date('1988-07-20'),
        preferredLanguage: 'id',
        ...pilgrimData,
    });
    idPilgrimsIds.push(pilgrim.id);
  }

  // Indonesian Package
  const idPackage = await ensurePackage({
      tenantId: idTenant.id,
      name: 'Paket Umrah Ekonomi Ramadhan 1447H',
      tier: 'ECONOMY',
      tripType: 'UMRAH',
      durationDays: 12,
      departureDate: new Date('2026-03-05'),
      returnDate: new Date('2026-03-17'),
      basePriceCents: BigInt(3500000000),  // 35,000,000 IDR
      currency: 'IDR',
      maxCapacity: 30,
      bookedCount: 5,
      includes: { visa: true, flight: true, hotel_makkah: true, hotel_madinah: true, transport: true, meals: false, guide: true },
      isPublished: true,
      createdBy: idAdmin.id,
  });

  await ensureBooking({
      tenantId: idTenant.id,
      bookingRef: 'UC-2026-00002',
      packageId: idPackage.id,
      status: BookingStatus.VISA_PROCESSING,
      totalAmountCents: BigInt(17500000000),  // 5 × 35,000,000 IDR
      paidAmountCents: BigInt(17500000000),   // Fully paid
      currency: 'IDR',
      departureDate: new Date('2026-03-05'),
      returnDate: new Date('2026-03-17'),
      createdBy: idAdmin.id,
  }, idPilgrimsIds, idPackage.basePriceCents);

  console.log(`   ✓ Tenant: ${idTenant.slug} | Admin: admin@baitussalam.co.id | Password: Admin@1234\n`);

  // ================================================================
  // 4. TENANT: Pakistani Operator — Kaaba Travel
  // ================================================================
  console.log('🇵🇰 Creating Pakistani Operator — Kaaba Travel...');
  const pkTenant = await prisma.tenant.upsert({
    where: { slug: 'kaaba-travel-pk' },
    create: {
      slug: 'kaaba-travel-pk',
      name: 'Kaaba Travel & Tours Pvt Ltd',
      type: TenantType.OPERATOR,
      status: TenantStatus.ACTIVE,
      tier: TenantTier.STARTER,
      email: 'admin@kaabatravel.pk',
      phone: '+922112345678',
      country: 'PK',
      licenseNumber: 'PK-TOUR-2024-456',
      licenseCountry: 'PK',
      timezone: 'Asia/Karachi',
      locale: 'ur',
      currency: 'PKR',
      settings: { features: ['crm', 'booking', 'social'] },
    },
    update: { status: TenantStatus.ACTIVE },
  });

  const pkAdminRole = await prisma.role.upsert({
    where: { tenantId_name: { tenantId: pkTenant.id, name: 'Operator Admin' } },
    create: {
      tenantId: pkTenant.id,
      name: 'Operator Admin',
      description: 'Full access to all operator features',
      isSystem: true,
    },
    update: {},
  });

  await Promise.all(
    permissions.map((p) =>
      prisma.rolePermission.upsert({
        where: { roleId_permissionId: { roleId: pkAdminRole.id, permissionId: p.id } },
        create: { roleId: pkAdminRole.id, permissionId: p.id },
        update: {},
      }),
    ),
  );

  const pkAdmin = await prisma.user.upsert({
    where: { tenantId_email: { tenantId: pkTenant.id, email: 'admin@kaabatravel.pk' } },
    create: {
      tenantId: pkTenant.id,
      email: 'admin@kaabatravel.pk',
      passwordHash,
      firstName: 'Imran',
      lastName: 'Khan',
      status: UserStatus.ACTIVE,
      emailVerifiedAt: new Date(),
      locale: 'ur',
      timezone: 'Asia/Karachi',
    },
    update: { status: UserStatus.ACTIVE },
  });

  await prisma.userRole.upsert({
    where: { userId_roleId: { userId: pkAdmin.id, roleId: pkAdminRole.id } },
    create: { userId: pkAdmin.id, roleId: pkAdminRole.id },
    update: {},
  });

  // Pakistani Pilgrims
  const pkPilgrims = [
    { firstNameEn: 'Tariq', lastNameEn: 'Mahmood', gender: Gender.MALE, phone: '+923211111111', priorUmrahCount: 1 },
    { firstNameEn: 'Zara', lastNameEn: 'Ahmed', gender: Gender.FEMALE, phone: '+923222222222', priorUmrahCount: 0 },
    { firstNameEn: 'Asad', lastNameEn: 'Ali', gender: Gender.MALE, phone: '+923233333333', priorUmrahCount: 3 },
    { firstNameEn: 'Nadia', lastNameEn: 'Iqbal', gender: Gender.FEMALE, phone: '+923244444444', priorUmrahCount: 0 },
    { firstNameEn: 'Hassan', lastNameEn: 'Raza', gender: Gender.MALE, phone: '+923255555555', priorUmrahCount: 2 },
  ];

  const pkPilgrimsIds: string[] = [];
  for (const pilgrimData of pkPilgrims) {
    const pilgrim = await ensurePilgrim({
        tenantId: pkTenant.id,
        // In the partially paid booking below, so BOOKED (PROSPECT contradicted the booking — AUD-028).
        status: PilgrimStatus.BOOKED,
        nationality: 'PK',
        country: 'PK',
        dateOfBirth: new Date('1990-11-05'),
        preferredLanguage: 'ur',
        ...pilgrimData,
    });
    pkPilgrimsIds.push(pilgrim.id);
  }

  // Pakistani Package
  const pkPackage = await ensurePackage({
      tenantId: pkTenant.id,
      name: 'Standard Umrah Package 2026',
      tier: 'STANDARD',
      tripType: 'UMRAH',
      durationDays: 10,
      departureDate: new Date('2026-04-01'),
      returnDate: new Date('2026-04-11'),
      basePriceCents: BigInt(30000000),  // 300,000 PKR
      currency: 'PKR',
      maxCapacity: 25,
      bookedCount: 5,
      includes: { visa: true, flight: true, hotel_makkah: true, hotel_madinah: false, transport: true, meals: false, guide: false },
      isPublished: true,
      createdBy: pkAdmin.id,
  });

  await ensureBooking({
      tenantId: pkTenant.id,
      bookingRef: 'UC-2026-00003',
      packageId: pkPackage.id,
      status: BookingStatus.PARTIALLY_PAID,
      totalAmountCents: BigInt(150000000),  // 5 × 300,000 PKR
      paidAmountCents: BigInt(75000000),    // 50% paid
      currency: 'PKR',
      departureDate: new Date('2026-04-01'),
      returnDate: new Date('2026-04-11'),
      createdBy: pkAdmin.id,
  }, pkPilgrimsIds, pkPackage.basePriceCents);

  console.log(`   ✓ Tenant: ${pkTenant.slug} | Admin: admin@kaabatravel.pk | Password: Admin@1234\n`);

  // ================================================================
  // 5. SOCIAL — seed public posts from all 3 operators
  // ================================================================
  console.log('📱 Seeding social feed posts...');

  // Create social accounts for each admin
  const ksaSocialAccount = await prisma.socialAccount.upsert({
    where: { userId: ksaAdmin.id },
    create: {
      userId: ksaAdmin.id,
      type: 'OPERATOR' as any,
      displayName: 'Al-Haramain Ground Services',
      bio: 'Licensed Saudi Mu\'assasa providing premium Umrah ground services. 20+ years experience.',
      isVerified: true,
      verifiedBadge: 'mu_assasa',
    },
    update: {},
  });

  const idSocialAccount = await prisma.socialAccount.upsert({
    where: { userId: idAdmin.id },
    create: {
      userId: idAdmin.id,
      type: 'OPERATOR' as any,
      displayName: 'PT Baitussalam Tours',
      bio: 'PPIU terpercaya dari Jakarta. Melayani jemaah umrah Indonesia sejak 2005.',
      isVerified: true,
      verifiedBadge: 'operator',
    },
    update: {},
  });

  const pkSocialAccount = await prisma.socialAccount.upsert({
    where: { userId: pkAdmin.id },
    create: {
      userId: pkAdmin.id,
      type: 'OPERATOR' as any,
      displayName: 'Kaaba Travel & Tours',
      bio: 'Pakistan\'s trusted Umrah operator. Serving pilgrims from Karachi since 2010.',
      isVerified: false,
    },
    update: {},
  });

  // Seed posts
  // Posts have no natural unique key, so each is created only if the same author has not posted it yet.
  const seedPosts: Prisma.PostUncheckedCreateInput[] = [
      {
        authorId: ksaSocialAccount.id,
        type: 'OFFER' as any,
        visibility: 'PUBLIC' as any,
        moderationStatus: 'APPROVED' as any,
        body: '🕋 Special Ramadan 2026 package available! VIP rooms at 200m from Haram. Limited to 40 pilgrims. Full ground services included. Contact us for group rates.',
        structuredData: {
          price: 8500,
          currency: 'SAR',
          deadline: '2026-02-15',
          services: ['hotel', 'transport', 'meals', 'mutawif'],
        },
        tags: ['ramadan', 'vip', 'umrah2026', 'makkah'],
        language: 'en',
        sourceCountry: 'SA',
        expiresAt: new Date('2026-02-15'),
      },
      {
        authorId: idSocialAccount.id,
        type: 'GUIDELINE' as any,
        visibility: 'PUBLIC' as any,
        moderationStatus: 'APPROVED' as any,
        body: '📋 UPDATE: Kemenag telah merilis regulasi terbaru untuk PPIU 2026. Semua operator wajib mendaftarkan jamaah melalui SISKOPATUH v3.0 paling lambat 30 Januari 2026. Download panduan lengkapnya di bawah.',
        tags: ['kemenag', 'siskopatuh', 'regulasi2026', 'ppiu'],
        language: 'id',
        sourceCountry: 'ID',
      },
      {
        authorId: pkSocialAccount.id,
        type: 'QUESTION' as any,
        visibility: 'PUBLIC' as any,
        moderationStatus: 'APPROVED' as any,
        body: 'Assalamualaikum. Can any experienced operator advise on the best Madinah hotels within 500m of Masjid Nabawi for a group of 25? Budget is around 250 SAR/night. JazakAllah Khair.',
        tags: ['madinah', 'hotels', 'advice', 'pakistan'],
        language: 'en',
        sourceCountry: 'PK',
      },
      {
        authorId: ksaSocialAccount.id,
        type: 'PARTNERSHIP' as any,
        visibility: 'PUBLIC' as any,
        moderationStatus: 'APPROVED' as any,
        body: '🤝 Seeking partnership with Indonesian PPIU operators for Hajj 1447H. We offer: Mina camp allocation, Arafat transport coordination, Tasreeh permits handling. Contact us for B2B rates.',
        structuredData: {
          partnerType: 'B2B',
          services: ['mina_camp', 'arafat_transport', 'tasreeh'],
          capacity: 200,
        },
        tags: ['hajj1447', 'b2b', 'partnership', 'indonesia', 'saudi'],
        language: 'en',
        sourceCountry: 'SA',
      },
      {
        authorId: idSocialAccount.id,
        type: 'UPDATE' as any,
        visibility: 'PUBLIC' as any,
        moderationStatus: 'APPROVED' as any,
        body: 'Alhamdulillah! Grup kedua Baitussalam telah tiba dengan selamat di Madinah. 28 jamaah siap melaksanakan Arbain di Masjid Nabawi. Semoga perjalanan ibadah mereka diterima Allah SWT. 🤲',
        tags: ['madinah', 'alhamdulillah', 'baitussalam', 'update'],
        language: 'id',
        sourceCountry: 'ID',
      },
  ];
  for (const post of seedPosts) {
    const exists = await prisma.post.findFirst({ where: { authorId: post.authorId, body: post.body } });
    if (!exists) await prisma.post.create({ data: post });
  }

  // The engagement counters are denormalised copies of real rows, kept by the API on every like, share,
  // comment, save, follow and post. Seeded posts start with no reactions, comments or saves, so every counter
  // of the seeded accounts is recomputed from the rows that exist (older versions of this seed wrote invented
  // numbers such as 203 likes with no reaction behind them). Re-running converges on the same values.
  for (const account of [ksaSocialAccount, idSocialAccount, pkSocialAccount]) {
    const posts = await prisma.post.findMany({ where: { authorId: account.id }, select: { id: true } });
    for (const { id } of posts) {
      const [likeCount, shareCount, commentCount, saveCount] = await Promise.all([
        prisma.reaction.count({ where: { postId: id, type: 'LIKE' } }),
        prisma.reaction.count({ where: { postId: id, type: 'SHARE' } }),
        prisma.comment.count({ where: { postId: id, deletedAt: null } }),
        prisma.savedPost.count({ where: { postId: id } }),
      ]);
      await prisma.post.update({ where: { id }, data: { likeCount, shareCount, commentCount, saveCount } });
    }
    const [postCount, followerCount, followingCount] = await Promise.all([
      prisma.post.count({ where: { authorId: account.id, deletedAt: null } }),
      prisma.follow.count({ where: { followedId: account.id } }),
      prisma.follow.count({ where: { followerId: account.id } }),
    ]);
    await prisma.socialAccount.update({ where: { id: account.id }, data: { postCount, followerCount, followingCount } });
  }

  console.log('   ✓ Social feed posts seeded (engagement counters match their rows)\n');

  // ================================================================
  // SUMMARY
  // ================================================================
  console.log('═══════════════════════════════════════════════════════');
  console.log('✅  Seed complete! Local dev credentials:');
  console.log('═══════════════════════════════════════════════════════');
  console.log('');
  console.log('🕋  KSA Mu\'assasa:');
  console.log(`    URL:      http://localhost:3000/login`);
  console.log(`    Slug:     al-haramain-ksa`);
  console.log(`    Email:    admin@alharamain.sa`);
  console.log(`    Password: Admin@1234`);
  console.log('');
  console.log('🇮🇩  Indonesian PPIU:');
  console.log(`    Slug:     baitussalam-id`);
  console.log(`    Email:    admin@baitussalam.co.id`);
  console.log(`    Password: Admin@1234`);
  console.log('');
  console.log('🇵🇰  Pakistani Operator:');
  console.log(`    Slug:     kaaba-travel-pk`);
  console.log(`    Email:    admin@kaabatravel.pk`);
  console.log(`    Password: Admin@1234`);
  console.log('');
  console.log('📚  API Swagger:  http://localhost:4000/api/docs');
  console.log('🌐  Web App:      http://localhost:3000');
  console.log('═══════════════════════════════════════════════════════');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

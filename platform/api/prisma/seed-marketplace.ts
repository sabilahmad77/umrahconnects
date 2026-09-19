/**
 * FIX-05 / F9 — demo marketplace supply seed (idempotent, converging).
 * Seeds a small, clearly-labelled DEMO set of sellers + listings. Each seller belongs to a PROVIDER
 * organization of its own type (hotel company, transport company, visa agency) — not to the operator
 * `al-haramain-ksa`, which older versions of this seed used for every seller.
 *
 * Run as the database owner (seeds use a bare PrismaClient; docs/control-tower/RLS.md):
 *   DATABASE_URL="$MIGRATE_DATABASE_URL" npx ts-node prisma/seed-marketplace.ts
 * Safe to re-run: provider organizations are upserted by slug (same values as prisma/scripts/seed-demo-roles.ts
 * and seed-isolation-pairs.ts), sellers and listings are matched by name, and a second run changes nothing.
 * A seller left under al-haramain-ksa by an older run is moved to its provider organization; if it already has
 * marketplace history (bookings, inquiries, quotes, offers, ratings — whose payments name the organization that
 * took them), it stays where it is, is DELISTED (no longer public) and the provider organization gets its own.
 *
 * NOTE: DEMO data, not real provider content. Real/production marketplace onboarding is a business decision
 * (see COMPLETION_REPORT).
 */
import { PrismaClient, TenantType } from '@prisma/client';

const prisma = new PrismaClient();

const LEGACY_OWNER_SLUG = 'al-haramain-ksa';

/** Provider organizations the demo sellers belong to (created if missing, exactly as the demo scripts do). */
const PROVIDERS: Record<string, { name: string; type: TenantType }> = {
  'makkah-grand-hotels': { name: 'Makkah Grand Hotels (demo)', type: 'VENDOR_HOTEL' },
  'madinah-comfort-hotels-b': { name: 'Madinah Comfort Hotels B (demo)', type: 'VENDOR_HOTEL' },
  'haramain-transport': { name: 'Haramain Transport Co. (demo)', type: 'VENDOR_TRANSPORT' },
  'nusuk-visa-partners-b': { name: 'Nusuk Visa Partners B (demo)', type: 'VENDOR_VISA' },
};

const VENDORS: { name: string; provider: keyof typeof PROVIDERS; city: string; email: string }[] = [
  { name: 'Makkah Grand Hotels', provider: 'makkah-grand-hotels', city: 'Makkah', email: 'sales@makkahgrand.demo' },
  { name: 'Madinah Comfort Stays', provider: 'madinah-comfort-hotels-b', city: 'Madinah', email: 'book@madinahcomfort.demo' },
  { name: 'Haramain Transport Co', provider: 'haramain-transport', city: 'Jeddah', email: 'ops@haramaintransport.demo' },
  { name: 'Nusuk Visa Partners', provider: 'nusuk-visa-partners-b', city: 'Riyadh', email: 'visa@nusukpartners.demo' },
];

const LISTINGS = [
  { vendor: 'Makkah Grand Hotels', name: 'Deluxe Room — 200m from Haram', type: 'hotel_room', priceCents: 95000, model: 'PER_NIGHT', city: 'Makkah', description: '5-star, Kaaba-view rooms, walking distance to Masjid al-Haram.' },
  { vendor: 'Makkah Grand Hotels', name: 'Family Suite — Ramadan Special', type: 'hotel_room', priceCents: 180000, model: 'PER_NIGHT', city: 'Makkah', description: 'Spacious suites for families, includes suhoor & iftar.' },
  { vendor: 'Madinah Comfort Stays', name: 'Standard Room near Al-Masjid an-Nabawi', type: 'hotel_room', priceCents: 62000, model: 'PER_NIGHT', city: 'Madinah', description: 'Comfortable rooms 350m from the Prophet’s Mosque.' },
  { vendor: 'Haramain Transport Co', name: 'Jeddah Airport → Makkah Transfer (Private)', type: 'transport_service', priceCents: 35000, model: 'PER_TRIP', city: 'Jeddah', description: 'Private GMC/Hiace transfer, meet & greet at the airport.' },
  { vendor: 'Haramain Transport Co', name: 'Makkah ↔ Madinah Coach (per seat)', type: 'transport_service', priceCents: 9000, model: 'PER_PERSON', city: 'Makkah', description: 'Comfortable AC coach between the two holy cities.' },
  { vendor: 'Nusuk Visa Partners', name: 'Umrah Visa Processing — Nusuk', type: 'visa_service', priceCents: 30000, model: 'PER_PERSON', city: 'Riyadh', description: 'Fast Nusuk/Masar visa processing with document support.' },
];

/** True when a seller already took part in marketplace business that names its current organization. */
async function hasHistory(vendorId: string): Promise<boolean> {
  const listing = { listing: { vendorId } };
  const counts = await Promise.all([
    prisma.listingBooking.count({ where: listing }),
    prisma.listingInquiry.count({ where: listing }),
    prisma.quote.count({ where: { vendorId } }),
    prisma.requestOffer.count({ where: { vendorId } }),
    prisma.vendorRating.count({ where: { vendorId } }),
  ]);
  return counts.some((n) => n > 0);
}

async function main() {
  console.log('🛒 Seeding demo marketplace sellers under their provider organizations…');
  const legacyOwner = await prisma.tenant.findUnique({ where: { slug: LEGACY_OWNER_SLUG }, select: { id: true } });

  const providerIds: Record<string, string> = {};
  for (const [slug, p] of Object.entries(PROVIDERS)) {
    const tenant = await prisma.tenant.upsert({
      where: { slug },
      create: { slug, name: p.name, type: p.type, status: 'ACTIVE', email: `hello@${slug}.dev`, country: 'SA' },
      update: {},
    });
    providerIds[slug] = tenant.id;
  }

  const vendorByName: Record<string, string> = {};
  let moved = 0;
  let delisted = 0;
  let createdVendors = 0;
  for (const v of VENDORS) {
    const provider = PROVIDERS[v.provider];
    const tenantId = providerIds[v.provider];
    let vendor = await prisma.vendor.findFirst({ where: { tenantId, name: v.name } });
    const legacy = legacyOwner ? await prisma.vendor.findFirst({ where: { tenantId: legacyOwner.id, name: v.name } }) : null;

    if (!vendor && legacy && !(await hasHistory(legacy.id))) {
      vendor = await prisma.vendor.update({ where: { id: legacy.id }, data: { tenantId, type: provider.type } });
      moved++;
      console.log(`   → moved seller ${v.name} to ${v.provider}`);
    } else if (legacy && legacy.status !== 'DELISTED') {
      await prisma.vendor.update({ where: { id: legacy.id }, data: { status: 'DELISTED' } });
      delisted++;
      console.log(`   − delisted the old ${v.name} under ${LEGACY_OWNER_SLUG} (it has marketplace history)`);
    }
    if (!vendor) {
      vendor = await prisma.vendor.create({
        data: {
          tenantId,
          name: v.name,
          type: provider.type,
          email: v.email,
          city: v.city,
          country: 'SA',
          status: 'VERIFIED',
          kycDocuments: [],
          images: [],
          verifiedAt: new Date(),
        },
      });
      createdVendors++;
      console.log(`   + seller ${v.name} (${v.provider})`);
    }
    vendorByName[v.name] = vendor.id;
  }

  let createdListings = 0;
  for (const l of LISTINGS) {
    const exists = await prisma.listing.findFirst({ where: { name: l.name, vendorId: vendorByName[l.vendor] } });
    if (exists) continue;
    await prisma.listing.create({
      data: {
        vendorId: vendorByName[l.vendor],
        type: l.type,
        name: l.name,
        description: l.description,
        priceCents: BigInt(l.priceCents),
        currency: 'SAR',
        pricingModel: l.model,
        city: l.city,
        attributes: { city: l.city, country: 'SA', demo: true },
        imageUrls: [],
        status: 'PUBLISHED',
        isActive: true,
      },
    });
    createdListings++;
  }
  console.log(
    `   ✓ ${VENDORS.length} sellers (${createdVendors} created, ${moved} moved, ${delisted} delisted), ${createdListings} new listings.`,
  );
}

main()
  .catch((e) => {
    console.error('❌ Marketplace seed failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

/**
 * FIX-05 — demo marketplace supply seed (idempotent).
 * Seeds a small, clearly-labelled DEMO set of vendors + listings for the
 * Al-Haramain demo tenant so the marketplace and public preview render supply.
 *
 * Run:  DATABASE_URL=... npx ts-node prisma/seed-marketplace.ts
 * Safe to re-run — skips vendors/listings that already exist by name.
 *
 * NOTE: DEMO data, not real provider content. Real/production marketplace
 * onboarding is a business decision (see COMPLETION_REPORT).
 */
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

const TENANT_SLUG = 'al-haramain-ksa';

const VENDORS = [
  { name: 'Makkah Grand Hotels', type: 'VENDOR_HOTEL', city: 'Makkah', email: 'sales@makkahgrand.demo' },
  { name: 'Madinah Comfort Stays', type: 'VENDOR_HOTEL', city: 'Madinah', email: 'book@madinahcomfort.demo' },
  { name: 'Haramain Transport Co', type: 'VENDOR_TRANSPORT', city: 'Jeddah', email: 'ops@haramaintransport.demo' },
  { name: 'Nusuk Visa Partners', type: 'VENDOR_VISA', city: 'Riyadh', email: 'visa@nusukpartners.demo' },
];

const LISTINGS = [
  { vendor: 'Makkah Grand Hotels', name: 'Deluxe Room — 200m from Haram', type: 'hotel_room', priceCents: 95000, model: 'PER_NIGHT', city: 'Makkah', description: '5-star, Kaaba-view rooms, walking distance to Masjid al-Haram.' },
  { vendor: 'Makkah Grand Hotels', name: 'Family Suite — Ramadan Special', type: 'hotel_room', priceCents: 180000, model: 'PER_NIGHT', city: 'Makkah', description: 'Spacious suites for families, includes suhoor & iftar.' },
  { vendor: 'Madinah Comfort Stays', name: 'Standard Room near Al-Masjid an-Nabawi', type: 'hotel_room', priceCents: 62000, model: 'PER_NIGHT', city: 'Madinah', description: 'Comfortable rooms 350m from the Prophet’s Mosque.' },
  { vendor: 'Haramain Transport Co', name: 'Jeddah Airport → Makkah Transfer (Private)', type: 'transport_service', priceCents: 35000, model: 'PER_TRIP', city: 'Jeddah', description: 'Private GMC/Hiace transfer, meet & greet at the airport.' },
  { vendor: 'Haramain Transport Co', name: 'Makkah ↔ Madinah Coach (per seat)', type: 'transport_service', priceCents: 9000, model: 'PER_PERSON', city: 'Makkah', description: 'Comfortable AC coach between the two holy cities.' },
  { vendor: 'Nusuk Visa Partners', name: 'Umrah Visa Processing — Nusuk', type: 'visa_service', priceCents: 30000, model: 'PER_PERSON', city: 'Riyadh', description: 'Fast Nusuk/Masar visa processing with document support.' },
];

async function main() {
  const tenant = await prisma.tenant.findUnique({ where: { slug: TENANT_SLUG } });
  if (!tenant) { console.error(`Tenant ${TENANT_SLUG} not found — run the main seed first.`); return; }
  console.log(`🛒 Seeding demo marketplace for ${tenant.name}…`);

  const vendorByName: Record<string, string> = {};
  for (const v of VENDORS) {
    let vendor = await prisma.vendor.findFirst({ where: { tenantId: tenant.id, name: v.name } });
    if (!vendor) {
      vendor = await prisma.vendor.create({
        data: {
          tenantId: tenant.id, name: v.name, type: v.type as any, email: v.email,
          city: v.city, country: 'SA', status: 'VERIFIED' as any, kycDocuments: [], images: [],
          verifiedAt: new Date(),
        },
      });
      console.log(`   + vendor ${v.name}`);
    }
    vendorByName[v.name] = vendor.id;
  }

  let created = 0;
  for (const l of LISTINGS) {
    const exists = await prisma.listing.findFirst({ where: { name: l.name, vendorId: vendorByName[l.vendor] } }).catch(() => null);
    if (exists) continue;
    await prisma.listing.create({
      data: {
        vendorId: vendorByName[l.vendor],
        type: l.type as any,
        name: l.name,
        description: l.description,
        priceCents: BigInt(l.priceCents),
        currency: 'SAR',
        pricingModel: l.model as any,
        attributes: { city: l.city, country: 'SA', demo: true },
        imageUrls: [],
        status: 'PUBLISHED' as any,
        isActive: true,
      } as any,
    }).then(() => created++).catch((e) => console.warn(`   ! ${l.name}: ${String(e.message).slice(0, 90)}`));
  }
  console.log(`   ✓ ${Object.keys(vendorByName).length} vendors, ${created} new listings seeded.`);
}

main().catch(console.error).finally(() => prisma.$disconnect());

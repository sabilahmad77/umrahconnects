/**
 * DEVELOPMENT ONLY — the "B side" of every tenant type, so tenant-isolation and
 * cross-tenant authorization can be proven with two genuine organizations per
 * role rather than with one organization and an assumption.
 *
 * `seed-demo-roles.ts` gives one real account per role (the "A side"). This
 * script adds a second, unrelated organization for hotel, transport and visa,
 * plus a second traveler in the shared community organization, so probes like
 * "Hotel A reads Hotel B's property" have something real to fail against.
 *
 * Idempotent. Refuses to run with NODE_ENV=production.
 *
 * Password: DEMO_PASSWORD (default: the documented local password Admin@1234).
 */
import * as bcrypt from 'bcryptjs';
import { TenantType } from '@prisma/client';
import { withAppContext } from './app-context';
import { PrismaService } from '../../src/prisma/prisma.service';
import { RbacService } from '../../src/modules/rbac/rbac.service';
import { COMMUNITY_TENANT_SLUG, RoleCode } from '../../src/modules/rbac/catalog';

if (process.env.NODE_ENV === 'production') {
  console.error('seed-isolation-pairs refuses to run in production');
  process.exit(1);
}

const PASSWORD = process.env.DEMO_PASSWORD ?? 'Admin@1234';

const ORGS: { slug: string; name: string; type: TenantType; country: string }[] = [
  { slug: 'madinah-comfort-hotels-b', name: 'Madinah Comfort Hotels B (demo)', type: 'VENDOR_HOTEL', country: 'SA' },
  { slug: 'jeddah-coach-transport-b', name: 'Jeddah Coach Transport B (demo)', type: 'VENDOR_TRANSPORT', country: 'SA' },
  { slug: 'nusuk-visa-partners-b', name: 'Nusuk Visa Partners B (demo)', type: 'VENDOR_VISA', country: 'SA' },
];

const ACCOUNTS: { email: string; org: string; role: RoleCode; first: string; last: string }[] = [
  { email: 'hotel.b@madinahcomfort.dev', org: 'madinah-comfort-hotels-b', role: 'HOTEL_MANAGER', first: 'Hana', last: 'HotelB' },
  { email: 'transport.b@jeddahcoach.dev', org: 'jeddah-coach-transport-b', role: 'TRANSPORT_MANAGER', first: 'Tamer', last: 'TransportB' },
  { email: 'visa.b@nusukvisa.dev', org: 'nusuk-visa-partners-b', role: 'VISA_OFFICER', first: 'Nadia', last: 'VisaB' },
  { email: 'traveler.b@umrahconnect.dev', org: COMMUNITY_TENANT_SLUG, role: 'PILGRIM', first: 'Bilal', last: 'TravelerB' },
];

withAppContext(async (app) => {
  const prisma = app.get(PrismaService);
  const rbac = app.get(RbacService);
  const hash = await bcrypt.hash(PASSWORD, 12);

  for (const o of ORGS) {
    await prisma.tenant.upsert({
      where: { slug: o.slug },
      create: { slug: o.slug, name: o.name, type: o.type, status: 'ACTIVE', email: `hello@${o.slug}.dev`, country: o.country },
      update: {},
    });
  }

  for (const a of ACCOUNTS) {
    const tenant = await prisma.tenant.findUnique({ where: { slug: a.org } });
    if (!tenant) {
      console.warn(`skip ${a.email}: organization ${a.org} not found (run seed-demo-roles first)`);
      continue;
    }
    const existing = await prisma.user.findFirst({ where: { tenantId: tenant.id, email: a.email } });
    const user = existing
      ? await prisma.user.update({ where: { id: existing.id }, data: { status: 'ACTIVE', emailVerifiedAt: existing.emailVerifiedAt ?? new Date() } })
      : await prisma.user.create({
          data: {
            tenantId: tenant.id, email: a.email, passwordHash: hash, firstName: a.first, lastName: a.last,
            status: 'ACTIVE', emailVerifiedAt: new Date(),
          },
        });
    await rbac.grantSystemRole(user.id, a.role);
    console.log(`${a.role.padEnd(18)} ${a.email}`);
  }
  console.log('Isolation-pair accounts ready (password: the documented local default unless DEMO_PASSWORD is set).');
}).catch((err) => {
  console.error(err);
  process.exit(1);
});

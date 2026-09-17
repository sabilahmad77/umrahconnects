/**
 * DEVELOPMENT ONLY — one real account per role so every dashboard can be
 * exercised with genuine server-side permissions (no client-side persona
 * switching). Idempotent. Refuses to run with NODE_ENV=production.
 *
 * Password: DEMO_PASSWORD (default: the documented local password Admin@1234).
 */
import * as bcrypt from 'bcryptjs';
import { TenantType } from '@prisma/client';
import { withAppContext } from './app-context';
import { PrismaService } from '../../src/prisma/prisma.service';
import { RbacService } from '../../src/modules/rbac/rbac.service';
import { COMMUNITY_TENANT_SLUG, PLATFORM_TENANT_SLUG, RoleCode } from '../../src/modules/rbac/catalog';

if (process.env.NODE_ENV === 'production') {
  console.error('seed-demo-roles refuses to run in production');
  process.exit(1);
}

const PASSWORD = process.env.DEMO_PASSWORD ?? 'Admin@1234';

const ORGS: { slug: string; name: string; type: TenantType; country: string }[] = [
  { slug: PLATFORM_TENANT_SLUG, name: 'Umrah Connect Platform', type: 'PLATFORM', country: 'SA' },
  { slug: COMMUNITY_TENANT_SLUG, name: 'Umrah Connect Travelers', type: 'OPERATOR', country: 'SA' },
  { slug: 'makkah-grand-hotels', name: 'Makkah Grand Hotels (demo)', type: 'VENDOR_HOTEL', country: 'SA' },
  { slug: 'haramain-transport', name: 'Haramain Transport Co. (demo)', type: 'VENDOR_TRANSPORT', country: 'SA' },
  { slug: 'fastvisa-agency', name: 'FastVisa Agency (demo)', type: 'VENDOR_VISA', country: 'SA' },
];

const ACCOUNTS: { email: string; org: string; role: RoleCode; first: string; last: string }[] = [
  { email: 'superadmin@umrahconnect.dev', org: PLATFORM_TENANT_SLUG, role: 'SUPER_ADMIN', first: 'Super', last: 'Admin' },
  { email: 'admin@alharamain.sa', org: 'al-haramain-ksa', role: 'OPERATOR_ADMIN', first: 'Ahmad', last: 'Al-Harbi' },
  { email: 'staff@alharamain.sa', org: 'al-haramain-ksa', role: 'OPERATOR_STAFF', first: 'Sara', last: 'Operations' },
  { email: 'finance@alharamain.sa', org: 'al-haramain-ksa', role: 'FINANCE_MANAGER', first: 'Faisal', last: 'Finance' },
  { email: 'visa.officer@alharamain.sa', org: 'al-haramain-ksa', role: 'VISA_OFFICER', first: 'Visa', last: 'Officer' },
  { email: 'hotel@makkahgrand.dev', org: 'makkah-grand-hotels', role: 'HOTEL_MANAGER', first: 'Huda', last: 'Hotel' },
  { email: 'transport@haramaintransport.dev', org: 'haramain-transport', role: 'TRANSPORT_MANAGER', first: 'Tariq', last: 'Transport' },
  { email: 'visa@fastvisa.dev', org: 'fastvisa-agency', role: 'VISA_OFFICER', first: 'Vera', last: 'Visa' },
  { email: 'traveler@umrahconnect.dev', org: COMMUNITY_TENANT_SLUG, role: 'PILGRIM', first: 'Yusuf', last: 'Traveler' },
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
      console.warn(`skip ${a.email}: organization ${a.org} not found (run the main seed first)`);
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
  console.log(`Demo role accounts ready (password: ${process.env.DEMO_PASSWORD ? 'DEMO_PASSWORD' : 'documented local default'}).`);
}).catch((err) => {
  console.error(err);
  process.exit(1);
});

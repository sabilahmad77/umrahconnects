/**
 * Idempotent RBAC data migration:
 *  - syncs the capability catalogue and system roles (via app bootstrap);
 *  - holders of legacy per-organization "Operator Admin" roles also receive the
 *    global OPERATOR_ADMIN system role (legacy rows are kept; they are
 *    tenant-scoped and can never carry platform capabilities);
 *  - the community (traveler) organization's users without a role become Travelers.
 *
 * Usage: pnpm --filter @umrah-connects/api exec ts-node prisma/scripts/sync-rbac.ts
 */
import { withAppContext } from './app-context';
import { PrismaService } from '../../src/prisma/prisma.service';
import { RbacService } from '../../src/modules/rbac/rbac.service';
import { COMMUNITY_TENANT_SLUG } from '../../src/modules/rbac/catalog';

withAppContext(async (app) => {
  const prisma = app.get(PrismaService);
  const rbac = app.get(RbacService);

  const legacyHolders = await prisma.userRole.findMany({
    where: { role: { name: 'Operator Admin', tenantId: { not: null } } },
    include: { user: { include: { tenant: true } } },
  });
  let operators = 0;
  for (const h of legacyHolders) {
    if (h.user.tenant.type === 'PLATFORM' || h.user.tenant.slug === COMMUNITY_TENANT_SLUG) continue;
    await rbac.grantSystemRole(h.userId, 'OPERATOR_ADMIN');
    operators++;
  }

  const community = await prisma.tenant.findUnique({ where: { slug: COMMUNITY_TENANT_SLUG } });
  let travelers = 0;
  if (community) {
    const roleless = await prisma.user.findMany({ where: { tenantId: community.id, userRoles: { none: {} }, deletedAt: null } });
    for (const u of roleless) {
      await rbac.grantSystemRole(u.id, 'PILGRIM');
      travelers++;
    }
  }
  console.log(`RBAC synced. OPERATOR_ADMIN granted to ${operators} legacy admin(s); ${travelers} traveler(s) received PILGRIM.`);
}).catch((err) => {
  console.error(err);
  process.exit(1);
});

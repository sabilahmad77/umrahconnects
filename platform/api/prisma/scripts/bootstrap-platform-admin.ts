/**
 * Creates (or repairs) the platform organization and one Super Admin account.
 * Production-safe: no default password; the password is read from the
 * environment, must be strong, and is never printed.
 *
 *   PLATFORM_ADMIN_EMAIL=ops@umrahconnect.io \
 *   PLATFORM_ADMIN_PASSWORD='<strong secret>' \
 *   pnpm --filter @umrah-connects/api exec ts-node prisma/scripts/bootstrap-platform-admin.ts
 *
 * Running it again for an existing account does NOT change its password unless
 * PLATFORM_ADMIN_RESET_PASSWORD=true.
 */
import * as bcrypt from 'bcryptjs';
import { withAppContext } from './app-context';
import { PrismaService } from '../../src/prisma/prisma.service';
import { RbacService } from '../../src/modules/rbac/rbac.service';
import { PLATFORM_TENANT_SLUG } from '../../src/modules/rbac/catalog';

const email = (process.env.PLATFORM_ADMIN_EMAIL ?? '').trim().toLowerCase();
const password = process.env.PLATFORM_ADMIN_PASSWORD ?? '';

function strong(p: string) {
  return p.length >= 14 && /[a-z]/.test(p) && /[A-Z]/.test(p) && /\d/.test(p) && /[^A-Za-z0-9]/.test(p);
}

if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
  console.error('PLATFORM_ADMIN_EMAIL is required');
  process.exit(1);
}

withAppContext(async (app) => {
  const prisma = app.get(PrismaService);
  const rbac = app.get(RbacService);

  const platform = await prisma.tenant.upsert({
    where: { slug: PLATFORM_TENANT_SLUG },
    create: { slug: PLATFORM_TENANT_SLUG, name: 'Umrah Connect Platform', type: 'PLATFORM', status: 'ACTIVE', email, country: 'SA' },
    update: { type: 'PLATFORM', status: 'ACTIVE', deletedAt: null },
  });

  let user = await prisma.user.findFirst({ where: { tenantId: platform.id, email } });
  const reset = process.env.PLATFORM_ADMIN_RESET_PASSWORD === 'true';
  if (!user || reset) {
    if (!strong(password)) {
      throw new Error('PLATFORM_ADMIN_PASSWORD must be ≥14 chars with upper, lower, digit and symbol');
    }
    const passwordHash = await bcrypt.hash(password, 12);
    user = user
      ? await prisma.user.update({
          where: { id: user.id },
          data: { passwordHash, status: 'ACTIVE', lockedUntil: null, failedLoginCount: 0, sessionsRevokedAt: new Date() },
        })
      : await prisma.user.create({
          data: {
            tenantId: platform.id, email, passwordHash, firstName: 'Platform', lastName: 'Administrator',
            status: 'ACTIVE', emailVerifiedAt: new Date(),
          },
        });
  }
  await rbac.grantSystemRole(user.id, 'SUPER_ADMIN');
  console.log(`Super Admin ready: ${email} (platform organization ${platform.id})${reset ? ' — password reset' : ''}`);
}).catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});

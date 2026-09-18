import * as bcrypt from 'bcryptjs';
import type { Prisma, PrismaClient } from '@prisma/client';
import type { RbacService } from '../../../src/modules/rbac/rbac.service';
import { COMMUNITY_ORG, PLATFORM_ORG, QA_EMAIL_DOMAIN, QA_FIXTURE, QA_IDENTITIES, QA_ORGS, qaEmail } from './fixtures';
import { generatePassword, readCredentials, type QaCredential } from './credentials';

export interface QaOrgRef {
  id: string;
  slug: string;
  name: string;
}

export interface QaUserRef {
  id: string;
  email: string;
  tenantId: string;
  firstName: string;
  lastName: string;
}

type Db = PrismaClient | Prisma.TransactionClient;

/**
 * Fixture organizations (A/B per business type) plus the shared platform and
 * community organizations. An existing organization on a fixture slug that is
 * NOT marked as a fixture is never taken over.
 */
export async function ensureQaOrganizations(prisma: Db): Promise<Record<string, QaOrgRef>> {
  const refs: Record<string, QaOrgRef> = {};
  for (const org of QA_ORGS) {
    const existing = await prisma.tenant.findUnique({ where: { slug: org.slug } });
    const metadata = (existing?.metadata ?? {}) as Record<string, unknown>;
    if (existing && metadata.fixture !== QA_FIXTURE) {
      throw new Error(`Organization "${org.slug}" exists but is not a ${QA_FIXTURE} fixture — refusing to modify it.`);
    }
    const data = {
      name: org.name,
      type: org.type,
      status: 'ACTIVE' as const,
      email: `contact@${org.slug}.${QA_EMAIL_DOMAIN}`,
      country: org.country,
      currency: org.currency,
      timezone: org.country === 'PK' ? 'Asia/Karachi' : 'Asia/Riyadh',
      metadata: { ...metadata, fixture: QA_FIXTURE, city: org.city },
      deletedAt: null,
    };
    const row = existing
      ? await prisma.tenant.update({ where: { id: existing.id }, data })
      : await prisma.tenant.create({ data: { slug: org.slug, ...data } });
    refs[org.key] = { id: row.id, slug: row.slug, name: row.name };
  }
  // Shared system organizations (never marked as fixtures; created only if missing).
  const platform = await prisma.tenant.upsert({
    where: { slug: PLATFORM_ORG },
    create: { slug: PLATFORM_ORG, name: 'Umrah Connect Platform', type: 'PLATFORM', status: 'ACTIVE', email: 'platform@umrahconnect.io', country: 'SA' },
    update: {},
  });
  const community = await prisma.tenant.upsert({
    where: { slug: COMMUNITY_ORG },
    create: { slug: COMMUNITY_ORG, name: 'Umrah Connect Travelers', type: 'OPERATOR', status: 'ACTIVE', email: 'travelers@umrahconnect.io', country: 'SA' },
    update: {},
  });
  refs[PLATFORM_ORG] = { id: platform.id, slug: platform.slug, name: platform.name };
  refs[COMMUNITY_ORG] = { id: community.id, slug: community.slug, name: community.name };
  return refs;
}

/**
 * Creates or resets every fixture identity: right organization, exactly one
 * system role, verified or not as documented, unlocked. A password recorded in
 * the credential file is kept while it still matches; otherwise (or with
 * `rotate`) a new random one is issued.
 */
export async function ensureQaIdentities(
  prisma: PrismaClient,
  rbac: RbacService,
  orgs: Record<string, QaOrgRef>,
  opts: { credentialsPath: string; rotate?: boolean },
): Promise<{ credentials: QaCredential[]; users: Record<string, QaUserRef> }> {
  const known = opts.rotate ? new Map<string, string>() : readCredentials(opts.credentialsPath);
  const credentials: QaCredential[] = [];
  const users: Record<string, QaUserRef> = {};
  const now = new Date();

  for (const identity of QA_IDENTITIES) {
    const email = qaEmail(identity);
    const org = orgs[identity.org];
    if (!org) throw new Error(`Unknown organization "${identity.org}" for ${email}`);

    const matches = await prisma.user.findMany({ where: { email: { equals: email, mode: 'insensitive' } } });
    if (matches.length > 1) throw new Error(`${email} exists in ${matches.length} organizations — resolve by hand.`);
    const existing = matches[0];

    let password = known.get(email);
    const keep = !!(password && existing?.passwordHash && (await bcrypt.compare(password, existing.passwordHash)));
    if (!keep) password = generatePassword();
    const passwordHash = keep ? existing!.passwordHash! : await bcrypt.hash(password!, 12);

    const data = {
      tenantId: org.id,
      email,
      firstName: identity.firstName,
      lastName: identity.lastName,
      passwordHash,
      status: identity.verified ? ('ACTIVE' as const) : ('PENDING_VERIFICATION' as const),
      emailVerifiedAt: identity.verified ? (existing?.emailVerifiedAt ?? now) : null,
      lockedUntil: null,
      failedLoginCount: 0,
      deletedAt: null,
    };
    const user = existing
      ? await prisma.user.update({ where: { id: existing.id }, data })
      : await prisma.user.create({ data });

    // Exactly the documented role: anything granted while testing is removed.
    const roleId = await rbac.systemRoleId(identity.role);
    await prisma.userRole.deleteMany({ where: { userId: user.id, roleId: { not: roleId } } });
    await rbac.grantSystemRole(user.id, identity.role);

    users[identity.key] = { id: user.id, email, tenantId: org.id, firstName: identity.firstName, lastName: identity.lastName };
    credentials.push({
      key: identity.key,
      email,
      role: identity.role,
      organization: org.name,
      organizationSlug: org.slug,
      emailVerified: identity.verified,
      purpose: identity.purpose,
      password: password!,
    });
  }
  return { credentials, users };
}

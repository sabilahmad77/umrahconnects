import * as bcrypt from 'bcryptjs';
import { PrismaClient, TenantType } from '@prisma/client';
import { RbacService } from '../src/modules/rbac/rbac.service';
import { RoleCode, COMMUNITY_TENANT_SLUG, PLATFORM_TENANT_SLUG } from '../src/modules/rbac/catalog';
import { TestContext, api } from './app';

export const PASSWORD = 'Fixture-Pass-2026';

export interface Actor {
  id: string;
  email: string;
  tenantId: string;
  token: string;
  refreshToken: string;
}

export interface World {
  superAdmin: Actor;
  opA: Actor; staffA: Actor; financeA: Actor;
  opB: Actor;
  hotelA: Actor; hotelB: Actor;
  transportA: Actor; transportB: Actor;
  visaA: Actor; visaB: Actor;
  travelerA: Actor; travelerB: Actor;
  tenants: Record<string, string>;
}

let hash: string | undefined;

async function tenant(prisma: PrismaClient, slug: string, type: TenantType, status: 'ACTIVE' | 'PENDING_KYC' = 'ACTIVE') {
  return prisma.tenant.upsert({
    where: { slug },
    create: { slug, name: slug, type, status, email: `${slug}@example.test`, country: 'SA' },
    update: { status, deletedAt: null },
  });
}

async function user(ctx: TestContext, rbac: RbacService, tenantId: string, email: string, role: RoleCode): Promise<Actor> {
  hash ??= await bcrypt.hash(PASSWORD, 4);
  const u = await ctx.prisma.user.upsert({
    where: { tenantId_email: { tenantId, email } },
    create: { tenantId, email, passwordHash: hash, firstName: email.split('@')[0], lastName: 'Fixture', status: 'ACTIVE', emailVerifiedAt: new Date() },
    update: { passwordHash: hash, status: 'ACTIVE', lockedUntil: null, failedLoginCount: 0, sessionsRevokedAt: null },
  });
  // Each file starts from the fixture's own state: extra roles granted and preferences saved
  // by an earlier file (e.g. rbac grants OPERATOR_STAFF to finance@op-a) must not leak into the next.
  await ctx.prisma.userRole.deleteMany({ where: { userId: u.id } });
  await ctx.prisma.userPreference.deleteMany({ where: { userId: u.id } });
  await rbac.grantSystemRole(u.id, role);
  const res = await ctx.http().post(api('/auth/login')).send({ email, password: PASSWORD });
  if (res.status !== 200) throw new Error(`fixture login failed for ${email}: ${res.status} ${JSON.stringify(res.body)}`);
  return { id: u.id, email, tenantId, token: res.body.data.accessToken, refreshToken: res.body.data.refreshToken };
}

export async function buildWorld(ctx: TestContext): Promise<World> {
  const { prisma } = ctx;
  const rbac = ctx.app.get(RbacService);
  const t = {
    platform: await tenant(prisma, PLATFORM_TENANT_SLUG, 'PLATFORM'),
    community: await tenant(prisma, COMMUNITY_TENANT_SLUG, 'OPERATOR'),
    opA: await tenant(prisma, 'fx-operator-a', 'OPERATOR'),
    opB: await tenant(prisma, 'fx-operator-b', 'OPERATOR'),
    hotelA: await tenant(prisma, 'fx-hotel-a', 'VENDOR_HOTEL'),
    hotelB: await tenant(prisma, 'fx-hotel-b', 'VENDOR_HOTEL'),
    transportA: await tenant(prisma, 'fx-transport-a', 'VENDOR_TRANSPORT'),
    transportB: await tenant(prisma, 'fx-transport-b', 'VENDOR_TRANSPORT'),
    visaA: await tenant(prisma, 'fx-visa-a', 'VENDOR_VISA'),
    visaB: await tenant(prisma, 'fx-visa-b', 'VENDOR_VISA'),
  };
  const tenants = Object.fromEntries(Object.entries(t).map(([k, v]) => [k, v.id]));
  return {
    tenants,
    superAdmin: await user(ctx, rbac, t.platform.id, 'root@platform.test', 'SUPER_ADMIN'),
    opA: await user(ctx, rbac, t.opA.id, 'admin@op-a.test', 'OPERATOR_ADMIN'),
    staffA: await user(ctx, rbac, t.opA.id, 'staff@op-a.test', 'OPERATOR_STAFF'),
    financeA: await user(ctx, rbac, t.opA.id, 'finance@op-a.test', 'FINANCE_MANAGER'),
    opB: await user(ctx, rbac, t.opB.id, 'admin@op-b.test', 'OPERATOR_ADMIN'),
    hotelA: await user(ctx, rbac, t.hotelA.id, 'manager@hotel-a.test', 'HOTEL_MANAGER'),
    hotelB: await user(ctx, rbac, t.hotelB.id, 'manager@hotel-b.test', 'HOTEL_MANAGER'),
    transportA: await user(ctx, rbac, t.transportA.id, 'manager@transport-a.test', 'TRANSPORT_MANAGER'),
    transportB: await user(ctx, rbac, t.transportB.id, 'manager@transport-b.test', 'TRANSPORT_MANAGER'),
    visaA: await user(ctx, rbac, t.visaA.id, 'officer@visa-a.test', 'VISA_OFFICER'),
    visaB: await user(ctx, rbac, t.visaB.id, 'officer@visa-b.test', 'VISA_OFFICER'),
    travelerA: await user(ctx, rbac, t.community.id, 'traveler-a@people.test', 'PILGRIM'),
    travelerB: await user(ctx, rbac, t.community.id, 'traveler-b@people.test', 'PILGRIM'),
  };
}

export const bearer = (a: Actor) => ({ Authorization: `Bearer ${a.token}` });

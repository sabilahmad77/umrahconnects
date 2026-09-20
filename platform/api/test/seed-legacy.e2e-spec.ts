import { execFileSync } from 'child_process';
import { join } from 'path';
import { Prisma, PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * F9: the legacy demo seeds (prisma/seed.ts, prisma/seed-marketplace.ts) converge — demo sellers belong to
 * provider organizations and every social counter of the seeded accounts matches its rows — also on a
 * database an older version of the seeds already populated. They run as the owner, in a scratch database
 * next to the e2e database (created from the migrations and dropped afterwards), so the demo organizations,
 * public listings and posts they create never reach the other suites.
 */
const cwd = join(__dirname, '..');
const ownerUrl = new URL(process.env.TEST_OWNER_DATABASE_URL!);
const scratchName = `${ownerUrl.pathname.slice(1)}_seeds_test`;
const scratchUrl = new URL(ownerUrl.toString());
scratchUrl.pathname = `/${scratchName}`;

const runAsOwner = (args: string[]) =>
  execFileSync('npx', args, {
    cwd,
    env: { ...process.env, DATABASE_URL: scratchUrl.toString(), PRISMA_HIDE_UPDATE_MESSAGE: '1' },
    stdio: 'pipe',
  }).toString();
const seed = (file: string) => runAsOwner(['ts-node', '--transpile-only', `prisma/${file}`]);

describe('legacy demo seeds converge (F9)', () => {
  let admin: PrismaClient;
  let db: PrismaClient;

  beforeAll(async () => {
    admin = new PrismaClient({ datasources: { db: { url: ownerUrl.toString() } } });
    await admin.$executeRaw`DROP DATABASE IF EXISTS ${Prisma.raw(`"${scratchName}"`)} WITH (FORCE)`;
    await admin.$executeRaw`CREATE DATABASE ${Prisma.raw(`"${scratchName}"`)}`;
    runAsOwner(['prisma', 'migrate', 'deploy']);
    db = new PrismaClient({ datasources: { db: { url: scratchUrl.toString() } } });
  }, 180_000);

  afterAll(async () => {
    await db?.$disconnect();
    if (admin) {
      await admin.$executeRaw`DROP DATABASE IF EXISTS ${Prisma.raw(`"${scratchName}"`)} WITH (FORCE)`;
      await admin.$disconnect();
    }
  });

  const SELLERS = ['Makkah Grand Hotels', 'Madinah Comfort Stays', 'Haramain Transport Co', 'Nusuk Visa Partners'];
  /** The demo sellers with their organization (Vendor.tenantId has no relation, so it is looked up). */
  const sellers = async () => {
    const vendors = await db.vendor.findMany({
      where: { name: { in: SELLERS } },
      select: { id: true, name: true, status: true, type: true, tenantId: true, _count: { select: { listings: true } } },
      orderBy: [{ name: 'asc' }, { createdAt: 'asc' }],
    });
    const orgs = await db.tenant.findMany({ where: { id: { in: vendors.map((v) => v.tenantId!) } }, select: { id: true, slug: true, type: true } });
    return vendors.map((v) => ({ ...v, tenant: orgs.find((o) => o.id === v.tenantId) }));
  };
  const seededAccounts = () =>
    db.socialAccount.findMany({ where: { displayName: { in: ['Al-Haramain Ground Services', 'PT Baitussalam Tours', 'Kaaba Travel & Tours'] } } });
  /** Every stored counter of the seeded accounts and their posts next to the rows it stands for. */
  const counters = async () => {
    const out: Record<string, [number, number][]> = {};
    for (const a of await seededAccounts()) {
      const posts = await db.post.findMany({ where: { authorId: a.id }, orderBy: { createdAt: 'asc' } });
      out[a.displayName] = [
        [a.postCount, await db.post.count({ where: { authorId: a.id, deletedAt: null } })],
        [a.followerCount, await db.follow.count({ where: { followedId: a.id } })],
        [a.followingCount, await db.follow.count({ where: { followerId: a.id } })],
      ];
      for (const p of posts) {
        out[a.displayName].push(
          [p.likeCount, await db.reaction.count({ where: { postId: p.id, type: 'LIKE' } })],
          [p.shareCount, await db.reaction.count({ where: { postId: p.id, type: 'SHARE' } })],
          [p.commentCount, await db.comment.count({ where: { postId: p.id, deletedAt: null } })],
          [p.saveCount, await db.savedPost.count({ where: { postId: p.id } })],
        );
      }
    }
    return out;
  };

  it('a fresh database gets provider-owned sellers and counters that match their rows', async () => {
    seed('seed.ts');
    seed('seed-marketplace.ts');
    const rows = await sellers();
    expect(rows.map((v) => [v.name, v.tenant?.slug, v.status])).toEqual([
      ['Haramain Transport Co', 'haramain-transport', 'VERIFIED'],
      ['Madinah Comfort Stays', 'madinah-comfort-hotels-b', 'VERIFIED'],
      ['Makkah Grand Hotels', 'makkah-grand-hotels', 'VERIFIED'],
      ['Nusuk Visa Partners', 'nusuk-visa-partners-b', 'VERIFIED'],
    ]);
    for (const v of rows) {
      expect(v.tenant?.type).toBe(v.type);
      expect(v._count.listings).toBeGreaterThan(0);
    }
    const c = await counters();
    expect(Object.keys(c)).toHaveLength(3);
    for (const pairs of Object.values(c)) for (const [stored, live] of pairs) expect(stored).toBe(live);
  }, 180_000);

  it('a database an older seed populated converges, keeping a seller with history where its payments are', async () => {
    // Recreate what the old seeds left: every seller under the operator, invented engagement numbers.
    const operator = await db.tenant.findUniqueOrThrow({ where: { slug: 'al-haramain-ksa' } });
    await db.listing.deleteMany({ where: { vendor: { name: { in: SELLERS } } } });
    await db.vendor.deleteMany({ where: { name: { in: SELLERS } } });
    const legacy: Record<string, string> = {};
    for (const [name, type] of [
      ['Makkah Grand Hotels', 'VENDOR_HOTEL'],
      ['Haramain Transport Co', 'VENDOR_TRANSPORT'],
      ['Nusuk Visa Partners', 'VENDOR_VISA'],
    ] as const) {
      const v = await db.vendor.create({ data: { tenantId: operator.id, name, type, status: 'VERIFIED', country: 'SA', email: 'legacy@seller.demo' } });
      legacy[name] = v.id;
    }
    const nusukListing = await db.listing.create({
      data: { vendorId: legacy['Nusuk Visa Partners'], type: 'visa_service', name: 'Umrah Visa Processing — Nusuk', priceCents: BigInt(30000) },
    });
    const booking = await db.listingBooking.create({ data: { listingId: nusukListing.id, customerName: 'Earlier customer', totalAmountCents: BigInt(30000) } });
    const [account] = await seededAccounts();
    const liked = await db.post.findFirstOrThrow({ where: { authorId: account.id } });
    const fan = await db.socialAccount.findFirstOrThrow({ where: { NOT: { id: account.id } } });
    await db.reaction.create({ data: { accountId: fan.id, postId: liked.id, type: 'LIKE' } });
    await db.post.updateMany({ where: { authorId: account.id }, data: { likeCount: 203, commentCount: 67, shareCount: 45 } });
    await db.socialAccount.update({ where: { id: account.id }, data: { postCount: 0, followerCount: 9 } });

    seed('seed.ts');
    seed('seed-marketplace.ts');

    const rows = await sellers();
    const byOrg = (name: string) =>
      rows
        .filter((v) => v.name === name)
        .map((v) => [v.tenant?.slug, v.status])
        .sort((a, b) => String(a[0]).localeCompare(String(b[0])));
    // Moved (same seller, listings kept) when it has no history …
    expect(rows.find((v) => v.name === 'Makkah Grand Hotels')).toMatchObject({ id: legacy['Makkah Grand Hotels'], tenant: { slug: 'makkah-grand-hotels' } });
    expect(rows.find((v) => v.name === 'Haramain Transport Co')).toMatchObject({ id: legacy['Haramain Transport Co'], tenant: { slug: 'haramain-transport' } });
    // … delisted in place and replaced when it does: the booking still belongs to the listing it was made on.
    expect(byOrg('Nusuk Visa Partners')).toEqual([
      ['al-haramain-ksa', 'DELISTED'],
      ['nusuk-visa-partners-b', 'VERIFIED'],
    ]);
    expect((await db.listingBooking.findUniqueOrThrow({ where: { id: booking.id } })).listingId).toBe(nusukListing.id);
    expect(byOrg('Madinah Comfort Stays')).toEqual([['madinah-comfort-hotels-b', 'VERIFIED']]);

    const c = await counters();
    for (const pairs of Object.values(c)) for (const [stored, live] of pairs) expect(stored).toBe(live);
    expect((await db.post.findUniqueOrThrow({ where: { id: liked.id } })).likeCount).toBe(1);

    // A further run changes nothing.
    const before = JSON.stringify([await sellers(), await counters()]);
    seed('seed.ts');
    expect(seed('seed-marketplace.ts')).toContain('0 created, 0 moved, 0 delisted), 0 new listings');
    expect(JSON.stringify([await sellers(), await counters()])).toBe(before);
  }, 240_000);
});

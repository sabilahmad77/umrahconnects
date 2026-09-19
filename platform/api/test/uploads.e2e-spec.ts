import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { existsSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { randomUUID } from 'crypto';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { api, createTestApp, TestContext } from './app';
import { Actor, bearer, buildWorld, World } from './fixtures';
import { StorageService } from '../src/modules/storage/storage.service';
import { AuditService } from '../src/modules/audit/audit.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { ReferenceScanner } from '../src/modules/storage/cleanup/reference-scanner';
import { CleanupRefusedError, OrphanCleanupService } from '../src/modules/storage/cleanup/orphan-cleanup.service';

/**
 * Uploads, media ownership, private document links and the orphan cleanup job.
 * The local storage driver writes to a throw-away directory for this file only.
 */

const uniq = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(200, 7)]);
const PDF = Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.alloc(200, 0x20)]);
const DAY = 86_400_000;

describe('uploads, media ownership, document links and orphan cleanup', () => {
  let ctx: TestContext;
  let w: World;
  let root: string;
  let visaDocId: string;
  const previousDir = process.env.STORAGE_LOCAL_DIR;

  const upload = (a: Actor | null, buffer: Buffer, filename = 'photo.png', contentType = 'image/png') => {
    let req = ctx.http().post(api('/uploads'));
    if (a) req = req.set(bearer(a));
    return req.attach('file', buffer, { filename, contentType });
  };
  const uploaded = async (a: Actor) => {
    const res = await upload(a, Buffer.concat([PNG, Buffer.from(uniq())]));
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    return res.body.data as { id: string; url: string; size: number; mime: string };
  };
  const fileOf = (url: string) => join(root, url.replace('/uploads/', ''));

  beforeAll(async () => {
    root = mkdtempSync(join(tmpdir(), 'uc-uploads-e2e-'));
    process.env.STORAGE_LOCAL_DIR = root;
    ctx = await createTestApp();
    w = await buildWorld(ctx);
  });
  afterAll(async () => {
    await ctx?.close();
    if (previousDir === undefined) delete process.env.STORAGE_LOCAL_DIR;
    else process.env.STORAGE_LOCAL_DIR = previousDir;
    rmSync(root, { recursive: true, force: true });
  });

  describe('POST /uploads', () => {
    it('refuses anonymous uploads', async () => {
      expect((await upload(null, PNG)).status).toBe(401);
    });

    it('refuses oversize files with the real limit, before storing anything', async () => {
      const res = await upload(w.hotelA, Buffer.concat([PNG, Buffer.alloc(5 * 1024 * 1024)]));
      expect(res.status).toBe(413);
      expect(res.body.error.message).toBe('Images must be 5 MB or smaller');
    });

    it('decides the type by content: renamed text, HTML polyglots and PDFs are refused', async () => {
      const text = await upload(w.hotelA, Buffer.from('just some text, not an image at all'.padEnd(64)), 'fake.png');
      expect(text.status).toBe(400);
      expect(text.body.error.message).toMatch(/not an accepted type/);
      const polyglot = await upload(w.hotelA, Buffer.concat([Buffer.from('GIF89a<script>alert(1)</script>'), Buffer.alloc(64)]), 'x.gif', 'image/gif');
      expect(polyglot.status).toBe(400);
      expect((await upload(w.hotelA, PDF, 'doc.png')).status).toBe(400);
      expect((await ctx.http().post(api('/uploads')).set(bearer(w.hotelA)).send({})).status).toBe(400);
    });

    it('stores a real image, records its owner and serves it as public media', async () => {
      const media = await uploaded(w.hotelA);
      expect(media.url).toMatch(/^\/uploads\/\d{13}-[0-9a-f]{24}\.png$/);
      expect(media.mime).toBe('image/png');
      const row = await ctx.prisma.mediaObject.findUniqueOrThrow({ where: { id: media.id } });
      expect([row.ownerUserId, row.tenantId, row.url, row.deletedAt]).toEqual([w.hotelA.id, w.hotelA.tenantId, media.url, null]);
      const served = await ctx.http().get(media.url);
      expect(served.status).toBe(200);
      expect(served.headers['x-content-type-options']).toBe('nosniff');
      expect(existsSync(fileOf(media.url))).toBe(true);
    });
  });

  describe('DELETE /uploads/:id', () => {
    it('only the uploader can delete, and never while a listing shows the image', async () => {
      const media = await uploaded(w.hotelA);
      const listing = (
        await ctx.http().post(api('/marketplace/listings')).set(bearer(w.hotelA))
          .send({ title: `Media hold ${uniq()}`, category: 'hotel_room', priceCents: 10_000, imageUrls: [media.url] })
      ).body.data;
      expect(listing.imageUrls).toEqual([media.url]);

      for (const other of [w.hotelB, w.travelerA]) {
        expect((await ctx.http().delete(api(`/uploads/${media.id}`)).set(bearer(other))).status).toBe(404);
      }
      const busy = await ctx.http().delete(api(`/uploads/${media.id}`)).set(bearer(w.hotelA));
      expect(busy.status).toBe(409);
      expect(busy.body.error.message).toMatch(/still used by a marketplace listing/);
      expect(existsSync(fileOf(media.url))).toBe(true);

      await ctx.http().put(api(`/marketplace/listings/${listing.id}`)).set(bearer(w.hotelA)).send({ imageUrls: [] }).expect(200);
      const done = await ctx.http().delete(api(`/uploads/${media.id}`)).set(bearer(w.hotelA));
      expect(done.status).toBe(200);
      expect(done.body.data).toEqual({ id: media.id, deleted: true });
      expect(existsSync(fileOf(media.url))).toBe(false);
      expect((await ctx.prisma.mediaObject.findUniqueOrThrow({ where: { id: media.id } })).deletedAt).not.toBeNull();
      expect((await ctx.http().delete(api(`/uploads/${media.id}`)).set(bearer(w.hotelA))).status).toBe(404);
      expect((await ctx.http().delete(api('/uploads/not-a-uuid')).set(bearer(w.hotelA))).status).toBe(400);
    });

    it('a deleted image cannot be attached again', async () => {
      const media = await uploaded(w.hotelA);
      await ctx.http().delete(api(`/uploads/${media.id}`)).set(bearer(w.hotelA)).expect(200);
      const res = await ctx.http().post(api('/marketplace/listings')).set(bearer(w.hotelA))
        .send({ title: `Ghost ${uniq()}`, category: 'hotel_room', imageUrls: [media.url] });
      expect(res.status).toBe(400);
    });
  });

  describe('private document links', () => {
    let kycId: string;

    beforeAll(async () => {
      const visa = (await ctx.http().post(api('/compliance/visas')).set(bearer(w.opA)).send({ applicantName: `Doc owner ${uniq()}` })).body.data;
      const doc = (await ctx.http().post(api(`/compliance/visas/${visa.id}/documents`)).set(bearer(w.opA)).send({ name: 'Passport', type: 'PASSPORT' })).body.data;
      visaDocId = doc.id;
      const up = await ctx.http().post(api(`/compliance/visas/${visa.id}/documents/${doc.id}/versions`)).set(bearer(w.opA)).attach('file', PDF, 'passport.pdf');
      expect(up.status, JSON.stringify(up.body)).toBe(201);

      // A KYC submission of hotel A, created directly so hotel A's organization stays ACTIVE.
      const stored = await ctx.app.get(StorageService).put({ buffer: PDF, originalName: 'licence.pdf', prefix: `kyc/${w.tenants.hotelA}` });
      kycId = (
        await ctx.prisma.tenantKyc.create({
          data: {
            tenantId: w.tenants.hotelA,
            registrySource: 'MANUAL' as any,
            documents: [{ storageKey: stored.storageKey, driver: stored.driver, name: 'licence.pdf', mimeType: stored.mimeType }],
          },
        })
      ).id;
    });

    it('another organization cannot obtain a link to the file', async () => {
      expect((await ctx.http().get(api(`/documents/visa/${visaDocId}/url`)).set(bearer(w.opB))).status).toBe(404);
      expect((await ctx.http().get(api(`/documents/visa/${visaDocId}/url`))).status).toBe(401);
      expect((await ctx.http().get(api(`/documents/kyc/${kycId}/0/url`)).set(bearer(w.hotelB))).status).toBe(404);
      expect((await ctx.http().get(api(`/documents/kyc/${kycId}/0/url`)).set(bearer(w.travelerA))).status).toBe(404);
      const own = await ctx.http().get(api(`/documents/kyc/${kycId}/0/url`)).set(bearer(w.hotelA));
      expect(own.status).toBe(200);
      const file = await ctx.http().get(String(own.body.data.url).replace('/proxy-api', '/api/v1'));
      expect(file.status).toBe(200);
      expect(file.headers['content-disposition']).toContain('attachment');
    });

    it('a signed link works once issued, and tampered, expired or foreign tokens are refused', async () => {
      const link = (await ctx.http().get(api(`/documents/visa/${visaDocId}/url`)).set(bearer(w.opA))).body.data;
      expect(new Date(link.expiresAt).getTime() - Date.now()).toBeLessThanOrEqual(900_000);
      const path = String(link.url).replace('/proxy-api', '/api/v1');
      const token = path.split('/').pop()!;
      expect((await ctx.http().get(path)).status).toBe(200);

      const [h, p, s] = token.split('.');
      const flipped = s.slice(0, -2) + (s.endsWith('AA') ? 'BB' : 'AA');
      expect((await ctx.http().get(api(`/documents/signed/${h}.${p}.${flipped}`))).status).toBe(401);
      // Same claims, a different key: a forged signature.
      const claims = JSON.parse(Buffer.from(p, 'base64url').toString());
      const forged = await new JwtService({ secret: 'not-the-server-secret-but-long-enough-000' }).signAsync(
        { purpose: 'download', key: claims.key, name: claims.name, mime: claims.mime },
        { audience: 'umrah-connects-download', expiresIn: 300 },
      );
      expect((await ctx.http().get(api(`/documents/signed/${forged}`))).status).toBe(401);
      // A genuine server signature that has expired.
      const jwt = ctx.app.get(JwtService, { strict: false });
      const expired = await jwt.signAsync(
        { purpose: 'download', key: claims.key, name: claims.name, mime: claims.mime, exp: Math.floor(Date.now() / 1000) - 60 },
        { audience: 'umrah-connects-download' },
      );
      const gone = await ctx.http().get(api(`/documents/signed/${expired}`));
      expect(gone.status).toBe(401);
      expect(gone.body.error.message).toMatch(/invalid or has expired/);
      // An access token is not a download token.
      expect((await ctx.http().get(api(`/documents/signed/${w.opA.token}`))).status).toBe(401);
    });
  });

  describe('orphan cleanup (O04) with the local driver', () => {
    const age = (file: string, days: number) => {
      const t = new Date(Date.now() - days * DAY);
      utimesSync(file, t, t);
    };
    const cleanup = (overrides: { config?: ConfigService; scanner?: ReferenceScanner } = {}) =>
      new OrphanCleanupService(
        ctx.app.get(StorageService),
        overrides.scanner ?? new ReferenceScanner(ctx.app.get(PrismaService)),
        ctx.app.get(PrismaService),
        ctx.app.get(AuditService),
        overrides.config ?? ctx.app.get(ConfigService),
      );

    it('dry run reports, apply deletes only old unreferenced platform objects, and every deletion is audited', async () => {
      const storage = ctx.app.get(StorageService);
      const used = await uploaded(w.hotelA);
      await ctx.http().post(api('/marketplace/listings')).set(bearer(w.hotelA))
        .send({ title: `Cleanup keeper ${uniq()}`, category: 'hotel_room', imageUrls: [used.url] }).expect(201);
      // Media referenced elsewhere: a social post (CDN-style URL form), an avatar and a group document.
      const inPost = await uploaded(w.travelerA);
      const inAvatar = await uploaded(w.travelerB);
      const inGroupDoc = await uploaded(w.opA);
      const account = await ctx.prisma.socialAccount.upsert({
        where: { userId: w.travelerA.id },
        create: { userId: w.travelerA.id, type: 'PILGRIM', displayName: 'Traveler A' },
        update: {},
      });
      await ctx.prisma.post.create({
        data: { authorId: account.id, type: 'UPDATE', mediaUrls: [`https://media.example.test/media/${inPost.url.split('/').pop()}`] },
      });
      await ctx.prisma.user.update({ where: { id: w.travelerB.id }, data: { avatarUrl: inAvatar.url } });
      await ctx.prisma.groupDocument.create({
        data: { groupId: randomUUID(), uploaderId: w.opA.id, name: 'Roster', url: inGroupDoc.url },
      });
      const elsewhere = [inPost, inAvatar, inGroupDoc].map((m) => fileOf(m.url));
      for (const f of elsewhere) age(f, 10);
      const orphan = await uploaded(w.hotelA);
      const fresh = await uploaded(w.hotelA);
      const foreign = join(root, 'seed-photo.jpg');
      writeFileSync(foreign, PNG);
      const orphanDoc = await storage.put({ buffer: PDF, originalName: 'x.pdf', prefix: 'kyc/abandoned' });
      const keptDoc = await ctx.prisma.visaDocumentVersion.findFirstOrThrow({ where: { documentId: visaDocId } });
      const privateFile = (key: string) => join(root, 'private', key);
      for (const f of [fileOf(used.url), fileOf(orphan.url), foreign, privateFile(orphanDoc.storageKey), privateFile(keptDoc.storageKey!)]) age(f, 10);

      const dry = await cleanup().run({ now: new Date() });
      expect(dry.mode).toBe('dry-run');
      expect(dry.orphans.map((o) => o.storageKey).sort()).toEqual([orphanDoc.storageKey, `media/${orphan.url.split('/').pop()}`].sort());
      expect(dry.deleted).toEqual([]);
      expect(dry.kept['too-recent']).toBeGreaterThanOrEqual(1);
      expect(dry.kept['unrecognised-name']).toBeGreaterThanOrEqual(1);
      expect(dry.kept.referenced).toBeGreaterThanOrEqual(5);
      expect(existsSync(fileOf(orphan.url))).toBe(true);

      const applied = await cleanup().run({ apply: true });
      expect(applied.deleted.map((o) => o.storageKey).sort()).toEqual(dry.orphans.map((o) => o.storageKey).sort());
      expect(applied.failed).toEqual([]);
      expect(existsSync(fileOf(orphan.url))).toBe(false);
      expect(existsSync(privateFile(orphanDoc.storageKey))).toBe(false);
      for (const f of [fileOf(used.url), fileOf(fresh.url), foreign, privateFile(keptDoc.storageKey!), ...elsewhere]) {
        expect(existsSync(f), f).toBe(true);
      }
      expect((await ctx.prisma.mediaObject.findUniqueOrThrow({ where: { id: orphan.id } })).deletedAt).not.toBeNull();
      const audit = await ctx.prisma.auditLog.findMany({ where: { resource: 'orphaned_object', action: 'DOCUMENT_DELETE' } });
      expect(audit.map((a) => a.resourceId).sort()).toEqual(applied.deleted.map((o) => o.storageKey).sort());

      const again = await cleanup().run({ apply: true });
      expect(again.deleted).toEqual([]);
    });

    it('refuses production without the explicit flag, and refuses to delete when nothing is referenced', async () => {
      // ConfigService prefers process.env (NODE_ENV=test here), so production is simulated with a stub.
      const prod = { get: (key: string) => (key === 'NODE_ENV' ? 'production' : undefined) } as unknown as ConfigService;
      await expect(cleanup({ config: prod }).run({ apply: true })).rejects.toBeInstanceOf(CleanupRefusedError);

      const lonely = await uploaded(w.hotelB);
      age(fileOf(lonely.url), 30);
      const blind = { referencedNames: async () => new Set<string>() } as unknown as ReferenceScanner;
      await expect(cleanup({ scanner: blind }).run({ apply: true })).rejects.toThrow(/wrong database/);
      expect(existsSync(fileOf(lonely.url))).toBe(true);
      await expect(cleanup().run({ graceHours: 0 })).rejects.toThrow(/at least 1 hour/);
    });
  });
});

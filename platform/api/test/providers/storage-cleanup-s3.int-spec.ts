import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ConfigService } from '@nestjs/config';
import { CreateBucketCommand, HeadObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { StorageService } from '../../src/modules/storage/storage.service';
import { OrphanCleanupService } from '../../src/modules/storage/cleanup/orphan-cleanup.service';
import type { ReferenceScanner } from '../../src/modules/storage/cleanup/reference-scanner';

const endpoint = process.env.S3_TEST_ENDPOINT; // e.g. http://127.0.0.1:19406 (MinIO)
const PDF = Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.alloc(256, 1)]);
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(256, 2)]);

/**
 * O04 on the S3-compatible driver (the R2 code path): the cleanup job lists both
 * buckets through the storage abstraction and deletes only unreferenced objects
 * written by the platform. The database side is stubbed here; the e2e suite
 * covers the reference scan against PostgreSQL.
 */
describe.skipIf(!endpoint)('orphan cleanup over the S3-compatible driver (MinIO)', () => {
  const stamp = Date.now();
  const env: Record<string, string> = {
    NODE_ENV: 'test',
    STORAGE_DRIVER: 's3',
    S3_ENDPOINT: endpoint ?? '',
    S3_REGION: 'us-east-1',
    S3_FORCE_PATH_STYLE: 'true',
    S3_BUCKET: `uc-cleanup-docs-${stamp}`,
    S3_PUBLIC_BUCKET: `uc-cleanup-media-${stamp}`,
    S3_PUBLIC_BASE_URL: `${endpoint}/uc-cleanup-media-${stamp}`,
    S3_ACCESS_KEY_ID: process.env.S3_TEST_ACCESS_KEY ?? '',
    S3_SECRET_ACCESS_KEY: process.env.S3_TEST_SECRET_KEY ?? '',
  };
  // Importing the Prisma client loads platform/api/.env into process.env, and
  // ConfigService prefers process.env over its own values — so the test pins
  // every storage variable there too (restored afterwards) and refuses to run
  // unless the driver really is S3: this suite must never touch local files.
  const previous = Object.fromEntries(Object.keys(env).map((k) => [k, process.env[k]]));
  if (endpoint) Object.assign(process.env, env);
  afterAll(() => {
    for (const [k, v] of Object.entries(previous)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });
  const config = new ConfigService(env);
  const storage = new StorageService(config);
  if (endpoint && storage.driver !== 's3') throw new Error(`Refusing to run: storage driver resolved to ${storage.driver}`);
  const raw = new S3Client({
    region: 'us-east-1', endpoint, forcePathStyle: true,
    credentials: { accessKeyId: env.S3_ACCESS_KEY_ID, secretAccessKey: env.S3_SECRET_ACCESS_KEY },
  });
  const exists = (Bucket: string, Key: string) => raw.send(new HeadObjectCommand({ Bucket, Key })).then(() => true, () => false);
  const audit: any[] = [];
  const cleanup = (referenced: Set<string>) =>
    new OrphanCleanupService(
      storage,
      { referencedNames: async () => referenced } as unknown as ReferenceScanner,
      { mediaObject: { updateMany: async () => ({ count: 1 }) } } as any,
      { log: async (entry: unknown) => { audit.push(entry); } } as any,
      config,
    );

  beforeAll(async () => {
    await raw.send(new CreateBucketCommand({ Bucket: env.S3_BUCKET }));
    await raw.send(new CreateBucketCommand({ Bucket: env.S3_PUBLIC_BUCKET }));
  });

  it('lists both buckets, keeps referenced/recent/foreign objects and deletes old orphans', async () => {
    const usedMedia = await storage.putPublicImage({ buffer: PNG, originalName: 'a.png' });
    const orphanMedia = await storage.putPublicImage({ buffer: Buffer.concat([PNG, Buffer.from('x')]), originalName: 'b.png' });
    const usedDoc = await storage.put({ buffer: PDF, originalName: 'p.pdf', prefix: 'visa-documents/app-1' });
    const orphanDoc = await storage.put({ buffer: PDF, originalName: 'k.pdf', prefix: 'kyc/tenant-1' });
    await raw.send(new PutObjectCommand({ Bucket: env.S3_PUBLIC_BUCKET, Key: 'media/seed-banner.jpg', Body: PNG }));

    const listed = [];
    for await (const o of storage.listObjects()) listed.push(o.storageKey);
    expect(listed.sort()).toEqual([usedMedia.storageKey, orphanMedia.storageKey, usedDoc.storageKey, orphanDoc.storageKey, 'media/seed-banner.jpg'].sort());

    const name = (key: string) => key.split('/').pop()!;
    const referenced = new Set([name(usedMedia.storageKey), name(usedDoc.storageKey)]);
    // Everything was written seconds ago: with the default grace nothing may go.
    expect((await cleanup(referenced).run({ apply: true })).deleted).toEqual([]);

    // Evaluated two weeks from now, the unreferenced platform objects are orphans.
    const later = new Date(Date.now() + 14 * 86_400_000);
    const dry = await cleanup(referenced).run({ now: later });
    expect(dry.orphans.map((o) => o.storageKey).sort()).toEqual([orphanDoc.storageKey, orphanMedia.storageKey].sort());
    expect(dry.kept).toMatchObject({ referenced: 2, 'unrecognised-name': 1 });

    const applied = await cleanup(referenced).run({ apply: true, now: later });
    expect(applied.deleted.map((o) => o.storageKey).sort()).toEqual(dry.orphans.map((o) => o.storageKey).sort());
    expect(applied.driver).toBe('s3');
    expect(await exists(env.S3_PUBLIC_BUCKET, orphanMedia.storageKey)).toBe(false);
    expect(await exists(env.S3_BUCKET, orphanDoc.storageKey)).toBe(false);
    expect(await exists(env.S3_PUBLIC_BUCKET, usedMedia.storageKey)).toBe(true);
    expect(await exists(env.S3_BUCKET, usedDoc.storageKey)).toBe(true);
    expect(await exists(env.S3_PUBLIC_BUCKET, 'media/seed-banner.jpg')).toBe(true);
    expect(audit.map((a) => a.resourceId).sort()).toEqual(applied.deleted.map((o) => o.storageKey).sort());
  });
});

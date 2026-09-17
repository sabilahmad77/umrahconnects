import { beforeAll, describe, expect, it } from 'vitest';
import { ConfigService } from '@nestjs/config';
import { CreateBucketCommand, HeadObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { StorageService } from '../../src/modules/storage/storage.service';

const endpoint = process.env.S3_TEST_ENDPOINT; // e.g. http://127.0.0.1:19000 (MinIO)
const PDF = Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.alloc(256, 1)]);
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(256, 2)]);

describe.skipIf(!endpoint)('StorageService S3-compatible driver (R2 code path) against MinIO', () => {
  const env: Record<string, string> = {
    NODE_ENV: 'test',
    STORAGE_DRIVER: 's3',
    S3_ENDPOINT: endpoint ?? '',
    S3_REGION: 'us-east-1',
    S3_FORCE_PATH_STYLE: 'true',
    S3_BUCKET: `uc-docs-${Date.now()}`,
    S3_PUBLIC_BUCKET: `uc-media-${Date.now()}`,
    S3_PUBLIC_BASE_URL: `${endpoint}/uc-media-public`,
    S3_ACCESS_KEY_ID: process.env.S3_TEST_ACCESS_KEY ?? '',
    S3_SECRET_ACCESS_KEY: process.env.S3_TEST_SECRET_KEY ?? '',
  };
  const storage = new StorageService(new ConfigService(env));
  const raw = new S3Client({
    region: 'us-east-1', endpoint, forcePathStyle: true,
    credentials: { accessKeyId: env.S3_ACCESS_KEY_ID, secretAccessKey: env.S3_SECRET_ACCESS_KEY },
  });

  beforeAll(async () => {
    await raw.send(new CreateBucketCommand({ Bucket: env.S3_BUCKET }));
    await raw.send(new CreateBucketCommand({ Bucket: env.S3_PUBLIC_BUCKET }));
  });

  it('stores private documents with the sniffed content type and a checksum', async () => {
    const stored = await storage.put({ buffer: PDF, originalName: 'passport.png', mimeType: 'image/png', prefix: 'visa-documents/app-1' });
    expect(stored.url).toMatch(/^private:visa-documents\/app-1\/\d+-[0-9a-f]{24}\.pdf$/);
    expect([stored.driver, stored.visibility, stored.mimeType]).toEqual(['s3', 'private', 'application/pdf']);
    const head = await raw.send(new HeadObjectCommand({ Bucket: env.S3_BUCKET, Key: stored.storageKey }));
    expect(head.ContentType).toBe('application/pdf');
    expect(head.Metadata?.sha256).toBe(stored.checksum);
  });

  it('private objects are readable only through short-lived presigned URLs', async () => {
    const stored = await storage.put({ buffer: PDF, originalName: 'visa.pdf', prefix: 'kyc/tenant-1' });
    const direct = await fetch(`${endpoint}/${env.S3_BUCKET}/${stored.storageKey}`);
    expect(direct.status).toBe(403);

    const signed = await storage.presignedUrl(stored.storageKey, { filename: 'visa.pdf', expiresInSeconds: 60 });
    const ok = await fetch(signed);
    expect(ok.status).toBe(200);
    expect(Buffer.from(await ok.arrayBuffer()).equals(PDF)).toBe(true);
    expect(ok.headers.get('content-disposition')).toContain('attachment');

    const tampered = signed.replace(/X-Amz-Signature=[0-9a-f]+/, 'X-Amz-Signature=' + '0'.repeat(64));
    expect((await fetch(tampered)).status).toBe(403);
    const otherKey = signed.replace(stored.storageKey, stored.storageKey.replace('.pdf', '-x.pdf'));
    expect((await fetch(otherKey)).status).toBe(403);

    const short = await storage.presignedUrl(stored.storageKey, { expiresInSeconds: 1 });
    await new Promise((r) => setTimeout(r, 2500));
    expect((await fetch(short)).status).toBe(403);
  });

  it('rejects disguised content and path traversal before anything is stored', async () => {
    await expect(storage.put({ buffer: Buffer.from('<html><script>x</script></html>'.padEnd(64)), originalName: 'a.pdf', prefix: 'visa-documents/x' })).rejects.toThrow(/not an accepted type/);
    await expect(storage.put({ buffer: PDF, originalName: 'a.pdf', prefix: '../../etc' })).rejects.toThrow(/Invalid storage location/);
    await expect(storage.putPublicImage({ buffer: PDF, originalName: 'x.png' })).rejects.toThrow(/not an accepted type/);
  });

  it('public media goes to the public bucket and deletions are best-effort', async () => {
    const media = await storage.putPublicImage({ buffer: PNG, originalName: 'avatar.png' });
    expect(media.url).toMatch(new RegExp(`^${env.S3_PUBLIC_BASE_URL}/media/\\d+-[0-9a-f]{24}\\.png$`));
    const head = await raw.send(new HeadObjectCommand({ Bucket: env.S3_PUBLIC_BUCKET, Key: media.storageKey }));
    expect(head.CacheControl).toContain('immutable');

    const doc = await storage.put({ buffer: PDF, originalName: 'x.pdf', prefix: 'visa-documents/del' });
    await storage.remove(doc.storageKey, 's3');
    await expect(raw.send(new HeadObjectCommand({ Bucket: env.S3_BUCKET, Key: doc.storageKey }))).rejects.toBeTruthy();
    await expect(storage.remove('missing/key.pdf', 's3')).resolves.toBeUndefined();
  });

  it('reports missing configuration instead of pretending', async () => {
    const bare = new StorageService(new ConfigService({ STORAGE_DRIVER: 'r2' }));
    expect(bare.status.missing).toEqual(['S3_ENDPOINT', 'S3_BUCKET', 'S3_ACCESS_KEY_ID', 'S3_SECRET_ACCESS_KEY']);
    await expect(bare.put({ buffer: PDF, originalName: 'a.pdf', prefix: 'x' })).rejects.toThrow(/not configured/);
  });
});

import { afterAll, describe, expect, it } from 'vitest';
import { ConfigService } from '@nestjs/config';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { resolveLocalStorageRoot, StorageService, STORED_NAME_PATTERN } from './storage.service';
import { MediaRegistryService } from './media-registry.service';

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64, 1)]);
const PDF = Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.alloc(64, 2)]);

describe('StorageService (local driver)', () => {
  const root = mkdtempSync(join(tmpdir(), 'uc-storage-'));
  const storage = new StorageService(new ConfigService({ STORAGE_DRIVER: 'local', STORAGE_LOCAL_DIR: root }));
  afterAll(() => rmSync(root, { recursive: true, force: true }));

  it('writes under the configured root and lists public and private objects', async () => {
    const media = await storage.putPublicImage({ buffer: PNG, originalName: 'a.png' });
    const doc = await storage.put({ buffer: PDF, originalName: 'p.pdf', prefix: 'kyc/t1' });
    writeFileSync(join(root, '.gitkeep'), '');
    expect(media.url).toMatch(/^\/uploads\/\d{13}-[0-9a-f]{24}\.png$/);
    expect(existsSync(join(root, media.storageKey.replace('media/', '')))).toBe(true);

    const listed = [];
    for await (const o of storage.listObjects()) listed.push(o);
    expect(listed.map((o) => [o.visibility, o.storageKey])).toEqual([
      ['public', media.storageKey],
      ['private', doc.storageKey],
    ]);
    expect(listed.every((o) => STORED_NAME_PATTERN.test(o.name) && o.sizeBytes > 0)).toBe(true);

    await storage.deleteObject(listed[0]);
    await storage.deleteObject(listed[1]);
    const after = [];
    for await (const o of storage.listObjects()) after.push(o);
    expect(after).toEqual([]);
  });

  it('only deletes well-formed media keys', async () => {
    await expect(storage.removePublicMedia('media/../../etc/passwd')).rejects.toThrow(/Invalid media key/);
    await expect(storage.removePublicMedia('private/x.png')).rejects.toThrow(/Invalid media key/);
  });

  it('states the real limit for oversize images', async () => {
    await expect(storage.putPublicImage({ buffer: Buffer.concat([PNG, Buffer.alloc(5 * 1024 * 1024)]), originalName: 'big.png' })).rejects.toThrow(
      /Images must be 5 MB or smaller/,
    );
  });

  it('resolves the local root from STORAGE_LOCAL_DIR', () => {
    expect(resolveLocalStorageRoot(undefined)).toBe(join(process.cwd(), 'uploads'));
    expect(resolveLocalStorageRoot('/srv/media')).toBe('/srv/media');
    expect(resolveLocalStorageRoot('data/up')).toBe(join(process.cwd(), 'data/up'));
  });

  it('maps issued media URLs back to their storage key', () => {
    const n = '1726000000000-0123456789abcdef01234567.webp';
    expect(MediaRegistryService.storageKeyForUrl(`/uploads/${n}`)).toBe(`media/${n}`);
    expect(MediaRegistryService.storageKeyForUrl(`https://cdn.example.com/media/${n}?v=1`)).toBe(`media/${n}`);
    expect(MediaRegistryService.storageKeyForUrl('https://evil.example.com/tracker.gif')).toBeNull();
  });
});

import { existsSync, readdirSync } from 'fs';
import { join, relative } from 'path';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { api, createTestApp, TestContext } from './app';
import { bearer, buildWorld, World } from './fixtures';

/**
 * F8: the suite stores files through the local storage driver; they belong to the run's own directory
 * (test/global-setup.ts creates it and removes it afterwards), never to the worktree's uploads/.
 */
describe('e2e storage isolation', () => {
  let ctx: TestContext;
  let w: World;
  const worktreeUploads = join(__dirname, '..', 'uploads');
  const filesIn = (dir: string): string[] =>
    existsSync(dir) ? readdirSync(dir, { recursive: true, withFileTypes: true }).filter((e) => e.isFile()).map((e) => join(e.parentPath ?? e.path, e.name)) : [];

  beforeAll(async () => {
    ctx = await createTestApp();
    w = await buildWorld(ctx);
  });
  afterAll(async () => {
    await ctx?.close();
  });

  it('points the local storage driver at the run directory, outside the worktree', () => {
    const runDir = inject('e2eStorageDir');
    expect(process.env.STORAGE_LOCAL_DIR).toBe(runDir);
    expect(relative(join(__dirname, '..'), runDir).startsWith('..')).toBe(true);
  });

  it('an upload lands in the run directory and leaves the worktree uploads/ untouched', async () => {
    const before = filesIn(worktreeUploads);
    const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(200, 7), Buffer.from(String(Date.now()))]);
    const res = await ctx.http().post(api('/uploads')).set(bearer(w.hotelA)).attach('file', png, { filename: 'photo.png', contentType: 'image/png' });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    const stored = join(inject('e2eStorageDir'), String(res.body.data.url).replace('/uploads/', ''));
    expect(existsSync(stored)).toBe(true);
    expect(filesIn(worktreeUploads)).toEqual(before);
  });
});

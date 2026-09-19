import { describe, expect, it } from 'vitest';
import { planOrphanCleanup } from './cleanup-plan';
import { assertMayRun, CleanupRefusedError } from './orphan-cleanup.service';
import { parseCleanupArgs } from './orphan-cleanup.cli';
import type { StoredObjectInfo } from '../storage.service';

const HOUR = 3_600_000;
const now = new Date('2026-09-18T12:00:00Z');
const name = (n: number, ext = 'png') => `${1_700_000_000_000 + n}-${n.toString(16).padStart(24, '0')}.${ext}`;
const obj = (n: number, ageHours: number, extra: Partial<StoredObjectInfo> = {}): StoredObjectInfo => ({
  visibility: 'public',
  storageKey: `media/${name(n)}`,
  name: name(n),
  sizeBytes: 100 + n,
  lastModified: new Date(now.getTime() - ageHours * HOUR),
  driver: 'local',
  ...extra,
});
const opts = { now, graceMs: 24 * HOUR, maxDeletions: 100 };

describe('planOrphanCleanup', () => {
  it('deletes only old, unreferenced objects written by the platform', () => {
    const referenced = obj(1, 500);
    const recent = obj(2, 1);
    const orphan = obj(3, 48);
    const foreign = obj(4, 900, { name: 'seed-hotel.jpg', storageKey: 'media/seed-hotel.jpg' });
    const plan = planOrphanCleanup([referenced, recent, orphan, foreign], new Set([referenced.name]), opts);
    expect(plan.orphans.map((o) => o.name)).toEqual([orphan.name]);
    expect(Object.fromEntries(plan.kept.map((k) => [k.object.name, k.reason]))).toEqual({
      [referenced.name]: 'referenced',
      [recent.name]: 'too-recent',
      'seed-hotel.jpg': 'unrecognised-name',
    });
    expect(plan.truncated).toBe(false);
  });

  it('treats the grace boundary and unreadable timestamps conservatively', () => {
    const edge = obj(5, 24); // exactly at the cutoff → old enough
    const inside = obj(6, 23.9);
    const invalid = obj(7, 100, { lastModified: new Date('invalid') });
    const plan = planOrphanCleanup([edge, inside, invalid], new Set(), opts);
    expect(plan.orphans.map((o) => o.name)).toEqual([edge.name]);
    expect(plan.kept.map((k) => k.reason)).toEqual(['too-recent', 'too-recent']);
  });

  it('covers private documents the same way, oldest first, capped per run', () => {
    const docs = [obj(8, 30), obj(9, 90), obj(10, 60)].map((o) => ({
      ...o,
      visibility: 'private' as const,
      storageKey: `kyc/tenant/${o.name}`,
    }));
    const plan = planOrphanCleanup(docs, new Set(), { ...opts, maxDeletions: 2 });
    expect(plan.orphans.map((o) => o.name)).toEqual([docs[1].name, docs[2].name]);
    expect(plan.truncated).toBe(true);
  });
});

describe('orphan cleanup guards', () => {
  it('refuses production unless explicitly allowed', () => {
    expect(() => assertMayRun({ NODE_ENV: 'production' }, {})).toThrow(CleanupRefusedError);
    expect(() => assertMayRun({ NODE_ENV: 'production' }, { allowProduction: true })).not.toThrow();
    expect(() => assertMayRun({ NODE_ENV: 'development' }, {})).not.toThrow();
  });

  it('parses the CLI flags, defaulting to a dry run', () => {
    expect(parseCleanupArgs([])).toMatchObject({ apply: false, graceHours: 168, maxDeletions: 1000, allowProduction: false });
    expect(parseCleanupArgs(['--', '--apply', '--grace-hours=12', '--max-deletions=5', '--allow-production', '--json'])).toMatchObject({
      apply: true,
      graceHours: 12,
      maxDeletions: 5,
      allowProduction: true,
      json: true,
    });
    expect(() => parseCleanupArgs(['--grace-hours'])).toThrow(/needs a number/);
    expect(() => parseCleanupArgs(['--delete-everything'])).toThrow(/Unknown option/);
  });
});

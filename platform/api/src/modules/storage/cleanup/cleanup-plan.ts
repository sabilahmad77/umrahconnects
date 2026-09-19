import { STORED_NAME_PATTERN, type StoredObjectInfo } from '../storage.service';

export type KeepReason = 'unrecognised-name' | 'too-recent' | 'referenced';

export interface CleanupPlanOptions {
  now: Date;
  /** Objects younger than this are never touched (an upload may not be attached yet). */
  graceMs: number;
  /** Safety valve: at most this many deletions per run; the rest wait for the next run. */
  maxDeletions: number;
}

export interface CleanupPlan {
  orphans: StoredObjectInfo[];
  kept: { object: StoredObjectInfo; reason: KeepReason }[];
  /** True when more orphans exist than `maxDeletions` allowed in this run. */
  truncated: boolean;
}

/**
 * Decides which stored objects are orphans. Pure, so every rule is unit-tested:
 *  1. only names this platform writes (`<epoch ms>-<24 hex>.<ext>`) are ever
 *     considered — anything else (seed images, operator files) is kept;
 *  2. objects younger than the grace period are kept;
 *  3. objects whose name appears anywhere in the database are kept;
 *  4. what remains is an orphan, oldest first, capped at `maxDeletions`.
 */
export function planOrphanCleanup(
  objects: StoredObjectInfo[],
  referencedNames: ReadonlySet<string>,
  opts: CleanupPlanOptions,
): CleanupPlan {
  const kept: CleanupPlan['kept'] = [];
  const orphans: StoredObjectInfo[] = [];
  const cutoff = opts.now.getTime() - opts.graceMs;
  for (const object of objects) {
    if (!STORED_NAME_PATTERN.test(object.name)) kept.push({ object, reason: 'unrecognised-name' });
    else if (!(object.lastModified instanceof Date) || Number.isNaN(object.lastModified.getTime()) || object.lastModified.getTime() > cutoff) {
      kept.push({ object, reason: 'too-recent' });
    } else if (referencedNames.has(object.name)) kept.push({ object, reason: 'referenced' });
    else orphans.push(object);
  }
  orphans.sort((a, b) => a.lastModified.getTime() - b.lastModified.getTime());
  const limit = Math.max(0, Math.floor(opts.maxDeletions));
  return { orphans: orphans.slice(0, limit), kept, truncated: orphans.length > limit };
}

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { StorageService, type StoredObjectInfo } from '../storage.service';
import { planOrphanCleanup, type KeepReason } from './cleanup-plan';
import { ReferenceScanner } from './reference-scanner';

export interface OrphanCleanupOptions {
  /** false (default) = dry run: report only, delete nothing. */
  apply?: boolean;
  /** Objects younger than this are never touched. Minimum 1 hour. */
  graceHours?: number;
  /** At most this many deletions per run. */
  maxDeletions?: number;
  /** Required to run at all when NODE_ENV=production. */
  allowProduction?: boolean;
  /** Required to delete when the database mentions no stored object at all (wrong database?). */
  allowEmptyReferenceSet?: boolean;
  now?: Date;
}

export interface ObjectSummary {
  storageKey: string;
  visibility: string;
  sizeBytes: number;
  lastModified: string;
}

export interface OrphanCleanupReport {
  mode: 'dry-run' | 'apply';
  driver: string;
  startedAt: string;
  finishedAt: string;
  graceHours: number;
  scannedObjects: number;
  referencedNames: number;
  kept: Record<KeepReason, number>;
  orphans: ObjectSummary[];
  deleted: ObjectSummary[];
  failed: (ObjectSummary & { error: string })[];
  /** More orphans exist than maxDeletions allowed; the next run continues. */
  truncated: boolean;
  bytesReclaimed: number;
}

export const DEFAULT_GRACE_HOURS = 7 * 24;
export const DEFAULT_MAX_DELETIONS = 1000;

/** The run was refused before anything was deleted (exit code 2 in the CLI). */
export class CleanupRefusedError extends Error {}

export function assertMayRun(env: { NODE_ENV?: string }, opts: Pick<OrphanCleanupOptions, 'allowProduction'>) {
  if (env.NODE_ENV === 'production' && !opts.allowProduction) {
    throw new CleanupRefusedError(
      'Refusing to run against production (NODE_ENV=production). Pass --allow-production to confirm.',
    );
  }
}

const summary = (o: StoredObjectInfo): ObjectSummary => ({
  storageKey: o.storageKey,
  visibility: o.visibility,
  sizeBytes: o.sizeBytes,
  lastModified: o.lastModified.toISOString(),
});

/**
 * O04 — removes stored objects that no database record mentions any more.
 *
 * Safety properties:
 *  - dry run unless `apply` is set;
 *  - never touches objects younger than the grace period, objects whose name
 *    appears anywhere in the database, or names this platform did not write;
 *  - references are scanned again immediately before deleting;
 *  - refuses production without `allowProduction`, and refuses to delete when
 *    the database mentions no object at all (a sign of the wrong database);
 *  - every deletion is written to the audit log and returned in the report.
 */
@Injectable()
export class OrphanCleanupService {
  private readonly logger = new Logger(OrphanCleanupService.name);

  constructor(
    private readonly storage: StorageService,
    private readonly scanner: ReferenceScanner,
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly config: ConfigService,
  ) {}

  async run(opts: OrphanCleanupOptions = {}): Promise<OrphanCleanupReport> {
    assertMayRun({ NODE_ENV: this.config.get<string>('NODE_ENV') ?? process.env.NODE_ENV }, opts);
    const graceHours = opts.graceHours ?? DEFAULT_GRACE_HOURS;
    if (!Number.isFinite(graceHours) || graceHours < 1) {
      throw new CleanupRefusedError('The grace period must be at least 1 hour.');
    }
    const maxDeletions = opts.maxDeletions ?? DEFAULT_MAX_DELETIONS;
    if (!Number.isInteger(maxDeletions) || maxDeletions < 1) {
      throw new CleanupRefusedError('maxDeletions must be a positive whole number.');
    }
    const now = opts.now ?? new Date();
    const startedAt = new Date();

    const objects: StoredObjectInfo[] = [];
    for await (const o of this.storage.listObjects()) objects.push(o);
    const referenced = await this.scanner.referencedNames();
    const plan = planOrphanCleanup(objects, referenced, { now, graceMs: graceHours * 3_600_000, maxDeletions });

    const kept: Record<KeepReason, number> = { 'unrecognised-name': 0, 'too-recent': 0, referenced: 0 };
    for (const k of plan.kept) kept[k.reason]++;
    const report: OrphanCleanupReport = {
      mode: opts.apply ? 'apply' : 'dry-run',
      driver: this.storage.driver,
      startedAt: startedAt.toISOString(),
      finishedAt: startedAt.toISOString(),
      graceHours,
      scannedObjects: objects.length,
      referencedNames: referenced.size,
      kept,
      orphans: plan.orphans.map(summary),
      deleted: [],
      failed: [],
      truncated: plan.truncated,
      bytesReclaimed: 0,
    };

    if (opts.apply && plan.orphans.length) {
      if (referenced.size === 0 && !opts.allowEmptyReferenceSet) {
        throw new CleanupRefusedError(
          'The database does not mention a single stored object, so every object looks orphaned. ' +
            'This usually means the wrong database. Nothing was deleted.',
        );
      }
      // A reference may have been added while listing; re-read right before deleting.
      const recheck = await this.scanner.referencedNames();
      for (const object of plan.orphans) {
        if (recheck.has(object.name)) {
          report.kept.referenced++;
          continue;
        }
        try {
          await this.storage.deleteObject(object);
          report.deleted.push(summary(object));
          report.bytesReclaimed += object.sizeBytes;
          if (object.visibility === 'public') {
            await this.prisma.mediaObject.updateMany({
              where: { storageKey: object.storageKey, deletedAt: null },
              data: { deletedAt: new Date() },
            });
          }
          await this.audit.log({
            actorEmail: 'system:orphan-cleanup',
            action: 'DOCUMENT_DELETE',
            namespace: 'storage',
            resource: 'orphaned_object',
            resourceId: object.storageKey,
            metadata: {
              job: 'orphan-cleanup',
              driver: object.driver,
              visibility: object.visibility,
              sizeBytes: object.sizeBytes,
              lastModified: object.lastModified.toISOString(),
              graceHours,
            },
          });
        } catch (err) {
          report.failed.push({ ...summary(object), error: (err as Error).message });
        }
      }
    }

    report.finishedAt = new Date().toISOString();
    this.logger.log(
      `${report.mode}: scanned ${report.scannedObjects}, orphans ${report.orphans.length}, ` +
        `deleted ${report.deleted.length}, failed ${report.failed.length}, kept ${JSON.stringify(report.kept)}`,
    );
    return report;
  }
}

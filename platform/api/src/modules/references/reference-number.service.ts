import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Human-facing reference numbers — `UC-2026-00001`, `INV-2026-00042` … (A12-3).
 *
 * They used to be `<PREFIX>-<year>-<5 digits of Math.random()>` behind a
 * PLATFORM-WIDE unique index, with no retry: 100 000 values shared by every
 * organization, so by the birthday bound a few hundred records a year already
 * made a collision routine — and a collision failed an ordinary create.
 *
 * Now each organization counts its own, per prefix and per year
 * (`core.reference_counters`), so the numbers are sequential and predictable and
 * two organizations may hold the same one — their own first booking of the year.
 * The counter is advanced by a single `INSERT … ON CONFLICT DO UPDATE …
 * RETURNING`, which is atomic: concurrent creates take the row lock in turn and
 * every caller gets a distinct number. Numbers are never reused, so a rolled-back
 * create leaves a gap — the cheap, correct trade for uniqueness under concurrency.
 *
 * `isTaken` is the bridge to the numbers the random generator already handed out:
 * the counters start above the highest legacy number per organization/prefix/year
 * (see the migration), and the caller's existence check keeps that true even if a
 * legacy row is inserted afterwards. Failing that, the unique index still refuses
 * a duplicate — this service makes the create succeed, it does not replace the
 * constraint that makes it safe.
 */

/** Every prefix in use. A new one only needs adding here for the type to allow it. */
export const REFERENCE_PREFIXES = ['UC', 'INV', 'BP', 'VISA'] as const;
export type ReferencePrefix = (typeof REFERENCE_PREFIXES)[number];

/** How many numbers to skip past taken ones before giving up (a legacy clash is rare). */
const MAX_ATTEMPTS = 25;

@Injectable()
export class ReferenceNumberService {
  private readonly logger = new Logger(ReferenceNumberService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * The organization's next reference for `prefix`.
   *
   * `isTaken` (optional) is asked before a number is handed out — pass the
   * existence check for the column that carries the reference, so a value an
   * older random generator already used is skipped instead of failing the create.
   */
  async next(
    tenantId: string,
    prefix: ReferencePrefix,
    isTaken?: (reference: string) => Promise<boolean>,
    now: Date = new Date(),
  ): Promise<string> {
    if (!tenantId) throw new Error('A reference number needs the organization it belongs to');
    const period = String(now.getFullYear());
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
      const reference = format(prefix, period, await this.allocate(tenantId, prefix, period));
      if (!isTaken || !(await isTaken(reference))) return reference;
      this.logger.warn(`${reference} is already used in this organization — taking the next number`);
    }
    throw new Error(`Could not allocate a free ${prefix} reference for organization ${tenantId}`);
  }

  /** Atomically advances the counter and returns the number allocated. */
  private async allocate(tenantId: string, prefix: string, period: string): Promise<number> {
    const [row] = await this.prisma.$queryRaw<{ value: number }[]>`
      INSERT INTO core.reference_counters (tenant_id, prefix, period, value, updated_at)
      VALUES (${tenantId}::uuid, ${prefix}, ${period}, 1, now())
      ON CONFLICT (tenant_id, prefix, period)
      DO UPDATE SET value = reference_counters.value + 1, updated_at = now()
      RETURNING value`;
    if (!row) throw new Error(`Reference counter ${prefix}/${period} did not return a number`);
    return row.value;
  }
}

/** `UC-2026-00001`; past 99 999 the number simply grows rather than wrapping. */
export function format(prefix: string, period: string, value: number): string {
  return `${prefix}-${period}-${String(value).padStart(5, '0')}`;
}

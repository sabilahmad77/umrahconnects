import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';

/** Postgres regex for the names StorageService writes (see STORED_NAME_PATTERN). */
export const STORED_NAME_SQL_PATTERN = '([0-9]{13}-[0-9a-f]{24}\\.[a-z0-9]{2,5})';

/**
 * Tables that mention object names without being a use of the object:
 *  - the audit trail records every upload and deletion forever;
 *  - the media registry lists every public upload, used or not;
 *  - Prisma's migration bookkeeping.
 */
export const NON_REFERENCE_TABLES = new Set([
  'audit.audit_logs',
  'core.media_objects',
  'public._prisma_migrations',
]);

const TEXT_TYPES = new Set(['text', 'character varying', 'character', 'json', 'jsonb']);
const TEXT_ARRAY_UDTS = new Set(['_text', '_varchar', '_bpchar']);

const ident = (name: string) => `"${name.replace(/"/g, '""')}"`;

interface ColumnRow {
  table_schema: string;
  table_name: string;
  column_name: string;
  data_type: string;
  udt_name: string;
}

/**
 * Finds every stored-object name the database still mentions.
 *
 * Deliberately generic: it reads every text, JSON and text-array column of
 * every table (except NON_REFERENCE_TABLES) instead of a hand-kept list of
 * "file columns". A column added next month that stores a file URL, a storage
 * key inside JSON, or a `private:` reference is covered without anyone
 * remembering to update the cleanup job — the failure mode of a list is
 * deleting files that are still in use. The price is a full scan, which is
 * acceptable for a periodic maintenance job.
 */
@Injectable()
export class ReferenceScanner {
  private readonly logger = new Logger(ReferenceScanner.name);

  constructor(private readonly prisma: PrismaService) {}

  async textColumnsByTable(): Promise<Map<string, { schema: string; table: string; columns: string[] }>> {
    const rows = await this.prisma.$queryRaw<ColumnRow[]>`
      SELECT c.table_schema, c.table_name, c.column_name, c.data_type, c.udt_name
      FROM information_schema.columns c
      JOIN information_schema.tables t
        ON t.table_schema = c.table_schema AND t.table_name = c.table_name
      WHERE t.table_type = 'BASE TABLE'
        AND c.table_schema NOT IN ('pg_catalog', 'information_schema', 'pg_toast')
      ORDER BY c.table_schema, c.table_name, c.ordinal_position`;
    const tables = new Map<string, { schema: string; table: string; columns: string[] }>();
    for (const r of rows) {
      const key = `${r.table_schema}.${r.table_name}`;
      if (NON_REFERENCE_TABLES.has(key)) continue;
      const textual = TEXT_TYPES.has(r.data_type) || (r.data_type === 'ARRAY' && TEXT_ARRAY_UDTS.has(r.udt_name));
      if (!textual) continue;
      if (!tables.has(key)) tables.set(key, { schema: r.table_schema, table: r.table_name, columns: [] });
      tables.get(key)!.columns.push(r.column_name);
    }
    return tables;
  }

  /** Every stored-object name mentioned by any row of any scanned table. */
  async referencedNames(): Promise<Set<string>> {
    const names = new Set<string>();
    for (const { schema, table, columns } of (await this.textColumnsByTable()).values()) {
      // Identifiers come from information_schema and are quoted; the pattern is a bound parameter.
      const text = Prisma.raw(`concat_ws(' ', ${columns.map((c) => `t.${ident(c)}::text`).join(', ')})`);
      const from = Prisma.raw(`${ident(schema)}.${ident(table)}`);
      const found = await this.prisma.$queryRaw<{ name: string }[]>(Prisma.sql`
        SELECT DISTINCT m[1] AS name
        FROM ${from} t, LATERAL regexp_matches(${text}, ${STORED_NAME_SQL_PATTERN}, 'g') AS m`);
      for (const f of found) names.add(f.name);
    }
    this.logger.debug(`Reference scan found ${names.size} referenced object name(s)`);
    return names;
  }
}

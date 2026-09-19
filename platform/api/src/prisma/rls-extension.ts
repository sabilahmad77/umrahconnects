import { Prisma, PrismaClient } from '@prisma/client';
import { currentDbContext, DbContext, runInTransactionContext } from './db-context';
import { RLS_MODELS } from './rls-tables';

/**
 * Prisma side of Row-Level Security (R05, docs/control-tower/RLS.md).
 *
 * Every operation that can reach a protected table runs inside a transaction that
 * first sets `app.scope`, `app.tenant_id` and `app.user_id` from the request's
 * database context (db-context.ts). Transaction-local settings (`set_config(…, true)`)
 * end with the transaction, so a pooled connection never carries one request's
 * scope into the next. Without a context the query runs as-is and the policies
 * return no protected rows (fail closed).
 *
 *  - Single operations: `BEGIN; set_config…; <query>; COMMIT` (a batch transaction).
 *  - Interactive `$transaction(async (tx) => …)`: the settings are applied once at
 *    the start; `tx` is the unextended client, so nothing is re-wrapped inside.
 *  - Batch `$transaction([...])`: the settings statement is prepended.
 *  - Raw queries in a scoped context are wrapped as well (their tables are unknown).
 *
 * Values are always bound parameters — nothing is interpolated into SQL.
 */

/** Relation field names (on any model) whose target is a protected model. */
const RLS_RELATION_FIELDS: ReadonlySet<string> = new Set(
  Prisma.dmmf.datamodel.models.flatMap((m) =>
    m.fields.filter((f) => f.kind === 'object' && RLS_MODELS.has(f.type)).map((f) => f.name),
  ),
);

function isPlainObject(v: unknown): v is Record<string, unknown> {
  if (v === null || typeof v !== 'object') return false;
  const proto = Object.getPrototypeOf(v);
  return proto === Object.prototype || proto === null;
}

/**
 * Whether an operation on `model` with `args` can read or write a protected table:
 * the model itself is protected, or the arguments name a relation to one anywhere
 * (include/select/where/data/orderBy all name the relation field), or they ask for
 * `_count: true` (every relation, unnamed). Over-approximates: a false positive
 * only costs one wrapped transaction.
 */
export function reachesProtectedTable(model: string | undefined, args: unknown): boolean {
  if (!model) return true; // raw query: tables unknown
  if (RLS_MODELS.has(model)) return true;
  return argsNameProtectedRelation(args, 0);
}

function argsNameProtectedRelation(value: unknown, depth: number): boolean {
  if (depth > 32) return true;
  if (Array.isArray(value)) return value.some((v) => argsNameProtectedRelation(v, depth + 1));
  if (!isPlainObject(value)) return false;
  for (const [key, v] of Object.entries(value)) {
    if (RLS_RELATION_FIELDS.has(key)) return true;
    if (key === '_count' && v === true) return true;
    if (v !== null && typeof v === 'object' && argsNameProtectedRelation(v, depth + 1)) return true;
  }
  return false;
}

type ScopeSettings = { scope: string; tenantId: string; userId: string };

export function scopeSettings(ctx: DbContext): ScopeSettings {
  return { scope: ctx.scope ?? '', tenantId: ctx.dbTenantId ?? '', userId: ctx.userId ?? '' };
}

function applyScope(client: { $executeRaw: PrismaClient['$executeRaw'] }, s: ScopeSettings) {
  return client.$executeRaw`SELECT set_config('app.scope', ${s.scope}, true), set_config('app.tenant_id', ${s.tenantId}, true), set_config('app.user_id', ${s.userId}, true)`;
}

/**
 * Returns `base` extended with RLS scoping, behind a proxy that also scopes
 * `$transaction`. Types are unchanged: the extension adds no methods or fields.
 */
export function createRlsScopedClient<T extends PrismaClient>(base: T): T {
  const extended = base.$extends({
    name: 'rls-scope',
    query: {
      async $allOperations({ model, args, query, ...rest }) {
        const ctx = currentDbContext();
        if (!ctx?.scope) return query(args);
        // Already inside a transaction opened through $transaction below: scoped at its start.
        if ((rest as { __internalParams?: { transaction?: unknown } }).__internalParams?.transaction) return query(args);
        if (!reachesProtectedTable(model, args)) return query(args);
        const [, result] = await base.$transaction([applyScope(base, scopeSettings(ctx)), query(args)]);
        return result;
      },
    },
  });

  function scopedTransaction(arg: unknown, options?: unknown): Promise<unknown> {
    const ctx = currentDbContext();
    const settings = ctx?.scope ? scopeSettings(ctx) : undefined;
    if (typeof arg === 'function') {
      const fn = arg as (tx: Prisma.TransactionClient) => Promise<unknown>;
      return base.$transaction(async (tx) => {
        if (settings) await applyScope(tx, settings);
        return runInTransactionContext(() => fn(tx));
      }, options as Parameters<PrismaClient['$transaction']>[1]);
    }
    const promises = arg as Prisma.PrismaPromise<unknown>[];
    if (!settings) return base.$transaction(promises, options as { isolationLevel?: Prisma.TransactionIsolationLevel });
    return base
      .$transaction([applyScope(base, settings), ...promises], options as { isolationLevel?: Prisma.TransactionIsolationLevel })
      .then((results) => results.slice(1));
  }

  return new Proxy(extended, {
    get(target, prop, receiver) {
      if (prop === '$transaction') return scopedTransaction;
      return Reflect.get(target, prop, receiver);
    },
  }) as unknown as T;
}

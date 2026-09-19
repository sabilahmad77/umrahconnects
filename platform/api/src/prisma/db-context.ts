import { AsyncLocalStorage } from 'node:async_hooks';
import { Logger } from '@nestjs/common';

/**
 * Database scope for Row-Level Security (R05, docs/control-tower/RLS.md).
 *
 * Every query against a tenant-private table runs inside a transaction that first
 * tells PostgreSQL who it is acting for (`app.scope`, `app.tenant_id`,
 * `app.user_id`). The policies then decide which rows exist. This file holds the
 * per-request context those values come from:
 *
 *  - `tenant`   an ordinary signed-in principal: its own organization's rows.
 *  - `platform` the Super Admin platform organization: read-only oversight of every
 *               organization, plus the few tables platform administration writes.
 *  - `system`   code that legitimately crosses organizations (provider webhooks,
 *               traveler checkout, traveler links, operator scripts …). Entered ONLY
 *               through `withSystemScope(reason, fn)` / `@SystemScoped(reason)`, with a
 *               reason from the closed list below — never a default.
 *
 * No context (public routes, bootstrap, anything outside a request) sends nothing
 * to the database, and the policies then return no tenant-private rows (fail closed).
 */

export type DbScope = 'tenant' | 'platform' | 'system';

/**
 * Every reason code may cross organizations. Adding one is a security decision:
 * name the flow, and keep the service-layer checks that make it safe.
 */
export const SYSTEM_SCOPE_REASONS = [
  /** A signed payment-provider webhook drives the change, not a principal. */
  'payments.webhook',
  /** A traveler pays a provider organization (listing booking checkout, status, sandbox completion). */
  'payments.traveler-checkout',
  /** A traveler reads/answers links to pilgrim records held by an operator organization. */
  'travelers.linked-records',
  /** Honour ANOTHER user's notification preferences when notifying them. */
  'notifications.recipient-preferences',
  /** A traveler turns an accepted offer into a booking record held by the PROVIDER organization. */
  'marketplace.offer-conversion',
  /** Operator CLI scripts and seeds (maintenance, QA fixtures). */
  'scripts.maintenance',
  /**
   * Scheduled maintenance that sweeps every organization (e.g. orphaned-upload cleanup).
   * A job that deletes things because NO row references them MUST run in this scope —
   * in any other scope RLS hides the references and everything looks orphaned.
   */
  'jobs.maintenance',
  /** Test harness only: arranging fixtures through application services. */
  'test.fixture',
] as const;

export type SystemScopeReason = (typeof SYSTEM_SCOPE_REASONS)[number];

export interface DbContext {
  scope?: DbScope;
  /** The principal's organization, as the application sees it. */
  tenantId?: string;
  userId?: string;
  /**
   * The organization sent to the database for tenant-row policies. Travelers all
   * share the community organization (D-007), so for them it stays empty: a
   * traveler never matches another traveler's rows through the tenant clause.
   */
  dbTenantId?: string;
  /** Why the current block runs in system scope (logged when it is entered). */
  reason?: SystemScopeReason;
  /** Set while an interactive transaction opened through PrismaService is running. */
  inTransaction?: boolean;
  requestId?: string;
}

const storage = new AsyncLocalStorage<DbContext>();
const logger = new Logger('DbScope');
const usage = new Map<SystemScopeReason, number>();

/** The database context of the current async flow (undefined outside any request). */
export function currentDbContext(): DbContext | undefined {
  return storage.getStore();
}

/**
 * Opens a fresh, mutable context for one request; the auth guard fills it in.
 * Prisma queries are lazy: start (await) them INSIDE `fn` — a promise returned
 * unawaited from `fn` runs after the context has ended, i.e. unscoped (fail closed).
 */
export function runWithDbContext<T>(context: DbContext, fn: () => T): T {
  return storage.run(context, fn);
}

export interface ScopedPrincipal {
  sub: string;
  tenantId: string;
  tenantType?: string;
}

/**
 * Binds the authenticated principal to the current request context. The platform
 * organization gets `platform`; everyone else `tenant`. Called by JwtAuthGuard.
 */
export function bindPrincipalToDbContext(principal: ScopedPrincipal, sharedTenantId?: string | null): DbContext | undefined {
  const context = storage.getStore();
  if (!context) return undefined;
  context.scope = principal.tenantType === 'PLATFORM' ? 'platform' : 'tenant';
  context.tenantId = principal.tenantId;
  context.userId = principal.sub;
  context.dbTenantId = sharedTenantId && principal.tenantId === sharedTenantId ? undefined : principal.tenantId;
  return context;
}

/**
 * Runs `fn` with system scope: tenant-private rows of every organization are
 * visible and writable to the queries it makes. Use it around the smallest block
 * that must cross organizations, and keep the explicit service-layer checks
 * (ownership, signatures, tokens) inside it — RLS no longer backs them up there.
 *
 * Must be entered BEFORE opening a transaction: the scope of a transaction is
 * fixed when it starts.
 */
export async function withSystemScope<T>(reason: SystemScopeReason, fn: () => Promise<T> | T): Promise<T> {
  if (!(SYSTEM_SCOPE_REASONS as readonly string[]).includes(reason)) {
    throw new Error(`Unknown system scope reason "${reason}"`);
  }
  const parent = storage.getStore();
  if (parent?.inTransaction && parent.scope !== 'system') {
    throw new Error('withSystemScope must be entered before the transaction is opened, not inside it');
  }
  usage.set(reason, (usage.get(reason) ?? 0) + 1);
  logger.debug(
    `system scope: ${reason} (user=${parent?.userId ?? '-'} tenant=${parent?.tenantId ?? '-'} request=${parent?.requestId ?? '-'})`,
  );
  const child: DbContext = { ...parent, scope: 'system', reason, inTransaction: false };
  // `await` inside the scope: Prisma queries are lazy and must start while the scope is active.
  return storage.run(child, async () => await fn());
}

/** Method decorator form of `withSystemScope` for service methods that are system-scoped end to end. */
export function SystemScoped(reason: SystemScopeReason): MethodDecorator {
  return (_target, _key, descriptor: PropertyDescriptor) => {
    const original = descriptor.value as (...args: unknown[]) => unknown;
    descriptor.value = function (this: unknown, ...args: unknown[]) {
      return withSystemScope(reason, () => original.apply(this, args) as Promise<unknown>);
    };
    return descriptor;
  };
}

/** How often each system-scope reason was entered in this process (observability and tests). */
export function systemScopeUsage(): Record<string, number> {
  return Object.fromEntries(usage);
}

/** Internal: marks the flow inside an interactive transaction (see PrismaService.$transaction). */
export function runInTransactionContext<T>(fn: () => T): T {
  const parent = storage.getStore();
  if (!parent) return fn();
  return storage.run({ ...parent, inTransaction: true }, fn);
}

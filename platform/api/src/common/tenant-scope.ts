import { BadRequestException, NotFoundException } from '@nestjs/common';

/**
 * Tenant-ownership helpers. Isolation is enforced in the service layer, so every
 * id that arrives from a client — in the path, the query or the body — must be
 * resolved inside the caller's tenant before it is read, written or linked.
 *
 * A foreign or unknown id yields 404 with the same message, so callers cannot
 * probe for the existence of other tenants' records.
 */

type FindFirstDelegate = { findFirst: (args: any) => Promise<any> };

const isUuid = (v: unknown): v is string =>
  typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

export function requireId(id: unknown, label = 'Record'): string {
  if (!isUuid(id)) throw new BadRequestException(`${label} id must be a valid UUID`);
  return id;
}

/** Loads `id` from `delegate` only if it belongs to `tenantId` (extra `where` merged in). */
export async function findOwned<T = any>(
  delegate: FindFirstDelegate,
  id: unknown,
  tenantId: string,
  label: string,
  extra: Record<string, unknown> = {},
  select?: Record<string, unknown>,
): Promise<T> {
  const safeId = requireId(id, label);
  if (!tenantId) throw new NotFoundException(`${label} not found`);
  const row = await delegate.findFirst({ where: { ...extra, id: safeId, tenantId }, ...(select ? { select } : {}) });
  if (!row) throw new NotFoundException(`${label} not found`);
  return row as T;
}

/** Validates an optional foreign id (undefined/null pass through unchanged). */
export async function assertOwnedIfPresent(
  delegate: FindFirstDelegate,
  id: unknown,
  tenantId: string,
  label: string,
  extra: Record<string, unknown> = {},
): Promise<void> {
  if (id === undefined || id === null || id === '') return;
  await findOwned(delegate, id, tenantId, label, extra, { id: true });
}

/** Validates a list of foreign ids in one query. */
export async function assertAllOwned(
  delegate: { count: (args: any) => Promise<number> },
  ids: unknown[] | undefined | null,
  tenantId: string,
  label: string,
  extra: Record<string, unknown> = {},
): Promise<void> {
  if (!ids?.length) return;
  const unique = [...new Set(ids.map((i) => requireId(i, label)))];
  const count = await delegate.count({ where: { ...extra, id: { in: unique }, tenantId } });
  if (count !== unique.length) throw new NotFoundException(`${label} not found`);
}

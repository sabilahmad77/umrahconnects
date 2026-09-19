import { describe, expect, it } from 'vitest';
import { Prisma } from '@prisma/client';
import { reachesProtectedTable } from './rls-extension';
import { RLS_PROTECTED_TABLES, RLS_UNPROTECTED_TABLES } from './rls-tables';

describe('which operations need the database scope (R05)', () => {
  it('always for protected models and raw queries', () => {
    expect(reachesProtectedTable('Pilgrim', {})).toBe(true);
    expect(reachesProtectedTable('UserPreference', { where: { userId: 'x' } })).toBe(true);
    expect(reachesProtectedTable(undefined, {})).toBe(true);
  });

  it('for other models only when the arguments reach a protected relation', () => {
    expect(reachesProtectedTable('User', { where: { id: 'x' } })).toBe(false);
    expect(reachesProtectedTable('User', { select: { preferences: { select: { notifications: true } } } })).toBe(true);
    expect(reachesProtectedTable('Tenant', { include: { kycRecords: { orderBy: { createdAt: 'desc' } } } })).toBe(true);
    expect(reachesProtectedTable('User', { include: { tenant: { include: { kycRecords: true } } } })).toBe(true);
    expect(reachesProtectedTable('TripGroup', { include: { _count: { select: { incidents: true } } } })).toBe(true);
    expect(reachesProtectedTable('TripGroup', { where: { incidents: { some: {} } } })).toBe(true);
  });

  it('`_count: true` in include/select counts relations; in groupBy/aggregate it counts rows', () => {
    expect(reachesProtectedTable('TripGroup', { include: { _count: true } })).toBe(true);
    expect(reachesProtectedTable('Tenant', { by: ['type'], _count: true })).toBe(false);
  });
});

describe('RLS classification covers every table exactly once', () => {
  const models = Prisma.dmmf.datamodel.models;
  const protectedByTable = new Map(RLS_PROTECTED_TABLES.map((t) => [t.table.split('.')[1], t]));
  const unprotected = new Set(Object.keys(RLS_UNPROTECTED_TABLES).map((t) => t.split('.')[1]));

  it.each(models.map((m) => [m.name, m.dbName ?? m.name]))('%s (%s) is classified', (name, table) => {
    const p = protectedByTable.get(table);
    expect(!!p !== unprotected.has(table), `${table} must be in exactly one list`).toBe(true);
    if (p) expect(p.model).toBe(name);
  });

  it('lists no table that does not exist', () => {
    const tables = new Set(models.map((m) => m.dbName));
    for (const t of [...protectedByTable.keys(), ...unprotected]) expect(tables.has(t), t).toBe(true);
  });

  it('every unprotected table states a reason', () => {
    for (const [t, reason] of Object.entries(RLS_UNPROTECTED_TABLES)) expect(reason.length, t).toBeGreaterThan(20);
  });
});

import { Prisma } from '@prisma/client';

/**
 * What the API's own database login is allowed to do (R05, docs/control-tower/RLS.md).
 * Row-Level Security only binds a role that is not a superuser, has no BYPASSRLS and cannot act as
 * the owner of the tables (an owner can switch RLS off or drop the policies). Any `true` here means the
 * policies are not the backstop they are meant to be.
 */
export interface DatabaseRoleState {
  role: string;
  superuser: boolean;
  bypassRls: boolean;
  /** Owns an application table, or is a member of a role that does (and can act with its rights). */
  ownsTables: boolean;
  /** Is a member of a superuser or BYPASSRLS role (could SET ROLE to it). */
  assumesPrivilegedRole: boolean;
}

/**
 * One catalogue query (also proves the database answers). Tables = ordinary and partitioned tables
 * outside PostgreSQL's own schemas, so `public._prisma_migrations` and every application schema count,
 * while this session's temporary schemas (pg_temp_N, owned by whoever connects) do not.
 */
export const DATABASE_ROLE_QUERY = Prisma.sql`
  SELECT r.rolname::text AS "role",
         r.rolsuper AS "superuser",
         r.rolbypassrls AS "bypassRls",
         EXISTS (
           SELECT 1
             FROM pg_class c
             JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE c.relkind IN ('r', 'p')
              AND n.nspname NOT IN ('pg_catalog', 'information_schema')
              AND n.nspname !~ '^pg_'
              AND pg_has_role(r.oid, c.relowner, 'MEMBER')
         ) AS "ownsTables",
         EXISTS (
           SELECT 1
             FROM pg_roles p
            WHERE (p.rolsuper OR p.rolbypassrls)
              AND p.oid <> r.oid
              AND pg_has_role(r.oid, p.oid, 'MEMBER')
         ) AS "assumesPrivilegedRole"
    FROM pg_roles r
   WHERE r.rolname = current_user`;

/** Human-readable reasons why RLS would not bind this role; empty when it is the restricted runtime login. */
export function databaseRoleProblems(state: DatabaseRoleState): string[] {
  const problems: string[] = [];
  if (state.superuser) problems.push('is a superuser');
  if (state.bypassRls) problems.push('has BYPASSRLS');
  if (state.ownsTables) problems.push('owns (or can act as the owner of) application tables');
  if (state.assumesPrivilegedRole) problems.push('is a member of a superuser or BYPASSRLS role');
  return problems;
}

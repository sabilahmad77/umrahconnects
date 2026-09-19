-- ============================================================================
-- Runtime database role for the API (R05, docs/control-tower/RLS.md)
--
-- The API must NOT connect as a superuser, a BYPASSRLS role or the table owner:
-- superusers and BYPASSRLS roles skip Row-Level Security entirely. This script
-- creates (or updates) a LOGIN role that is a member of uc_app_runtime — the
-- NOLOGIN group that migration 20260918180000_rls_defence_in_depth grants
-- SELECT/INSERT/UPDATE/DELETE to — and re-applies those grants in the current
-- database (idempotent: safe after a restore or a manual schema change).
--
-- Run as a superuser (or a CREATEROLE role that owns the schemas), AFTER
-- `prisma migrate deploy`, against the application database:
--
--   UC_RUNTIME_LOGIN=uc_app UC_RUNTIME_PASSWORD='<secret>' \
--     psql "$MIGRATE_DATABASE_URL_WITHOUT_QUERY" -v ON_ERROR_STOP=1 -f prisma/rls/runtime-role.sql
--
-- The password is read from the environment (never on the command line, never
-- echoed). Then point the API's DATABASE_URL at that login; keep migrations and
-- seeds on the owner URL (MIGRATE_DATABASE_URL).
-- ============================================================================

\getenv runtime_login UC_RUNTIME_LOGIN
\getenv runtime_password UC_RUNTIME_PASSWORD
\if :{?runtime_login}
\else
  \echo 'Set UC_RUNTIME_LOGIN (the API login role name)'
  \quit
\endif
\if :{?runtime_password}
\else
  \echo 'Set UC_RUNTIME_PASSWORD (read from the environment, never printed)'
  \quit
\endif

SELECT 'CREATE ROLE uc_app_runtime NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE'
 WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'uc_app_runtime') \gexec

SELECT format('CREATE ROLE %I LOGIN', :'runtime_login')
 WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = :'runtime_login') \gexec

\set QUIET on
ALTER ROLE :"runtime_login" WITH LOGIN PASSWORD :'runtime_password'
  NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION INHERIT;
\set QUIET off
GRANT uc_app_runtime TO :"runtime_login";

-- Same grants as the migration (keep in sync).
DO $$
DECLARE
  s text;
BEGIN
  FOREACH s IN ARRAY ARRAY[
    'core', 'marketplace', 'social', 'audit', 'plugin_crm', 'plugin_booking', 'plugin_hotel',
    'plugin_visa', 'plugin_transport', 'plugin_finance', 'plugin_group_ops', 'plugin_portal', 'plugin_reporting'
  ] LOOP
    IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = s) THEN
      EXECUTE format('GRANT USAGE ON SCHEMA %I TO uc_app_runtime', s);
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA %I TO uc_app_runtime', s);
      EXECUTE format('GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA %I TO uc_app_runtime', s);
    END IF;
  END LOOP;
  REVOKE UPDATE, DELETE ON audit.audit_logs FROM uc_app_runtime;
END $$;

-- What the API will be: must print f | f | f (not superuser, no BYPASSRLS, not owner of anything).
SELECT r.rolname, r.rolsuper, r.rolbypassrls,
       EXISTS (SELECT 1 FROM pg_class c WHERE c.relowner = r.oid) AS owns_tables
  FROM pg_roles r WHERE r.rolname = :'runtime_login';

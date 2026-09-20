-- ============================================================================
-- Runtime database role for the API (R05, docs/control-tower/RLS.md)
--
-- The API must NOT connect as a superuser, a BYPASSRLS role or the table owner:
-- superusers and BYPASSRLS roles skip Row-Level Security entirely. This script
-- creates (or updates) a LOGIN role that is a member of uc_app_runtime — the
-- NOLOGIN group that migration 20260918180000_rls_defence_in_depth grants
-- SELECT/INSERT/UPDATE/DELETE to — and re-applies those grants (and the default
-- privileges for tables later migrations create) in the current database.
-- Idempotent: run it after every `prisma migrate deploy` and after a restore.
--
-- Run as the owner that runs the migrations (a superuser, or a CREATEROLE role
-- that owns the schemas), AFTER `prisma migrate deploy`, against the application
-- database, with ON_ERROR_STOP so a failure is an exit code:
--
--   UC_RUNTIME_LOGIN=uc_app UC_RUNTIME_PASSWORD='<secret>' \
--     psql "$MIGRATE_DATABASE_URL_WITHOUT_QUERY" -v ON_ERROR_STOP=1 -f prisma/rls/runtime-role.sql
--
-- (infrastructure/kvm/scripts/deploy.sh does this inside the uc-postgres container.)
-- The password is read from the environment (never on the command line, never
-- echoed, kept out of the server log). Then point the API's DATABASE_URL at that
-- login; keep migrations and seeds on the owner URL (MIGRATE_DATABASE_URL).
-- The last line printed is `<login>|<rolsuper>|<rolbypassrls>|<owns_tables>`
-- and must read `<login>|f|f|f`.
-- ============================================================================

\getenv runtime_login UC_RUNTIME_LOGIN
\getenv runtime_password UC_RUNTIME_PASSWORD
-- A missing variable is an error (exit code 3 under ON_ERROR_STOP), not a silent success.
\if :{?runtime_login}
\else
  \echo 'Set UC_RUNTIME_LOGIN (the API login role name)'
  DO $$ BEGIN RAISE EXCEPTION 'UC_RUNTIME_LOGIN is not set'; END $$;
  \quit
\endif
\if :{?runtime_password}
\else
  \echo 'Set UC_RUNTIME_PASSWORD (read from the environment, never printed)'
  DO $$ BEGIN RAISE EXCEPTION 'UC_RUNTIME_PASSWORD is not set'; END $$;
  \quit
\endif

-- Refuse to turn the owner (or the role running this script) into the runtime login: the ALTER ROLE below
-- would strip its privileges and replace its password.
SELECT (:'runtime_login' = current_user
        OR EXISTS (SELECT 1 FROM pg_class c JOIN pg_roles r ON r.oid = c.relowner
                    WHERE r.rolname = :'runtime_login' AND c.relnamespace NOT IN
                          (SELECT oid FROM pg_namespace WHERE nspname ~ '^pg_' OR nspname = 'information_schema'))
        OR EXISTS (SELECT 1 FROM pg_namespace n JOIN pg_roles r ON r.oid = n.nspowner
                    WHERE r.rolname = :'runtime_login' AND n.nspname !~ '^pg_' AND n.nspname <> 'information_schema')
       ) AS runtime_login_is_owner \gset
\if :runtime_login_is_owner
  \echo 'Refusing: UC_RUNTIME_LOGIN names the owner of the schema/tables (or the role running this script); use a dedicated login'
  DO $$ BEGIN RAISE EXCEPTION 'UC_RUNTIME_LOGIN must be a dedicated role, not the owner'; END $$;
  \quit
\endif

-- Keep the statement that carries the password out of the server log (slow-statement and error logging
-- print statement text). Only a superuser may change these; for a CREATEROLE owner the defaults stay.
DO $$
BEGIN
  PERFORM set_config('log_statement', 'none', false);
  PERFORM set_config('log_min_duration_statement', '-1', false);
  PERFORM set_config('log_min_error_statement', 'panic', false);
EXCEPTION WHEN insufficient_privilege THEN
  RAISE NOTICE 'not a superuser: server statement logging settings unchanged';
END $$;

SELECT 'CREATE ROLE uc_app_runtime NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE'
 WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'uc_app_runtime') \gexec

SELECT format('CREATE ROLE %I LOGIN', :'runtime_login')
 WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = :'runtime_login') \gexec

\set QUIET on
ALTER ROLE :"runtime_login" WITH LOGIN PASSWORD :'runtime_password'
  NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION INHERIT;
\set QUIET off
\unset runtime_password
GRANT uc_app_runtime TO :"runtime_login";

-- Same grants as the migration (keep in sync). The default privileges apply to tables and sequences that
-- the role running this script (the migration owner) creates later.
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
      EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA %I GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO uc_app_runtime', s);
      EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA %I GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO uc_app_runtime', s);
    END IF;
  END LOOP;
  IF to_regclass('audit.audit_logs') IS NOT NULL THEN
    REVOKE UPDATE, DELETE ON audit.audit_logs FROM uc_app_runtime;
  END IF;
END $$;

-- What the API will be: must print <login>|f|f|f (not superuser, no BYPASSRLS, not owner of anything).
SELECT r.rolname, r.rolsuper, r.rolbypassrls,
       EXISTS (SELECT 1 FROM pg_class c WHERE c.relowner = r.oid) AS owns_tables
  FROM pg_roles r WHERE r.rolname = :'runtime_login';

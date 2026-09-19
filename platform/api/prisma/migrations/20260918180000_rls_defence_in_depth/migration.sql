-- ============================================================================
-- R05 — Row-Level Security as defence in depth (docs/control-tower/RLS.md)
--
-- Additive: no column, constraint or data changes. Tenant isolation stays in the
-- service layer; these policies make PostgreSQL refuse cross-tenant rows even when
-- a query forgets its tenant filter.
--
-- The application (PrismaService) opens every query on these tables with
--   SELECT set_config('app.scope', <tenant|platform|system>, true),
--          set_config('app.tenant_id', <principal organization>, true),
--          set_config('app.user_id', <principal user>, true)
-- inside the same transaction. No settings ⇒ no rows (fail closed).
--
-- Roles:
--   * The migration/owner role (superuser or BYPASSRLS) runs migrations and seeds.
--   * uc_app_runtime (NOLOGIN, NOSUPERUSER, NOBYPASSRLS) holds the runtime grants;
--     the API's DATABASE_URL logs in as a member of it (see prisma/rls/runtime-role.sql).
--   * FORCE ROW LEVEL SECURITY: the policies apply to the table owner too, so only
--     a superuser/BYPASSRLS role bypasses them — never the running application.
-- ============================================================================

-- ── Scope helpers ───────────────────────────────────────────────────────────
-- current_setting(..., true) returns NULL when never set and '' after a
-- transaction-local value has ended; both mean "no scope".
CREATE OR REPLACE FUNCTION core.rls_scope() RETURNS text
  LANGUAGE sql STABLE PARALLEL SAFE
  AS $$ SELECT NULLIF(current_setting('app.scope', true), '') $$;

CREATE OR REPLACE FUNCTION core.rls_tenant_id() RETURNS uuid
  LANGUAGE sql STABLE PARALLEL SAFE
  AS $$ SELECT NULLIF(current_setting('app.tenant_id', true), '')::uuid $$;

CREATE OR REPLACE FUNCTION core.rls_user_id() RETURNS uuid
  LANGUAGE sql STABLE PARALLEL SAFE
  AS $$ SELECT NULLIF(current_setting('app.user_id', true), '')::uuid $$;

-- ── Runtime role ────────────────────────────────────────────────────────────
-- Cluster-wide NOLOGIN group role. Creating it needs CREATEROLE; where the
-- migration role lacks it, create it once with prisma/rls/runtime-role.sql and
-- re-run the grants below from that file.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'uc_app_runtime') THEN
    BEGIN
      CREATE ROLE uc_app_runtime NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
    EXCEPTION WHEN insufficient_privilege THEN
      RAISE WARNING 'uc_app_runtime was not created (%): run prisma/rls/runtime-role.sql as a superuser', SQLERRM;
    END;
  END IF;
END $$;

DO $$
DECLARE
  s text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'uc_app_runtime') THEN
    RETURN;
  END IF;
  FOREACH s IN ARRAY ARRAY[
    'core', 'marketplace', 'social', 'audit', 'plugin_crm', 'plugin_booking', 'plugin_hotel',
    'plugin_visa', 'plugin_transport', 'plugin_finance', 'plugin_group_ops', 'plugin_portal', 'plugin_reporting'
  ] LOOP
    IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = s) THEN
      EXECUTE format('GRANT USAGE ON SCHEMA %I TO uc_app_runtime', s);
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA %I TO uc_app_runtime', s);
      EXECUTE format('GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA %I TO uc_app_runtime', s);
      -- Tables created by later migrations (run by this same owner) get the same grants.
      EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA %I GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO uc_app_runtime', s);
      EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA %I GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO uc_app_runtime', s);
    END IF;
  END LOOP;
  -- The audit trail is append-only for the running application.
  REVOKE UPDATE, DELETE ON audit.audit_logs FROM uc_app_runtime;
END $$;

-- ── Policies ────────────────────────────────────────────────────────────────
-- Every protected table: ENABLE + FORCE, a scope-specific policy set, and
-- rls_system for code that explicitly entered system scope (withSystemScope).
-- Generated from src/prisma/rls-tables.ts; test/rls.e2e-spec.ts checks they match.

-- plugin_crm.pilgrims (tenant, platform read)
ALTER TABLE plugin_crm.pilgrims ENABLE ROW LEVEL SECURITY;
ALTER TABLE plugin_crm.pilgrims FORCE ROW LEVEL SECURITY;
CREATE POLICY rls_tenant ON plugin_crm.pilgrims FOR ALL
  USING ((core.rls_scope() = 'tenant' AND tenant_id = core.rls_tenant_id()))
  WITH CHECK ((core.rls_scope() = 'tenant' AND tenant_id = core.rls_tenant_id()));
CREATE POLICY rls_platform_read ON plugin_crm.pilgrims FOR SELECT
  USING (core.rls_scope() = 'platform');
CREATE POLICY rls_system ON plugin_crm.pilgrims FOR ALL
  USING (core.rls_scope() = 'system')
  WITH CHECK (core.rls_scope() = 'system');

-- plugin_crm.pilgrim_documents (tenant)
ALTER TABLE plugin_crm.pilgrim_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE plugin_crm.pilgrim_documents FORCE ROW LEVEL SECURITY;
CREATE POLICY rls_tenant ON plugin_crm.pilgrim_documents FOR ALL
  USING ((core.rls_scope() = 'tenant' AND tenant_id = core.rls_tenant_id()))
  WITH CHECK ((core.rls_scope() = 'tenant' AND tenant_id = core.rls_tenant_id()));
CREATE POLICY rls_system ON plugin_crm.pilgrim_documents FOR ALL
  USING (core.rls_scope() = 'system')
  WITH CHECK (core.rls_scope() = 'system');

-- plugin_crm.family_groups (tenant)
ALTER TABLE plugin_crm.family_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE plugin_crm.family_groups FORCE ROW LEVEL SECURITY;
CREATE POLICY rls_tenant ON plugin_crm.family_groups FOR ALL
  USING ((core.rls_scope() = 'tenant' AND tenant_id = core.rls_tenant_id()))
  WITH CHECK ((core.rls_scope() = 'tenant' AND tenant_id = core.rls_tenant_id()));
CREATE POLICY rls_system ON plugin_crm.family_groups FOR ALL
  USING (core.rls_scope() = 'system')
  WITH CHECK (core.rls_scope() = 'system');

-- plugin_crm.pilgrim_account_links (tenant)
ALTER TABLE plugin_crm.pilgrim_account_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE plugin_crm.pilgrim_account_links FORCE ROW LEVEL SECURITY;
CREATE POLICY rls_tenant ON plugin_crm.pilgrim_account_links FOR ALL
  USING ((core.rls_scope() = 'tenant' AND tenant_id = core.rls_tenant_id()))
  WITH CHECK ((core.rls_scope() = 'tenant' AND tenant_id = core.rls_tenant_id()));
CREATE POLICY rls_system ON plugin_crm.pilgrim_account_links FOR ALL
  USING (core.rls_scope() = 'system')
  WITH CHECK (core.rls_scope() = 'system');

-- plugin_booking.packages (tenant, platform read)
ALTER TABLE plugin_booking.packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE plugin_booking.packages FORCE ROW LEVEL SECURITY;
CREATE POLICY rls_tenant ON plugin_booking.packages FOR ALL
  USING ((core.rls_scope() = 'tenant' AND tenant_id = core.rls_tenant_id()))
  WITH CHECK ((core.rls_scope() = 'tenant' AND tenant_id = core.rls_tenant_id()));
CREATE POLICY rls_platform_read ON plugin_booking.packages FOR SELECT
  USING (core.rls_scope() = 'platform');
CREATE POLICY rls_system ON plugin_booking.packages FOR ALL
  USING (core.rls_scope() = 'system')
  WITH CHECK (core.rls_scope() = 'system');

-- plugin_booking.bookings (tenant, platform read)
ALTER TABLE plugin_booking.bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE plugin_booking.bookings FORCE ROW LEVEL SECURITY;
CREATE POLICY rls_tenant ON plugin_booking.bookings FOR ALL
  USING ((core.rls_scope() = 'tenant' AND tenant_id = core.rls_tenant_id()))
  WITH CHECK ((core.rls_scope() = 'tenant' AND tenant_id = core.rls_tenant_id()));
CREATE POLICY rls_platform_read ON plugin_booking.bookings FOR SELECT
  USING (core.rls_scope() = 'platform');
CREATE POLICY rls_system ON plugin_booking.bookings FOR ALL
  USING (core.rls_scope() = 'system')
  WITH CHECK (core.rls_scope() = 'system');

-- plugin_booking.booking_pilgrims (tenant)
ALTER TABLE plugin_booking.booking_pilgrims ENABLE ROW LEVEL SECURITY;
ALTER TABLE plugin_booking.booking_pilgrims FORCE ROW LEVEL SECURITY;
CREATE POLICY rls_tenant ON plugin_booking.booking_pilgrims FOR ALL
  USING ((core.rls_scope() = 'tenant' AND tenant_id = core.rls_tenant_id()))
  WITH CHECK ((core.rls_scope() = 'tenant' AND tenant_id = core.rls_tenant_id()));
CREATE POLICY rls_system ON plugin_booking.booking_pilgrims FOR ALL
  USING (core.rls_scope() = 'system')
  WITH CHECK (core.rls_scope() = 'system');

-- plugin_visa.visa_applications (tenant, platform read)
ALTER TABLE plugin_visa.visa_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE plugin_visa.visa_applications FORCE ROW LEVEL SECURITY;
CREATE POLICY rls_tenant ON plugin_visa.visa_applications FOR ALL
  USING ((core.rls_scope() = 'tenant' AND tenant_id = core.rls_tenant_id()))
  WITH CHECK ((core.rls_scope() = 'tenant' AND tenant_id = core.rls_tenant_id()));
CREATE POLICY rls_platform_read ON plugin_visa.visa_applications FOR SELECT
  USING (core.rls_scope() = 'platform');
CREATE POLICY rls_system ON plugin_visa.visa_applications FOR ALL
  USING (core.rls_scope() = 'system')
  WITH CHECK (core.rls_scope() = 'system');

-- plugin_visa.visa_documents (tenant)
ALTER TABLE plugin_visa.visa_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE plugin_visa.visa_documents FORCE ROW LEVEL SECURITY;
CREATE POLICY rls_tenant ON plugin_visa.visa_documents FOR ALL
  USING ((core.rls_scope() = 'tenant' AND tenant_id = core.rls_tenant_id()))
  WITH CHECK ((core.rls_scope() = 'tenant' AND tenant_id = core.rls_tenant_id()));
CREATE POLICY rls_system ON plugin_visa.visa_documents FOR ALL
  USING (core.rls_scope() = 'system')
  WITH CHECK (core.rls_scope() = 'system');

-- plugin_visa.visa_document_versions (child)
ALTER TABLE plugin_visa.visa_document_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE plugin_visa.visa_document_versions FORCE ROW LEVEL SECURITY;
CREATE POLICY rls_parent_read ON plugin_visa.visa_document_versions FOR SELECT
  USING (EXISTS (SELECT 1 FROM plugin_visa.visa_documents p WHERE p.id = visa_document_versions.document_id));
CREATE POLICY rls_parent_write ON plugin_visa.visa_document_versions FOR ALL
  USING ((core.rls_scope() = 'tenant' AND EXISTS (SELECT 1 FROM plugin_visa.visa_documents p WHERE p.id = visa_document_versions.document_id AND p.tenant_id = core.rls_tenant_id())))
  WITH CHECK ((core.rls_scope() = 'tenant' AND EXISTS (SELECT 1 FROM plugin_visa.visa_documents p WHERE p.id = visa_document_versions.document_id AND p.tenant_id = core.rls_tenant_id())));
CREATE POLICY rls_system ON plugin_visa.visa_document_versions FOR ALL
  USING (core.rls_scope() = 'system')
  WITH CHECK (core.rls_scope() = 'system');

-- plugin_visa.regulatory_submissions (tenant)
ALTER TABLE plugin_visa.regulatory_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE plugin_visa.regulatory_submissions FORCE ROW LEVEL SECURITY;
CREATE POLICY rls_tenant ON plugin_visa.regulatory_submissions FOR ALL
  USING ((core.rls_scope() = 'tenant' AND tenant_id = core.rls_tenant_id()))
  WITH CHECK ((core.rls_scope() = 'tenant' AND tenant_id = core.rls_tenant_id()));
CREATE POLICY rls_system ON plugin_visa.regulatory_submissions FOR ALL
  USING (core.rls_scope() = 'system')
  WITH CHECK (core.rls_scope() = 'system');

-- plugin_visa.visa_service_requests (tenant)
ALTER TABLE plugin_visa.visa_service_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE plugin_visa.visa_service_requests FORCE ROW LEVEL SECURITY;
CREATE POLICY rls_tenant ON plugin_visa.visa_service_requests FOR ALL
  USING ((core.rls_scope() = 'tenant' AND tenant_id = core.rls_tenant_id()))
  WITH CHECK ((core.rls_scope() = 'tenant' AND tenant_id = core.rls_tenant_id()));
CREATE POLICY rls_system ON plugin_visa.visa_service_requests FOR ALL
  USING (core.rls_scope() = 'system')
  WITH CHECK (core.rls_scope() = 'system');

-- plugin_visa.visa_service_request_notes (child)
ALTER TABLE plugin_visa.visa_service_request_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE plugin_visa.visa_service_request_notes FORCE ROW LEVEL SECURITY;
CREATE POLICY rls_parent_read ON plugin_visa.visa_service_request_notes FOR SELECT
  USING (EXISTS (SELECT 1 FROM plugin_visa.visa_service_requests p WHERE p.id = visa_service_request_notes.request_id));
CREATE POLICY rls_parent_write ON plugin_visa.visa_service_request_notes FOR ALL
  USING ((core.rls_scope() = 'tenant' AND EXISTS (SELECT 1 FROM plugin_visa.visa_service_requests p WHERE p.id = visa_service_request_notes.request_id AND p.tenant_id = core.rls_tenant_id())))
  WITH CHECK ((core.rls_scope() = 'tenant' AND EXISTS (SELECT 1 FROM plugin_visa.visa_service_requests p WHERE p.id = visa_service_request_notes.request_id AND p.tenant_id = core.rls_tenant_id())));
CREATE POLICY rls_system ON plugin_visa.visa_service_request_notes FOR ALL
  USING (core.rls_scope() = 'system')
  WITH CHECK (core.rls_scope() = 'system');

-- plugin_visa.visa_service_request_events (child)
ALTER TABLE plugin_visa.visa_service_request_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE plugin_visa.visa_service_request_events FORCE ROW LEVEL SECURITY;
CREATE POLICY rls_parent_read ON plugin_visa.visa_service_request_events FOR SELECT
  USING (EXISTS (SELECT 1 FROM plugin_visa.visa_service_requests p WHERE p.id = visa_service_request_events.request_id));
CREATE POLICY rls_parent_write ON plugin_visa.visa_service_request_events FOR ALL
  USING ((core.rls_scope() = 'tenant' AND EXISTS (SELECT 1 FROM plugin_visa.visa_service_requests p WHERE p.id = visa_service_request_events.request_id AND p.tenant_id = core.rls_tenant_id())))
  WITH CHECK ((core.rls_scope() = 'tenant' AND EXISTS (SELECT 1 FROM plugin_visa.visa_service_requests p WHERE p.id = visa_service_request_events.request_id AND p.tenant_id = core.rls_tenant_id())));
CREATE POLICY rls_system ON plugin_visa.visa_service_request_events FOR ALL
  USING (core.rls_scope() = 'system')
  WITH CHECK (core.rls_scope() = 'system');

-- plugin_finance.invoices (tenant, platform read)
ALTER TABLE plugin_finance.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE plugin_finance.invoices FORCE ROW LEVEL SECURITY;
CREATE POLICY rls_tenant ON plugin_finance.invoices FOR ALL
  USING ((core.rls_scope() = 'tenant' AND tenant_id = core.rls_tenant_id()))
  WITH CHECK ((core.rls_scope() = 'tenant' AND tenant_id = core.rls_tenant_id()));
CREATE POLICY rls_platform_read ON plugin_finance.invoices FOR SELECT
  USING (core.rls_scope() = 'platform');
CREATE POLICY rls_system ON plugin_finance.invoices FOR ALL
  USING (core.rls_scope() = 'system')
  WITH CHECK (core.rls_scope() = 'system');

-- plugin_finance.payments (tenant, platform read)
ALTER TABLE plugin_finance.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE plugin_finance.payments FORCE ROW LEVEL SECURITY;
CREATE POLICY rls_tenant ON plugin_finance.payments FOR ALL
  USING ((core.rls_scope() = 'tenant' AND tenant_id = core.rls_tenant_id()))
  WITH CHECK ((core.rls_scope() = 'tenant' AND tenant_id = core.rls_tenant_id()));
CREATE POLICY rls_platform_read ON plugin_finance.payments FOR SELECT
  USING (core.rls_scope() = 'platform');
CREATE POLICY rls_system ON plugin_finance.payments FOR ALL
  USING (core.rls_scope() = 'system')
  WITH CHECK (core.rls_scope() = 'system');

-- plugin_finance.payment_transactions (tenant)
ALTER TABLE plugin_finance.payment_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE plugin_finance.payment_transactions FORCE ROW LEVEL SECURITY;
CREATE POLICY rls_tenant ON plugin_finance.payment_transactions FOR ALL
  USING ((core.rls_scope() = 'tenant' AND tenant_id = core.rls_tenant_id()))
  WITH CHECK ((core.rls_scope() = 'tenant' AND tenant_id = core.rls_tenant_id()));
CREATE POLICY rls_system ON plugin_finance.payment_transactions FOR ALL
  USING (core.rls_scope() = 'system')
  WITH CHECK (core.rls_scope() = 'system');

-- plugin_finance.payment_webhook_events (tenant)
ALTER TABLE plugin_finance.payment_webhook_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE plugin_finance.payment_webhook_events FORCE ROW LEVEL SECURITY;
CREATE POLICY rls_tenant ON plugin_finance.payment_webhook_events FOR ALL
  USING ((core.rls_scope() = 'tenant' AND tenant_id = core.rls_tenant_id()))
  WITH CHECK ((core.rls_scope() = 'tenant' AND tenant_id = core.rls_tenant_id()));
CREATE POLICY rls_system ON plugin_finance.payment_webhook_events FOR ALL
  USING (core.rls_scope() = 'system')
  WITH CHECK (core.rls_scope() = 'system');

-- plugin_finance.payment_customers (owner-user)
ALTER TABLE plugin_finance.payment_customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE plugin_finance.payment_customers FORCE ROW LEVEL SECURITY;
CREATE POLICY rls_owner ON plugin_finance.payment_customers FOR ALL
  USING ((core.rls_scope() IN ('tenant', 'platform') AND user_id = core.rls_user_id()))
  WITH CHECK ((core.rls_scope() IN ('tenant', 'platform') AND user_id = core.rls_user_id()));
CREATE POLICY rls_system ON plugin_finance.payment_customers FOR ALL
  USING (core.rls_scope() = 'system')
  WITH CHECK (core.rls_scope() = 'system');

-- plugin_finance.budget_plans (tenant)
ALTER TABLE plugin_finance.budget_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE plugin_finance.budget_plans FORCE ROW LEVEL SECURITY;
CREATE POLICY rls_tenant ON plugin_finance.budget_plans FOR ALL
  USING ((core.rls_scope() = 'tenant' AND tenant_id = core.rls_tenant_id()))
  WITH CHECK ((core.rls_scope() = 'tenant' AND tenant_id = core.rls_tenant_id()));
CREATE POLICY rls_system ON plugin_finance.budget_plans FOR ALL
  USING (core.rls_scope() = 'system')
  WITH CHECK (core.rls_scope() = 'system');

-- plugin_finance.ledger_entries (tenant)
ALTER TABLE plugin_finance.ledger_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE plugin_finance.ledger_entries FORCE ROW LEVEL SECURITY;
CREATE POLICY rls_tenant ON plugin_finance.ledger_entries FOR ALL
  USING ((core.rls_scope() = 'tenant' AND tenant_id = core.rls_tenant_id()))
  WITH CHECK ((core.rls_scope() = 'tenant' AND tenant_id = core.rls_tenant_id()));
CREATE POLICY rls_system ON plugin_finance.ledger_entries FOR ALL
  USING (core.rls_scope() = 'system')
  WITH CHECK (core.rls_scope() = 'system');

-- plugin_transport.vehicles (tenant, platform read)
ALTER TABLE plugin_transport.vehicles ENABLE ROW LEVEL SECURITY;
ALTER TABLE plugin_transport.vehicles FORCE ROW LEVEL SECURITY;
CREATE POLICY rls_tenant ON plugin_transport.vehicles FOR ALL
  USING ((core.rls_scope() = 'tenant' AND tenant_id = core.rls_tenant_id()))
  WITH CHECK ((core.rls_scope() = 'tenant' AND tenant_id = core.rls_tenant_id()));
CREATE POLICY rls_platform_read ON plugin_transport.vehicles FOR SELECT
  USING (core.rls_scope() = 'platform');
CREATE POLICY rls_system ON plugin_transport.vehicles FOR ALL
  USING (core.rls_scope() = 'system')
  WITH CHECK (core.rls_scope() = 'system');

-- plugin_transport.drivers (tenant)
ALTER TABLE plugin_transport.drivers ENABLE ROW LEVEL SECURITY;
ALTER TABLE plugin_transport.drivers FORCE ROW LEVEL SECURITY;
CREATE POLICY rls_tenant ON plugin_transport.drivers FOR ALL
  USING ((core.rls_scope() = 'tenant' AND tenant_id = core.rls_tenant_id()))
  WITH CHECK ((core.rls_scope() = 'tenant' AND tenant_id = core.rls_tenant_id()));
CREATE POLICY rls_system ON plugin_transport.drivers FOR ALL
  USING (core.rls_scope() = 'system')
  WITH CHECK (core.rls_scope() = 'system');

-- plugin_transport.vehicle_drivers (child)
ALTER TABLE plugin_transport.vehicle_drivers ENABLE ROW LEVEL SECURITY;
ALTER TABLE plugin_transport.vehicle_drivers FORCE ROW LEVEL SECURITY;
CREATE POLICY rls_parent_read ON plugin_transport.vehicle_drivers FOR SELECT
  USING (EXISTS (SELECT 1 FROM plugin_transport.vehicles p WHERE p.id = vehicle_drivers.vehicle_id));
CREATE POLICY rls_parent_write ON plugin_transport.vehicle_drivers FOR ALL
  USING ((core.rls_scope() = 'tenant' AND EXISTS (SELECT 1 FROM plugin_transport.vehicles p WHERE p.id = vehicle_drivers.vehicle_id AND p.tenant_id = core.rls_tenant_id())))
  WITH CHECK ((core.rls_scope() = 'tenant' AND EXISTS (SELECT 1 FROM plugin_transport.vehicles p WHERE p.id = vehicle_drivers.vehicle_id AND p.tenant_id = core.rls_tenant_id())));
CREATE POLICY rls_system ON plugin_transport.vehicle_drivers FOR ALL
  USING (core.rls_scope() = 'system')
  WITH CHECK (core.rls_scope() = 'system');

-- plugin_transport.transport_routes (tenant)
ALTER TABLE plugin_transport.transport_routes ENABLE ROW LEVEL SECURITY;
ALTER TABLE plugin_transport.transport_routes FORCE ROW LEVEL SECURITY;
CREATE POLICY rls_tenant ON plugin_transport.transport_routes FOR ALL
  USING ((core.rls_scope() = 'tenant' AND tenant_id = core.rls_tenant_id()))
  WITH CHECK ((core.rls_scope() = 'tenant' AND tenant_id = core.rls_tenant_id()));
CREATE POLICY rls_system ON plugin_transport.transport_routes FOR ALL
  USING (core.rls_scope() = 'system')
  WITH CHECK (core.rls_scope() = 'system');

-- plugin_transport.transport_assignments (tenant)
ALTER TABLE plugin_transport.transport_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE plugin_transport.transport_assignments FORCE ROW LEVEL SECURITY;
CREATE POLICY rls_tenant ON plugin_transport.transport_assignments FOR ALL
  USING ((core.rls_scope() = 'tenant' AND tenant_id = core.rls_tenant_id()))
  WITH CHECK ((core.rls_scope() = 'tenant' AND tenant_id = core.rls_tenant_id()));
CREATE POLICY rls_system ON plugin_transport.transport_assignments FOR ALL
  USING (core.rls_scope() = 'system')
  WITH CHECK (core.rls_scope() = 'system');

-- plugin_transport.tasreeh_permits (tenant)
ALTER TABLE plugin_transport.tasreeh_permits ENABLE ROW LEVEL SECURITY;
ALTER TABLE plugin_transport.tasreeh_permits FORCE ROW LEVEL SECURITY;
CREATE POLICY rls_tenant ON plugin_transport.tasreeh_permits FOR ALL
  USING ((core.rls_scope() = 'tenant' AND tenant_id = core.rls_tenant_id()))
  WITH CHECK ((core.rls_scope() = 'tenant' AND tenant_id = core.rls_tenant_id()));
CREATE POLICY rls_system ON plugin_transport.tasreeh_permits FOR ALL
  USING (core.rls_scope() = 'system')
  WITH CHECK (core.rls_scope() = 'system');

-- plugin_hotel.hotels (shared-hotel, platform read)
ALTER TABLE plugin_hotel.hotels ENABLE ROW LEVEL SECURITY;
ALTER TABLE plugin_hotel.hotels FORCE ROW LEVEL SECURITY;
CREATE POLICY rls_tenant ON plugin_hotel.hotels FOR ALL
  USING ((core.rls_scope() = 'tenant' AND tenant_id = core.rls_tenant_id()))
  WITH CHECK ((core.rls_scope() = 'tenant' AND tenant_id = core.rls_tenant_id()));
CREATE POLICY rls_shared_read ON plugin_hotel.hotels FOR SELECT
  USING (tenant_id IS NULL AND core.rls_scope() IS NOT NULL);
CREATE POLICY rls_platform_read ON plugin_hotel.hotels FOR SELECT
  USING (core.rls_scope() = 'platform');
CREATE POLICY rls_system ON plugin_hotel.hotels FOR ALL
  USING (core.rls_scope() = 'system')
  WITH CHECK (core.rls_scope() = 'system');

-- plugin_hotel.room_types (child)
ALTER TABLE plugin_hotel.room_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE plugin_hotel.room_types FORCE ROW LEVEL SECURITY;
CREATE POLICY rls_parent_read ON plugin_hotel.room_types FOR SELECT
  USING (EXISTS (SELECT 1 FROM plugin_hotel.hotels p WHERE p.id = room_types.hotel_id));
CREATE POLICY rls_parent_write ON plugin_hotel.room_types FOR ALL
  USING ((core.rls_scope() = 'tenant' AND EXISTS (SELECT 1 FROM plugin_hotel.hotels p WHERE p.id = room_types.hotel_id AND p.tenant_id = core.rls_tenant_id())))
  WITH CHECK ((core.rls_scope() = 'tenant' AND EXISTS (SELECT 1 FROM plugin_hotel.hotels p WHERE p.id = room_types.hotel_id AND p.tenant_id = core.rls_tenant_id())));
CREATE POLICY rls_system ON plugin_hotel.room_types FOR ALL
  USING (core.rls_scope() = 'system')
  WITH CHECK (core.rls_scope() = 'system');

-- plugin_hotel.rooms (tenant)
ALTER TABLE plugin_hotel.rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE plugin_hotel.rooms FORCE ROW LEVEL SECURITY;
CREATE POLICY rls_tenant ON plugin_hotel.rooms FOR ALL
  USING ((core.rls_scope() = 'tenant' AND tenant_id = core.rls_tenant_id()))
  WITH CHECK ((core.rls_scope() = 'tenant' AND tenant_id = core.rls_tenant_id()));
CREATE POLICY rls_system ON plugin_hotel.rooms FOR ALL
  USING (core.rls_scope() = 'system')
  WITH CHECK (core.rls_scope() = 'system');

-- plugin_hotel.hotel_bookings (tenant)
ALTER TABLE plugin_hotel.hotel_bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE plugin_hotel.hotel_bookings FORCE ROW LEVEL SECURITY;
CREATE POLICY rls_tenant ON plugin_hotel.hotel_bookings FOR ALL
  USING ((core.rls_scope() = 'tenant' AND tenant_id = core.rls_tenant_id()))
  WITH CHECK ((core.rls_scope() = 'tenant' AND tenant_id = core.rls_tenant_id()));
CREATE POLICY rls_system ON plugin_hotel.hotel_bookings FOR ALL
  USING (core.rls_scope() = 'system')
  WITH CHECK (core.rls_scope() = 'system');

-- plugin_hotel.allotments (tenant)
ALTER TABLE plugin_hotel.allotments ENABLE ROW LEVEL SECURITY;
ALTER TABLE plugin_hotel.allotments FORCE ROW LEVEL SECURITY;
CREATE POLICY rls_tenant ON plugin_hotel.allotments FOR ALL
  USING ((core.rls_scope() = 'tenant' AND tenant_id = core.rls_tenant_id()))
  WITH CHECK ((core.rls_scope() = 'tenant' AND tenant_id = core.rls_tenant_id()));
CREATE POLICY rls_system ON plugin_hotel.allotments FOR ALL
  USING (core.rls_scope() = 'system')
  WITH CHECK (core.rls_scope() = 'system');

-- plugin_hotel.room_assignments (tenant)
ALTER TABLE plugin_hotel.room_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE plugin_hotel.room_assignments FORCE ROW LEVEL SECURITY;
CREATE POLICY rls_tenant ON plugin_hotel.room_assignments FOR ALL
  USING ((core.rls_scope() = 'tenant' AND tenant_id = core.rls_tenant_id()))
  WITH CHECK ((core.rls_scope() = 'tenant' AND tenant_id = core.rls_tenant_id()));
CREATE POLICY rls_system ON plugin_hotel.room_assignments FOR ALL
  USING (core.rls_scope() = 'system')
  WITH CHECK (core.rls_scope() = 'system');

-- plugin_group_ops.incidents (tenant)
ALTER TABLE plugin_group_ops.incidents ENABLE ROW LEVEL SECURITY;
ALTER TABLE plugin_group_ops.incidents FORCE ROW LEVEL SECURITY;
CREATE POLICY rls_tenant ON plugin_group_ops.incidents FOR ALL
  USING ((core.rls_scope() = 'tenant' AND tenant_id = core.rls_tenant_id()))
  WITH CHECK ((core.rls_scope() = 'tenant' AND tenant_id = core.rls_tenant_id()));
CREATE POLICY rls_system ON plugin_group_ops.incidents FOR ALL
  USING (core.rls_scope() = 'system')
  WITH CHECK (core.rls_scope() = 'system');

-- core.tenant_kyc (tenant, platform read, platform write)
ALTER TABLE core.tenant_kyc ENABLE ROW LEVEL SECURITY;
ALTER TABLE core.tenant_kyc FORCE ROW LEVEL SECURITY;
CREATE POLICY rls_tenant ON core.tenant_kyc FOR ALL
  USING ((core.rls_scope() = 'tenant' AND tenant_id = core.rls_tenant_id()))
  WITH CHECK ((core.rls_scope() = 'tenant' AND tenant_id = core.rls_tenant_id()));
CREATE POLICY rls_platform_read ON core.tenant_kyc FOR SELECT
  USING (core.rls_scope() = 'platform');
CREATE POLICY rls_platform_admin ON core.tenant_kyc FOR ALL
  USING (core.rls_scope() = 'platform')
  WITH CHECK (core.rls_scope() = 'platform');
CREATE POLICY rls_system ON core.tenant_kyc FOR ALL
  USING (core.rls_scope() = 'system')
  WITH CHECK (core.rls_scope() = 'system');

-- core.user_preferences (owner-user)
ALTER TABLE core.user_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE core.user_preferences FORCE ROW LEVEL SECURITY;
CREATE POLICY rls_owner ON core.user_preferences FOR ALL
  USING ((core.rls_scope() IN ('tenant', 'platform') AND user_id = core.rls_user_id()))
  WITH CHECK ((core.rls_scope() IN ('tenant', 'platform') AND user_id = core.rls_user_id()));
CREATE POLICY rls_system ON core.user_preferences FOR ALL
  USING (core.rls_scope() = 'system')
  WITH CHECK (core.rls_scope() = 'system');


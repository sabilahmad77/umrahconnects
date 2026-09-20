-- ============================================================================
-- A12-3 (eng100-fx3): human-facing references are per-organization and handed
-- out in order, instead of five digits of Math.random() behind a PLATFORM-WIDE
-- unique index.
--
-- `<PREFIX>-<year>-<5 random digits>` draws from 100 000 values shared by every
-- organization on the platform, with no retry on the unique constraint. By the
-- birthday bound a few hundred bookings a year already make a collision routine,
-- and the collision does not degrade gracefully: an ordinary create fails.
--
-- Backwards-compatible: every existing reference keeps its value and stays valid
-- (platform-wide uniqueness implies per-organization uniqueness), and the counters
-- below start above whatever the random generator already produced for that
-- organization, prefix and year — so the first generated number never clashes
-- with a legacy one.
-- ============================================================================

-- ── The counters ────────────────────────────────────────────────────────────
CREATE TABLE "core"."reference_counters" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "prefix" VARCHAR(12) NOT NULL,
    "period" VARCHAR(8) NOT NULL,
    "value" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "reference_counters_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "reference_counters_tenant_id_prefix_period_key"
  ON "core"."reference_counters"("tenant_id", "prefix", "period");

-- ── Uniqueness moves from the platform to the organization ──────────────────
DROP INDEX "plugin_booking"."bookings_booking_ref_key";
CREATE UNIQUE INDEX "bookings_tenant_id_booking_ref_key"
  ON "plugin_booking"."bookings"("tenant_id", "booking_ref");

DROP INDEX "plugin_finance"."invoices_invoice_ref_key";
CREATE UNIQUE INDEX "invoices_tenant_id_invoice_ref_key"
  ON "plugin_finance"."invoices"("tenant_id", "invoice_ref");

DROP INDEX "plugin_finance"."budget_plans_plan_ref_key";
CREATE UNIQUE INDEX "budget_plans_tenant_id_plan_ref_key"
  ON "plugin_finance"."budget_plans"("tenant_id", "plan_ref");

-- ── Start each counter above the legacy random numbers ──────────────────────
-- Only well-formed `PREFIX-YYYY-digits` references count; an operator-entered
-- external visa number in any other shape is ignored. The numeric part is capped
-- at 9 digits so it always fits the counter's integer.
INSERT INTO "core"."reference_counters" ("tenant_id", "prefix", "period", "value", "updated_at")
SELECT "tenant_id", "prefix", "period", MAX("n"), now()
  FROM (
    SELECT "tenant_id",
           split_part("booking_ref", '-', 1) AS "prefix",
           split_part("booking_ref", '-', 2) AS "period",
           split_part("booking_ref", '-', 3)::int AS "n"
      FROM "plugin_booking"."bookings"
     WHERE "booking_ref" ~ '^[A-Z]{1,12}-[0-9]{4}-[0-9]{1,9}$'
    UNION ALL
    SELECT "tenant_id",
           split_part("invoice_ref", '-', 1),
           split_part("invoice_ref", '-', 2),
           split_part("invoice_ref", '-', 3)::int
      FROM "plugin_finance"."invoices"
     WHERE "invoice_ref" ~ '^[A-Z]{1,12}-[0-9]{4}-[0-9]{1,9}$'
    UNION ALL
    SELECT "tenant_id",
           split_part("plan_ref", '-', 1),
           split_part("plan_ref", '-', 2),
           split_part("plan_ref", '-', 3)::int
      FROM "plugin_finance"."budget_plans"
     WHERE "plan_ref" ~ '^[A-Z]{1,12}-[0-9]{4}-[0-9]{1,9}$'
    UNION ALL
    SELECT "tenant_id",
           split_part("application_number", '-', 1),
           split_part("application_number", '-', 2),
           split_part("application_number", '-', 3)::int
      FROM "plugin_visa"."visa_applications"
     WHERE "application_number" ~ '^[A-Z]{1,12}-[0-9]{4}-[0-9]{1,9}$'
  ) AS "legacy"
 GROUP BY "tenant_id", "prefix", "period"
    ON CONFLICT ("tenant_id", "prefix", "period") DO NOTHING;

-- ── Row-Level Security (R05) ────────────────────────────────────────────────
-- A counter is ordinary organization data: an organization allocates its own
-- numbers, and cross-organization flows that legitimately create a record for a
-- provider (marketplace offer conversion) already run in explicit system scope.
ALTER TABLE core.reference_counters ENABLE ROW LEVEL SECURITY;
ALTER TABLE core.reference_counters FORCE ROW LEVEL SECURITY;
CREATE POLICY rls_tenant ON core.reference_counters FOR ALL
  USING ((core.rls_scope() = 'tenant' AND tenant_id = core.rls_tenant_id()))
  WITH CHECK ((core.rls_scope() = 'tenant' AND tenant_id = core.rls_tenant_id()));
CREATE POLICY rls_system ON core.reference_counters FOR ALL
  USING (core.rls_scope() = 'system')
  WITH CHECK (core.rls_scope() = 'system');

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'uc_app_runtime') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON core.reference_counters TO uc_app_runtime;
  END IF;
END $$;

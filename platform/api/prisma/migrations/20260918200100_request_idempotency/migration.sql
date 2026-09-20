-- ============================================================================
-- N-FORM-1 (eng100-fx3): server-side idempotency for ordinary creates.
--
-- Duplicate-submission protection lived only in the browser: apps/web/lib/
-- single-flight.ts joins identical writes that overlap in ONE tab. A second tab,
-- a retry after a token refresh, a flaky connection or any API client walks
-- straight past it — five identical `POST /pilgrims` created five pilgrims.
--
-- A create that carries an `Idempotency-Key` header is recorded here with the
-- caller, the method, the path and a hash of the body, together with the first
-- response. A repeat replays that response instead of creating a second record;
-- the same key with a different body is refused. Money paths keep their own,
-- older idempotency (plugin_finance.payments.idempotency_key) and never reach
-- this table.
--
-- Additive: a new table only. Requests without the header behave exactly as before.
-- ============================================================================

CREATE TABLE "core"."idempotency_keys" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "key" VARCHAR(200) NOT NULL,
    "method" VARCHAR(10) NOT NULL,
    "path" VARCHAR(500) NOT NULL,
    "request_hash" CHAR(64) NOT NULL,
    "status_code" INTEGER,
    "response" JSONB,
    "completed_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "idempotency_keys_pkey" PRIMARY KEY ("id")
);

-- The claim: one row per (caller, key). Concurrent duplicates lose this insert
-- and wait for the winner's answer instead of creating a second record.
CREATE UNIQUE INDEX "idempotency_keys_user_id_key_key" ON "core"."idempotency_keys"("user_id", "key");
CREATE INDEX "idempotency_keys_expires_at_idx" ON "core"."idempotency_keys"("expires_at");

-- ── Row-Level Security (R05) ────────────────────────────────────────────────
-- A key belongs to the user who used it — the same policy shape as core.user_preferences.
ALTER TABLE core.idempotency_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE core.idempotency_keys FORCE ROW LEVEL SECURITY;
CREATE POLICY rls_owner ON core.idempotency_keys FOR ALL
  USING ((core.rls_scope() IN ('tenant', 'platform') AND user_id = core.rls_user_id()))
  WITH CHECK ((core.rls_scope() IN ('tenant', 'platform') AND user_id = core.rls_user_id()));
CREATE POLICY rls_system ON core.idempotency_keys FOR ALL
  USING (core.rls_scope() = 'system')
  WITH CHECK (core.rls_scope() = 'system');

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'uc_app_runtime') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON core.idempotency_keys TO uc_app_runtime;
  END IF;
END $$;

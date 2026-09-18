-- eng100-a07 — traveler ↔ pilgrim linkage (P06 / XT-003, DECISIONS.md D-022).
-- Additive only: one new enum, one new table, indexes and constraints on it.

-- CreateEnum
CREATE TYPE "plugin_crm"."PilgrimLinkStatus" AS ENUM ('INVITED', 'ACTIVE', 'DECLINED', 'REVOKED', 'UNLINKED', 'EXPIRED');

-- CreateTable
CREATE TABLE "plugin_crm"."pilgrim_account_links" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "pilgrim_id" UUID NOT NULL,
    "user_id" UUID,
    "status" "plugin_crm"."PilgrimLinkStatus" NOT NULL DEFAULT 'INVITED',
    "invited_email" VARCHAR(255) NOT NULL,
    "email_source" VARCHAR(20) NOT NULL DEFAULT 'RECORD',
    "token_hash" VARCHAR(64),
    "invited_by" UUID NOT NULL,
    "invited_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "last_sent_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "send_count" INTEGER NOT NULL DEFAULT 1,
    "accepted_at" TIMESTAMPTZ,
    "declined_at" TIMESTAMPTZ,
    "unlinked_at" TIMESTAMPTZ,
    "revoked_at" TIMESTAMPTZ,
    "revoked_by" UUID,
    "revoked_reason" VARCHAR(500),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "pilgrim_account_links_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "pilgrim_account_links_token_hash_key" ON "plugin_crm"."pilgrim_account_links"("token_hash");

-- CreateIndex
CREATE INDEX "pilgrim_account_links_tenant_id_pilgrim_id_idx" ON "plugin_crm"."pilgrim_account_links"("tenant_id", "pilgrim_id");

-- CreateIndex
CREATE INDEX "pilgrim_account_links_user_id_status_idx" ON "plugin_crm"."pilgrim_account_links"("user_id", "status");

-- AddForeignKey
ALTER TABLE "plugin_crm"."pilgrim_account_links" ADD CONSTRAINT "pilgrim_account_links_pilgrim_id_fkey" FOREIGN KEY ("pilgrim_id") REFERENCES "plugin_crm"."pilgrims"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plugin_crm"."pilgrim_account_links" ADD CONSTRAINT "pilgrim_account_links_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "core"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- ── Hand-written integrity rules (not expressible in Prisma 5; its diff ignores
--    partial indexes and CHECK constraints, so they never appear as drift) ──────

-- At most one ACTIVE link per pilgrim record. This also guarantees that one
-- account can never hold two ACTIVE links to the same record.
CREATE UNIQUE INDEX "pilgrim_account_links_one_active_per_pilgrim"
    ON "plugin_crm"."pilgrim_account_links"("pilgrim_id")
    WHERE "status" = 'ACTIVE';

-- At most one outstanding invitation per pilgrim record (resend rotates the
-- token of that invitation instead of creating a second one).
CREATE UNIQUE INDEX "pilgrim_account_links_one_invite_per_pilgrim"
    ON "plugin_crm"."pilgrim_account_links"("pilgrim_id")
    WHERE "status" = 'INVITED';

-- An ACTIVE link always names the account that accepted it, and when.
ALTER TABLE "plugin_crm"."pilgrim_account_links"
    ADD CONSTRAINT "pilgrim_account_links_active_has_account"
    CHECK ("status" <> 'ACTIVE' OR ("user_id" IS NOT NULL AND "accepted_at" IS NOT NULL));

-- An outstanding invitation always has a token hash (the raw token is never stored).
ALTER TABLE "plugin_crm"."pilgrim_account_links"
    ADD CONSTRAINT "pilgrim_account_links_invite_has_token"
    CHECK ("status" <> 'INVITED' OR "token_hash" IS NOT NULL);

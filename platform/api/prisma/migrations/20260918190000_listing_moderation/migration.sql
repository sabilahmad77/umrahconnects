-- F2 (eng100-fx1): platform moderation state for marketplace listings.
--
-- A takedown used to be only status = ARCHIVED, which the owner could move back to
-- DRAFT and republish. The moderation decision now lives in its own columns, which
-- only platform:marketplace:moderate writes; public routes require CLEAR.
-- Additive: existing rows default to CLEAR, nothing is dropped or renamed.

-- AlterTable
ALTER TABLE "marketplace"."listings" ADD COLUMN     "moderated_at" TIMESTAMPTZ,
ADD COLUMN     "moderated_by" UUID,
ADD COLUMN     "moderation_reason" TEXT,
ADD COLUMN     "moderation_status" VARCHAR(20) NOT NULL DEFAULT 'CLEAR';

-- Only the two decisions exist; anything else is a bug, not a state.
ALTER TABLE "marketplace"."listings"
  ADD CONSTRAINT "listings_moderation_status_check"
  CHECK ("moderation_status" IN ('CLEAR', 'TAKEN_DOWN'));

-- Backfill: a listing whose most recent platform decision was a removal
-- (DELETE /admin/listings/:id, audited as SOFT_DELETE) and that is still archived
-- is taken down. Listings already republished through the old bypass are left as
-- they are for a moderator to review (the audit trail lists them).
UPDATE "marketplace"."listings" AS l
SET "moderation_status" = 'TAKEN_DOWN',
    "moderation_reason" = 'Removed by the platform before takedown reasons were recorded. Contact support for details.',
    "moderated_by" = last."actor_id",
    "moderated_at" = last."occurred_at"
FROM (
  SELECT DISTINCT ON ("resource_id") "resource_id", "action", "actor_id", "occurred_at"
  FROM "audit"."audit_logs"
  WHERE "resource" = 'listing' AND "namespace" = 'core' AND "action" IN ('SOFT_DELETE', 'UPDATE')
  ORDER BY "resource_id", "occurred_at" DESC
) AS last
WHERE last."resource_id" = l."id"::text
  AND last."action" = 'SOFT_DELETE'
  AND l."status" = 'ARCHIVED'
  AND l."is_active" = false;

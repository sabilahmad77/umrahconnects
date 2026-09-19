-- eng100-a06: public media registry (upload ownership) and a filterable listing city.
-- Additive only: one nullable column, one new table, indexes, and a backfill of the
-- new column from the value listings already carry in attributes.city.

-- AlterTable
ALTER TABLE "marketplace"."listings" ADD COLUMN     "city" VARCHAR(100);

-- Backfill: the city was only stored inside the attributes JSON until now.
UPDATE "marketplace"."listings"
SET "city" = LEFT(NULLIF(TRIM("attributes"->>'city'), ''), 100)
WHERE "city" IS NULL
  AND jsonb_typeof("attributes"->'city') = 'string';

-- CreateTable
CREATE TABLE "core"."media_objects" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID,
    "owner_user_id" UUID NOT NULL,
    "storage_key" VARCHAR(512) NOT NULL,
    "url" TEXT NOT NULL,
    "driver" VARCHAR(20) NOT NULL,
    "visibility" VARCHAR(20) NOT NULL DEFAULT 'public',
    "mime_type" VARCHAR(120) NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "checksum" VARCHAR(64) NOT NULL,
    "original_name" VARCHAR(255),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "media_objects_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "media_objects_storage_key_key" ON "core"."media_objects"("storage_key");

-- CreateIndex
CREATE INDEX "media_objects_owner_user_id_created_at_idx" ON "core"."media_objects"("owner_user_id", "created_at");

-- CreateIndex
CREATE INDEX "media_objects_tenant_id_idx" ON "core"."media_objects"("tenant_id");

-- CreateIndex
CREATE INDEX "listings_status_is_active_created_at_idx" ON "marketplace"."listings"("status", "is_active", "created_at");

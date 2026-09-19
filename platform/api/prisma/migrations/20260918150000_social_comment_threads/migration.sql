-- eng100-a05: editable comments and posts ("Edited" marker) and a covering index
-- for paginated top-level comments and reply threads. Additive only.

-- AlterTable
ALTER TABLE "social"."comments" ADD COLUMN     "edited_at" TIMESTAMPTZ;

-- AlterTable
ALTER TABLE "social"."posts" ADD COLUMN     "edited_at" TIMESTAMPTZ;

-- CreateIndex
CREATE INDEX "comments_post_id_parent_id_created_at_idx" ON "social"."comments"("post_id", "parent_id", "created_at");

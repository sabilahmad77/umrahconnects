-- eng100-a02 (P07 / XT-005): per-user notification preferences.
-- Additive only: a new table; language and time zone reuse core.users.locale/timezone.

-- CreateTable
CREATE TABLE "core"."user_preferences" (
    "user_id" UUID NOT NULL,
    "notifications" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "user_preferences_pkey" PRIMARY KEY ("user_id")
);

-- AddForeignKey
ALTER TABLE "core"."user_preferences" ADD CONSTRAINT "user_preferences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "core"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;


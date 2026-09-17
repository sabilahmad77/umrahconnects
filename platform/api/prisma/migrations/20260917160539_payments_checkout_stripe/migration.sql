-- AlterTable
ALTER TABLE "plugin_finance"."payments" ADD COLUMN     "listing_booking_id" UUID,
ADD COLUMN     "payer_user_id" UUID;

-- CreateTable
CREATE TABLE "plugin_finance"."payment_customers" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "provider" VARCHAR(40) NOT NULL,
    "provider_customer_id" VARCHAR(200) NOT NULL,
    "livemode" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_customers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "payment_customers_user_id_provider_livemode_key" ON "plugin_finance"."payment_customers"("user_id", "provider", "livemode");

-- CreateIndex
CREATE INDEX "payments_gateway_gateway_ref_idx" ON "plugin_finance"."payments"("gateway", "gateway_ref");

-- CreateIndex
CREATE INDEX "payments_listing_booking_id_idx" ON "plugin_finance"."payments"("listing_booking_id");

-- CreateIndex
CREATE INDEX "payments_payer_user_id_idx" ON "plugin_finance"."payments"("payer_user_id");

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "audit";

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "core";

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "marketplace";

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "plugin_booking";

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "plugin_crm";

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "plugin_finance";

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "plugin_group_ops";

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "plugin_hotel";

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "plugin_portal";

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "plugin_reporting";

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "plugin_transport";

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "plugin_visa";

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "social";

-- CreateEnum
CREATE TYPE "core"."TenantStatus" AS ENUM ('PENDING_KYC', 'KYC_SUBMITTED', 'KYC_APPROVED', 'KYC_REJECTED', 'ACTIVE', 'SUSPENDED', 'CHURNED');

-- CreateEnum
CREATE TYPE "core"."TenantTier" AS ENUM ('STARTER', 'GROWTH', 'SCALE', 'ENTERPRISE');

-- CreateEnum
CREATE TYPE "core"."TenantType" AS ENUM ('OPERATOR', 'MU_ASSASA', 'SUB_AGENT', 'VENDOR_HOTEL', 'VENDOR_TRANSPORT', 'VENDOR_CATERING', 'VENDOR_GUIDE', 'VENDOR_VISA');

-- CreateEnum
CREATE TYPE "core"."UserStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'LOCKED', 'PENDING_VERIFICATION');

-- CreateEnum
CREATE TYPE "core"."Gender" AS ENUM ('MALE', 'FEMALE');

-- CreateEnum
CREATE TYPE "plugin_crm"."PilgrimStatus" AS ENUM ('LEAD', 'PROSPECT', 'BOOKED', 'DOCUMENTS_PENDING', 'VISA_PENDING', 'VISA_APPROVED', 'VISA_REJECTED', 'TRAVELING', 'IN_KINGDOM', 'RETURNED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "plugin_booking"."BookingStatus" AS ENUM ('DRAFT', 'CONFIRMED', 'PARTIALLY_PAID', 'FULLY_PAID', 'VISA_PROCESSING', 'TRAVELING', 'COMPLETED', 'CANCELLED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "plugin_finance"."PaymentStatus" AS ENUM ('PENDING', 'PROCESSING', 'AUTHORIZED', 'COMPLETED', 'FAILED', 'REFUNDED', 'PARTIALLY_REFUNDED', 'DISPUTED');

-- CreateEnum
CREATE TYPE "plugin_finance"."InvoiceStatus" AS ENUM ('DRAFT', 'ISSUED', 'SENT', 'PARTIALLY_PAID', 'PAID', 'OVERDUE', 'CANCELLED', 'VOID');

-- CreateEnum
CREATE TYPE "plugin_visa"."VisaStatus" AS ENUM ('NOT_STARTED', 'DOCUMENTS_COLLECTING', 'SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'EXPIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "plugin_visa"."RegulatorySystem" AS ENUM ('NUSUK_MASAR', 'SISKOPATUH', 'NAHCON', 'DIYANET', 'TABUNG_HAJI', 'MOTAC', 'IBA_DGRP', 'MANUAL');

-- CreateEnum
CREATE TYPE "plugin_hotel"."HotelContractType" AS ENUM ('ALLOTMENT', 'ON_DEMAND', 'GUARANTEED');

-- CreateEnum
CREATE TYPE "plugin_transport"."TransportType" AS ENUM ('BUS_SMALL', 'BUS_MEDIUM', 'BUS_LARGE', 'PRIVATE_CAR', 'VAN');

-- CreateEnum
CREATE TYPE "plugin_transport"."MovementType" AS ENUM ('AIRPORT_PICKUP', 'AIRPORT_DROPOFF', 'MAKKAH_MADINAH', 'MADINAH_MAKKAH', 'ZIYARAT', 'MASHAER_MINA', 'MASHAER_ARAFAT', 'MASHAER_MUZDALIFAH', 'LOCAL');

-- CreateEnum
CREATE TYPE "marketplace"."VendorStatus" AS ENUM ('PENDING_KYC', 'KYC_SUBMITTED', 'VERIFIED', 'SUSPENDED', 'DELISTED');

-- CreateEnum
CREATE TYPE "social"."PostType" AS ENUM ('UPDATE', 'OFFER', 'GUIDELINE', 'QUESTION', 'PARTNERSHIP', 'STORY', 'EVENT');

-- CreateEnum
CREATE TYPE "social"."PostVisibility" AS ENUM ('PUBLIC', 'VERIFIED_ONLY', 'ROLE_SET', 'FOLLOWER_SET', 'CUSTOM_SET');

-- CreateEnum
CREATE TYPE "social"."ModerationStatus" AS ENUM ('PENDING', 'APPROVED', 'HELD_FOR_REVIEW', 'REJECTED', 'SHADOW_BANNED');

-- CreateEnum
CREATE TYPE "social"."SocialAccountType" AS ENUM ('OPERATOR', 'SUB_AGENT', 'VENDOR_HOTEL', 'VENDOR_TRANSPORT', 'VENDOR_CATERING', 'MUTAWIF', 'VISA_PROCESSOR', 'PILGRIM');

-- CreateEnum
CREATE TYPE "audit"."AuditAction" AS ENUM ('CREATE', 'UPDATE', 'DELETE', 'SOFT_DELETE', 'LOGIN', 'LOGOUT', 'PERMISSION_CHANGE', 'TENANT_CONFIG_CHANGE', 'PAYMENT_INITIATE', 'PAYMENT_COMPLETE', 'PAYMENT_FAIL', 'VISA_SUBMIT', 'VISA_STATUS_CHANGE', 'DOCUMENT_UPLOAD', 'DOCUMENT_DELETE', 'DATA_EXPORT', 'DATA_ACCESS');

-- CreateEnum
CREATE TYPE "plugin_visa"."VisaRequestCategory" AS ENUM ('NEW_APPLICATION', 'DOCUMENT_ISSUE', 'STATUS_INQUIRY', 'URGENT_PROCESSING', 'APPOINTMENT', 'CORRECTION', 'REFUND', 'CANCELLATION', 'OTHER');

-- CreateEnum
CREATE TYPE "plugin_visa"."VisaRequestPriority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'URGENT');

-- CreateEnum
CREATE TYPE "plugin_visa"."VisaRequestStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'WAITING_ON_CUSTOMER', 'ESCALATED', 'RESOLVED', 'CLOSED');

-- CreateEnum
CREATE TYPE "plugin_visa"."VisaRequestNoteVisibility" AS ENUM ('INTERNAL', 'PUBLIC');

-- CreateEnum
CREATE TYPE "plugin_visa"."VisaDocumentStatus" AS ENUM ('MISSING', 'RECEIVED', 'VERIFIED', 'REJECTED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "social"."ConnectionStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED', 'BLOCKED');

-- CreateEnum
CREATE TYPE "social"."NotificationType" AS ENUM ('POST_COMMENT', 'POST_REACTION', 'COMMENT_REPLY', 'CONNECTION_REQUEST', 'CONNECTION_ACCEPTED', 'FOLLOW', 'MESSAGE', 'REQUEST_OFFER', 'REQUEST_OFFER_ACCEPTED', 'REQUEST_OFFER_REJECTED', 'GROUP_INVITE', 'BOOKING_CREATED', 'BOOKING_STATUS', 'PAYMENT_RECEIVED', 'VISA_STATUS', 'VISA_REQUEST', 'SYSTEM');

-- CreateEnum
CREATE TYPE "core"."InquiryType" AS ENUM ('CONTACT', 'PARTNER', 'CAREERS', 'NEWSLETTER', 'DEMO', 'SUPPORT');

-- CreateEnum
CREATE TYPE "core"."InquiryStatus" AS ENUM ('NEW', 'IN_REVIEW', 'RESOLVED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "marketplace"."RequestStatus" AS ENUM ('OPEN', 'IN_NEGOTIATION', 'FULFILLED', 'CLOSED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "marketplace"."RequestServiceType" AS ENUM ('HOTEL', 'TRANSPORT', 'VISA', 'PACKAGE', 'GUIDE', 'CATERING', 'OTHER');

-- CreateEnum
CREATE TYPE "marketplace"."OfferStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED', 'WITHDRAWN');

-- CreateTable
CREATE TABLE "core"."tenants" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "slug" VARCHAR(100) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "name_ar" VARCHAR(255),
    "type" "core"."TenantType" NOT NULL,
    "status" "core"."TenantStatus" NOT NULL DEFAULT 'PENDING_KYC',
    "tier" "core"."TenantTier" NOT NULL DEFAULT 'STARTER',
    "license_number" VARCHAR(100),
    "license_country" CHAR(2),
    "license_expiry" DATE,
    "regulatory_system" "plugin_visa"."RegulatorySystem",
    "email" VARCHAR(255) NOT NULL,
    "phone" VARCHAR(30),
    "website" VARCHAR(255),
    "country" CHAR(2) NOT NULL,
    "timezone" VARCHAR(50) NOT NULL DEFAULT 'Asia/Riyadh',
    "locale" VARCHAR(10) NOT NULL DEFAULT 'en',
    "currency" CHAR(3) NOT NULL DEFAULT 'SAR',
    "parent_tenant_id" UUID,
    "metadata" JSONB,
    "settings" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "tenants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "core"."tenant_kyc" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "registry_source" "plugin_visa"."RegulatorySystem" NOT NULL,
    "registry_lookup_at" TIMESTAMPTZ,
    "registry_data" JSONB,
    "verified_at" TIMESTAMPTZ,
    "verified_by" UUID,
    "rejection_reason" TEXT,
    "documents" JSONB NOT NULL DEFAULT '[]',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "tenant_kyc_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "core"."users" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "email" VARCHAR(255),
    "phone" VARCHAR(30),
    "password_hash" TEXT,
    "status" "core"."UserStatus" NOT NULL DEFAULT 'PENDING_VERIFICATION',
    "first_name" VARCHAR(100) NOT NULL,
    "last_name" VARCHAR(100) NOT NULL,
    "first_name_ar" VARCHAR(100),
    "last_name_ar" VARCHAR(100),
    "avatar_url" TEXT,
    "locale" VARCHAR(10) NOT NULL DEFAULT 'en',
    "timezone" VARCHAR(50) NOT NULL DEFAULT 'Asia/Riyadh',
    "mfa_enabled" BOOLEAN NOT NULL DEFAULT false,
    "mfa_secret" TEXT,
    "email_verified_at" TIMESTAMPTZ,
    "phone_verified_at" TIMESTAMPTZ,
    "last_login_at" TIMESTAMPTZ,
    "last_login_ip" TEXT,
    "login_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "created_by" UUID,
    "deleted_at" TIMESTAMPTZ,
    "row_version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "core"."refresh_tokens" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "revoked_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "user_agent" TEXT,
    "ip_address" TEXT,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "core"."otp_codes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID,
    "phone" TEXT,
    "email" TEXT,
    "code_hash" TEXT NOT NULL,
    "purpose" VARCHAR(50) NOT NULL,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "used_at" TIMESTAMPTZ,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "otp_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "core"."roles" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID,
    "name" VARCHAR(100) NOT NULL,
    "description" TEXT,
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "core"."permissions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "namespace" VARCHAR(50) NOT NULL,
    "resource" VARCHAR(100) NOT NULL,
    "action" VARCHAR(50) NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "core"."role_permissions" (
    "role_id" UUID NOT NULL,
    "permission_id" UUID NOT NULL,
    "granted_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "granted_by" UUID,

    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("role_id","permission_id")
);

-- CreateTable
CREATE TABLE "core"."user_roles" (
    "user_id" UUID NOT NULL,
    "role_id" UUID NOT NULL,
    "granted_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "granted_by" UUID,
    "expires_at" TIMESTAMPTZ,

    CONSTRAINT "user_roles_pkey" PRIMARY KEY ("user_id","role_id")
);

-- CreateTable
CREATE TABLE "core"."tenant_plugins" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "plugin_id" VARCHAR(100) NOT NULL,
    "version" VARCHAR(20) NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "config" JSONB NOT NULL DEFAULT '{}',
    "installed_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "installed_by" UUID,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "tenant_plugins_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plugin_crm"."pilgrims" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "status" "plugin_crm"."PilgrimStatus" NOT NULL DEFAULT 'LEAD',
    "first_name_en" VARCHAR(100) NOT NULL,
    "last_name_en" VARCHAR(100) NOT NULL,
    "first_name_ar" VARCHAR(100),
    "last_name_ar" VARCHAR(100),
    "gender" "core"."Gender" NOT NULL,
    "date_of_birth" DATE NOT NULL,
    "nationality" CHAR(2) NOT NULL,
    "email" VARCHAR(255),
    "phone" VARCHAR(30),
    "whatsapp" VARCHAR(30),
    "address" TEXT,
    "city" VARCHAR(100),
    "country" CHAR(2) NOT NULL,
    "preferred_language" VARCHAR(10) NOT NULL DEFAULT 'ar',
    "passport_number" VARCHAR(30),
    "passport_expiry" DATE,
    "passport_country" CHAR(2),
    "national_id" VARCHAR(30),
    "has_disability" BOOLEAN NOT NULL DEFAULT false,
    "needs_wheelchair" BOOLEAN NOT NULL DEFAULT false,
    "medical_notes" TEXT,
    "vaccinated" BOOLEAN NOT NULL DEFAULT false,
    "vaccination_records" JSONB NOT NULL DEFAULT '[]',
    "source" VARCHAR(100),
    "sub_agent_id" UUID,
    "notes" TEXT,
    "tags" TEXT[],
    "prior_umrah_count" INTEGER NOT NULL DEFAULT 0,
    "prior_hajj_count" INTEGER NOT NULL DEFAULT 0,
    "lifetime_spend" BIGINT NOT NULL DEFAULT 0,
    "lifetime_currency" CHAR(3) NOT NULL DEFAULT 'SAR',
    "family_group_id" UUID,
    "mahram_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    "deleted_at" TIMESTAMPTZ,
    "row_version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "pilgrims_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plugin_crm"."family_groups" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "lead_pilgrim_id" UUID,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "family_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plugin_crm"."pilgrim_documents" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "pilgrim_id" UUID NOT NULL,
    "type" VARCHAR(50) NOT NULL,
    "file_name" TEXT NOT NULL,
    "file_url" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "file_size_bytes" INTEGER NOT NULL,
    "ocr_data" JSONB,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "verified_at" TIMESTAMPTZ,
    "verified_by" UUID,
    "expires_at" DATE,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,

    CONSTRAINT "pilgrim_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plugin_booking"."packages" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "name_ar" VARCHAR(255),
    "description" TEXT,
    "description_ar" TEXT,
    "tier" VARCHAR(50) NOT NULL DEFAULT 'STANDARD',
    "tripType" VARCHAR(20) NOT NULL,
    "duration_days" INTEGER NOT NULL,
    "departure_date" DATE,
    "return_date" DATE,
    "base_price_cents" BIGINT NOT NULL,
    "currency" CHAR(3) NOT NULL DEFAULT 'SAR',
    "max_capacity" INTEGER NOT NULL,
    "booked_count" INTEGER NOT NULL DEFAULT 0,
    "includes" JSONB NOT NULL DEFAULT '{}',
    "pricingRules" JSONB NOT NULL DEFAULT '[]',
    "is_published" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "created_by" UUID,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "packages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plugin_booking"."bookings" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "booking_ref" TEXT NOT NULL,
    "package_id" UUID,
    "status" "plugin_booking"."BookingStatus" NOT NULL DEFAULT 'DRAFT',
    "sub_agent_id" UUID,
    "sub_agent_commission_rate" DECIMAL(5,2),
    "total_amount_cents" BIGINT NOT NULL,
    "paid_amount_cents" BIGINT NOT NULL DEFAULT 0,
    "currency" CHAR(3) NOT NULL DEFAULT 'SAR',
    "discount_cents" BIGINT NOT NULL DEFAULT 0,
    "tax_cents" BIGINT NOT NULL DEFAULT 0,
    "group_id" UUID,
    "departure_date" DATE,
    "return_date" DATE,
    "flight_details" JSONB,
    "notes" TEXT,
    "cancellation_reason" TEXT,
    "cancelled_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    "row_version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "bookings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plugin_booking"."booking_pilgrims" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "booking_id" UUID NOT NULL,
    "pilgrim_id" UUID NOT NULL,
    "price_cents" BIGINT,
    "currency" CHAR(3),
    "room_type" VARCHAR(50),
    "bed_type" VARCHAR(30),
    "seat_number" VARCHAR(20),
    "meal_pref" VARCHAR(50),
    "special_reqs" TEXT,
    "added_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "booking_pilgrims_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plugin_hotel"."hotels" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID,
    "vendor_id" UUID,
    "name" VARCHAR(255) NOT NULL,
    "name_ar" VARCHAR(255),
    "city" VARCHAR(100) NOT NULL,
    "country" CHAR(2) NOT NULL DEFAULT 'SA',
    "area" VARCHAR(120),
    "address" TEXT,
    "postal_code" VARCHAR(20),
    "star_rating" INTEGER,
    "distance_to_haram" INTEGER,
    "coordinates" JSONB,
    "amenities" TEXT[],
    "images" TEXT[],
    "description" TEXT,
    "description_ar" TEXT,
    "contact_person" VARCHAR(150),
    "phone" VARCHAR(40),
    "email" VARCHAR(255),
    "check_in_time" VARCHAR(10),
    "check_out_time" VARCHAR(10),
    "cancellation_policy" TEXT,
    "total_rooms" INTEGER NOT NULL DEFAULT 0,
    "status" VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    "notes" TEXT,
    "is_verified" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "hotels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plugin_hotel"."room_types" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "hotel_id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "occupancy" INTEGER NOT NULL,
    "bed_config" VARCHAR(50),
    "description" TEXT,
    "base_price_cents" BIGINT NOT NULL DEFAULT 0,
    "price_per_person_cents" BIGINT,
    "total_count" INTEGER NOT NULL DEFAULT 0,
    "status" VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    "amenities" TEXT[],
    "images" TEXT[],

    CONSTRAINT "room_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plugin_hotel"."rooms" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "hotel_id" UUID NOT NULL,
    "room_type_id" UUID,
    "room_number" VARCHAR(40) NOT NULL,
    "floor" VARCHAR(20),
    "capacity" INTEGER NOT NULL DEFAULT 2,
    "bed_type" VARCHAR(40),
    "bed_count" INTEGER NOT NULL DEFAULT 1,
    "available_beds" INTEGER NOT NULL DEFAULT 0,
    "price_per_night_cents" BIGINT NOT NULL DEFAULT 0,
    "price_per_person_cents" BIGINT,
    "seasonal_pricing" JSONB NOT NULL DEFAULT '[]',
    "images" TEXT[],
    "facilities" TEXT[],
    "description" TEXT,
    "status" VARCHAR(20) NOT NULL DEFAULT 'AVAILABLE',
    "notes" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rooms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plugin_hotel"."hotel_bookings" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "hotel_id" UUID NOT NULL,
    "room_type_id" UUID,
    "room_id" UUID,
    "customer_user_id" UUID,
    "guest_name" VARCHAR(200) NOT NULL,
    "guest_email" VARCHAR(255),
    "guest_phone" VARCHAR(40),
    "guest_nationality" CHAR(2),
    "source" VARCHAR(20) NOT NULL DEFAULT 'EXTERNAL',
    "check_in" DATE NOT NULL,
    "check_out" DATE NOT NULL,
    "guests" INTEGER NOT NULL DEFAULT 1,
    "total_amount_cents" BIGINT NOT NULL DEFAULT 0,
    "currency" VARCHAR(8) NOT NULL DEFAULT 'SAR',
    "status" VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    "payment_status" VARCHAR(20) NOT NULL DEFAULT 'UNPAID',
    "notes" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "hotel_bookings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plugin_hotel"."allotments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "hotel_id" UUID NOT NULL,
    "room_type_id" UUID,
    "contract_type" "plugin_hotel"."HotelContractType" NOT NULL DEFAULT 'ALLOTMENT',
    "check_in" DATE NOT NULL,
    "check_out" DATE NOT NULL,
    "total_rooms" INTEGER NOT NULL,
    "booked_rooms" INTEGER NOT NULL DEFAULT 0,
    "overbook_buffer" INTEGER NOT NULL DEFAULT 0,
    "rate_cents" BIGINT NOT NULL,
    "currency" CHAR(3) NOT NULL DEFAULT 'SAR',
    "cancellation_policy" JSONB NOT NULL DEFAULT '{}',
    "notes" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "allotments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plugin_hotel"."room_assignments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "allotment_id" UUID NOT NULL,
    "booking_id" UUID NOT NULL,
    "room_number" VARCHAR(20),
    "pilgrims" JSONB NOT NULL DEFAULT '[]',
    "check_in" DATE NOT NULL,
    "check_out" DATE NOT NULL,
    "confirmed_at" TIMESTAMPTZ,

    CONSTRAINT "room_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plugin_visa"."visa_applications" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "pilgrim_id" UUID,
    "booking_id" UUID,
    "operator_id" UUID,
    "status" "plugin_visa"."VisaStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "regulatory_system" "plugin_visa"."RegulatorySystem" NOT NULL,
    "applicant_name" VARCHAR(200),
    "applicant_passport" VARCHAR(50),
    "applicant_nationality" CHAR(2),
    "visa_type" VARCHAR(50),
    "destination_country" CHAR(2),
    "service_country" CHAR(2),
    "application_number" VARCHAR(60),
    "required_documents" TEXT[],
    "assigned_officer" VARCHAR(150),
    "expected_completion_at" DATE,
    "price_cents" BIGINT NOT NULL DEFAULT 0,
    "currency" VARCHAR(8) NOT NULL DEFAULT 'SAR',
    "payment_status" VARCHAR(20) NOT NULL DEFAULT 'UNPAID',
    "submitted_at" TIMESTAMPTZ,
    "approved_at" TIMESTAMPTZ,
    "rejected_at" TIMESTAMPTZ,
    "expires_at" DATE,
    "external_ref" VARCHAR(100),
    "regulator_data" JSONB,
    "rejection_code" VARCHAR(50),
    "rejection_reason" TEXT,
    "risk_score" INTEGER,
    "documents" JSONB NOT NULL DEFAULT '[]',
    "timeline" JSONB NOT NULL DEFAULT '[]',
    "notes" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "created_by" UUID,

    CONSTRAINT "visa_applications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plugin_visa"."regulatory_submissions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "regulatory_system" "plugin_visa"."RegulatorySystem" NOT NULL,
    "batch_ref" VARCHAR(100),
    "pilgrim_ids" TEXT[],
    "submitted_at" TIMESTAMPTZ,
    "acknowledged_at" TIMESTAMPTZ,
    "completed_at" TIMESTAMPTZ,
    "failed_at" TIMESTAMPTZ,
    "request_payload" JSONB,
    "response_payload" JSONB,
    "error_details" JSONB,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "regulatory_submissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plugin_visa"."visa_service_requests" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "ticket_number" VARCHAR(30) NOT NULL,
    "subject" VARCHAR(200) NOT NULL,
    "description" TEXT,
    "category" "plugin_visa"."VisaRequestCategory" NOT NULL DEFAULT 'OTHER',
    "priority" "plugin_visa"."VisaRequestPriority" NOT NULL DEFAULT 'NORMAL',
    "status" "plugin_visa"."VisaRequestStatus" NOT NULL DEFAULT 'OPEN',
    "requester_name" VARCHAR(150),
    "requester_email" VARCHAR(255),
    "requester_phone" VARCHAR(30),
    "requester_id" UUID,
    "pilgrim_id" UUID,
    "visa_application_id" UUID,
    "assignee_id" UUID,
    "assignee_name" VARCHAR(150),
    "due_at" TIMESTAMPTZ,
    "first_response_at" TIMESTAMPTZ,
    "escalated_at" TIMESTAMPTZ,
    "escalation_reason" TEXT,
    "resolved_at" TIMESTAMPTZ,
    "resolution" TEXT,
    "closed_at" TIMESTAMPTZ,
    "reopened_at" TIMESTAMPTZ,
    "reopen_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "created_by" UUID,

    CONSTRAINT "visa_service_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plugin_visa"."visa_service_request_notes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "request_id" UUID NOT NULL,
    "visibility" "plugin_visa"."VisaRequestNoteVisibility" NOT NULL DEFAULT 'INTERNAL',
    "body" TEXT NOT NULL,
    "author_id" UUID,
    "author_name" VARCHAR(150),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "visa_service_request_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plugin_visa"."visa_service_request_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "request_id" UUID NOT NULL,
    "type" VARCHAR(40) NOT NULL,
    "message" VARCHAR(400) NOT NULL,
    "from_value" VARCHAR(100),
    "to_value" VARCHAR(100),
    "actor_id" UUID,
    "actor_email" VARCHAR(255),
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "visa_service_request_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plugin_visa"."visa_documents" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "application_id" UUID NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "type" VARCHAR(60) NOT NULL DEFAULT 'OTHER',
    "status" "plugin_visa"."VisaDocumentStatus" NOT NULL DEFAULT 'MISSING',
    "url" TEXT,
    "mime_type" VARCHAR(120),
    "size_bytes" INTEGER,
    "version" INTEGER NOT NULL DEFAULT 0,
    "expires_at" DATE,
    "verified_at" TIMESTAMPTZ,
    "verified_by" UUID,
    "rejected_at" TIMESTAMPTZ,
    "rejection_reason" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "created_by" UUID,

    CONSTRAINT "visa_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plugin_visa"."visa_document_versions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "document_id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "url" TEXT NOT NULL,
    "storage_key" TEXT,
    "driver" VARCHAR(20) NOT NULL DEFAULT 'local',
    "mime_type" VARCHAR(120),
    "size_bytes" INTEGER,
    "checksum" VARCHAR(64),
    "uploaded_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "uploaded_by" UUID,
    "replaced_at" TIMESTAMPTZ,

    CONSTRAINT "visa_document_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plugin_transport"."vehicles" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "vendor_id" UUID,
    "type" "plugin_transport"."TransportType" NOT NULL,
    "name" VARCHAR(200),
    "brand" VARCHAR(100),
    "plate_number" VARCHAR(30) NOT NULL,
    "registration_number" VARCHAR(50),
    "capacity" INTEGER NOT NULL,
    "booked_seats" INTEGER NOT NULL DEFAULT 0,
    "luggage_capacity" INTEGER,
    "has_ac" BOOLEAN NOT NULL DEFAULT true,
    "licensed_for_hajj" BOOLEAN NOT NULL DEFAULT false,
    "saudi_license_no" VARCHAR(50),
    "model" VARCHAR(100),
    "year" INTEGER,
    "features" TEXT[],
    "image_urls" TEXT[],
    "document_urls" TEXT[],
    "status" VARCHAR(20) NOT NULL DEFAULT 'AVAILABLE',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "vehicles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plugin_transport"."drivers" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "vendor_id" UUID,
    "first_name" VARCHAR(100) NOT NULL,
    "last_name" VARCHAR(100) NOT NULL,
    "phone" VARCHAR(30) NOT NULL,
    "email" VARCHAR(255),
    "nationality" CHAR(2),
    "id_number" VARCHAR(50),
    "languages" TEXT[],
    "license_number" VARCHAR(50),
    "license_expiry" DATE,
    "photo_url" TEXT,
    "document_urls" TEXT[],
    "status" VARCHAR(20) NOT NULL DEFAULT 'AVAILABLE',
    "rating" DECIMAL(3,2),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "drivers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plugin_transport"."vehicle_drivers" (
    "vehicle_id" UUID NOT NULL,
    "driver_id" UUID NOT NULL,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "assigned_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vehicle_drivers_pkey" PRIMARY KEY ("vehicle_id","driver_id")
);

-- CreateTable
CREATE TABLE "plugin_transport"."transport_routes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "movement_type" "plugin_transport"."MovementType" NOT NULL,
    "origin_city" VARCHAR(100) NOT NULL,
    "dest_city" VARCHAR(100) NOT NULL,
    "pickup_point" VARCHAR(255),
    "dropoff_point" VARCHAR(255),
    "distance_km" INTEGER,
    "duration_mins" INTEGER,
    "departure_at" TIMESTAMPTZ,
    "arrival_at" TIMESTAMPTZ,
    "price_per_seat_cents" BIGINT,
    "price_per_vehicle_cents" BIGINT,
    "currency" VARCHAR(8) NOT NULL DEFAULT 'SAR',
    "total_seats" INTEGER,
    "booked_seats" INTEGER NOT NULL DEFAULT 0,
    "vehicle_id" UUID,
    "driver_id" UUID,
    "status" VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    "notes" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "transport_routes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plugin_transport"."transport_assignments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "vehicle_id" UUID NOT NULL,
    "route_id" UUID,
    "driver_id" UUID,
    "group_id" UUID,
    "booking_id" UUID,
    "customer_type" VARCHAR(20) NOT NULL DEFAULT 'PLATFORM_USER',
    "customer_name" VARCHAR(200),
    "customer_email" VARCHAR(255),
    "customer_phone" VARCHAR(40),
    "pickup_location" VARCHAR(255),
    "dropoff_location" VARCHAR(255),
    "scheduled_at" TIMESTAMPTZ NOT NULL,
    "departed_at" TIMESTAMPTZ,
    "arrived_at" TIMESTAMPTZ,
    "pilgrims" JSONB NOT NULL DEFAULT '[]',
    "passenger_count" INTEGER NOT NULL DEFAULT 1,
    "price_cents" BIGINT NOT NULL DEFAULT 0,
    "currency" VARCHAR(8) NOT NULL DEFAULT 'SAR',
    "payment_status" VARCHAR(20) NOT NULL DEFAULT 'UNPAID',
    "status" VARCHAR(20) NOT NULL DEFAULT 'SCHEDULED',
    "notes" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "transport_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plugin_transport"."tasreeh_permits" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "vehicle_id" UUID NOT NULL,
    "permit_number" VARCHAR(50) NOT NULL,
    "permit_date" DATE NOT NULL,
    "zone" VARCHAR(50) NOT NULL,
    "issued_at" TIMESTAMPTZ,
    "expires_at" DATE NOT NULL,
    "document_url" TEXT,

    CONSTRAINT "tasreeh_permits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plugin_finance"."invoices" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "invoice_ref" TEXT NOT NULL,
    "status" "plugin_finance"."InvoiceStatus" NOT NULL DEFAULT 'DRAFT',
    "type" VARCHAR(30) NOT NULL DEFAULT 'CUSTOMER',
    "booking_id" UUID,
    "pilgrim_id" UUID,
    "vendor_id" UUID,
    "issued_to_name" TEXT NOT NULL,
    "issued_to_address" JSONB,
    "subtotal_cents" BIGINT NOT NULL,
    "tax_cents" BIGINT NOT NULL DEFAULT 0,
    "discount_cents" BIGINT NOT NULL DEFAULT 0,
    "total_cents" BIGINT NOT NULL,
    "paid_cents" BIGINT NOT NULL DEFAULT 0,
    "currency" CHAR(3) NOT NULL DEFAULT 'SAR',
    "issued_at" DATE,
    "due_at" DATE,
    "paid_at" TIMESTAMPTZ,
    "zatca_uuid" UUID,
    "zatca_hash" TEXT,
    "zatca_qr_code" TEXT,
    "zatca_cleared_at" TIMESTAMPTZ,
    "line_items" JSONB NOT NULL DEFAULT '[]',
    "notes" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "created_by" UUID,

    CONSTRAINT "invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plugin_finance"."payments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "invoice_id" UUID,
    "booking_id" UUID,
    "pilgrim_id" UUID,
    "status" "plugin_finance"."PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "amount_cents" BIGINT NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "fx_rate_sar" DECIMAL(15,6),
    "gateway" VARCHAR(50) NOT NULL,
    "gateway_ref" VARCHAR(200),
    "gateway_status" VARCHAR(50),
    "gateway_response" JSONB,
    "is_bnpl" BOOLEAN NOT NULL DEFAULT false,
    "bnpl_provider" VARCHAR(50),
    "installment_plan" JSONB,
    "idempotency_key" TEXT NOT NULL,
    "paid_at" TIMESTAMPTZ,
    "failed_at" TIMESTAMPTZ,
    "failure_reason" TEXT,
    "refunded_cents" BIGINT NOT NULL DEFAULT 0,
    "refunded_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plugin_finance"."budget_plans" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "plan_ref" TEXT NOT NULL,
    "client_user_id" UUID,
    "client_name" VARCHAR(200) NOT NULL,
    "client_type" VARCHAR(20) NOT NULL DEFAULT 'TRAVELER',
    "request_id" UUID,
    "destination" VARCHAR(120),
    "date_from" DATE,
    "date_to" DATE,
    "travelers" INTEGER NOT NULL DEFAULT 1,
    "currency" VARCHAR(8) NOT NULL DEFAULT 'SAR',
    "total_budget_cents" BIGINT NOT NULL DEFAULT 0,
    "hotel_budget_cents" BIGINT NOT NULL DEFAULT 0,
    "transport_budget_cents" BIGINT NOT NULL DEFAULT 0,
    "visa_budget_cents" BIGINT NOT NULL DEFAULT 0,
    "package_budget_cents" BIGINT NOT NULL DEFAULT 0,
    "other_budget_cents" BIGINT NOT NULL DEFAULT 0,
    "commission_rate" DECIMAL(5,2),
    "commission_cents" BIGINT NOT NULL DEFAULT 0,
    "suggested_options" JSONB NOT NULL DEFAULT '[]',
    "final_plan" JSONB,
    "status" VARCHAR(20) NOT NULL DEFAULT 'DRAFT',
    "notes" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "created_by" UUID,

    CONSTRAINT "budget_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plugin_finance"."ledger_entries" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "account_code" VARCHAR(20) NOT NULL,
    "type" VARCHAR(10) NOT NULL,
    "amount_cents" BIGINT NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "fx_rate_sar" DECIMAL(15,6),
    "reference_type" VARCHAR(50) NOT NULL,
    "reference_id" UUID NOT NULL,
    "description" TEXT,
    "posted_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,

    CONSTRAINT "ledger_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plugin_finance"."fx_rates" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "base_currency" CHAR(3) NOT NULL DEFAULT 'SAR',
    "quote_currency" CHAR(3) NOT NULL,
    "rate" DECIMAL(18,8) NOT NULL,
    "source" VARCHAR(50) NOT NULL DEFAULT 'manual',
    "rate_date" DATE NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fx_rates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plugin_group_ops"."trip_groups" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "description" TEXT,
    "cover_url" TEXT,
    "visibility" VARCHAR(20) NOT NULL DEFAULT 'PRIVATE',
    "tripType" VARCHAR(20) NOT NULL DEFAULT 'UMRAH',
    "season" VARCHAR(50),
    "departure_date" DATE,
    "return_date" DATE,
    "capacity" INTEGER NOT NULL,
    "enrolled_count" INTEGER NOT NULL DEFAULT 0,
    "mutawif_id" UUID,
    "lead_guide_id" UUID,
    "status" VARCHAR(50) NOT NULL DEFAULT 'PLANNING',
    "itinerary" JSONB NOT NULL DEFAULT '[]',
    "briefing_notes" TEXT,
    "emergency_contact" JSONB,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "created_by" UUID,

    CONSTRAINT "trip_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plugin_group_ops"."group_members" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "group_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role" VARCHAR(20) NOT NULL DEFAULT 'MEMBER',
    "status" VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    "joined_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,

    CONSTRAINT "group_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plugin_group_ops"."group_invites" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "group_id" UUID NOT NULL,
    "invitee_user_id" UUID,
    "invitee_email" VARCHAR(255),
    "invited_by" UUID NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    "message" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "responded_at" TIMESTAMPTZ,

    CONSTRAINT "group_invites_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plugin_group_ops"."group_posts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "group_id" UUID NOT NULL,
    "author_id" UUID NOT NULL,
    "body" TEXT NOT NULL,
    "media_urls" TEXT[],
    "is_pinned" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "group_posts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plugin_group_ops"."group_post_comments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "post_id" UUID NOT NULL,
    "author_id" UUID NOT NULL,
    "body" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "group_post_comments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plugin_group_ops"."group_polls" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "group_id" UUID NOT NULL,
    "author_id" UUID NOT NULL,
    "question" VARCHAR(500) NOT NULL,
    "options" JSONB NOT NULL DEFAULT '[]',
    "is_multiple" BOOLEAN NOT NULL DEFAULT false,
    "closes_at" TIMESTAMPTZ,
    "status" VARCHAR(20) NOT NULL DEFAULT 'OPEN',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "group_polls_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plugin_group_ops"."group_poll_votes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "poll_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "option_index" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "group_poll_votes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plugin_group_ops"."group_notes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "group_id" UUID NOT NULL,
    "author_id" UUID NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "body" TEXT,
    "category" VARCHAR(30) NOT NULL DEFAULT 'GENERAL',
    "pinned" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "group_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plugin_group_ops"."group_documents" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "group_id" UUID NOT NULL,
    "uploader_id" UUID NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "url" TEXT NOT NULL,
    "mime_type" VARCHAR(120),
    "size_bytes" INTEGER,
    "description" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "group_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plugin_group_ops"."incidents" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "group_id" UUID NOT NULL,
    "pilgrim_id" UUID,
    "type" VARCHAR(50) NOT NULL,
    "severity" VARCHAR(20) NOT NULL,
    "description" TEXT NOT NULL,
    "location" TEXT,
    "resolved_at" TIMESTAMPTZ,
    "resolution" TEXT,
    "reported_by" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "incidents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "marketplace"."vendors" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID,
    "status" "marketplace"."VendorStatus" NOT NULL DEFAULT 'PENDING_KYC',
    "type" "core"."TenantType" NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "name_ar" VARCHAR(255),
    "description" TEXT,
    "email" VARCHAR(255) NOT NULL,
    "phone" VARCHAR(30),
    "website" TEXT,
    "country" CHAR(2) NOT NULL,
    "city" VARCHAR(100),
    "address" TEXT,
    "kyc_documents" JSONB NOT NULL DEFAULT '[]',
    "verified_at" TIMESTAMPTZ,
    "verified_by" UUID,
    "rating" DECIMAL(3,2),
    "rating_count" INTEGER NOT NULL DEFAULT 0,
    "logo_url" TEXT,
    "images" TEXT[],
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "vendors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "marketplace"."listings" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "vendor_id" UUID NOT NULL,
    "type" VARCHAR(50) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "name_ar" VARCHAR(255),
    "description" TEXT,
    "price_cents" BIGINT NOT NULL,
    "currency" CHAR(3) NOT NULL DEFAULT 'SAR',
    "pricingModel" VARCHAR(30) NOT NULL DEFAULT 'PER_PERSON',
    "attributes" JSONB NOT NULL DEFAULT '{}',
    "image_urls" TEXT[],
    "status" VARCHAR(20) NOT NULL DEFAULT 'PUBLISHED',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "listings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "marketplace"."listing_inquiries" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "listing_id" UUID NOT NULL,
    "from_user_id" UUID,
    "from_name" VARCHAR(200),
    "from_email" VARCHAR(255),
    "from_phone" VARCHAR(40),
    "message" TEXT NOT NULL,
    "party_size" INTEGER,
    "start_date" DATE,
    "end_date" DATE,
    "status" VARCHAR(20) NOT NULL DEFAULT 'NEW',
    "response" TEXT,
    "responded_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "listing_inquiries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "marketplace"."listing_bookings" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "listing_id" UUID NOT NULL,
    "customer_user_id" UUID,
    "customer_name" VARCHAR(200) NOT NULL,
    "customer_email" VARCHAR(255),
    "customer_phone" VARCHAR(40),
    "start_date" DATE,
    "end_date" DATE,
    "party_size" INTEGER NOT NULL DEFAULT 1,
    "total_amount_cents" BIGINT NOT NULL DEFAULT 0,
    "currency" VARCHAR(8) NOT NULL DEFAULT 'SAR',
    "status" VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    "payment_status" VARCHAR(20) NOT NULL DEFAULT 'UNPAID',
    "notes" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "listing_bookings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "marketplace"."quotes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "vendor_id" UUID NOT NULL,
    "listing_id" UUID,
    "status" VARCHAR(30) NOT NULL DEFAULT 'PENDING',
    "requirements" JSONB NOT NULL DEFAULT '{}',
    "offered_price_cents" BIGINT,
    "currency" CHAR(3) NOT NULL DEFAULT 'SAR',
    "valid_until" TIMESTAMPTZ,
    "requested_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "responded_at" TIMESTAMPTZ,
    "accepted_at" TIMESTAMPTZ,
    "rejected_at" TIMESTAMPTZ,
    "notes" TEXT,

    CONSTRAINT "quotes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "marketplace"."vendor_ratings" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "vendor_id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "booking_ref" TEXT,
    "score" INTEGER NOT NULL,
    "review" TEXT,
    "is_verified" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vendor_ratings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "social"."social_accounts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "type" "social"."SocialAccountType" NOT NULL,
    "display_name" VARCHAR(100) NOT NULL,
    "bio" TEXT,
    "avatar_url" TEXT,
    "is_verified" BOOLEAN NOT NULL DEFAULT false,
    "verified_badge" TEXT,
    "privacy_default" "social"."PostVisibility" NOT NULL DEFAULT 'PUBLIC',
    "cover_url" TEXT,
    "phone" VARCHAR(40),
    "nationality" CHAR(2),
    "city" VARCHAR(100),
    "travel_interests" TEXT[],
    "preferred_date_from" DATE,
    "preferred_date_to" DATE,
    "profile_visibility" VARCHAR(20) NOT NULL DEFAULT 'PUBLIC',
    "contact_visibility" VARCHAR(20) NOT NULL DEFAULT 'CONNECTIONS',
    "follower_count" INTEGER NOT NULL DEFAULT 0,
    "following_count" INTEGER NOT NULL DEFAULT 0,
    "post_count" INTEGER NOT NULL DEFAULT 0,
    "is_suspended" BOOLEAN NOT NULL DEFAULT false,
    "is_shadow_banned" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "social_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "social"."saved_posts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "account_id" UUID NOT NULL,
    "post_id" UUID NOT NULL,
    "saved_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "saved_posts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "social"."posts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "author_id" UUID NOT NULL,
    "type" "social"."PostType" NOT NULL,
    "visibility" "social"."PostVisibility" NOT NULL DEFAULT 'PUBLIC',
    "moderation_status" "social"."ModerationStatus" NOT NULL DEFAULT 'PENDING',
    "body" VARCHAR(2000),
    "structured_data" JSONB,
    "media_urls" TEXT[],
    "attachment_url" TEXT,
    "tags" TEXT[],
    "language" VARCHAR(10) NOT NULL DEFAULT 'ar',
    "expires_at" TIMESTAMPTZ,
    "like_count" INTEGER NOT NULL DEFAULT 0,
    "comment_count" INTEGER NOT NULL DEFAULT 0,
    "share_count" INTEGER NOT NULL DEFAULT 0,
    "save_count" INTEGER NOT NULL DEFAULT 0,
    "source_country" CHAR(2),
    "target_roles" TEXT[],
    "moderated_at" TIMESTAMPTZ,
    "moderated_by" UUID,
    "moderation_notes" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "posts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "social"."comments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "post_id" UUID NOT NULL,
    "author_id" UUID NOT NULL,
    "parent_id" UUID,
    "body" VARCHAR(1000) NOT NULL,
    "like_count" INTEGER NOT NULL DEFAULT 0,
    "moderation_status" "social"."ModerationStatus" NOT NULL DEFAULT 'APPROVED',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "comments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "social"."reactions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "account_id" UUID NOT NULL,
    "post_id" UUID,
    "comment_id" UUID,
    "type" VARCHAR(20) NOT NULL DEFAULT 'LIKE',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "social"."follows" (
    "follower_id" UUID NOT NULL,
    "followed_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "follows_pkey" PRIMARY KEY ("follower_id","followed_id")
);

-- CreateTable
CREATE TABLE "social"."conversations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "type" VARCHAR(20) NOT NULL DEFAULT 'DM',
    "name" VARCHAR(200),
    "context_ref" VARCHAR(100),
    "participants" JSONB NOT NULL DEFAULT '[]',
    "last_message_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "social"."messages" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "conversation_id" UUID NOT NULL,
    "sender_id" UUID NOT NULL,
    "body" VARCHAR(4000) NOT NULL,
    "media_urls" TEXT[],
    "read_by" JSONB NOT NULL DEFAULT '[]',
    "deleted_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "social"."post_reports" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "post_id" UUID NOT NULL,
    "reporter_id" UUID NOT NULL,
    "reason" VARCHAR(50) NOT NULL,
    "details" TEXT,
    "resolved_at" TIMESTAMPTZ,
    "resolved_by" UUID,
    "resolution" VARCHAR(50),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "post_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "social"."connections" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "requester_id" UUID NOT NULL,
    "recipient_id" UUID NOT NULL,
    "status" "social"."ConnectionStatus" NOT NULL DEFAULT 'PENDING',
    "message" TEXT,
    "responded_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "connections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "social"."notifications" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID,
    "recipient_id" UUID NOT NULL,
    "actor_id" UUID,
    "type" "social"."NotificationType" NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "body" TEXT,
    "link" TEXT,
    "data" JSONB,
    "read_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "core"."public_inquiries" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "type" "core"."InquiryType" NOT NULL,
    "status" "core"."InquiryStatus" NOT NULL DEFAULT 'NEW',
    "name" VARCHAR(160),
    "email" VARCHAR(200) NOT NULL,
    "phone" VARCHAR(40),
    "company" VARCHAR(200),
    "subject" VARCHAR(240),
    "message" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "public_inquiries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "marketplace"."marketplace_requests" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "traveler_id" UUID NOT NULL,
    "service_type" "marketplace"."RequestServiceType" NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "description" TEXT,
    "city" TEXT,
    "date_from" TIMESTAMPTZ,
    "date_to" TIMESTAMPTZ,
    "travelers" INTEGER NOT NULL DEFAULT 1,
    "budget_min_cents" BIGINT,
    "budget_max_cents" BIGINT,
    "currency" VARCHAR(8) NOT NULL DEFAULT 'SAR',
    "requirements" JSONB,
    "status" "marketplace"."RequestStatus" NOT NULL DEFAULT 'OPEN',
    "accepted_offer_id" UUID,
    "expires_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "marketplace_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "marketplace"."request_offers" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "request_id" UUID NOT NULL,
    "provider_id" UUID NOT NULL,
    "vendor_id" UUID,
    "title" VARCHAR(200) NOT NULL,
    "description" TEXT,
    "price_cents" BIGINT NOT NULL,
    "currency" VARCHAR(8) NOT NULL DEFAULT 'SAR',
    "valid_until" TIMESTAMPTZ,
    "status" "marketplace"."OfferStatus" NOT NULL DEFAULT 'PENDING',
    "responded_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "request_offers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit"."audit_logs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID,
    "actor_id" UUID,
    "actor_email" TEXT,
    "action" "audit"."AuditAction" NOT NULL,
    "namespace" VARCHAR(50) NOT NULL,
    "resource" VARCHAR(100) NOT NULL,
    "resource_id" TEXT,
    "before_state" JSONB,
    "after_state" JSONB,
    "metadata" JSONB,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "request_id" TEXT,
    "occurred_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plugin_finance"."payment_transactions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "payment_id" UUID NOT NULL,
    "type" VARCHAR(40) NOT NULL,
    "provider" VARCHAR(40) NOT NULL,
    "amount_cents" BIGINT NOT NULL DEFAULT 0,
    "currency" CHAR(3) NOT NULL DEFAULT 'SAR',
    "provider_ref" VARCHAR(200),
    "status" VARCHAR(40),
    "message" VARCHAR(400),
    "payload" JSONB,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actor_id" UUID,

    CONSTRAINT "payment_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plugin_finance"."payment_webhook_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "provider" VARCHAR(40) NOT NULL,
    "event_id" VARCHAR(200) NOT NULL,
    "type" VARCHAR(80) NOT NULL,
    "payment_id" UUID,
    "tenant_id" UUID,
    "signature" VARCHAR(400),
    "payload" JSONB,
    "processed_at" TIMESTAMPTZ,
    "result" VARCHAR(200),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_webhook_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tenants_slug_key" ON "core"."tenants"("slug");

-- CreateIndex
CREATE INDEX "users_tenant_id_idx" ON "core"."users"("tenant_id");

-- CreateIndex
CREATE INDEX "users_email_idx" ON "core"."users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_tenant_id_email_key" ON "core"."users"("tenant_id", "email");

-- CreateIndex
CREATE UNIQUE INDEX "users_tenant_id_phone_key" ON "core"."users"("tenant_id", "phone");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_token_hash_key" ON "core"."refresh_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "refresh_tokens_user_id_idx" ON "core"."refresh_tokens"("user_id");

-- CreateIndex
CREATE INDEX "otp_codes_phone_idx" ON "core"."otp_codes"("phone");

-- CreateIndex
CREATE INDEX "otp_codes_email_idx" ON "core"."otp_codes"("email");

-- CreateIndex
CREATE UNIQUE INDEX "roles_tenant_id_name_key" ON "core"."roles"("tenant_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "permissions_namespace_resource_action_key" ON "core"."permissions"("namespace", "resource", "action");

-- CreateIndex
CREATE UNIQUE INDEX "tenant_plugins_tenant_id_plugin_id_key" ON "core"."tenant_plugins"("tenant_id", "plugin_id");

-- CreateIndex
CREATE INDEX "pilgrims_tenant_id_idx" ON "plugin_crm"."pilgrims"("tenant_id");

-- CreateIndex
CREATE INDEX "pilgrims_tenant_id_status_idx" ON "plugin_crm"."pilgrims"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "pilgrims_tenant_id_family_group_id_idx" ON "plugin_crm"."pilgrims"("tenant_id", "family_group_id");

-- CreateIndex
CREATE INDEX "family_groups_tenant_id_idx" ON "plugin_crm"."family_groups"("tenant_id");

-- CreateIndex
CREATE INDEX "pilgrim_documents_tenant_id_pilgrim_id_idx" ON "plugin_crm"."pilgrim_documents"("tenant_id", "pilgrim_id");

-- CreateIndex
CREATE INDEX "packages_tenant_id_idx" ON "plugin_booking"."packages"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "bookings_booking_ref_key" ON "plugin_booking"."bookings"("booking_ref");

-- CreateIndex
CREATE INDEX "bookings_tenant_id_idx" ON "plugin_booking"."bookings"("tenant_id");

-- CreateIndex
CREATE INDEX "bookings_tenant_id_status_idx" ON "plugin_booking"."bookings"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "bookings_booking_ref_idx" ON "plugin_booking"."bookings"("booking_ref");

-- CreateIndex
CREATE INDEX "booking_pilgrims_tenant_id_idx" ON "plugin_booking"."booking_pilgrims"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "booking_pilgrims_booking_id_pilgrim_id_key" ON "plugin_booking"."booking_pilgrims"("booking_id", "pilgrim_id");

-- CreateIndex
CREATE INDEX "hotels_tenant_id_idx" ON "plugin_hotel"."hotels"("tenant_id");

-- CreateIndex
CREATE INDEX "hotels_city_idx" ON "plugin_hotel"."hotels"("city");

-- CreateIndex
CREATE INDEX "hotels_tenant_id_status_idx" ON "plugin_hotel"."hotels"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "room_types_hotel_id_idx" ON "plugin_hotel"."room_types"("hotel_id");

-- CreateIndex
CREATE INDEX "rooms_hotel_id_idx" ON "plugin_hotel"."rooms"("hotel_id");

-- CreateIndex
CREATE INDEX "rooms_hotel_id_status_idx" ON "plugin_hotel"."rooms"("hotel_id", "status");

-- CreateIndex
CREATE INDEX "hotel_bookings_tenant_id_idx" ON "plugin_hotel"."hotel_bookings"("tenant_id");

-- CreateIndex
CREATE INDEX "hotel_bookings_hotel_id_status_idx" ON "plugin_hotel"."hotel_bookings"("hotel_id", "status");

-- CreateIndex
CREATE INDEX "hotel_bookings_tenant_id_check_in_idx" ON "plugin_hotel"."hotel_bookings"("tenant_id", "check_in");

-- CreateIndex
CREATE INDEX "allotments_tenant_id_idx" ON "plugin_hotel"."allotments"("tenant_id");

-- CreateIndex
CREATE INDEX "allotments_tenant_id_check_in_check_out_idx" ON "plugin_hotel"."allotments"("tenant_id", "check_in", "check_out");

-- CreateIndex
CREATE INDEX "room_assignments_tenant_id_idx" ON "plugin_hotel"."room_assignments"("tenant_id");

-- CreateIndex
CREATE INDEX "room_assignments_allotment_id_idx" ON "plugin_hotel"."room_assignments"("allotment_id");

-- CreateIndex
CREATE INDEX "visa_applications_tenant_id_idx" ON "plugin_visa"."visa_applications"("tenant_id");

-- CreateIndex
CREATE INDEX "visa_applications_tenant_id_status_idx" ON "plugin_visa"."visa_applications"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "visa_applications_pilgrim_id_idx" ON "plugin_visa"."visa_applications"("pilgrim_id");

-- CreateIndex
CREATE INDEX "regulatory_submissions_tenant_id_idx" ON "plugin_visa"."regulatory_submissions"("tenant_id");

-- CreateIndex
CREATE INDEX "regulatory_submissions_tenant_id_regulatory_system_idx" ON "plugin_visa"."regulatory_submissions"("tenant_id", "regulatory_system");

-- CreateIndex
CREATE INDEX "visa_service_requests_tenant_id_status_idx" ON "plugin_visa"."visa_service_requests"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "visa_service_requests_tenant_id_assignee_id_idx" ON "plugin_visa"."visa_service_requests"("tenant_id", "assignee_id");

-- CreateIndex
CREATE INDEX "visa_service_requests_tenant_id_due_at_idx" ON "plugin_visa"."visa_service_requests"("tenant_id", "due_at");

-- CreateIndex
CREATE UNIQUE INDEX "visa_service_requests_tenant_id_ticket_number_key" ON "plugin_visa"."visa_service_requests"("tenant_id", "ticket_number");

-- CreateIndex
CREATE INDEX "visa_service_request_notes_request_id_created_at_idx" ON "plugin_visa"."visa_service_request_notes"("request_id", "created_at");

-- CreateIndex
CREATE INDEX "visa_service_request_events_request_id_created_at_idx" ON "plugin_visa"."visa_service_request_events"("request_id", "created_at");

-- CreateIndex
CREATE INDEX "visa_documents_tenant_id_application_id_idx" ON "plugin_visa"."visa_documents"("tenant_id", "application_id");

-- CreateIndex
CREATE INDEX "visa_documents_tenant_id_status_idx" ON "plugin_visa"."visa_documents"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "visa_documents_tenant_id_expires_at_idx" ON "plugin_visa"."visa_documents"("tenant_id", "expires_at");

-- CreateIndex
CREATE INDEX "visa_document_versions_document_id_uploaded_at_idx" ON "plugin_visa"."visa_document_versions"("document_id", "uploaded_at");

-- CreateIndex
CREATE UNIQUE INDEX "visa_document_versions_document_id_version_key" ON "plugin_visa"."visa_document_versions"("document_id", "version");

-- CreateIndex
CREATE INDEX "vehicles_tenant_id_idx" ON "plugin_transport"."vehicles"("tenant_id");

-- CreateIndex
CREATE INDEX "vehicles_tenant_id_status_idx" ON "plugin_transport"."vehicles"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "drivers_tenant_id_idx" ON "plugin_transport"."drivers"("tenant_id");

-- CreateIndex
CREATE INDEX "drivers_tenant_id_status_idx" ON "plugin_transport"."drivers"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "transport_routes_tenant_id_idx" ON "plugin_transport"."transport_routes"("tenant_id");

-- CreateIndex
CREATE INDEX "transport_routes_tenant_id_status_idx" ON "plugin_transport"."transport_routes"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "transport_assignments_tenant_id_idx" ON "plugin_transport"."transport_assignments"("tenant_id");

-- CreateIndex
CREATE INDEX "transport_assignments_tenant_id_status_idx" ON "plugin_transport"."transport_assignments"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "tasreeh_permits_tenant_id_idx" ON "plugin_transport"."tasreeh_permits"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_invoice_ref_key" ON "plugin_finance"."invoices"("invoice_ref");

-- CreateIndex
CREATE INDEX "invoices_tenant_id_idx" ON "plugin_finance"."invoices"("tenant_id");

-- CreateIndex
CREATE INDEX "invoices_tenant_id_status_idx" ON "plugin_finance"."invoices"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "invoices_invoice_ref_idx" ON "plugin_finance"."invoices"("invoice_ref");

-- CreateIndex
CREATE UNIQUE INDEX "payments_idempotency_key_key" ON "plugin_finance"."payments"("idempotency_key");

-- CreateIndex
CREATE INDEX "payments_tenant_id_idx" ON "plugin_finance"."payments"("tenant_id");

-- CreateIndex
CREATE INDEX "payments_tenant_id_status_idx" ON "plugin_finance"."payments"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "payments_idempotency_key_idx" ON "plugin_finance"."payments"("idempotency_key");

-- CreateIndex
CREATE UNIQUE INDEX "budget_plans_plan_ref_key" ON "plugin_finance"."budget_plans"("plan_ref");

-- CreateIndex
CREATE INDEX "budget_plans_tenant_id_idx" ON "plugin_finance"."budget_plans"("tenant_id");

-- CreateIndex
CREATE INDEX "budget_plans_tenant_id_status_idx" ON "plugin_finance"."budget_plans"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "ledger_entries_tenant_id_account_code_idx" ON "plugin_finance"."ledger_entries"("tenant_id", "account_code");

-- CreateIndex
CREATE INDEX "ledger_entries_tenant_id_posted_at_idx" ON "plugin_finance"."ledger_entries"("tenant_id", "posted_at");

-- CreateIndex
CREATE UNIQUE INDEX "fx_rates_base_currency_quote_currency_rate_date_key" ON "plugin_finance"."fx_rates"("base_currency", "quote_currency", "rate_date");

-- CreateIndex
CREATE INDEX "trip_groups_tenant_id_idx" ON "plugin_group_ops"."trip_groups"("tenant_id");

-- CreateIndex
CREATE INDEX "trip_groups_visibility_idx" ON "plugin_group_ops"."trip_groups"("visibility");

-- CreateIndex
CREATE INDEX "group_members_group_id_idx" ON "plugin_group_ops"."group_members"("group_id");

-- CreateIndex
CREATE INDEX "group_members_user_id_idx" ON "plugin_group_ops"."group_members"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "group_members_group_id_user_id_key" ON "plugin_group_ops"."group_members"("group_id", "user_id");

-- CreateIndex
CREATE INDEX "group_invites_group_id_status_idx" ON "plugin_group_ops"."group_invites"("group_id", "status");

-- CreateIndex
CREATE INDEX "group_invites_invitee_user_id_status_idx" ON "plugin_group_ops"."group_invites"("invitee_user_id", "status");

-- CreateIndex
CREATE INDEX "group_posts_group_id_created_at_idx" ON "plugin_group_ops"."group_posts"("group_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "group_post_comments_post_id_created_at_idx" ON "plugin_group_ops"."group_post_comments"("post_id", "created_at");

-- CreateIndex
CREATE INDEX "group_polls_group_id_idx" ON "plugin_group_ops"."group_polls"("group_id");

-- CreateIndex
CREATE INDEX "group_poll_votes_poll_id_idx" ON "plugin_group_ops"."group_poll_votes"("poll_id");

-- CreateIndex
CREATE UNIQUE INDEX "group_poll_votes_poll_id_user_id_option_index_key" ON "plugin_group_ops"."group_poll_votes"("poll_id", "user_id", "option_index");

-- CreateIndex
CREATE INDEX "group_notes_group_id_category_idx" ON "plugin_group_ops"."group_notes"("group_id", "category");

-- CreateIndex
CREATE INDEX "group_documents_group_id_created_at_idx" ON "plugin_group_ops"."group_documents"("group_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "incidents_tenant_id_group_id_idx" ON "plugin_group_ops"."incidents"("tenant_id", "group_id");

-- CreateIndex
CREATE INDEX "vendors_status_idx" ON "marketplace"."vendors"("status");

-- CreateIndex
CREATE INDEX "vendors_type_idx" ON "marketplace"."vendors"("type");

-- CreateIndex
CREATE INDEX "listings_vendor_id_idx" ON "marketplace"."listings"("vendor_id");

-- CreateIndex
CREATE INDEX "listings_type_status_idx" ON "marketplace"."listings"("type", "status");

-- CreateIndex
CREATE INDEX "listing_inquiries_listing_id_status_idx" ON "marketplace"."listing_inquiries"("listing_id", "status");

-- CreateIndex
CREATE INDEX "listing_inquiries_from_user_id_idx" ON "marketplace"."listing_inquiries"("from_user_id");

-- CreateIndex
CREATE INDEX "listing_bookings_listing_id_status_idx" ON "marketplace"."listing_bookings"("listing_id", "status");

-- CreateIndex
CREATE INDEX "listing_bookings_customer_user_id_idx" ON "marketplace"."listing_bookings"("customer_user_id");

-- CreateIndex
CREATE INDEX "quotes_tenant_id_idx" ON "marketplace"."quotes"("tenant_id");

-- CreateIndex
CREATE INDEX "quotes_vendor_id_idx" ON "marketplace"."quotes"("vendor_id");

-- CreateIndex
CREATE UNIQUE INDEX "vendor_ratings_vendor_id_tenant_id_booking_ref_key" ON "marketplace"."vendor_ratings"("vendor_id", "tenant_id", "booking_ref");

-- CreateIndex
CREATE UNIQUE INDEX "social_accounts_user_id_key" ON "social"."social_accounts"("user_id");

-- CreateIndex
CREATE INDEX "saved_posts_account_id_saved_at_idx" ON "social"."saved_posts"("account_id", "saved_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "saved_posts_account_id_post_id_key" ON "social"."saved_posts"("account_id", "post_id");

-- CreateIndex
CREATE INDEX "posts_author_id_idx" ON "social"."posts"("author_id");

-- CreateIndex
CREATE INDEX "posts_type_moderation_status_idx" ON "social"."posts"("type", "moderation_status");

-- CreateIndex
CREATE INDEX "posts_created_at_idx" ON "social"."posts"("created_at");

-- CreateIndex
CREATE INDEX "comments_post_id_idx" ON "social"."comments"("post_id");

-- CreateIndex
CREATE INDEX "comments_author_id_idx" ON "social"."comments"("author_id");

-- CreateIndex
CREATE UNIQUE INDEX "reactions_account_id_post_id_type_key" ON "social"."reactions"("account_id", "post_id", "type");

-- CreateIndex
CREATE UNIQUE INDEX "reactions_account_id_comment_id_type_key" ON "social"."reactions"("account_id", "comment_id", "type");

-- CreateIndex
CREATE INDEX "messages_conversation_id_created_at_idx" ON "social"."messages"("conversation_id", "created_at");

-- CreateIndex
CREATE INDEX "connections_requester_id_idx" ON "social"."connections"("requester_id");

-- CreateIndex
CREATE INDEX "connections_recipient_id_status_idx" ON "social"."connections"("recipient_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "connections_requester_id_recipient_id_key" ON "social"."connections"("requester_id", "recipient_id");

-- CreateIndex
CREATE INDEX "notifications_recipient_id_read_at_idx" ON "social"."notifications"("recipient_id", "read_at");

-- CreateIndex
CREATE INDEX "notifications_recipient_id_created_at_idx" ON "social"."notifications"("recipient_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "public_inquiries_type_status_idx" ON "core"."public_inquiries"("type", "status");

-- CreateIndex
CREATE INDEX "public_inquiries_created_at_idx" ON "core"."public_inquiries"("created_at" DESC);

-- CreateIndex
CREATE INDEX "marketplace_requests_tenant_id_status_idx" ON "marketplace"."marketplace_requests"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "marketplace_requests_traveler_id_status_idx" ON "marketplace"."marketplace_requests"("traveler_id", "status");

-- CreateIndex
CREATE INDEX "marketplace_requests_service_type_status_idx" ON "marketplace"."marketplace_requests"("service_type", "status");

-- CreateIndex
CREATE INDEX "request_offers_request_id_status_idx" ON "marketplace"."request_offers"("request_id", "status");

-- CreateIndex
CREATE INDEX "request_offers_provider_id_status_idx" ON "marketplace"."request_offers"("provider_id", "status");

-- CreateIndex
CREATE INDEX "audit_logs_tenant_id_occurred_at_idx" ON "audit"."audit_logs"("tenant_id", "occurred_at");

-- CreateIndex
CREATE INDEX "audit_logs_actor_id_idx" ON "audit"."audit_logs"("actor_id");

-- CreateIndex
CREATE INDEX "audit_logs_resource_resource_id_idx" ON "audit"."audit_logs"("resource", "resource_id");

-- CreateIndex
CREATE INDEX "payment_transactions_tenant_id_payment_id_idx" ON "plugin_finance"."payment_transactions"("tenant_id", "payment_id");

-- CreateIndex
CREATE INDEX "payment_transactions_payment_id_created_at_idx" ON "plugin_finance"."payment_transactions"("payment_id", "created_at");

-- CreateIndex
CREATE INDEX "payment_webhook_events_payment_id_idx" ON "plugin_finance"."payment_webhook_events"("payment_id");

-- CreateIndex
CREATE UNIQUE INDEX "payment_webhook_events_provider_event_id_key" ON "plugin_finance"."payment_webhook_events"("provider", "event_id");

-- AddForeignKey
ALTER TABLE "core"."tenants" ADD CONSTRAINT "tenants_parent_tenant_id_fkey" FOREIGN KEY ("parent_tenant_id") REFERENCES "core"."tenants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core"."tenant_kyc" ADD CONSTRAINT "tenant_kyc_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core"."users" ADD CONSTRAINT "users_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core"."refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "core"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core"."otp_codes" ADD CONSTRAINT "otp_codes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "core"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core"."roles" ADD CONSTRAINT "roles_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core"."role_permissions" ADD CONSTRAINT "role_permissions_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "core"."roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core"."role_permissions" ADD CONSTRAINT "role_permissions_permission_id_fkey" FOREIGN KEY ("permission_id") REFERENCES "core"."permissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core"."user_roles" ADD CONSTRAINT "user_roles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "core"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core"."user_roles" ADD CONSTRAINT "user_roles_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "core"."roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core"."tenant_plugins" ADD CONSTRAINT "tenant_plugins_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plugin_crm"."pilgrims" ADD CONSTRAINT "pilgrims_family_group_id_fkey" FOREIGN KEY ("family_group_id") REFERENCES "plugin_crm"."family_groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plugin_crm"."pilgrim_documents" ADD CONSTRAINT "pilgrim_documents_pilgrim_id_fkey" FOREIGN KEY ("pilgrim_id") REFERENCES "plugin_crm"."pilgrims"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plugin_booking"."bookings" ADD CONSTRAINT "bookings_package_id_fkey" FOREIGN KEY ("package_id") REFERENCES "plugin_booking"."packages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plugin_booking"."booking_pilgrims" ADD CONSTRAINT "booking_pilgrims_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "plugin_booking"."bookings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plugin_hotel"."room_types" ADD CONSTRAINT "room_types_hotel_id_fkey" FOREIGN KEY ("hotel_id") REFERENCES "plugin_hotel"."hotels"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plugin_hotel"."rooms" ADD CONSTRAINT "rooms_hotel_id_fkey" FOREIGN KEY ("hotel_id") REFERENCES "plugin_hotel"."hotels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plugin_hotel"."rooms" ADD CONSTRAINT "rooms_room_type_id_fkey" FOREIGN KEY ("room_type_id") REFERENCES "plugin_hotel"."room_types"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plugin_hotel"."hotel_bookings" ADD CONSTRAINT "hotel_bookings_hotel_id_fkey" FOREIGN KEY ("hotel_id") REFERENCES "plugin_hotel"."hotels"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plugin_hotel"."allotments" ADD CONSTRAINT "allotments_hotel_id_fkey" FOREIGN KEY ("hotel_id") REFERENCES "plugin_hotel"."hotels"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plugin_hotel"."room_assignments" ADD CONSTRAINT "room_assignments_allotment_id_fkey" FOREIGN KEY ("allotment_id") REFERENCES "plugin_hotel"."allotments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plugin_visa"."visa_service_request_notes" ADD CONSTRAINT "visa_service_request_notes_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "plugin_visa"."visa_service_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plugin_visa"."visa_service_request_events" ADD CONSTRAINT "visa_service_request_events_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "plugin_visa"."visa_service_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plugin_visa"."visa_document_versions" ADD CONSTRAINT "visa_document_versions_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "plugin_visa"."visa_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plugin_transport"."vehicle_drivers" ADD CONSTRAINT "vehicle_drivers_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "plugin_transport"."vehicles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plugin_transport"."vehicle_drivers" ADD CONSTRAINT "vehicle_drivers_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "plugin_transport"."drivers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plugin_transport"."transport_routes" ADD CONSTRAINT "transport_routes_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "plugin_transport"."vehicles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plugin_transport"."transport_routes" ADD CONSTRAINT "transport_routes_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "plugin_transport"."drivers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plugin_transport"."transport_assignments" ADD CONSTRAINT "transport_assignments_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "plugin_transport"."vehicles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plugin_transport"."transport_assignments" ADD CONSTRAINT "transport_assignments_route_id_fkey" FOREIGN KEY ("route_id") REFERENCES "plugin_transport"."transport_routes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plugin_transport"."transport_assignments" ADD CONSTRAINT "transport_assignments_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "plugin_transport"."drivers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plugin_transport"."tasreeh_permits" ADD CONSTRAINT "tasreeh_permits_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "plugin_transport"."vehicles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plugin_finance"."payments" ADD CONSTRAINT "payments_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "plugin_finance"."invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plugin_group_ops"."group_members" ADD CONSTRAINT "group_members_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "plugin_group_ops"."trip_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plugin_group_ops"."group_invites" ADD CONSTRAINT "group_invites_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "plugin_group_ops"."trip_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plugin_group_ops"."group_posts" ADD CONSTRAINT "group_posts_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "plugin_group_ops"."trip_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plugin_group_ops"."group_post_comments" ADD CONSTRAINT "group_post_comments_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "plugin_group_ops"."group_posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plugin_group_ops"."group_polls" ADD CONSTRAINT "group_polls_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "plugin_group_ops"."trip_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plugin_group_ops"."group_poll_votes" ADD CONSTRAINT "group_poll_votes_poll_id_fkey" FOREIGN KEY ("poll_id") REFERENCES "plugin_group_ops"."group_polls"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plugin_group_ops"."group_notes" ADD CONSTRAINT "group_notes_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "plugin_group_ops"."trip_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plugin_group_ops"."incidents" ADD CONSTRAINT "incidents_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "plugin_group_ops"."trip_groups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marketplace"."listings" ADD CONSTRAINT "listings_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "marketplace"."vendors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marketplace"."listing_inquiries" ADD CONSTRAINT "listing_inquiries_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "marketplace"."listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marketplace"."listing_bookings" ADD CONSTRAINT "listing_bookings_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "marketplace"."listings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marketplace"."quotes" ADD CONSTRAINT "quotes_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "marketplace"."vendors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marketplace"."quotes" ADD CONSTRAINT "quotes_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "marketplace"."listings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marketplace"."vendor_ratings" ADD CONSTRAINT "vendor_ratings_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "marketplace"."vendors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "social"."social_accounts" ADD CONSTRAINT "social_accounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "core"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "social"."saved_posts" ADD CONSTRAINT "saved_posts_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "social"."social_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "social"."saved_posts" ADD CONSTRAINT "saved_posts_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "social"."posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "social"."posts" ADD CONSTRAINT "posts_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "social"."social_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "social"."comments" ADD CONSTRAINT "comments_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "social"."posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "social"."comments" ADD CONSTRAINT "comments_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "social"."social_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "social"."reactions" ADD CONSTRAINT "reactions_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "social"."social_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "social"."reactions" ADD CONSTRAINT "reactions_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "social"."posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "social"."reactions" ADD CONSTRAINT "reactions_comment_id_fkey" FOREIGN KEY ("comment_id") REFERENCES "social"."comments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "social"."follows" ADD CONSTRAINT "follows_follower_id_fkey" FOREIGN KEY ("follower_id") REFERENCES "social"."social_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "social"."follows" ADD CONSTRAINT "follows_followed_id_fkey" FOREIGN KEY ("followed_id") REFERENCES "social"."social_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "social"."messages" ADD CONSTRAINT "messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "social"."conversations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "social"."messages" ADD CONSTRAINT "messages_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "social"."social_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "social"."post_reports" ADD CONSTRAINT "post_reports_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "social"."posts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "social"."post_reports" ADD CONSTRAINT "post_reports_reporter_id_fkey" FOREIGN KEY ("reporter_id") REFERENCES "social"."social_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marketplace"."request_offers" ADD CONSTRAINT "request_offers_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "marketplace"."marketplace_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plugin_finance"."payment_transactions" ADD CONSTRAINT "payment_transactions_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "plugin_finance"."payments"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Umrah Connects — PostgreSQL initialization
-- This runs once on first container start.

-- Create extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";     -- trigram search for Arabic + Latin
CREATE EXTENSION IF NOT EXISTS "unaccent";     -- accent-insensitive search

-- Create application schemas
CREATE SCHEMA IF NOT EXISTS core;
CREATE SCHEMA IF NOT EXISTS marketplace;
CREATE SCHEMA IF NOT EXISTS social;
CREATE SCHEMA IF NOT EXISTS audit;

-- Plugin schemas (each plugin owns its schema)
CREATE SCHEMA IF NOT EXISTS plugin_crm;
CREATE SCHEMA IF NOT EXISTS plugin_booking;
CREATE SCHEMA IF NOT EXISTS plugin_hotel;
CREATE SCHEMA IF NOT EXISTS plugin_visa;
CREATE SCHEMA IF NOT EXISTS plugin_transport;
CREATE SCHEMA IF NOT EXISTS plugin_finance;
CREATE SCHEMA IF NOT EXISTS plugin_group_ops;
CREATE SCHEMA IF NOT EXISTS plugin_portal;
CREATE SCHEMA IF NOT EXISTS plugin_reporting;

-- No application login is created here. The API connects as the Row-Level Security runtime login that
-- `platform/api/prisma/rls/runtime-role.sql` creates after `prisma migrate deploy` (member of uc_app_runtime,
-- password from the environment) — docs/control-tower/RLS.md. The former `app_user` role carried a password
-- written in this file and was used by nothing.

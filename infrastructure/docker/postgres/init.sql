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

-- App role (used by the application connection pool)
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'app_user') THEN
    CREATE ROLE app_user WITH LOGIN PASSWORD 'change_me_in_production';
  END IF;
END
$$;

GRANT USAGE ON SCHEMA core TO app_user;
GRANT USAGE ON SCHEMA marketplace TO app_user;
GRANT USAGE ON SCHEMA social TO app_user;
GRANT USAGE ON SCHEMA audit TO app_user;
GRANT USAGE ON SCHEMA plugin_crm TO app_user;
GRANT USAGE ON SCHEMA plugin_booking TO app_user;
GRANT USAGE ON SCHEMA plugin_hotel TO app_user;
GRANT USAGE ON SCHEMA plugin_visa TO app_user;
GRANT USAGE ON SCHEMA plugin_transport TO app_user;
GRANT USAGE ON SCHEMA plugin_finance TO app_user;
GRANT USAGE ON SCHEMA plugin_group_ops TO app_user;
GRANT USAGE ON SCHEMA plugin_portal TO app_user;
GRANT USAGE ON SCHEMA plugin_reporting TO app_user;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA core TO app_user;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA marketplace TO app_user;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA social TO app_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA core GRANT ALL ON TABLES TO app_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA marketplace GRANT ALL ON TABLES TO app_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA social GRANT ALL ON TABLES TO app_user;

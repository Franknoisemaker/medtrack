-- Migration: 20260612000001_fix_table_grants.sql
-- Description: Explicitly grant CRUD privileges on all existing and future tables in public schema to default API roles (authenticated, anon, service_role) to prevent permission denied errors.

-- 1. Grant permissions on all existing tables in public schema
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated, anon, service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated, anon, service_role;

-- 2. Alter default privileges for any future tables created in public schema
ALTER DEFAULT PRIVILEGES IN SCHEMA public 
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated, anon, service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA public 
GRANT USAGE, SELECT ON SEQUENCES TO authenticated, anon, service_role;

-- Migration: 20260522000004_auth_lockout.sql
-- Description: Add authentication lockout and attempt tracking columns to consultations table to prevent brute force attacks under NOM-024

ALTER TABLE consultas 
ADD COLUMN IF NOT EXISTS intentos_fallidos INTEGER DEFAULT 0 NOT NULL,
ADD COLUMN IF NOT EXISTS auth_blocked_until TIMESTAMP WITH TIME ZONE;

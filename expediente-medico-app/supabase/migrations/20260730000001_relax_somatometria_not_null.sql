-- Migration: 20260730000001_relax_somatometria_not_null.sql
-- Description: Remove NOT NULL constraints from paciente_somatometria core fields.
-- Rationale: The previous NOT NULL constraints caused silent data loss when any
-- required field was missing during signing. Validation is handled at the
-- application layer (sign-note edge function and PatientRecord UI). The DB
-- should store whatever was captured, not silently reject the entire record.

ALTER TABLE paciente_somatometria
  ALTER COLUMN peso_kg           DROP NOT NULL,
  ALTER COLUMN talla_cm          DROP NOT NULL,
  ALTER COLUMN presion_sistolica DROP NOT NULL,
  ALTER COLUMN presion_diastolica DROP NOT NULL;

-- Also drop the positivity CHECK constraints that block storing NULL-adjacent
-- data during partial consultations. Validation stays in application code.
ALTER TABLE paciente_somatometria
  DROP CONSTRAINT IF EXISTS chk_peso_positivo,
  DROP CONSTRAINT IF EXISTS chk_talla_positiva,
  DROP CONSTRAINT IF EXISTS chk_presion_sistolica,
  DROP CONSTRAINT IF EXISTS chk_presion_diastolica;

-- Migration: Add sexo column to pacientes table for clinical completeness
ALTER TABLE pacientes ADD COLUMN IF NOT EXISTS sexo TEXT;

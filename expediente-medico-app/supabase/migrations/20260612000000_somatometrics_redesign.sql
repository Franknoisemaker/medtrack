-- Migration: 20260612000000_somatometrics_redesign.sql
-- Description: Add tipo_consulta to consultas and new optional somatometrics columns to paciente_somatometria

-- 1. Add tipo_consulta column to consultas table with check constraint
ALTER TABLE consultas 
ADD COLUMN IF NOT EXISTS tipo_consulta TEXT NOT NULL DEFAULT 'General'
CONSTRAINT chk_consulta_tipo CHECK (tipo_consulta IN ('General', 'Control de Peso'));

-- 2. Add optional somatometrics columns to paciente_somatometria table with range checks
ALTER TABLE paciente_somatometria
ADD COLUMN IF NOT EXISTS musculo_pct NUMERIC(4,1) CONSTRAINT chk_musculo_pct CHECK (musculo_pct >= 0 AND musculo_pct <= 100),
ADD COLUMN IF NOT EXISTS grasa_pct NUMERIC(4,1) CONSTRAINT chk_grasa_pct CHECK (grasa_pct >= 0 AND grasa_pct <= 100),
ADD COLUMN IF NOT EXISTS cintura_cm NUMERIC(4,1) CONSTRAINT chk_cintura_cm CHECK (cintura_cm > 0),
ADD COLUMN IF NOT EXISTS cadera_cm NUMERIC(4,1) CONSTRAINT chk_cadera_cm CHECK (cadera_cm > 0),
ADD COLUMN IF NOT EXISTS busto_cm NUMERIC(4,1) CONSTRAINT chk_busto_cm CHECK (busto_cm > 0),
ADD COLUMN IF NOT EXISTS brazo_cm NUMERIC(4,1) CONSTRAINT chk_brazo_cm CHECK (brazo_cm > 0),
ADD COLUMN IF NOT EXISTS dosis_ml NUMERIC(4,1) CONSTRAINT chk_dosis_ml CHECK (dosis_ml >= 0);

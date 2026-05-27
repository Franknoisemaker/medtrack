-- Migration: 20260522000000_init.sql
-- Description: Create base schemas, tables, indices, and enable RLS

-- Enable necessary postgres extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. medicos
CREATE TABLE IF NOT EXISTS medicos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nombre TEXT NOT NULL,
    cedula TEXT NOT NULL UNIQUE,
    email TEXT NOT NULL UNIQUE,
    creado_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. pacientes
CREATE TABLE IF NOT EXISTS pacientes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nombre TEXT NOT NULL,
    fecha_nacimiento DATE NOT NULL,
    telefono TEXT NOT NULL,
    email TEXT,
    contacto_emergencia_nombre TEXT,
    contacto_emergencia_telefono TEXT,
    alergias_cifrado TEXT,
    medicamentos_cifrado TEXT,
    padecimientos_cifrado TEXT,
    creado_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 3. consultas
CREATE TABLE IF NOT EXISTS consultas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    medico_id UUID REFERENCES medicos(id) ON DELETE RESTRICT NOT NULL,
    paciente_id UUID REFERENCES pacientes(id) ON DELETE SET NULL,
    fecha_hora TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT timezone('utc'::text, now()),
    status TEXT NOT NULL DEFAULT 'PENDING_ONBOARDING',
    motivo_consulta_cifrado TEXT,
    creado_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    CONSTRAINT chk_consulta_status CHECK (status IN ('PENDING_ONBOARDING', 'ACTIVE', 'COMPLETED', 'CANCELLED'))
);

-- 4. notas_soap
CREATE TABLE IF NOT EXISTS notas_soap (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    consulta_id UUID REFERENCES consultas(id) ON DELETE CASCADE NOT NULL,
    subjetivo_cifrado TEXT NOT NULL,
    objetivo_cifrado TEXT NOT NULL,
    analisis_cifrado TEXT NOT NULL,
    plan_cifrado TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'draft',
    firma_electronica TEXT,
    key_version TEXT,
    creado_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    signed_at TIMESTAMP WITH TIME ZONE,
    CONSTRAINT chk_soap_status CHECK (status IN ('draft', 'signed'))
);

-- 5. soap_aclaraciones
CREATE TABLE IF NOT EXISTS soap_aclaraciones (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nota_soap_id UUID REFERENCES notas_soap(id) ON DELETE CASCADE NOT NULL,
    aclaracion_texto TEXT NOT NULL,
    medico_id UUID REFERENCES medicos(id) ON DELETE RESTRICT NOT NULL,
    firma_electronica TEXT NOT NULL,
    creado_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 6. paciente_somatometria
CREATE TABLE IF NOT EXISTS paciente_somatometria (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    consulta_id UUID REFERENCES consultas(id) ON DELETE CASCADE NOT NULL,
    peso_kg NUMERIC(4,1) NOT NULL,
    talla_cm INTEGER NOT NULL,
    presion_sistolica INTEGER NOT NULL,
    presion_diastolica INTEGER NOT NULL,
    imc NUMERIC(3,1),
    peso_ideal NUMERIC(4,1),
    creado_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    CONSTRAINT chk_peso_positivo CHECK (peso_kg > 0),
    CONSTRAINT chk_talla_positiva CHECK (talla_cm > 0),
    CONSTRAINT chk_presion_sistolica CHECK (presion_sistolica > 0),
    CONSTRAINT chk_presion_diastolica CHECK (presion_diastolica > 0)
);

-- 7. jwt_jti_used
CREATE TABLE IF NOT EXISTS jwt_jti_used (
    jti UUID PRIMARY KEY,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    creado_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Create index for TTL on jwt_jti_used
CREATE INDEX IF NOT EXISTS idx_jwt_jti_used_expires_at ON jwt_jti_used(expires_at);

-- 8. archivos_clinicos
CREATE TABLE IF NOT EXISTS archivos_clinicos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    consulta_id UUID REFERENCES consultas(id) ON DELETE CASCADE NOT NULL,
    titulo TEXT NOT NULL,
    categoria TEXT NOT NULL,
    r2_key TEXT NOT NULL,
    medico_id UUID REFERENCES medicos(id) ON DELETE RESTRICT NOT NULL,
    scan_status TEXT NOT NULL DEFAULT 'PENDING',
    uploaded_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    CONSTRAINT chk_scan_status CHECK (scan_status IN ('PENDING', 'CLEAN', 'INFECTED', 'BYPASSED'))
);

-- 9. qr_soft_pass
CREATE TABLE IF NOT EXISTS qr_soft_pass (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    consulta_id UUID REFERENCES consultas(id) ON DELETE CASCADE NOT NULL,
    token_opaco UUID UNIQUE NOT NULL DEFAULT gen_random_uuid(),
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    used_at TIMESTAMP WITH TIME ZONE,
    creado_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS on all tables
ALTER TABLE medicos ENABLE ROW LEVEL SECURITY;
ALTER TABLE pacientes ENABLE ROW LEVEL SECURITY;
ALTER TABLE consultas ENABLE ROW LEVEL SECURITY;
ALTER TABLE notas_soap ENABLE ROW LEVEL SECURITY;
ALTER TABLE soap_aclaraciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE paciente_somatometria ENABLE ROW LEVEL SECURITY;
ALTER TABLE jwt_jti_used ENABLE ROW LEVEL SECURITY;
ALTER TABLE archivos_clinicos ENABLE ROW LEVEL SECURITY;
ALTER TABLE qr_soft_pass ENABLE ROW LEVEL SECURITY;

-- Basic RLS Policies

-- For medicos: only authenticated users can read or write
CREATE POLICY medic_access_policy ON medicos
    FOR ALL
    TO authenticated
    USING (auth.uid() = id);

-- For patients: onboarding is write-only for anonymous users during soft-gate, full access for authenticated physicians
CREATE POLICY patient_insert_anon ON pacientes
    FOR INSERT
    TO anon, authenticated
    WITH CHECK (true);

CREATE POLICY patient_select_medic ON pacientes
    FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY patient_update_medic ON pacientes
    FOR UPDATE
    TO authenticated
    USING (true);

-- For consultas, notas_soap, soap_aclaraciones, paciente_somatometria, archivos_clinicos, qr_soft_pass
CREATE POLICY consulta_all_medic ON consultas FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY notas_soap_all_medic ON notas_soap FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY soap_aclaraciones_all_medic ON soap_aclaraciones FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY somatometria_all_medic ON paciente_somatometria FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY archivos_all_medic ON archivos_clinicos FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY qr_all_medic ON qr_soft_pass FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Allow patient write-only access to their somatometria and soft-pass verification
CREATE POLICY somatometria_insert_anon ON paciente_somatometria FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY qr_select_anon ON qr_soft_pass FOR SELECT TO anon USING (expires_at > now() AND used_at IS NULL);
CREATE POLICY qr_update_anon ON qr_soft_pass FOR UPDATE TO anon USING (expires_at > now() AND used_at IS NULL) WITH CHECK (true);

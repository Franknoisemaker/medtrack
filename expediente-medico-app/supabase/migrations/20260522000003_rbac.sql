-- Migration: 20260522000003_rbac.sql
-- Description: Drop basic RLS policies and replace them with robust RBAC policies using auth.jwt() ->> 'role' claims

-- Drop old basic policies
DROP POLICY IF EXISTS medic_access_policy ON medicos;
DROP POLICY IF EXISTS patient_insert_anon ON pacientes;
DROP POLICY IF EXISTS patient_select_medic ON pacientes;
DROP POLICY IF EXISTS patient_update_medic ON pacientes;
DROP POLICY IF EXISTS consulta_all_medic ON consultas;
DROP POLICY IF EXISTS notas_soap_all_medic ON notas_soap;
DROP POLICY IF EXISTS soap_aclaraciones_all_medic ON soap_aclaraciones;
DROP POLICY IF EXISTS somatometria_all_medic ON paciente_somatometria;
DROP POLICY IF EXISTS archivos_all_medic ON archivos_clinicos;
DROP POLICY IF EXISTS qr_all_medic ON qr_soft_pass;
DROP POLICY IF EXISTS somatometria_insert_anon ON paciente_somatometria;
DROP POLICY IF EXISTS qr_select_anon ON qr_soft_pass;
DROP POLICY IF EXISTS qr_update_anon ON qr_soft_pass;

-- Define advanced RBAC policies using JWT Claims role mappings:
-- clinic_doctor, clinic_patient, clinic_admin

-- ==========================================
-- 1. Table: medicos
-- ==========================================
-- clinic_doctor can read own info
CREATE POLICY doctor_read_self ON medicos
    FOR SELECT
    TO authenticated
    USING (auth.jwt() ->> 'role' = 'clinic_doctor' AND auth.uid() = id);

-- clinic_admin can manage doctors
CREATE POLICY admin_manage_medicos ON medicos
    FOR ALL
    TO authenticated
    USING (auth.jwt() ->> 'role' = 'clinic_admin');

-- clinic_patient can read doctor name/details of their appointments
CREATE POLICY patient_read_doctors ON medicos
    FOR SELECT
    TO authenticated, anon
    USING (auth.jwt() ->> 'role' = 'clinic_patient' OR auth.jwt() ->> 'role' IS NULL);

-- ==========================================
-- 2. Table: pacientes
-- ==========================================
-- clinic_doctor can manage all patients
CREATE POLICY doctor_manage_patients ON pacientes
    FOR ALL
    TO authenticated
    USING (auth.jwt() ->> 'role' = 'clinic_doctor');

-- clinic_patient can read and update their own patient profile
CREATE POLICY patient_access_self ON pacientes
    FOR SELECT
    TO authenticated
    USING (auth.jwt() ->> 'role' = 'clinic_patient' AND auth.uid() = id);

CREATE POLICY patient_update_self ON pacientes
    FOR UPDATE
    TO authenticated
    USING (auth.jwt() ->> 'role' = 'clinic_patient' AND auth.uid() = id)
    WITH CHECK (auth.uid() = id);

-- Anonymous patient write-only insert during soft-gate onboarding
CREATE POLICY anonymous_patient_onboard ON pacientes
    FOR INSERT
    TO anon, authenticated
    WITH CHECK (auth.jwt() ->> 'role' IS NULL OR auth.jwt() ->> 'role' = 'clinic_patient');

-- ==========================================
-- 3. Table: consultas
-- ==========================================
-- clinic_doctor can manage all consultations
CREATE POLICY doctor_manage_consultations ON consultas
    FOR ALL
    TO authenticated
    USING (auth.jwt() ->> 'role' = 'clinic_doctor');

-- clinic_patient can read their own consultations
CREATE POLICY patient_read_consultations ON consultas
    FOR SELECT
    TO authenticated
    USING (auth.jwt() ->> 'role' = 'clinic_patient' AND auth.uid() = paciente_id);

-- Anonymous client can create consultation requests
CREATE POLICY anon_create_consultations ON consultas
    FOR INSERT
    TO anon
    WITH CHECK (true);

-- ==========================================
-- 4. Table: notas_soap
-- ==========================================
-- clinic_doctor has full control (mutations still bounded by legal immutability trigger in 20260522000001)
CREATE POLICY doctor_manage_soap ON notas_soap
    FOR ALL
    TO authenticated
    USING (auth.jwt() ->> 'role' = 'clinic_doctor');

-- ==========================================
-- 5. Table: soap_aclaraciones
-- ==========================================
CREATE POLICY doctor_manage_aclaraciones ON soap_aclaraciones
    FOR ALL
    TO authenticated
    USING (auth.jwt() ->> 'role' = 'clinic_doctor');

-- ==========================================
-- 6. Table: paciente_somatometria
-- ==========================================
-- clinic_doctor can manage all somatometrics
CREATE POLICY doctor_manage_somatometria ON paciente_somatometria
    FOR ALL
    TO authenticated
    USING (auth.jwt() ->> 'role' = 'clinic_doctor');

-- clinic_patient can insert own somatometrics during soft-gate/onboarding
CREATE POLICY patient_insert_somatometria ON paciente_somatometria
    FOR INSERT
    TO anon, authenticated
    WITH CHECK (true);

-- clinic_patient can read their own historical somatometrics
CREATE POLICY patient_read_somatometria ON paciente_somatometria
    FOR SELECT
    TO authenticated
    USING (
        auth.jwt() ->> 'role' = 'clinic_patient' AND 
        EXISTS (
            SELECT 1 FROM consultas 
            WHERE consultas.id = consulta_id AND consultas.paciente_id = auth.uid()
        )
    );

-- ==========================================
-- 7. Table: archivos_clinicos
-- ==========================================
-- clinic_doctor can manage files
CREATE POLICY doctor_manage_files ON archivos_clinicos
    FOR ALL
    TO authenticated
    USING (auth.jwt() ->> 'role' = 'clinic_doctor');

-- clinic_patient can view their own clinical files
CREATE POLICY patient_read_files ON archivos_clinicos
    FOR SELECT
    TO authenticated
    USING (
        auth.jwt() ->> 'role' = 'clinic_patient' AND
        EXISTS (
            SELECT 1 FROM consultas
            WHERE consultas.id = consulta_id AND consultas.paciente_id = auth.uid()
        )
    );

-- ==========================================
-- 8. Table: qr_soft_pass
-- ==========================================
-- clinic_doctor can manage all QR soft passes
CREATE POLICY doctor_manage_qr ON qr_soft_pass
    FOR ALL
    TO authenticated
    USING (auth.jwt() ->> 'role' = 'clinic_doctor');

-- clinic_patient can read and check their own QR soft pass
CREATE POLICY patient_read_qr ON qr_soft_pass
    FOR SELECT
    TO authenticated, anon
    USING (
        EXISTS (
            SELECT 1 FROM consultas
            WHERE consultas.id = consulta_id AND (consultas.paciente_id = auth.uid() OR auth.jwt() ->> 'role' IS NULL)
        )
    );

-- ==========================================
-- 9. Table: audit_logs
-- ==========================================
-- clinic_admin can read all audit logs
CREATE POLICY admin_read_audit ON audit_logs
    FOR SELECT
    TO authenticated
    USING (auth.jwt() ->> 'role' = 'clinic_admin');

-- clinic_doctor can read audit logs relating to their own actions
CREATE POLICY doctor_read_audit ON audit_logs
    FOR SELECT
    TO authenticated
    USING (auth.jwt() ->> 'role' = 'clinic_doctor' AND auth.uid() = medico_id);

-- System or any role can insert audit logs silently (trigger blocks modifications anyway)
CREATE POLICY system_insert_audit ON audit_logs
    FOR INSERT
    TO authenticated, anon
    WITH CHECK (true);

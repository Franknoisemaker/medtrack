-- Migration: 20261023000000_doctor_isolation_rls.sql
-- Description: Isolate all clinical data per doctor. A doctor can only see and modify the
-- patients, consultations, SOAP notes, aclaraciones, somatometrics, files, QR passes,
-- short links and audit logs that belong to their own consultations.
--
-- Ownership rule: consultas.medico_id = auth.uid().
--   * consultas, notas_soap, soap_aclaraciones, paciente_somatometria, archivos_clinicos,
--     qr_soft_pass -> owned through their consultation.
--   * pacientes -> visible to a doctor only if that doctor has at least one consultation
--     with the patient (pacientes has no owner column).
--
-- Before this migration every policy only checked the 'clinic_doctor' role, so any doctor
-- could read and modify every other doctor's records, and the decryption RPCs returned PHI
-- for any consultation.
--
-- Not changed here (by design):
--   * Edge Functions use the service role and bypass RLS; they now check ownership in code
--     (see supabase/functions/_shared/doctorAuth.ts).
--   * Patient-facing policies (clinic_patient role) and the is_local_dev_sandbox() dev policies.

-- ==========================================
-- 1. Ownership helpers
-- ==========================================
-- SECURITY DEFINER so the checks don't depend on (or recurse into) the RLS of the tables they read.

CREATE OR REPLACE FUNCTION public.is_consulta_owner(p_consulta_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM consultas
    WHERE id = p_consulta_id AND medico_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.is_nota_soap_owner(p_nota_soap_id UUID, p_require_signed BOOLEAN DEFAULT false)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM notas_soap n
    JOIN consultas c ON c.id = n.consulta_id
    WHERE n.id = p_nota_soap_id
      AND c.medico_id = auth.uid()
      AND (NOT p_require_signed OR n.status = 'signed')
  );
$$;

CREATE OR REPLACE FUNCTION public.is_paciente_of_doctor(p_paciente_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM consultas
    WHERE paciente_id = p_paciente_id AND medico_id = auth.uid()
  );
$$;

REVOKE ALL ON FUNCTION public.is_consulta_owner(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_nota_soap_owner(UUID, BOOLEAN) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_paciente_of_doctor(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_consulta_owner(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_nota_soap_owner(UUID, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_paciente_of_doctor(UUID) TO authenticated;

-- ==========================================
-- 2. pacientes: only patients the doctor has consulted
-- ==========================================
-- New patients are created by the create-appointment Edge Function (service role),
-- so doctors need no INSERT/DELETE policy here.
DROP POLICY IF EXISTS doctor_manage_patients ON pacientes;
DROP POLICY IF EXISTS doctor_read_patients ON pacientes;
DROP POLICY IF EXISTS doctor_update_patients ON pacientes;

CREATE POLICY doctor_read_patients ON pacientes
    FOR SELECT
    TO authenticated
    USING (auth.jwt() -> 'app_metadata' ->> 'role' = 'clinic_doctor' AND public.is_paciente_of_doctor(id));

CREATE POLICY doctor_update_patients ON pacientes
    FOR UPDATE
    TO authenticated
    USING (auth.jwt() -> 'app_metadata' ->> 'role' = 'clinic_doctor' AND public.is_paciente_of_doctor(id))
    WITH CHECK (auth.jwt() -> 'app_metadata' ->> 'role' = 'clinic_doctor' AND public.is_paciente_of_doctor(id));

-- ==========================================
-- 3. consultas: only the assigned doctor
-- ==========================================
-- anon_create_consultations let anyone insert a consultation for any doctor/patient, which
-- could be used to attach another doctor's patient to yourself. Consultations are created by
-- the create-appointment Edge Function (service role) or by the doctor (HistoricalNoteModal).
DROP POLICY IF EXISTS anon_create_consultations ON consultas;
DROP POLICY IF EXISTS doctor_manage_consultations ON consultas;

CREATE POLICY doctor_manage_consultations ON consultas
    FOR ALL
    TO authenticated
    USING (auth.jwt() -> 'app_metadata' ->> 'role' = 'clinic_doctor' AND medico_id = auth.uid())
    WITH CHECK (
        auth.jwt() -> 'app_metadata' ->> 'role' = 'clinic_doctor'
        AND medico_id = auth.uid()
        AND (paciente_id IS NULL OR public.is_paciente_of_doctor(paciente_id))
    );

-- ==========================================
-- 4. notas_soap: only the assigned doctor
-- ==========================================
DROP POLICY IF EXISTS doctor_manage_soap ON notas_soap;

CREATE POLICY doctor_manage_soap ON notas_soap
    FOR ALL
    TO authenticated
    USING (auth.jwt() -> 'app_metadata' ->> 'role' = 'clinic_doctor' AND public.is_consulta_owner(consulta_id))
    WITH CHECK (auth.jwt() -> 'app_metadata' ->> 'role' = 'clinic_doctor' AND public.is_consulta_owner(consulta_id));

-- ==========================================
-- 5. soap_aclaraciones: read own, append-only insert, no update/delete
-- ==========================================
-- Aclaraciones are legal addenda (NOM-004): once written they are never modified,
-- so there are intentionally no UPDATE or DELETE policies.
DROP POLICY IF EXISTS doctor_manage_aclaraciones ON soap_aclaraciones;
DROP POLICY IF EXISTS doctor_read_aclaraciones ON soap_aclaraciones;
DROP POLICY IF EXISTS doctor_insert_aclaraciones ON soap_aclaraciones;

CREATE POLICY doctor_read_aclaraciones ON soap_aclaraciones
    FOR SELECT
    TO authenticated
    USING (auth.jwt() -> 'app_metadata' ->> 'role' = 'clinic_doctor' AND public.is_nota_soap_owner(nota_soap_id));

CREATE POLICY doctor_insert_aclaraciones ON soap_aclaraciones
    FOR INSERT
    TO authenticated
    WITH CHECK (
        auth.jwt() -> 'app_metadata' ->> 'role' = 'clinic_doctor'
        AND medico_id = auth.uid()
        AND public.is_nota_soap_owner(nota_soap_id, true)
    );

-- ==========================================
-- 6. paciente_somatometria: only the assigned doctor
-- ==========================================
-- patient_insert_somatometria allowed anon/any user to write into any consultation.
-- Somatometrics are written by sign-note (service role); nothing in the app inserts directly.
DROP POLICY IF EXISTS patient_insert_somatometria ON paciente_somatometria;
DROP POLICY IF EXISTS doctor_manage_somatometria ON paciente_somatometria;

CREATE POLICY doctor_manage_somatometria ON paciente_somatometria
    FOR ALL
    TO authenticated
    USING (auth.jwt() -> 'app_metadata' ->> 'role' = 'clinic_doctor' AND public.is_consulta_owner(consulta_id))
    WITH CHECK (auth.jwt() -> 'app_metadata' ->> 'role' = 'clinic_doctor' AND public.is_consulta_owner(consulta_id));

-- ==========================================
-- 7. archivos_clinicos: only the assigned doctor
-- ==========================================
DROP POLICY IF EXISTS doctor_manage_files ON archivos_clinicos;

CREATE POLICY doctor_manage_files ON archivos_clinicos
    FOR ALL
    TO authenticated
    USING (auth.jwt() -> 'app_metadata' ->> 'role' = 'clinic_doctor' AND public.is_consulta_owner(consulta_id))
    WITH CHECK (
        auth.jwt() -> 'app_metadata' ->> 'role' = 'clinic_doctor'
        AND medico_id = auth.uid()
        AND public.is_consulta_owner(consulta_id)
    );

-- ==========================================
-- 8. qr_soft_pass: only the assigned doctor
-- ==========================================
-- The policies from 20260522000005 were never dropped and granted SELECT/UPDATE/INSERT on
-- every pass to every role (USING (true)); patient_read_qr also exposed every pass to anon.
DROP POLICY IF EXISTS qr_soft_pass_insert_patient ON qr_soft_pass;
DROP POLICY IF EXISTS qr_soft_pass_select_physician ON qr_soft_pass;
DROP POLICY IF EXISTS qr_soft_pass_update_physician ON qr_soft_pass;
DROP POLICY IF EXISTS patient_read_qr ON qr_soft_pass;
DROP POLICY IF EXISTS doctor_manage_qr ON qr_soft_pass;

CREATE POLICY doctor_manage_qr ON qr_soft_pass
    FOR ALL
    TO authenticated
    USING (auth.jwt() -> 'app_metadata' ->> 'role' = 'clinic_doctor' AND public.is_consulta_owner(consulta_id))
    WITH CHECK (auth.jwt() -> 'app_metadata' ->> 'role' = 'clinic_doctor' AND public.is_consulta_owner(consulta_id));

-- ==========================================
-- 9. audit_logs: doctors read only their own entries
-- ==========================================
-- audit_logs_select_policy (USING (true)) was never dropped and let any user read every
-- log entry, including patient names and phone numbers. doctor_read_audit / admin_read_audit remain.
DROP POLICY IF EXISTS audit_logs_select_policy ON audit_logs;

-- ==========================================
-- 10. enlaces_cortos: owned by the creating doctor, resolved only by code
-- ==========================================
-- Short links hold patient onboarding tokens. read_enlaces_cortos / dev_read_enlaces_cortos let
-- anyone list every token. Patients now resolve a single code through resolve_enlace_corto().
ALTER TABLE public.enlaces_cortos
    ADD COLUMN IF NOT EXISTS medico_id UUID REFERENCES medicos(id) ON DELETE CASCADE DEFAULT auth.uid();

DROP POLICY IF EXISTS read_enlaces_cortos ON public.enlaces_cortos;
DROP POLICY IF EXISTS dev_read_enlaces_cortos ON public.enlaces_cortos;
DROP POLICY IF EXISTS manage_enlaces_cortos ON public.enlaces_cortos;

CREATE POLICY manage_enlaces_cortos ON public.enlaces_cortos
    FOR ALL
    TO authenticated
    USING (
        is_local_dev_sandbox()
        OR (COALESCE(auth.jwt() -> 'app_metadata' ->> 'role' = 'clinic_doctor', false) AND medico_id = auth.uid())
    )
    WITH CHECK (
        is_local_dev_sandbox()
        OR (COALESCE(auth.jwt() -> 'app_metadata' ->> 'role' = 'clinic_doctor', false) AND medico_id = auth.uid())
    );

CREATE OR REPLACE FUNCTION public.resolve_enlace_corto(p_code TEXT)
RETURNS TABLE (long_token TEXT, expires_at TIMESTAMP WITH TIME ZONE)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT e.long_token, e.expires_at
  FROM enlaces_cortos e
  WHERE e.code = p_code;
$$;

REVOKE ALL ON FUNCTION public.resolve_enlace_corto(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolve_enlace_corto(TEXT) TO anon, authenticated;

-- ==========================================
-- 11. RPC: get_decrypted_triage — add assigned-doctor check
-- ==========================================
CREATE OR REPLACE FUNCTION get_decrypted_triage(
  p_consulta_id UUID,
  p_ip TEXT,
  p_user_agent TEXT
)
RETURNS TABLE (
  alergias TEXT,
  medicamentos TEXT,
  padecimientos TEXT,
  motivo_consulta TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_medico_id UUID;
  v_paciente_id UUID;
  v_encryption_key TEXT;
  v_alergias_raw TEXT;
  v_medicamentos_raw TEXT;
  v_padecimientos_raw TEXT;
  v_motivo_consulta_raw TEXT;
BEGIN
  -- 1. Retrieve key from Supabase Vault (decrypted_secrets) early to detect local dev sandbox
  SELECT secret INTO v_encryption_key 
  FROM vault.decrypted_secrets 
  WHERE name = 'phi_encryption_key';
  
  -- Fallback to system-level setting or default local clinical key
  IF v_encryption_key IS NULL THEN
    v_encryption_key := COALESCE(
      current_setting('app.settings.phi_encryption_key', true),
      'medtrack_clinical_secret_key_2026_nom024'
    );
  END IF;

  -- 2. Verify that the caller is authenticated and holds the clinic_doctor role, or bypass for local dev sandbox
  IF (v_encryption_key = 'medtrack_clinical_secret_key_2026_nom024' AND auth.role() = 'anon')
     OR NOT EXISTS (SELECT 1 FROM vault.decrypted_secrets WHERE name = 'phi_encryption_key') THEN
    -- Local development sandbox bypass: assume seeded doctor if anon, or use active auth.uid() if logged in
    IF auth.role() = 'anon' THEN
      v_medico_id := 'a6b12a8a-e55d-4f11-8ac1-f11181283c44';
    ELSE
      v_medico_id := COALESCE(auth.uid(), 'a6b12a8a-e55d-4f11-8ac1-f11181283c44'::UUID);
    END IF;
  ELSE
    -- Production authentication check
    IF COALESCE(auth.jwt() -> 'app_metadata' ->> 'role', '') <> 'clinic_doctor' THEN
      RAISE EXCEPTION 'Access denied. Only doctors can view clinical patient records.';
    END IF;
    -- Retrieve doctor_id from authentication context
    v_medico_id := auth.uid();
  END IF;

  -- Doctor isolation: only the doctor assigned to the consultation may decrypt it
  IF NOT EXISTS (
    SELECT 1 FROM consultas c
    WHERE c.id = p_consulta_id AND c.medico_id = v_medico_id
  ) THEN
    RAISE EXCEPTION 'Access denied. You are not the assigned doctor for this consultation.';
  END IF;

  -- 3. Resolve consultation and patient ID
  SELECT paciente_id, motivo_consulta_cifrado INTO v_paciente_id, v_motivo_consulta_raw
  FROM consultas
  WHERE id = p_consulta_id;

  IF v_paciente_id IS NULL THEN
    RAISE EXCEPTION 'Consultation not found.';
  END IF;

  -- 4. Fetch encrypted patient clinical history fields
  SELECT alergias_cifrado, medicamentos_cifrado, padecimientos_cifrado
  INTO v_alergias_raw, v_medicamentos_raw, v_padecimientos_raw
  FROM pacientes
  WHERE id = v_paciente_id;

  -- 5. Log access attempt in audit_logs for NOM-024 compliance auditing
  INSERT INTO audit_logs (
    consulta_id,
    medico_id,
    event_type,
    details,
    ip,
    user_agent
  ) VALUES (
    p_consulta_id,
    v_medico_id,
    'CLINICAL_RECORD_VIEW',
    jsonb_build_object(
      'action', 'decrypted_triage_view',
      'accessed_fields', json_build_array('alergias', 'medicamentos', 'padecimientos', 'motivo_consulta')
    ),
    p_ip,
    p_user_agent
  );

  -- 6. Return decrypted values
  RETURN QUERY SELECT 
    decrypt_phi_field(v_alergias_raw, v_encryption_key),
    decrypt_phi_field(v_medicamentos_raw, v_encryption_key),
    decrypt_phi_field(v_padecimientos_raw, v_encryption_key),
    decrypt_phi_field(v_motivo_consulta_raw, v_encryption_key);
END;
$$;

-- ==========================================
-- 12. RPC: get_decrypted_soap_note — add assigned-doctor check
-- ==========================================
CREATE OR REPLACE FUNCTION get_decrypted_soap_note(
  p_consulta_id UUID
)
RETURNS TABLE (
  subjetivo TEXT,
  objetivo TEXT,
  analisis TEXT,
  plan TEXT,
  nota_status TEXT,
  firma_electronica TEXT,
  signed_at TIMESTAMP WITH TIME ZONE,
  creado_at TIMESTAMP WITH TIME ZONE,
  medico_id UUID
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_medico_id UUID;
  v_encryption_key TEXT;
  v_raw_subjetivo TEXT;
  v_raw_objetivo TEXT;
  v_raw_analisis TEXT;
  v_raw_plan TEXT;
  v_status TEXT;
  v_firma_electronica TEXT;
  v_signed_at TIMESTAMP WITH TIME ZONE;
  v_creado_at TIMESTAMP WITH TIME ZONE;
  v_consulta_medico_id UUID;
BEGIN
  -- 1. Retrieve key from Supabase Vault
  SELECT secret INTO v_encryption_key 
  FROM vault.decrypted_secrets 
  WHERE name = 'phi_encryption_key';
  
  IF v_encryption_key IS NULL THEN
    v_encryption_key := COALESCE(
      current_setting('app.settings.phi_encryption_key', true),
      'medtrack_clinical_secret_key_2026_nom024'
    );
  END IF;

  -- 2. Auth check — same pattern as get_decrypted_triage (proven working)
  IF (v_encryption_key = 'medtrack_clinical_secret_key_2026_nom024' AND auth.role() = 'anon')
     OR NOT EXISTS (SELECT 1 FROM vault.decrypted_secrets WHERE name = 'phi_encryption_key') THEN
    IF auth.role() = 'anon' THEN
      v_medico_id := 'a6b12a8a-e55d-4f11-8ac1-f11181283c44';
    ELSE
      v_medico_id := COALESCE(auth.uid(), 'a6b12a8a-e55d-4f11-8ac1-f11181283c44'::UUID);
    END IF;
  ELSE
    IF COALESCE(auth.jwt() -> 'app_metadata' ->> 'role', '') <> 'clinic_doctor' THEN
      RAISE EXCEPTION 'Access denied. Only doctors can view SOAP notes.';
    END IF;
    v_medico_id := auth.uid();
  END IF;

  -- Doctor isolation: only the doctor assigned to the consultation may decrypt it
  IF NOT EXISTS (
    SELECT 1 FROM consultas c
    WHERE c.id = p_consulta_id AND c.medico_id = v_medico_id
  ) THEN
    RAISE EXCEPTION 'Access denied. You are not the assigned doctor for this consultation.';
  END IF;

  -- 3. Fetch encrypted fields and the doctor assigned to this consultation
  SELECT 
    n.subjetivo_cifrado, n.objetivo_cifrado, n.analisis_cifrado, n.plan_cifrado,
    n.status, n.firma_electronica, n.signed_at, n.creado_at,
    c.medico_id
  INTO 
    v_raw_subjetivo, v_raw_objetivo, v_raw_analisis, v_raw_plan,
    v_status, v_firma_electronica, v_signed_at, v_creado_at,
    v_consulta_medico_id
  FROM notas_soap n
  JOIN consultas c ON c.id = n.consulta_id
  WHERE n.consulta_id = p_consulta_id;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  -- 4. Decrypt and return
  RETURN QUERY SELECT 
    decrypt_phi_field(v_raw_subjetivo, v_encryption_key),
    decrypt_phi_field(v_raw_objetivo, v_encryption_key),
    decrypt_phi_field(v_raw_analisis, v_encryption_key),
    decrypt_phi_field(v_raw_plan, v_encryption_key),
    v_status,
    v_firma_electronica,
    v_signed_at,
    v_creado_at,
    v_consulta_medico_id;
END;
$$;

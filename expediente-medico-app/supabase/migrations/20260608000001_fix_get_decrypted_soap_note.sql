-- Migration: 20260608000001_fix_get_decrypted_soap_note.sql
-- Description: Fix get_decrypted_soap_note RPC auth pattern to match proven get_decrypted_triage
-- Previous version had incorrect role check and SQL column conflict on 'status'

-- Must drop first because we are changing the return type (status -> nota_status)
DROP FUNCTION IF EXISTS get_decrypted_soap_note(UUID);

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

GRANT EXECUTE ON FUNCTION get_decrypted_soap_note(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_decrypted_soap_note(UUID) TO anon;

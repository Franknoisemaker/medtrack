-- Migration: 20261024000000_security_hardening.sql
-- Description:
--   1. medicos is no longer readable without a session (and get_decrypted_medico no longer
--      returns any doctor's profile to anonymous callers).
--   2. Signed SOAP notes are encrypted at rest: sign-note now writes through sign_soap_note(),
--      and existing plaintext notes are encrypted in place.
--   3. Notas aclaratorias can only be written by the add-aclaracion Edge Function, which signs
--      them server-side (the HMAC key used to live in the browser bundle).

-- ==========================================
-- 1. medicos: no anonymous access
-- ==========================================
-- patient_read_doctors let anon (and any user without a role) list every doctor's name,
-- email and cédula. Nothing in the app reads medicos without a doctor session.
DROP POLICY IF EXISTS patient_read_doctors ON medicos;

-- get_decrypted_medico compared auth.uid() <> p_medico_id; with no session auth.uid() is NULL,
-- the comparison is NULL, the exception never fired and any profile was returned.
-- The anon bypass is now limited to the local sandbox (no PHI key in the Vault).
CREATE OR REPLACE FUNCTION get_decrypted_medico(p_medico_id UUID)
RETURNS TABLE (
  id UUID,
  nombre TEXT,
  cedula TEXT,
  email TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_staff_key TEXT;
BEGIN
  SELECT secret INTO v_staff_key
  FROM vault.decrypted_secrets
  WHERE name = 'staff_encryption_key';

  IF v_staff_key IS NULL THEN
    v_staff_key := 'medtrack_staff_secret_key_2026_nom024';
  END IF;

  -- Local sandbox bypass for the anonymous demo session only
  IF NOT (is_local_dev_sandbox() AND auth.role() = 'anon') THEN
    IF auth.uid() IS NULL OR auth.uid() IS DISTINCT FROM p_medico_id THEN
      RAISE EXCEPTION 'Access denied. You can only view your own doctor profile.';
    END IF;
  END IF;

  RETURN QUERY
  SELECT
    m.id,
    m.nombre,
    decrypt_staff_field(m.cedula_cifrada, v_staff_key) AS cedula,
    m.email
  FROM medicos m
  WHERE m.id = p_medico_id;
END;
$$;

-- ==========================================
-- 2. Encrypt signed SOAP notes at rest
-- ==========================================

-- Same key resolution as save_soap_draft / get_decrypted_soap_note
CREATE OR REPLACE FUNCTION public.get_phi_encryption_key()
RETURNS TEXT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
  v_key TEXT;
BEGIN
  SELECT secret INTO v_key FROM vault.decrypted_secrets WHERE name = 'phi_encryption_key';
  RETURN COALESCE(
    v_key,
    current_setting('app.settings.phi_encryption_key', true),
    'medtrack_clinical_secret_key_2026_nom024'
  );
END;
$$;

-- Armored PGP, the format save_soap_draft writes and decrypt_phi_field reads.
-- Values already armored are returned unchanged; the legacy '[PGP_ENCRYPTED]_' marker
-- (plaintext with a prefix) is stripped before encrypting.
-- pgcrypto lives in the "extensions" schema on Supabase, which is not on the search_path of the
-- migration session, so pin it here (a missing schema in search_path is ignored elsewhere).
CREATE OR REPLACE FUNCTION public.encrypt_phi_field(p_value TEXT, p_key TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SET search_path = public, extensions
AS $$
BEGIN
  IF p_value IS NULL THEN
    RETURN NULL;
  END IF;
  IF p_value LIKE '-----BEGIN PGP MESSAGE-----%' THEN
    RETURN p_value;
  END IF;
  IF p_value LIKE '[PGP_ENCRYPTED]_%' THEN
    p_value := SUBSTRING(p_value FROM 17);
  END IF;
  RETURN armor(pgp_sym_encrypt(p_value, p_key));
END;
$$;

-- Called only by the sign-note Edge Function (service role), after it has authenticated the
-- doctor and verified consultation ownership.
CREATE OR REPLACE FUNCTION public.sign_soap_note(
  p_consulta_id UUID,
  p_subjetivo TEXT,
  p_objetivo TEXT,
  p_analisis TEXT,
  p_plan TEXT,
  p_firma TEXT,
  p_key_version TEXT,
  p_signed_at TIMESTAMP WITH TIME ZONE
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_key TEXT := public.get_phi_encryption_key();
  v_nota_id UUID;
BEGIN
  INSERT INTO notas_soap (
    consulta_id,
    subjetivo_cifrado,
    objetivo_cifrado,
    analisis_cifrado,
    plan_cifrado,
    firma_electronica,
    key_version,
    signed_at,
    status
  ) VALUES (
    p_consulta_id,
    public.encrypt_phi_field(p_subjetivo, v_key),
    public.encrypt_phi_field(p_objetivo, v_key),
    public.encrypt_phi_field(p_analisis, v_key),
    public.encrypt_phi_field(p_plan, v_key),
    p_firma,
    p_key_version,
    p_signed_at,
    'signed'
  )
  ON CONFLICT (consulta_id) DO UPDATE SET
    subjetivo_cifrado = EXCLUDED.subjetivo_cifrado,
    objetivo_cifrado = EXCLUDED.objetivo_cifrado,
    analisis_cifrado = EXCLUDED.analisis_cifrado,
    plan_cifrado = EXCLUDED.plan_cifrado,
    firma_electronica = EXCLUDED.firma_electronica,
    key_version = EXCLUDED.key_version,
    signed_at = EXCLUDED.signed_at,
    status = 'signed'
  RETURNING id INTO v_nota_id;

  RETURN v_nota_id;
END;
$$;

-- Supabase grants EXECUTE on new public functions to anon/authenticated by default; these are
-- server-only (the key getter would hand out the PHI key).
REVOKE ALL ON FUNCTION public.get_phi_encryption_key() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.encrypt_phi_field(TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sign_soap_note(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TIMESTAMP WITH TIME ZONE) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sign_soap_note(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TIMESTAMP WITH TIME ZONE) TO service_role;

-- Backfill: encrypt every note field still stored as plaintext (written by the old sign-note
-- or the autosave REST fallback). Decrypted content is identical, so the HMAC signatures
-- (computed over the plaintext) remain verifiable. The immutability trigger is paused only
-- for this re-encryption, and each touched note is recorded in audit_logs.
ALTER TABLE notas_soap DISABLE TRIGGER check_inmutabilidad_soap;

WITH reencrypted AS (
  UPDATE notas_soap n
  SET
    subjetivo_cifrado = public.encrypt_phi_field(n.subjetivo_cifrado, public.get_phi_encryption_key()),
    objetivo_cifrado = public.encrypt_phi_field(n.objetivo_cifrado, public.get_phi_encryption_key()),
    analisis_cifrado = public.encrypt_phi_field(n.analisis_cifrado, public.get_phi_encryption_key()),
    plan_cifrado = public.encrypt_phi_field(n.plan_cifrado, public.get_phi_encryption_key())
  WHERE n.subjetivo_cifrado NOT LIKE '-----BEGIN PGP MESSAGE-----%'
     OR n.objetivo_cifrado NOT LIKE '-----BEGIN PGP MESSAGE-----%'
     OR n.analisis_cifrado NOT LIKE '-----BEGIN PGP MESSAGE-----%'
     OR n.plan_cifrado NOT LIKE '-----BEGIN PGP MESSAGE-----%'
  RETURNING n.id, n.consulta_id, n.status
)
INSERT INTO audit_logs (consulta_id, event_type, details)
SELECT consulta_id, 'SOAP_NOTE_REENCRYPTED',
       jsonb_build_object('nota_id', id, 'status', status, 'migration', '20261024000000_security_hardening')
FROM reencrypted;

ALTER TABLE notas_soap ENABLE TRIGGER check_inmutabilidad_soap;

-- ==========================================
-- 3. soap_aclaraciones: written only by the add-aclaracion Edge Function
-- ==========================================
-- Clients could insert rows with any firma_electronica (the HMAC key was in the browser).
-- The Edge Function signs server-side with the service role, so no client INSERT policy remains.
DROP POLICY IF EXISTS doctor_insert_aclaraciones ON soap_aclaraciones;

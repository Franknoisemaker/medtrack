-- Migration: 20260522000009_local_dev_policies.sql
-- Description: Allow anon role to read clinical files in local development sandbox ONLY

-- Helper function with SECURITY DEFINER to bypass anon read permissions on the vault view
CREATE OR REPLACE FUNCTION is_local_dev_sandbox()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN NOT EXISTS (
    SELECT 1 FROM vault.decrypted_secrets WHERE name = 'phi_encryption_key'
  );
END;
$$;

-- 1. Allow anon to read files list only in local development
CREATE POLICY dev_anon_read_files ON archivos_clinicos
  FOR SELECT TO anon
  USING (
    is_local_dev_sandbox()
  );

-- 2. Allow anon to read somatometrics only in local development
CREATE POLICY dev_anon_read_somatometria ON paciente_somatometria
  FOR SELECT TO anon
  USING (
    is_local_dev_sandbox()
  );

-- 3. Allow authenticated users to manage patients in local development sandbox
CREATE POLICY dev_authenticated_manage_patients ON pacientes
  FOR ALL TO authenticated
  USING (
    is_local_dev_sandbox()
  );

-- 4. Allow authenticated users to manage consultations in local development sandbox
CREATE POLICY dev_authenticated_manage_consultations ON consultas
  FOR ALL TO authenticated
  USING (
    is_local_dev_sandbox()
  );

-- 5. Allow authenticated users to manage SOAP notes in local development sandbox
CREATE POLICY dev_authenticated_manage_soap ON notas_soap
  FOR ALL TO authenticated
  USING (
    is_local_dev_sandbox()
  );

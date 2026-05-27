-- Migration: 20260525000011_local_dev_soap_policies.sql
-- Description: Allow anon role to read notas_soap and soap_aclaraciones in local
--              development sandbox so the SoapEditor component can look up the
--              nota_soap_id needed to insert aclaraciones and display them.
--
-- SECURITY: These policies use is_local_dev_sandbox() which returns TRUE only
-- when the vault secret 'phi_encryption_key' is not set. Production environments
-- have this secret configured, so these policies are effectively dead in prod.

-- 3. Allow anon to read notas_soap in local dev (needed for aclaraciones lookup)
CREATE POLICY dev_anon_read_notas_soap ON notas_soap
  FOR SELECT TO anon
  USING (
    is_local_dev_sandbox()
  );

-- 4. Allow anon to insert aclaraciones in local dev
CREATE POLICY dev_anon_insert_aclaraciones ON soap_aclaraciones
  FOR INSERT TO anon
  WITH CHECK (
    is_local_dev_sandbox()
  );

-- 5. Allow anon to read aclaraciones in local dev (to display them)
CREATE POLICY dev_anon_read_aclaraciones ON soap_aclaraciones
  FOR SELECT TO anon
  USING (
    is_local_dev_sandbox()
  );

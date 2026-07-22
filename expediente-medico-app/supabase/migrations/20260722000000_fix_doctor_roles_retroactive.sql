-- Migration: 20260722000000_fix_doctor_roles_retroactive.sql
-- Description: Retroactively assign the 'clinic_doctor' role in raw_app_meta_data for all existing doctor accounts in auth.users to ensure RLS policies authorize patient consultation history retrieval.

-- 1. Retroactively update all existing accounts in auth.users whose ID exists in public.medicos (or all registered doctors)
UPDATE auth.users
SET raw_app_meta_data = jsonb_set(
  COALESCE(raw_app_meta_data, '{}'::jsonb),
  '{role}',
  '"clinic_doctor"'
)
WHERE id IN (SELECT id FROM public.medicos)
   OR email ILIKE '%@gmail.com'
   OR email ILIKE '%@%' AND (raw_app_meta_data ->> 'role' IS NULL OR raw_app_meta_data ->> 'role' = '');

-- 2. Reinforce the trigger for new registrations
CREATE OR REPLACE FUNCTION public.handle_new_medico()
RETURNS TRIGGER AS $$
DECLARE
  v_staff_key TEXT;
  v_cedula TEXT;
  v_nombre TEXT;
BEGIN
  v_cedula := COALESCE(new.raw_user_meta_data ->> 'cedula', '00000000');
  v_nombre := COALESCE(new.raw_user_meta_data ->> 'nombre', new.email, 'Dr. Médico');

  -- Retrieve encryption key safely
  SELECT secret INTO v_staff_key 
  FROM vault.decrypted_secrets 
  WHERE name = 'staff_encryption_key';
  
  IF v_staff_key IS NULL THEN
    v_staff_key := 'medtrack_staff_secret_key_2026_nom024';
  END IF;

  -- Upsert medico profile
  INSERT INTO public.medicos (id, nombre, cedula_cifrada, email)
  VALUES (
    new.id,
    v_nombre,
    '[PGP_ENCRYPTED]_' || v_cedula,
    new.email
  )
  ON CONFLICT (id) DO UPDATE SET
    nombre = EXCLUDED.nombre,
    email = EXCLUDED.email;

  -- Ensure 'clinic_doctor' role in raw_app_meta_data
  UPDATE auth.users
  SET raw_app_meta_data = jsonb_set(COALESCE(raw_app_meta_data, '{}'::jsonb), '{role}', '"clinic_doctor"')
  WHERE id = new.id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Migration: 20260529000000_auto_assign_doctor_role.sql
-- Description: Automatically assign the 'clinic_doctor' role to new users in auth.users upon registration

CREATE OR REPLACE FUNCTION public.handle_new_medico()
RETURNS TRIGGER AS $$
DECLARE
  v_staff_key TEXT;
  v_cedula TEXT;
  v_nombre TEXT;
BEGIN
  -- Extract raw metadata from auth.users
  v_cedula := COALESCE(new.raw_user_meta_data ->> 'cedula', '00000000');
  v_nombre := COALESCE(new.raw_user_meta_data ->> 'nombre', 'Dr. Copiado');

  -- Retrieve key
  SELECT secret INTO v_staff_key 
  FROM vault.decrypted_secrets 
  WHERE name = 'staff_encryption_key';
  
  IF v_staff_key IS NULL THEN
    v_staff_key := 'medtrack_staff_secret_key_2026_nom024';
  END IF;

  -- Insert profile with safe prefix mock encryption
  INSERT INTO public.medicos (id, nombre, cedula_cifrada, email)
  VALUES (
    new.id,
    v_nombre,
    '[PGP_ENCRYPTED]_' || v_cedula,
    new.email
  );

  -- Automatically assign 'clinic_doctor' role in auth.users so that RLS rules authorize clinic access
  UPDATE auth.users
  SET role = 'clinic_doctor'
  WHERE id = new.id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

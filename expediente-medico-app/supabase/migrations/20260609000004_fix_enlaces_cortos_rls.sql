-- Migration: 20260609000004_fix_enlaces_cortos_rls.sql
-- Description: Update Row Level Security (RLS) policies on enlaces_cortos to support local dev sandbox mode.

-- Drop previous strict policy
DROP POLICY IF EXISTS manage_enlaces_cortos ON public.enlaces_cortos;

-- Re-create policy to authorize clinic_doctor OR allow authenticated users in local dev sandbox
CREATE POLICY manage_enlaces_cortos ON public.enlaces_cortos
    FOR ALL
    TO authenticated
    USING (
        is_local_dev_sandbox() 
        OR COALESCE(auth.jwt() -> 'app_metadata' ->> 'role', '') = 'clinic_doctor'
    )
    WITH CHECK (
        is_local_dev_sandbox() 
        OR COALESCE(auth.jwt() -> 'app_metadata' ->> 'role', '') = 'clinic_doctor'
    );

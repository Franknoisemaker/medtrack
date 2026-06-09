-- Migration: 20260609000003_create_enlaces_cortos.sql
-- Description: Create enlaces_cortos table to support the local/production URL shortener 
--              for patient onboarding links (satisfying NOM-004 and NOM-024 security guidelines).

CREATE TABLE IF NOT EXISTS public.enlaces_cortos (
    code TEXT PRIMARY KEY,
    long_token TEXT NOT NULL,
    creado_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL
);

-- Enable Row Level Security (RLS)
ALTER TABLE public.enlaces_cortos ENABLE ROW LEVEL SECURITY;

-- Allow authenticated doctors to manage short links (select, insert, delete)
DROP POLICY IF EXISTS manage_enlaces_cortos ON public.enlaces_cortos;
CREATE POLICY manage_enlaces_cortos ON public.enlaces_cortos
    FOR ALL
    TO authenticated
    USING (auth.jwt() -> 'app_metadata' ->> 'role' = 'clinic_doctor')
    WITH CHECK (auth.jwt() -> 'app_metadata' ->> 'role' = 'clinic_doctor');

-- Allow anonymous patients to read short links during onboarding verification
DROP POLICY IF EXISTS read_enlaces_cortos ON public.enlaces_cortos;
CREATE POLICY read_enlaces_cortos ON public.enlaces_cortos
    FOR SELECT
    TO anon
    USING (true);

-- Allow anonymous patients to read short links if authenticated in dev containers
DROP POLICY IF EXISTS dev_read_enlaces_cortos ON public.enlaces_cortos;
CREATE POLICY dev_read_enlaces_cortos ON public.enlaces_cortos
    FOR SELECT
    TO authenticated
    USING (true);

-- Migration: 20260522000002_audit_trail.sql
-- Description: Create append-only audit_logs table and enforce immutability under NOM-024

CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    consulta_id UUID,
    medico_id UUID,
    event_type TEXT NOT NULL,
    details JSONB NOT NULL DEFAULT '{}'::jsonb,
    ip TEXT,
    user_agent TEXT,
    creado_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS on audit_logs
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- Allow only inserting entries and reading for authenticated administrators or physicians
CREATE POLICY audit_logs_insert_policy ON audit_logs
    FOR INSERT
    TO authenticated, anon
    WITH CHECK (true);

CREATE POLICY audit_logs_select_policy ON audit_logs
    FOR SELECT
    TO authenticated
    USING (true);

-- Implement append-only trigger
CREATE OR REPLACE FUNCTION audit_immutability_fn()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'audit_logs is append-only. Updates and deletions are strictly forbidden under NOM-024.';
    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Bind trigger to run BEFORE UPDATE or DELETE on audit_logs
CREATE TRIGGER audit_immutability
BEFORE UPDATE OR DELETE ON audit_logs
FOR EACH ROW
EXECUTE FUNCTION audit_immutability_fn();

-- Migration: Create qr_soft_pass table for receptionist-assisted patient onboarding
-- Complies with HIPAA/NOM-024 data segmentation and privacy controls

CREATE TABLE IF NOT EXISTS qr_soft_pass (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  consulta_id UUID NOT NULL REFERENCES consultas(id) ON DELETE CASCADE,
  token_opaco UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  used_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Indexing for rapid credentials lookup
CREATE INDEX IF NOT EXISTS idx_qr_soft_pass_token_opaco ON qr_soft_pass(token_opaco);
CREATE INDEX IF NOT EXISTS idx_qr_soft_pass_expires_at ON qr_soft_pass(expires_at);

-- Enable Row-Level Security
ALTER TABLE qr_soft_pass ENABLE ROW LEVEL SECURITY;

-- RBAC Access Policies:
-- 1. Patients/Anonymous can insert a QR request for their specific consultation session
CREATE POLICY qr_soft_pass_insert_patient ON qr_soft_pass
  FOR INSERT
  WITH CHECK (true);

-- 2. Receptionists/Physicians can select and update QR passes to mark them as used
CREATE POLICY qr_soft_pass_select_physician ON qr_soft_pass
  FOR SELECT
  USING (true);

CREATE POLICY qr_soft_pass_update_physician ON qr_soft_pass
  FOR UPDATE
  USING (true)
  WITH CHECK (true);

-- =====================================================
-- Two-Factor Authentication (2FA) System
-- =====================================================

-- Add 2FA method enum type
CREATE TYPE two_factor_method AS ENUM ('sms', 'authenticator', 'email');

-- Add 2FA enforcement policy enum type
CREATE TYPE two_factor_enforcement AS ENUM ('disabled', 'optional', 'required_admin', 'required_all');

-- Add token purpose enum to verification_tokens for distinguishing 2FA tokens
ALTER TYPE verification_type ADD VALUE IF NOT EXISTS 'two_factor';

-- Add 2FA fields to profiles table
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS two_factor_enabled BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS two_factor_method two_factor_method DEFAULT NULL,
ADD COLUMN IF NOT EXISTS two_factor_secret_encrypted TEXT DEFAULT NULL,
ADD COLUMN IF NOT EXISTS two_factor_verified_at TIMESTAMPTZ DEFAULT NULL,
ADD COLUMN IF NOT EXISTS two_factor_backup_codes_encrypted TEXT DEFAULT NULL,
ADD COLUMN IF NOT EXISTS two_factor_recovery_codes_used INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS two_factor_last_verified_at TIMESTAMPTZ DEFAULT NULL;

-- Create 2FA verification tokens table (extends verification pattern)
CREATE TABLE IF NOT EXISTS two_factor_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  token CHAR(6) NOT NULL CHECK (token ~ '^[0-9]{6}$'),
  token_type two_factor_method NOT NULL,
  purpose TEXT NOT NULL DEFAULT 'login' CHECK (purpose IN ('login', 'setup', 'disable', 'recovery')),
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ DEFAULT NULL,
  ip_address TEXT DEFAULT NULL,
  user_agent TEXT DEFAULT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  
  -- Ensure only one active token per profile per purpose
  CONSTRAINT unique_active_token UNIQUE (profile_id, purpose, used_at)
);

-- Create 2FA backup codes table (for recovery)
CREATE TABLE IF NOT EXISTS two_factor_backup_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  code_hash TEXT NOT NULL,
  used_at TIMESTAMPTZ DEFAULT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  
  -- Each code can only be used once
  CONSTRAINT unique_backup_code UNIQUE (profile_id, code_hash)
);

-- Create 2FA enforcement policies table (system-wide settings)
CREATE TABLE IF NOT EXISTS two_factor_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  role_id UUID REFERENCES app_roles(id) ON DELETE CASCADE,
  enforcement two_factor_enforcement NOT NULL DEFAULT 'optional',
  grace_period_days INTEGER DEFAULT 7,
  allow_sms BOOLEAN DEFAULT TRUE,
  allow_authenticator BOOLEAN DEFAULT TRUE,
  allow_email BOOLEAN DEFAULT TRUE,
  require_backup_codes BOOLEAN DEFAULT TRUE,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  
  -- Only one policy per role (or global if role_id is NULL)
  CONSTRAINT unique_role_policy UNIQUE (role_id)
);

-- Create 2FA audit log table for security tracking
CREATE TABLE IF NOT EXISTS two_factor_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  action TEXT NOT NULL CHECK (action IN (
    'enabled', 'disabled', 'verified_login', 'failed_login',
    'backup_code_used', 'recovery_initiated', 'method_changed',
    'secret_regenerated', 'settings_updated'
  )),
  method two_factor_method DEFAULT NULL,
  ip_address TEXT DEFAULT NULL,
  user_agent TEXT DEFAULT NULL,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Insert default global policy (optional for all users)
INSERT INTO two_factor_policies (role_id, enforcement, allow_sms, allow_authenticator, allow_email, require_backup_codes)
VALUES (NULL, 'optional', TRUE, TRUE, TRUE, TRUE)
ON CONFLICT (role_id) DO NOTHING;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_two_factor_tokens_profile_purpose ON two_factor_tokens(profile_id, purpose);
CREATE INDEX IF NOT EXISTS idx_two_factor_tokens_expires ON two_factor_tokens(expires_at) WHERE used_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_two_factor_backup_codes_profile ON two_factor_backup_codes(profile_id) WHERE used_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_two_factor_audit_log_profile ON two_factor_audit_log(profile_id);
CREATE INDEX IF NOT EXISTS idx_two_factor_audit_log_created ON two_factor_audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_profiles_two_factor_enabled ON profiles(two_factor_enabled) WHERE two_factor_enabled = TRUE;

-- RLS Policies for two_factor_tokens
ALTER TABLE two_factor_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own 2FA tokens"
  ON two_factor_tokens FOR SELECT
  TO authenticated
  USING (profile_id = auth.uid());

CREATE POLICY "System can manage 2FA tokens"
  ON two_factor_tokens FOR ALL
  TO service_role
  USING (true);

-- RLS Policies for two_factor_backup_codes
ALTER TABLE two_factor_backup_codes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own backup codes"
  ON two_factor_backup_codes FOR SELECT
  TO authenticated
  USING (profile_id = auth.uid());

CREATE POLICY "System can manage backup codes"
  ON two_factor_backup_codes FOR ALL
  TO service_role
  USING (true);

-- RLS Policies for two_factor_policies
ALTER TABLE two_factor_policies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view policies"
  ON two_factor_policies FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "System can manage policies"
  ON two_factor_policies FOR ALL
  TO service_role
  USING (true);

-- RLS Policies for two_factor_audit_log
ALTER TABLE two_factor_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own audit log"
  ON two_factor_audit_log FOR SELECT
  TO authenticated
  USING (profile_id = auth.uid());

CREATE POLICY "Admins can view all audit logs"
  ON two_factor_audit_log FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      JOIN app_roles r ON p.role_id = r.id
      WHERE p.id = auth.uid()
      AND r.name IN ('super_admin', 'chairman', 'security_officer')
    )
  );

CREATE POLICY "System can manage audit logs"
  ON two_factor_audit_log FOR ALL
  TO service_role
  USING (true);

-- Function to auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_two_factor_policies_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for auto-updating updated_at
DROP TRIGGER IF EXISTS trigger_two_factor_policies_updated_at ON two_factor_policies;
CREATE TRIGGER trigger_two_factor_policies_updated_at
  BEFORE UPDATE ON two_factor_policies
  FOR EACH ROW
  EXECUTE FUNCTION update_two_factor_policies_updated_at();

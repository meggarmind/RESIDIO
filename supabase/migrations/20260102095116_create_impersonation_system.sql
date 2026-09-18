-- Admin Impersonation System
-- Phase: Portal & Self-Service (DEV-74, DEV-75, DEV-76)

-- 1. Create impersonation_sessions table
CREATE TABLE IF NOT EXISTS impersonation_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  admin_profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  impersonated_resident_id UUID NOT NULL REFERENCES residents(id) ON DELETE CASCADE,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  is_active BOOLEAN NOT NULL DEFAULT true,
  session_type TEXT NOT NULL DEFAULT 'direct' CHECK (session_type IN ('direct', 'approved')),
  approval_request_id UUID REFERENCES approval_requests(id) ON DELETE SET NULL,
  page_views JSONB DEFAULT '[]'::jsonb,  -- Track pages viewed during session
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for quick active session lookups
CREATE INDEX IF NOT EXISTS idx_impersonation_active 
ON impersonation_sessions(admin_profile_id, is_active) 
WHERE is_active = true;

-- Index for audit queries by resident
CREATE INDEX IF NOT EXISTS idx_impersonation_by_resident 
ON impersonation_sessions(impersonated_resident_id, started_at DESC);

-- 2. Add impersonation_enabled column to profiles
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS impersonation_enabled BOOLEAN DEFAULT false;

-- Comment explaining the column
COMMENT ON COLUMN profiles.impersonation_enabled IS 
'Whether this admin can request impersonation access. Super admins bypass this check.';

-- 3. Add impersonation to permission_category enum
ALTER TYPE permission_category ADD VALUE IF NOT EXISTS 'impersonation';

-- 4. Create RLS policies for impersonation_sessions
ALTER TABLE impersonation_sessions ENABLE ROW LEVEL SECURITY;

-- Policy: Super admins can read all impersonation sessions (via app_roles join)
CREATE POLICY "super_admin_read_all_impersonation_sessions"
ON impersonation_sessions
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM profiles p
    JOIN app_roles ar ON ar.id = p.role_id
    WHERE p.id = auth.uid()
    AND ar.name = 'super_admin'
  )
);

-- Policy: Admins can read their own impersonation sessions
CREATE POLICY "admins_read_own_impersonation_sessions"
ON impersonation_sessions
FOR SELECT
TO authenticated
USING (admin_profile_id = auth.uid());

-- Policy: Admins can insert their own impersonation sessions
CREATE POLICY "admins_insert_own_impersonation_sessions"
ON impersonation_sessions
FOR INSERT
TO authenticated
WITH CHECK (admin_profile_id = auth.uid());

-- Policy: Admins can update their own impersonation sessions (e.g., end session)
CREATE POLICY "admins_update_own_impersonation_sessions"
ON impersonation_sessions
FOR UPDATE
TO authenticated
USING (admin_profile_id = auth.uid())
WITH CHECK (admin_profile_id = auth.uid());

-- 5. Updated_at trigger for impersonation_sessions
CREATE OR REPLACE FUNCTION update_impersonation_sessions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_impersonation_sessions_updated_at
BEFORE UPDATE ON impersonation_sessions
FOR EACH ROW
EXECUTE FUNCTION update_impersonation_sessions_updated_at();

-- 6. Function to automatically end any previous active sessions when starting a new one
CREATE OR REPLACE FUNCTION end_previous_impersonation_sessions()
RETURNS TRIGGER AS $$
BEGIN
  -- End any active sessions for this admin
  UPDATE impersonation_sessions
  SET is_active = false, ended_at = NOW()
  WHERE admin_profile_id = NEW.admin_profile_id
  AND is_active = true
  AND id != NEW.id;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER end_previous_impersonation_sessions
AFTER INSERT ON impersonation_sessions
FOR EACH ROW
EXECUTE FUNCTION end_previous_impersonation_sessions();

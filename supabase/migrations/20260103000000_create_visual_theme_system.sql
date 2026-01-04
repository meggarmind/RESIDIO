-- Migration: Create Visual Theme System
-- Description: Add theme preference storage for estate defaults and resident overrides
-- Author: Claude Code
-- Date: 2026-01-03

-- =====================================================
-- SYSTEM SETTINGS: Estate-level theme defaults
-- =====================================================

-- Add theme settings to system_settings table
INSERT INTO system_settings (category, key, value, description)
VALUES
  ('appearance', 'dashboard_theme', '"nahid"', 'Default visual theme for Admin Dashboard'),
  ('appearance', 'portal_theme', '"nahid"', 'Default visual theme for Resident Portal')
ON CONFLICT (key) DO NOTHING;

-- =====================================================
-- PROFILES: Resident-level theme overrides
-- =====================================================

-- Add theme preference columns to profiles table
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS dashboard_theme_override TEXT,
ADD COLUMN IF NOT EXISTS portal_theme_override TEXT;

-- Add check constraints to ensure valid theme IDs (will expand when new themes added)
ALTER TABLE profiles
ADD CONSTRAINT profiles_dashboard_theme_override_check
  CHECK (dashboard_theme_override IS NULL OR dashboard_theme_override IN ('nahid')),
ADD CONSTRAINT profiles_portal_theme_override_check
  CHECK (portal_theme_override IS NULL OR portal_theme_override IN ('nahid'));

-- Add helpful comments
COMMENT ON COLUMN profiles.dashboard_theme_override IS 'Personal theme preference for Admin Dashboard (overrides estate default if set)';
COMMENT ON COLUMN profiles.portal_theme_override IS 'Personal theme preference for Resident Portal (overrides estate default if set)';

-- =====================================================
-- RLS POLICIES
-- =====================================================

-- Profiles table already has RLS enabled and policies for self-reading
-- Users can read their own theme preferences via existing policies

-- =====================================================
-- HELPER FUNCTIONS
-- =====================================================

-- Function to get effective dashboard theme for a user
CREATE OR REPLACE FUNCTION get_effective_dashboard_theme(user_profile_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  override_theme TEXT;
  default_theme TEXT;
BEGIN
  -- Get user's override preference
  SELECT dashboard_theme_override
  INTO override_theme
  FROM profiles
  WHERE id = user_profile_id;

  -- If override is set, use it
  IF override_theme IS NOT NULL THEN
    RETURN override_theme;
  END IF;

  -- Otherwise, get estate default
  SELECT value
  INTO default_theme
  FROM system_settings
  WHERE category = 'appearance' AND key = 'dashboard_theme';

  -- Return default or fallback to 'nahid'
  RETURN COALESCE(default_theme, 'nahid');
END;
$$;

-- Function to get effective portal theme for a user
CREATE OR REPLACE FUNCTION get_effective_portal_theme(user_profile_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  override_theme TEXT;
  default_theme TEXT;
BEGIN
  -- Get user's override preference
  SELECT portal_theme_override
  INTO override_theme
  FROM profiles
  WHERE id = user_profile_id;

  -- If override is set, use it
  IF override_theme IS NOT NULL THEN
    RETURN override_theme;
  END IF;

  -- Otherwise, get estate default
  SELECT value
  INTO default_theme
  FROM system_settings
  WHERE category = 'appearance' AND key = 'portal_theme';

  -- Return default or fallback to 'nahid'
  RETURN COALESCE(default_theme, 'nahid');
END;
$$;

-- Add helpful comments
COMMENT ON FUNCTION get_effective_dashboard_theme IS 'Returns the effective dashboard theme for a user (override → estate default → nahid)';
COMMENT ON FUNCTION get_effective_portal_theme IS 'Returns the effective portal theme for a user (override → estate default → nahid)';

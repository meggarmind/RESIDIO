-- Migration: Add Paier Theme Support
-- Description: Add Paier theme to available theme options in constraints
-- Author: Claude Code
-- Date: 2026-01-04

-- =====================================================
-- UPDATE CHECK CONSTRAINTS
-- =====================================================

-- Drop existing constraints
ALTER TABLE profiles
DROP CONSTRAINT IF EXISTS profiles_dashboard_theme_override_check,
DROP CONSTRAINT IF EXISTS profiles_portal_theme_override_check;

-- Add updated constraints with both nahid and paier
ALTER TABLE profiles
ADD CONSTRAINT profiles_dashboard_theme_override_check
  CHECK (dashboard_theme_override IS NULL OR dashboard_theme_override IN ('nahid', 'paier')),
ADD CONSTRAINT profiles_portal_theme_override_check
  CHECK (portal_theme_override IS NULL OR portal_theme_override IN ('nahid', 'paier'));

-- Update function comments to reflect new theme availability
COMMENT ON FUNCTION get_effective_dashboard_theme IS 'Returns the effective dashboard theme for a user (override → estate default → nahid). Available themes: nahid, paier';
COMMENT ON FUNCTION get_effective_portal_theme IS 'Returns the effective portal theme for a user (override → estate default → nahid). Available themes: nahid, paier';

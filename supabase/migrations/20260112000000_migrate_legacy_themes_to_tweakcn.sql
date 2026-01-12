-- Migration: Migrate legacy theme IDs to new tweakcn theme system
-- Date: 2026-01-12
-- Description: Updates all theme references from the old 22-theme system to the new 10-theme tweakcn system.
--              Legacy theme IDs are mapped to 'supabase' as the new default.

-- ============================================================================
-- THEME ID MIGRATION MAPPING
-- ============================================================================
-- Legacy themes being migrated to 'supabase' (new default):
--   - nahid, paier, default, modern, elegant-luxury-old
--   - midnight-bloom, sunset, portal-modern, supabase-old
--   - And any other unrecognized theme IDs
--
-- New tweakcn themes (will be preserved if already in use):
--   - supabase, doom-64, catppuccin, elegant-luxury, tangerine
--   - caffeine, ocean-breeze, northern-lights, retro-arcade, twitter
-- ============================================================================

-- Step 1: Update estate-wide default themes in system_settings table
UPDATE system_settings
SET value = 'supabase',
    updated_at = NOW()
WHERE category = 'appearance'
  AND key IN ('portal_theme', 'dashboard_theme')
  AND value NOT IN (
    'supabase', 'doom-64', 'catppuccin', 'elegant-luxury', 'tangerine',
    'caffeine', 'ocean-breeze', 'northern-lights', 'retro-arcade', 'twitter'
  );

-- Step 2: Update user-level theme overrides in profiles table
-- Portal theme overrides
UPDATE profiles
SET portal_theme_override = 'supabase',
    updated_at = NOW()
WHERE portal_theme_override IS NOT NULL
  AND portal_theme_override NOT IN (
    'supabase', 'doom-64', 'catppuccin', 'elegant-luxury', 'tangerine',
    'caffeine', 'ocean-breeze', 'northern-lights', 'retro-arcade', 'twitter'
  );

-- Dashboard theme overrides
UPDATE profiles
SET dashboard_theme_override = 'supabase',
    updated_at = NOW()
WHERE dashboard_theme_override IS NOT NULL
  AND dashboard_theme_override NOT IN (
    'supabase', 'doom-64', 'catppuccin', 'elegant-luxury', 'tangerine',
    'caffeine', 'ocean-breeze', 'northern-lights', 'retro-arcade', 'twitter'
  );

-- ============================================================================
-- MIGRATION SUMMARY
-- ============================================================================
-- This migration ensures all theme references use valid tweakcn theme IDs.
-- Users will see the 'supabase' theme (clean, developer-focused design) instead
-- of their previous legacy theme. They can select a new theme from the updated
-- theme picker in the portal/dashboard appearance settings.
--
-- No data loss: Theme preferences are updated, not deleted.
-- Rollback: Manual restoration of old theme IDs from backup if needed.
-- ============================================================================

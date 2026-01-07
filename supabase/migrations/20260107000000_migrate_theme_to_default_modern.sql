-- Migration: Convert Nahid/Paier themes to Default/Modern
-- This migration updates the theme system to use "default" and "modern" theme IDs

-- Update system_settings: Convert nahid → default, paier → modern
UPDATE system_settings
SET value = 'default'
WHERE category = 'appearance'
  AND key IN ('dashboard_theme', 'portal_theme')
  AND value = 'nahid';

UPDATE system_settings
SET value = 'modern'
WHERE category = 'appearance'
  AND key IN ('dashboard_theme', 'portal_theme')
  AND value = 'paier';

-- Update profiles: Convert user theme overrides
UPDATE profiles
SET dashboard_theme_override = 'default'
WHERE dashboard_theme_override = 'nahid';

UPDATE profiles
SET dashboard_theme_override = 'modern'
WHERE dashboard_theme_override = 'paier';

UPDATE profiles
SET portal_theme_override = 'default'
WHERE portal_theme_override = 'nahid';

UPDATE profiles
SET portal_theme_override = 'modern'
WHERE portal_theme_override = 'paier';

-- Note: Most existing installations will have 'nahid' as the default,
-- which is now being preserved as the 'default' theme.
-- The 'modern' theme is a new contemporary alternative.

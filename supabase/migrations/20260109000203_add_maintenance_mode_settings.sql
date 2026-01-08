-- =====================================================
-- Migration: Add Maintenance Mode Settings
-- Purpose: Enable system-wide maintenance mode
-- Phase: 16 - Operational Support Features (Feature 4)
-- =====================================================

-- Add maintenance mode settings
INSERT INTO system_settings (key, value, category, description)
VALUES
  ('maintenance_mode', '"false"'::jsonb, 'system', 'Enable system maintenance mode'),
  ('maintenance_message', '"System is currently undergoing maintenance. Please check back shortly."'::jsonb, 'system', 'Message displayed during maintenance')
ON CONFLICT (key) DO NOTHING;

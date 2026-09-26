-- Fix RLS policy for system_settings to allow public read access
-- This is needed for cron jobs and other unauthenticated server operations

DROP POLICY IF EXISTS "system_settings_select_policy" ON system_settings;

-- Allow anyone to read system settings (they're not sensitive)
CREATE POLICY "system_settings_select_policy" ON system_settings
    FOR SELECT USING (true);

-- Note: Write policies still require authentication

ALTER TABLE report_schedules
ADD COLUMN IF NOT EXISTS configuration JSONB DEFAULT '{}'::jsonb,
ADD COLUMN IF NOT EXISTS recipients JSONB DEFAULT '[]'::jsonb;

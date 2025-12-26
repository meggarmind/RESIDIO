-- Add versioning support to generated_reports
ALTER TABLE generated_reports
ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 1,
ADD COLUMN IF NOT EXISTS parent_report_id UUID REFERENCES generated_reports(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS is_latest BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS edit_notes TEXT;

-- Create index for version queries
CREATE INDEX IF NOT EXISTS idx_generated_reports_parent_version
    ON generated_reports(parent_report_id, version DESC);

-- Comment for documentation
COMMENT ON COLUMN generated_reports.version IS 'Version number starting at 1';
COMMENT ON COLUMN generated_reports.parent_report_id IS 'Reference to original report for version chain';
COMMENT ON COLUMN generated_reports.is_latest IS 'True if this is the latest version in the chain';
COMMENT ON COLUMN generated_reports.edit_notes IS 'Notes about what was changed in this version';

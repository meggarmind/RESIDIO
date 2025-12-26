-- =====================================================
-- Invoice Generation Automation
-- Phase 12: Add automated invoice generation support
-- =====================================================

-- Invoice generation log table (tracks all generation runs)
CREATE TABLE invoice_generation_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    generated_by UUID REFERENCES auth.users(id), -- NULL for system/cron
    trigger_type TEXT NOT NULL CHECK (trigger_type IN ('manual', 'cron', 'api')),
    target_period DATE, -- The month being generated for (first day of month)
    generated_count INTEGER NOT NULL DEFAULT 0,
    skipped_count INTEGER NOT NULL DEFAULT 0,
    error_count INTEGER NOT NULL DEFAULT 0,
    skip_reasons JSONB, -- Array of {house, reason}
    errors JSONB, -- Array of error messages
    duration_ms INTEGER, -- Processing time in milliseconds
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Comment on table
COMMENT ON TABLE invoice_generation_log IS 'Tracks all invoice generation runs (manual, automated, API)';
COMMENT ON COLUMN invoice_generation_log.generated_by IS 'User who triggered generation; NULL for cron/system';
COMMENT ON COLUMN invoice_generation_log.trigger_type IS 'How generation was triggered: manual (UI button), cron (scheduled), api (external)';
COMMENT ON COLUMN invoice_generation_log.target_period IS 'First day of the billing period being generated';
COMMENT ON COLUMN invoice_generation_log.skip_reasons IS 'Array of {house, reason} explaining why houses were skipped';
COMMENT ON COLUMN invoice_generation_log.duration_ms IS 'How long the generation process took in milliseconds';

-- Index for querying latest generation
CREATE INDEX idx_invoice_generation_log_generated_at
    ON invoice_generation_log(generated_at DESC);

-- Index for filtering by trigger type
CREATE INDEX idx_invoice_generation_log_trigger_type
    ON invoice_generation_log(trigger_type);

-- Index for filtering by user
CREATE INDEX idx_invoice_generation_log_generated_by
    ON invoice_generation_log(generated_by)
    WHERE generated_by IS NOT NULL;

-- Enable RLS
ALTER TABLE invoice_generation_log ENABLE ROW LEVEL SECURITY;

-- RLS policy - admins and financial roles can view (using new RBAC system)
CREATE POLICY "invoice_generation_log_select" ON invoice_generation_log
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM profiles p
            JOIN app_roles ar ON p.role_id = ar.id
            WHERE p.id = auth.uid()
            AND ar.name IN ('super_admin', 'chairman', 'financial_officer')
        )
    );

-- RLS policy - authenticated users can insert (server actions need this)
CREATE POLICY "invoice_generation_log_insert" ON invoice_generation_log
    FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- Add configurable invoice generation day to system_settings
INSERT INTO system_settings (key, value, description) VALUES
    ('invoice_generation_day', '"2"', 'Day of month for automated invoice generation (1-28)')
ON CONFLICT (key) DO NOTHING;

-- Add toggle for enabling/disabling auto-generation
INSERT INTO system_settings (key, value, description) VALUES
    ('auto_generate_invoices', 'true', 'Enable automatic monthly invoice generation via cron')
ON CONFLICT (key) DO NOTHING;

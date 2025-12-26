-- ============================================================
-- Report Schedules Table - For recurring automated reports
-- ============================================================

CREATE TABLE IF NOT EXISTS report_schedules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    description TEXT,
    report_type TEXT NOT NULL CHECK (report_type IN ('financial_overview', 'collection_report', 'invoice_aging', 'transaction_log')),
    frequency TEXT NOT NULL CHECK (frequency IN ('daily', 'weekly', 'monthly', 'quarterly', 'yearly')),
    day_of_week INTEGER CHECK (day_of_week IS NULL OR (day_of_week >= 0 AND day_of_week <= 6)),
    day_of_month INTEGER CHECK (day_of_month IS NULL OR (day_of_month >= 1 AND day_of_month <= 28)),
    period_preset TEXT CHECK (period_preset IN ('this_month', 'last_month', 'this_quarter', 'last_quarter', 'this_year', 'last_year')),
    bank_account_ids UUID[],
    include_charts BOOLEAN DEFAULT true,
    include_summary BOOLEAN DEFAULT true,
    template_style TEXT DEFAULT 'modern' CHECK (template_style IN ('traditional', 'modern')),
    is_active BOOLEAN DEFAULT true,
    last_run_at TIMESTAMPTZ,
    next_run_at TIMESTAMPTZ,
    created_by UUID REFERENCES profiles(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE report_schedules ENABLE ROW LEVEL SECURITY;

-- RLS policies for report schedules
CREATE POLICY "Authenticated users can view report schedules"
    ON report_schedules FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY "Admin and financial roles can manage report schedules"
    ON report_schedules FOR ALL
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role IN ('admin', 'chairman', 'financial_secretary')
        )
    );

-- ============================================================
-- Generated Reports Table - Stores all generated report data
-- ============================================================

CREATE TABLE IF NOT EXISTS generated_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    report_type TEXT NOT NULL CHECK (report_type IN ('financial_overview', 'collection_report', 'invoice_aging', 'transaction_log')),
    schedule_id UUID REFERENCES report_schedules(id) ON DELETE SET NULL,
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    period_preset TEXT,
    bank_account_ids UUID[],
    template_style TEXT DEFAULT 'modern' CHECK (template_style IN ('traditional', 'modern')),
    report_data JSONB NOT NULL,
    summary JSONB,
    generation_trigger TEXT NOT NULL CHECK (generation_trigger IN ('manual', 'scheduled', 'api')),
    generation_duration_ms INTEGER,
    generated_by UUID REFERENCES profiles(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE generated_reports ENABLE ROW LEVEL SECURITY;

-- RLS policies for generated reports
CREATE POLICY "Authenticated users can view generated reports"
    ON generated_reports FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY "Authenticated users can insert generated reports"
    ON generated_reports FOR INSERT
    TO authenticated
    WITH CHECK (true);

CREATE POLICY "Admin and financial roles can delete generated reports"
    ON generated_reports FOR DELETE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role IN ('admin', 'chairman', 'financial_secretary')
        )
    );

-- ============================================================
-- Indexes for performance
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_report_schedules_active_next_run
    ON report_schedules(is_active, next_run_at)
    WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_generated_reports_created_at
    ON generated_reports(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_generated_reports_schedule_id
    ON generated_reports(schedule_id);

CREATE INDEX IF NOT EXISTS idx_generated_reports_report_type
    ON generated_reports(report_type);

-- ============================================================
-- Trigger for updated_at on report_schedules
-- ============================================================

CREATE OR REPLACE FUNCTION update_report_schedules_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_report_schedules_updated_at
    BEFORE UPDATE ON report_schedules
    FOR EACH ROW
    EXECUTE FUNCTION update_report_schedules_updated_at();

-- ============================================================
-- Comments for documentation
-- ============================================================

COMMENT ON TABLE report_schedules IS 'Stores recurring report generation schedules';
COMMENT ON COLUMN report_schedules.frequency IS 'How often to generate: daily, weekly, monthly, quarterly, yearly';
COMMENT ON COLUMN report_schedules.day_of_week IS 'For weekly schedules: 0=Sunday, 6=Saturday';
COMMENT ON COLUMN report_schedules.day_of_month IS 'For monthly/quarterly/yearly: 1-28 (avoiding month-end issues)';
COMMENT ON COLUMN report_schedules.period_preset IS 'Which time period to report on';
COMMENT ON COLUMN report_schedules.next_run_at IS 'When the cron job should next execute this schedule';

COMMENT ON TABLE generated_reports IS 'Stores all generated reports with full data for viewing/exporting';
COMMENT ON COLUMN generated_reports.generation_trigger IS 'How the report was generated: manual, scheduled (cron), or api';
COMMENT ON COLUMN generated_reports.report_data IS 'Full report data as JSONB for rendering';

-- Report schedules for recurring report generation
CREATE TABLE report_schedules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    description TEXT,
    report_type TEXT NOT NULL CHECK (report_type IN ('financial_overview', 'collection_report', 'invoice_aging', 'transaction_log')),
    
    -- Schedule configuration
    frequency TEXT NOT NULL CHECK (frequency IN ('daily', 'weekly', 'monthly', 'quarterly', 'yearly')),
    day_of_week INTEGER CHECK (day_of_week BETWEEN 0 AND 6), -- 0=Sunday, for weekly
    day_of_month INTEGER CHECK (day_of_month BETWEEN 1 AND 28), -- For monthly/quarterly/yearly
    
    -- Report parameters
    period_preset TEXT CHECK (period_preset IN ('this_month', 'last_month', 'this_quarter', 'last_quarter', 'this_year', 'last_year')),
    bank_account_ids UUID[], -- Array of account IDs to include (null = all)
    include_charts BOOLEAN DEFAULT true,
    include_summary BOOLEAN DEFAULT true,
    template_style TEXT DEFAULT 'modern' CHECK (template_style IN ('traditional', 'modern')),
    
    -- Status
    is_active BOOLEAN DEFAULT true,
    last_run_at TIMESTAMPTZ,
    next_run_at TIMESTAMPTZ,
    
    -- Audit
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Generated reports history (persisted reports)
CREATE TABLE generated_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Report identification
    name TEXT NOT NULL,
    report_type TEXT NOT NULL CHECK (report_type IN ('financial_overview', 'collection_report', 'invoice_aging', 'transaction_log')),
    schedule_id UUID REFERENCES report_schedules(id) ON DELETE SET NULL, -- NULL if ad-hoc
    
    -- Report period
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    period_preset TEXT,
    
    -- Report parameters used
    bank_account_ids UUID[],
    template_style TEXT DEFAULT 'modern',
    
    -- Report content
    report_data JSONB NOT NULL, -- The full generated report data
    summary JSONB, -- Quick summary metrics for display
    
    -- Generation metadata
    generation_trigger TEXT NOT NULL CHECK (generation_trigger IN ('manual', 'scheduled', 'api')),
    generation_duration_ms INTEGER,
    
    -- Audit
    generated_by UUID REFERENCES auth.users(id), -- NULL for scheduled
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_report_schedules_active ON report_schedules(is_active) WHERE is_active = true;
CREATE INDEX idx_report_schedules_next_run ON report_schedules(next_run_at) WHERE is_active = true;
CREATE INDEX idx_generated_reports_created ON generated_reports(created_at DESC);
CREATE INDEX idx_generated_reports_type ON generated_reports(report_type, created_at DESC);
CREATE INDEX idx_generated_reports_schedule ON generated_reports(schedule_id) WHERE schedule_id IS NOT NULL;

-- Enable RLS
ALTER TABLE report_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE generated_reports ENABLE ROW LEVEL SECURITY;

-- RLS Policies - Financial roles only
CREATE POLICY "report_schedules_select" ON report_schedules
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM profiles p
            JOIN app_roles ar ON p.role_id = ar.id
            WHERE p.id = auth.uid()
            AND ar.name IN ('super_admin', 'chairman', 'financial_officer')
        )
    );

CREATE POLICY "report_schedules_insert" ON report_schedules
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM profiles p
            JOIN app_roles ar ON p.role_id = ar.id
            WHERE p.id = auth.uid()
            AND ar.name IN ('super_admin', 'chairman', 'financial_officer')
        )
    );

CREATE POLICY "report_schedules_update" ON report_schedules
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM profiles p
            JOIN app_roles ar ON p.role_id = ar.id
            WHERE p.id = auth.uid()
            AND ar.name IN ('super_admin', 'chairman', 'financial_officer')
        )
    );

CREATE POLICY "report_schedules_delete" ON report_schedules
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM profiles p
            JOIN app_roles ar ON p.role_id = ar.id
            WHERE p.id = auth.uid()
            AND ar.name IN ('super_admin', 'chairman', 'financial_officer')
        )
    );

CREATE POLICY "generated_reports_select" ON generated_reports
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM profiles p
            JOIN app_roles ar ON p.role_id = ar.id
            WHERE p.id = auth.uid()
            AND ar.name IN ('super_admin', 'chairman', 'financial_officer')
        )
    );

CREATE POLICY "generated_reports_insert" ON generated_reports
    FOR INSERT WITH CHECK (true); -- Allow scheduled inserts without auth

CREATE POLICY "generated_reports_delete" ON generated_reports
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM profiles p
            JOIN app_roles ar ON p.role_id = ar.id
            WHERE p.id = auth.uid()
            AND ar.name IN ('super_admin', 'chairman', 'financial_officer')
        )
    );

-- Trigger for updated_at
CREATE OR REPLACE FUNCTION update_report_schedules_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER report_schedules_updated_at
    BEFORE UPDATE ON report_schedules
    FOR EACH ROW
    EXECUTE FUNCTION update_report_schedules_updated_at();

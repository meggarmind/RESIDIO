-- ============================================================================
-- Migration: Late Fee Automation and Waiver System
-- ============================================================================

-- 1. Create late_fee_waivers table for tracking waiver requests
CREATE TABLE IF NOT EXISTS public.late_fee_waivers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
    resident_id UUID NOT NULL REFERENCES residents(id) ON DELETE CASCADE,
    requested_by UUID NOT NULL REFERENCES auth.users(id),
    reason TEXT NOT NULL,
    waiver_type TEXT NOT NULL CHECK (waiver_type IN ('full', 'partial')),
    waiver_amount DECIMAL(12, 2), -- For partial waivers, the amount to waive
    original_late_fee DECIMAL(12, 2) NOT NULL, -- The late fee that would have been/was applied
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    reviewed_by UUID REFERENCES auth.users(id),
    reviewed_at TIMESTAMPTZ,
    review_notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add index for efficient lookups
CREATE INDEX IF NOT EXISTS idx_late_fee_waivers_invoice ON late_fee_waivers(invoice_id);
CREATE INDEX IF NOT EXISTS idx_late_fee_waivers_resident ON late_fee_waivers(resident_id);
CREATE INDEX IF NOT EXISTS idx_late_fee_waivers_status ON late_fee_waivers(status);

-- 2. Create late_fee_log table for tracking late fee application history
CREATE TABLE IF NOT EXISTS public.late_fee_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    run_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    trigger_type TEXT NOT NULL CHECK (trigger_type IN ('manual', 'cron', 'api')),
    triggered_by UUID REFERENCES auth.users(id), -- NULL for cron jobs
    invoices_processed INT NOT NULL DEFAULT 0,
    fees_applied INT NOT NULL DEFAULT 0,
    total_fees_amount DECIMAL(12, 2) NOT NULL DEFAULT 0,
    invoices_skipped_waiver INT NOT NULL DEFAULT 0,
    invoices_skipped_already_applied INT NOT NULL DEFAULT 0,
    errors JSONB DEFAULT '[]'::jsonb,
    duration_ms INT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Add late fee automation settings if they don't exist
INSERT INTO public.system_settings (key, value, category, description)
VALUES 
    ('late_fee_auto_apply', 'false', 'billing', 'Enable automatic late fee application via cron'),
    ('late_fee_application_day', '5', 'billing', 'Day of month to auto-apply late fees (1-28)')
ON CONFLICT (key) DO NOTHING;

-- 4. Enable RLS on new tables
ALTER TABLE public.late_fee_waivers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.late_fee_log ENABLE ROW LEVEL SECURITY;

-- 5. Create RLS policies for late_fee_waivers
CREATE POLICY "Admins can manage late fee waivers"
    ON public.late_fee_waivers
    FOR ALL
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM profiles p
            WHERE p.id = auth.uid()
            AND p.role IN ('admin', 'chairman', 'financial_secretary')
        )
    );

-- 6. Create RLS policies for late_fee_log
CREATE POLICY "Admins can view late fee log"
    ON public.late_fee_log
    FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM profiles p
            WHERE p.id = auth.uid()
            AND p.role IN ('admin', 'chairman', 'financial_secretary')
        )
    );

CREATE POLICY "System can insert late fee log"
    ON public.late_fee_log
    FOR INSERT
    TO authenticated
    WITH CHECK (true);

-- 7. Update trigger for late_fee_waivers
CREATE OR REPLACE FUNCTION update_late_fee_waiver_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_late_fee_waiver_timestamp
    BEFORE UPDATE ON late_fee_waivers
    FOR EACH ROW
    EXECUTE FUNCTION update_late_fee_waiver_timestamp();

-- 8. Add approval request type for late fee waivers
DO $$
BEGIN
    -- Check if the enum value already exists
    IF NOT EXISTS (
        SELECT 1 FROM pg_enum 
        WHERE enumlabel = 'late_fee_waiver' 
        AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'approval_request_type')
    ) THEN
        -- Add the new enum value if it doesn't exist
        ALTER TYPE approval_request_type ADD VALUE IF NOT EXISTS 'late_fee_waiver';
    END IF;
EXCEPTION
    WHEN others THEN
        -- If approval_request_type doesn't exist as an enum, that's fine
        NULL;
END $$;

COMMENT ON TABLE late_fee_waivers IS 'Tracks late fee waiver requests and their approval status';
COMMENT ON TABLE late_fee_log IS 'Audit log of late fee application runs';

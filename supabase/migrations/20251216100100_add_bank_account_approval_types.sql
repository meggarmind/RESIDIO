-- Migration: Add bank account approval types to approval_requests table
-- Extends the approval workflow to support bank account create/update/delete operations

BEGIN;

-- Create approval_requests table if it doesn't exist
-- (Table may already exist from previous setup)
CREATE TABLE IF NOT EXISTS public.approval_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    request_type TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    requested_changes JSONB NOT NULL DEFAULT '{}',
    current_values JSONB NOT NULL DEFAULT '{}',
    reason TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    requested_by UUID NOT NULL REFERENCES public.profiles(id),
    reviewed_by UUID REFERENCES public.profiles(id),
    reviewed_at TIMESTAMPTZ,
    review_notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable RLS if not already enabled
ALTER TABLE public.approval_requests ENABLE ROW LEVEL SECURITY;

-- Add constraint for valid status values if not exists
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'approval_requests_status_check'
    ) THEN
        ALTER TABLE public.approval_requests
        ADD CONSTRAINT approval_requests_status_check
        CHECK (status IN ('pending', 'approved', 'rejected'));
    END IF;
END $$;

-- Add index for faster status queries
CREATE INDEX IF NOT EXISTS idx_approval_requests_status ON public.approval_requests(status);
CREATE INDEX IF NOT EXISTS idx_approval_requests_type ON public.approval_requests(request_type);
CREATE INDEX IF NOT EXISTS idx_approval_requests_entity ON public.approval_requests(entity_type, entity_id);

-- Create trigger for updated_at if not exists
DROP TRIGGER IF EXISTS approval_requests_updated_at ON public.approval_requests;
CREATE TRIGGER approval_requests_updated_at
    BEFORE UPDATE ON public.approval_requests
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_updated_at();

-- RLS Policies
-- Policy: Admins and chairmen can view all approval requests
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE tablename = 'approval_requests'
        AND policyname = 'Admins and chairmen can view all approval requests'
    ) THEN
        CREATE POLICY "Admins and chairmen can view all approval requests"
            ON public.approval_requests
            FOR SELECT
            USING (public.get_my_role() IN ('admin', 'chairman'));
    END IF;
END $$;

-- Policy: Users can view their own requests
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE tablename = 'approval_requests'
        AND policyname = 'Users can view own approval requests'
    ) THEN
        CREATE POLICY "Users can view own approval requests"
            ON public.approval_requests
            FOR SELECT
            USING (requested_by = auth.uid());
    END IF;
END $$;

-- Policy: All authenticated can create approval requests
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE tablename = 'approval_requests'
        AND policyname = 'Authenticated users can create approval requests'
    ) THEN
        CREATE POLICY "Authenticated users can create approval requests"
            ON public.approval_requests
            FOR INSERT
            WITH CHECK (auth.uid() IS NOT NULL);
    END IF;
END $$;

-- Policy: Admins and chairmen can update (approve/reject) requests
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE tablename = 'approval_requests'
        AND policyname = 'Admins and chairmen can update approval requests'
    ) THEN
        CREATE POLICY "Admins and chairmen can update approval requests"
            ON public.approval_requests
            FOR UPDATE
            USING (public.get_my_role() IN ('admin', 'chairman'));
    END IF;
END $$;

-- Grant permissions
GRANT ALL ON public.approval_requests TO authenticated;

-- Add comment documenting valid request types including new bank account types
COMMENT ON TABLE public.approval_requests IS
'Maker-checker workflow for sensitive operations.
Valid request_type values:
- billing_profile_effective_date: Change to billing profile effective date
- house_plots_change: Change to house number of plots
- bank_account_create: Create new bank account (NEW)
- bank_account_update: Update existing bank account (NEW)
- bank_account_delete: Delete bank account (NEW)

Valid entity_type values:
- billing_profile
- house
- estate_bank_account (NEW)';

COMMIT;

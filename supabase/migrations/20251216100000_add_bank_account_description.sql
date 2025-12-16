-- Migration: Add description field to estate_bank_accounts
-- This adds an optional description field for administrative notes about bank accounts

BEGIN;

-- Create estate_bank_accounts table if it doesn't exist
-- (Table may already exist from previous setup)
CREATE TABLE IF NOT EXISTS public.estate_bank_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_number TEXT NOT NULL UNIQUE,
    account_name TEXT NOT NULL,
    bank_name TEXT NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable RLS if not already enabled
ALTER TABLE public.estate_bank_accounts ENABLE ROW LEVEL SECURITY;

-- Add description column (the main purpose of this migration)
ALTER TABLE public.estate_bank_accounts
ADD COLUMN IF NOT EXISTS description TEXT;

-- Add comment for documentation
COMMENT ON COLUMN public.estate_bank_accounts.description IS 'Optional description for internal notes about this bank account usage';

-- Create RLS policies if they don't exist
-- Policy: Admins, chairmen, and financial_secretaries can manage bank accounts
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE tablename = 'estate_bank_accounts'
        AND policyname = 'Admins chairmen fin sec can manage bank accounts'
    ) THEN
        CREATE POLICY "Admins chairmen fin sec can manage bank accounts"
            ON public.estate_bank_accounts
            FOR ALL
            USING (public.get_my_role() IN ('admin', 'chairman', 'financial_secretary'));
    END IF;
END $$;

-- Policy: All authenticated users can view active bank accounts (for dropdowns)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE tablename = 'estate_bank_accounts'
        AND policyname = 'All authenticated can view active bank accounts'
    ) THEN
        CREATE POLICY "All authenticated can view active bank accounts"
            ON public.estate_bank_accounts
            FOR SELECT
            USING (is_active = true OR public.get_my_role() IN ('admin', 'chairman', 'financial_secretary'));
    END IF;
END $$;

-- Grant permissions
GRANT ALL ON public.estate_bank_accounts TO authenticated;

COMMIT;

-- Migration: Create Payment Records

-- 1. Create Enums
BEGIN;

DO $$ BEGIN
    CREATE TYPE payment_status AS ENUM ('pending', 'paid', 'overdue', 'failed');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE payment_method AS ENUM ('cash', 'bank_transfer', 'pos', 'cheque');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 2. Add profile_id to residents (needed for RLS)
ALTER TABLE public.residents ADD COLUMN IF NOT EXISTS profile_id UUID REFERENCES public.profiles(id);
CREATE INDEX IF NOT EXISTS idx_residents_profile_id ON public.residents(profile_id);

-- 3. Create payment_records table
CREATE TABLE IF NOT EXISTS payment_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    resident_id UUID NOT NULL REFERENCES public.residents(id) ON DELETE CASCADE,
    amount DECIMAL(10, 2) NOT NULL,
    payment_date DATE NOT NULL DEFAULT CURRENT_DATE,
    period_start DATE,
    period_end DATE,
    status payment_status NOT NULL DEFAULT 'pending',
    method payment_method,
    reference_number TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Indexes
CREATE INDEX IF NOT EXISTS idx_payment_records_resident ON payment_records(resident_id);
CREATE INDEX IF NOT EXISTS idx_payment_records_status ON payment_records(status);
CREATE INDEX IF NOT EXISTS idx_payment_records_date ON payment_records(payment_date);

-- 4. Enable RLS
ALTER TABLE payment_records ENABLE ROW LEVEL SECURITY;

-- 5. Policies
-- Admins/Chairman/FinSec can view/manage ALL payments
DROP POLICY IF EXISTS "Admins and FinSec can manage all payments" ON payment_records;
CREATE POLICY "Admins and FinSec can manage all payments" ON payment_records
    FOR ALL
    USING (
        auth.uid() IN (
            SELECT id FROM profiles 
            WHERE role IN ('admin', 'chairman', 'financial_secretary')
        )
    );

-- Residents can view their OWN payments
DROP POLICY IF EXISTS "Residents can view own payments" ON payment_records;
CREATE POLICY "Residents can view own payments" ON payment_records
    FOR SELECT
    USING (
        resident_id IN (
            SELECT id FROM residents WHERE profile_id = auth.uid()
        )
    );

-- 6. Trigger for updated_at
DROP TRIGGER IF EXISTS update_payment_records_modtime ON payment_records;
CREATE TRIGGER update_payment_records_modtime
    BEFORE UPDATE ON payment_records
    FOR EACH ROW
    EXECUTE FUNCTION handle_updated_at();

COMMIT;

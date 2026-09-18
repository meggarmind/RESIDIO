-- Paystack Payment Gateway Integration
-- Creates table to track Paystack transactions and link to payments

-- Create paystack_transactions table
CREATE TABLE IF NOT EXISTS paystack_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Links to existing records
    payment_id UUID REFERENCES payment_records(id) ON DELETE SET NULL,
    invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
    resident_id UUID NOT NULL REFERENCES residents(id) ON DELETE CASCADE,
    house_id UUID REFERENCES houses(id) ON DELETE SET NULL,
    
    -- Paystack-specific fields
    reference TEXT NOT NULL UNIQUE,
    amount_kobo INTEGER NOT NULL,
    channel TEXT, -- card, bank, ussd, qr, mobile_money, bank_transfer
    status TEXT NOT NULL DEFAULT 'pending', -- pending, success, failed, abandoned, reversed
    authorization_code TEXT, -- For recurring payments
    customer_code TEXT,
    gateway_response TEXT,
    paid_at TIMESTAMP WITH TIME ZONE,
    
    -- Full response data for debugging/auditing
    response_data JSONB,
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for lookups
CREATE INDEX IF NOT EXISTS idx_paystack_transactions_reference ON paystack_transactions(reference);
CREATE INDEX IF NOT EXISTS idx_paystack_transactions_invoice_id ON paystack_transactions(invoice_id);
CREATE INDEX IF NOT EXISTS idx_paystack_transactions_resident_id ON paystack_transactions(resident_id);
CREATE INDEX IF NOT EXISTS idx_paystack_transactions_status ON paystack_transactions(status);

-- Update timestamp trigger
CREATE OR REPLACE FUNCTION update_paystack_transactions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS paystack_transactions_updated_at ON paystack_transactions;
CREATE TRIGGER paystack_transactions_updated_at
    BEFORE UPDATE ON paystack_transactions
    FOR EACH ROW
    EXECUTE FUNCTION update_paystack_transactions_updated_at();

-- Add 'online' payment method if not already in enum
-- Note: This modifies the method column to allow 'online' as a value
-- First check if it exists, if not add it
DO $$
BEGIN
    -- If the payment_method enum exists, add 'online' value
    IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'payment_method') THEN
        BEGIN
            ALTER TYPE payment_method ADD VALUE IF NOT EXISTS 'online';
        EXCEPTION
            WHEN duplicate_object THEN
                NULL; -- Value already exists
        END;
    END IF;
END$$;

-- Add paystack_reference column to payment_records for cross-reference
ALTER TABLE payment_records 
ADD COLUMN IF NOT EXISTS paystack_reference TEXT;

-- Index for looking up payments by Paystack reference
CREATE INDEX IF NOT EXISTS idx_payment_records_paystack_reference 
ON payment_records(paystack_reference) 
WHERE paystack_reference IS NOT NULL;

-- RLS policies for paystack_transactions
ALTER TABLE paystack_transactions ENABLE ROW LEVEL SECURITY;

-- Admin can see all transactions
CREATE POLICY paystack_transactions_admin_all ON paystack_transactions
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM profiles p
            JOIN app_roles r ON r.id = p.role_id
            WHERE p.id = auth.uid()
            AND r.name IN ('super_admin', 'chairman', 'financial_officer')
        )
    );

-- Residents can see their own transactions
CREATE POLICY paystack_transactions_resident_select ON paystack_transactions
    FOR SELECT
    USING (
        resident_id IN (
            SELECT id FROM residents WHERE profile_id = auth.uid()
        )
    );

-- Comment on table
COMMENT ON TABLE paystack_transactions IS 'Tracks all Paystack payment transactions for online invoice payments';
COMMENT ON COLUMN paystack_transactions.reference IS 'Unique Paystack transaction reference';
COMMENT ON COLUMN paystack_transactions.amount_kobo IS 'Transaction amount in kobo (smallest currency unit)';
COMMENT ON COLUMN paystack_transactions.channel IS 'Payment channel used (card, bank, ussd, etc.)';
COMMENT ON COLUMN paystack_transactions.authorization_code IS 'Saved card authorization for recurring payments';

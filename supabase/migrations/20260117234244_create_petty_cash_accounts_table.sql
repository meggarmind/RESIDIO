-- Migration: Create petty_cash_accounts table
-- Part of Unified Expenditure Engine implementation

CREATE TABLE IF NOT EXISTS petty_cash_accounts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL,
    current_balance numeric(12, 2) NOT NULL DEFAULT 0,
    initial_float numeric(12, 2) NOT NULL DEFAULT 0,
    last_replenishment_at timestamptz,
    last_replenishment_amount numeric(12, 2),
    last_replenishment_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
    is_active boolean NOT NULL DEFAULT true,
    notes text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid REFERENCES profiles(id) ON DELETE SET NULL
);

-- Add RLS policies
ALTER TABLE petty_cash_accounts ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to read petty cash accounts
CREATE POLICY "Authenticated users can view petty cash accounts"
    ON petty_cash_accounts FOR SELECT
    TO authenticated
    USING (true);

-- Only admins can insert/update/delete
CREATE POLICY "Admins can manage petty cash accounts"
    ON petty_cash_accounts FOR ALL
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role IN ('admin', 'chairman', 'financial_secretary')
        )
    );

-- Add comments
COMMENT ON TABLE petty_cash_accounts IS 'Tracks petty cash floats for the estate';
COMMENT ON COLUMN petty_cash_accounts.current_balance IS 'Current cash-on-hand balance';
COMMENT ON COLUMN petty_cash_accounts.initial_float IS 'The original imprest amount for this account';
COMMENT ON COLUMN petty_cash_accounts.last_replenishment_at IS 'When the float was last topped up';

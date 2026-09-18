-- Add effective_date column to billing_profiles table
-- Used to determine when a billing profile's rates become active
-- Changes to this field that affect existing invoices require maker-checker approval

ALTER TABLE billing_profiles ADD COLUMN effective_date DATE NOT NULL DEFAULT CURRENT_DATE;

-- Add comment for documentation
COMMENT ON COLUMN billing_profiles.effective_date IS 'Date from which this billing profile rates are effective. Changing to earlier than existing invoices requires approval.';

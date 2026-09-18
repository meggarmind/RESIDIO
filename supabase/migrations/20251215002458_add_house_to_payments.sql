-- Add house association and split payment support to payment_records
BEGIN;

-- 1. Add house_id column (nullable for backwards compatibility)
ALTER TABLE payment_records 
ADD COLUMN house_id UUID REFERENCES houses(id) ON DELETE SET NULL;

-- 2. Add split_payment_group_id for linking split payments
ALTER TABLE payment_records 
ADD COLUMN split_payment_group_id UUID;

-- 3. Add index for house-based queries
CREATE INDEX IF NOT EXISTS idx_payment_records_house 
ON payment_records(house_id) WHERE house_id IS NOT NULL;

-- 4. Add composite index for resident + house queries
CREATE INDEX IF NOT EXISTS idx_payment_records_resident_house 
ON payment_records(resident_id, house_id);

-- 5. Add index for split payment lookups
CREATE INDEX IF NOT EXISTS idx_payment_records_split_group 
ON payment_records(split_payment_group_id) WHERE split_payment_group_id IS NOT NULL;

-- 6. Add helpful comment explaining the columns
COMMENT ON COLUMN payment_records.house_id IS 'Optional reference to specific house the payment is for. Null means payment applies to all resident houses.';
COMMENT ON COLUMN payment_records.split_payment_group_id IS 'Groups multiple payment records created from a single bank transaction split across multiple houses.';

COMMIT;

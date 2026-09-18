-- Migration: Populate expense_categories from debit transaction_tags
-- Part of Unified Expenditure Engine

-- Add a column to link transaction_tags to expense_categories
ALTER TABLE transaction_tags
ADD COLUMN IF NOT EXISTS expense_category_id uuid REFERENCES expense_categories(id) ON DELETE SET NULL;

-- Create a "Bank Import - Miscellaneous" category for unmapped expenses
INSERT INTO expense_categories (name, description)
VALUES ('Bank Import - Miscellaneous', 'Expenses imported from bank statements without a specific category')
ON CONFLICT (name) DO NOTHING;

-- Populate expense_categories from existing debit transaction_tags
INSERT INTO expense_categories (name, description)
SELECT 
    t.name,
    COALESCE(t.description, 'Imported from bank transaction tag')
FROM transaction_tags t
WHERE t.transaction_type = 'debit'
ON CONFLICT (name) DO NOTHING;

-- Link existing debit tags to their corresponding categories
UPDATE transaction_tags t
SET expense_category_id = ec.id
FROM expense_categories ec
WHERE t.name = ec.name
AND t.transaction_type = 'debit';

-- Add comment
COMMENT ON COLUMN transaction_tags.expense_category_id IS 'Links debit tags to expense categories for automatic expense creation';

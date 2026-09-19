-- Add columns for debit transaction assignments to email_transactions
ALTER TABLE email_transactions
  ADD COLUMN IF NOT EXISTS matched_project_id UUID REFERENCES projects(id),
  ADD COLUMN IF NOT EXISTS matched_petty_cash_account_id UUID REFERENCES petty_cash_accounts(id),
  ADD COLUMN IF NOT EXISTS matched_expense_category_id UUID REFERENCES expense_categories(id),
  ADD COLUMN IF NOT EXISTS tag_id UUID REFERENCES transaction_tags(id),
  ADD COLUMN IF NOT EXISTS expense_id UUID REFERENCES expenses(id);

-- Add indexes for new foreign keys to optimize searching and foreign key lookups
CREATE INDEX IF NOT EXISTS idx_email_transactions_project
  ON email_transactions(matched_project_id) WHERE matched_project_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_email_transactions_petty_cash
  ON email_transactions(matched_petty_cash_account_id) WHERE matched_petty_cash_account_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_email_transactions_expense_category
  ON email_transactions(matched_expense_category_id) WHERE matched_expense_category_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_email_transactions_tag
  ON email_transactions(tag_id) WHERE tag_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_email_transactions_expense
  ON email_transactions(expense_id) WHERE expense_id IS NOT NULL;

-- Add comments for clarity
COMMENT ON COLUMN email_transactions.matched_project_id IS 'Project associated with this transaction (debit)';
COMMENT ON COLUMN email_transactions.matched_petty_cash_account_id IS 'Petty cash account for replenishment (debit)';
COMMENT ON COLUMN email_transactions.matched_expense_category_id IS 'Expense category for categorization (debit)';
COMMENT ON COLUMN email_transactions.tag_id IS 'Transaction tag for automated categorization';
COMMENT ON COLUMN email_transactions.expense_id IS 'Link to the created expense record after processing';

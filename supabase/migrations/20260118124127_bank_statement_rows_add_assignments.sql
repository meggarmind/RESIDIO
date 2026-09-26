ALTER TABLE bank_statement_rows
ADD COLUMN IF NOT EXISTS matched_petty_cash_account_id UUID REFERENCES petty_cash_accounts(id),
ADD COLUMN IF NOT EXISTS matched_project_id UUID REFERENCES projects(id),
ADD COLUMN IF NOT EXISTS matched_expense_category_id UUID REFERENCES expense_categories(id);

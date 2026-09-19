-- Migration: Link expenses to petty cash accounts
-- Part of Unified Expenditure Engine implementation

-- Add petty_cash_account_id to expenses table
ALTER TABLE expenses
ADD COLUMN IF NOT EXISTS petty_cash_account_id uuid REFERENCES petty_cash_accounts(id) ON DELETE SET NULL;

-- Add index for querying expenses by petty cash account
CREATE INDEX IF NOT EXISTS idx_expenses_petty_cash_account_id ON expenses(petty_cash_account_id);

-- Add comment
COMMENT ON COLUMN expenses.petty_cash_account_id IS 'Link to petty cash account if source_type is petty_cash';

-- Create a trigger to update petty cash balance when an expense is created/updated/deleted
CREATE OR REPLACE FUNCTION update_petty_cash_balance()
RETURNS TRIGGER AS $$
BEGIN
    -- On INSERT: Decrease balance for petty cash expenses
    IF TG_OP = 'INSERT' AND NEW.source_type = 'petty_cash' AND NEW.petty_cash_account_id IS NOT NULL THEN
        UPDATE petty_cash_accounts
        SET current_balance = current_balance - NEW.amount,
            updated_at = now()
        WHERE id = NEW.petty_cash_account_id;
    END IF;

    -- On DELETE: Restore balance for deleted petty cash expenses
    IF TG_OP = 'DELETE' AND OLD.source_type = 'petty_cash' AND OLD.petty_cash_account_id IS NOT NULL THEN
        UPDATE petty_cash_accounts
        SET current_balance = current_balance + OLD.amount,
            updated_at = now()
        WHERE id = OLD.petty_cash_account_id;
    END IF;

    -- On UPDATE: Handle changes in amount or petty cash account
    IF TG_OP = 'UPDATE' THEN
        -- If moving away from petty cash, restore old balance
        IF OLD.source_type = 'petty_cash' AND OLD.petty_cash_account_id IS NOT NULL
           AND (NEW.source_type != 'petty_cash' OR NEW.petty_cash_account_id IS NULL OR NEW.petty_cash_account_id != OLD.petty_cash_account_id) THEN
            UPDATE petty_cash_accounts
            SET current_balance = current_balance + OLD.amount,
                updated_at = now()
            WHERE id = OLD.petty_cash_account_id;
        END IF;

        -- If moving to petty cash or changing amount, update new balance
        IF NEW.source_type = 'petty_cash' AND NEW.petty_cash_account_id IS NOT NULL THEN
            -- If same account, just adjust the difference
            IF OLD.petty_cash_account_id = NEW.petty_cash_account_id AND OLD.source_type = 'petty_cash' THEN
                UPDATE petty_cash_accounts
                SET current_balance = current_balance + OLD.amount - NEW.amount,
                    updated_at = now()
                WHERE id = NEW.petty_cash_account_id;
            ELSE
                -- New account, decrease full amount
                UPDATE petty_cash_accounts
                SET current_balance = current_balance - NEW.amount,
                    updated_at = now()
                WHERE id = NEW.petty_cash_account_id;
            END IF;
        END IF;
    END IF;

    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger
DROP TRIGGER IF EXISTS trg_update_petty_cash_balance ON expenses;
CREATE TRIGGER trg_update_petty_cash_balance
    AFTER INSERT OR UPDATE OR DELETE ON expenses
    FOR EACH ROW
    EXECUTE FUNCTION update_petty_cash_balance();

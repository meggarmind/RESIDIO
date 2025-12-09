-- Migration: Create Wallet System
-- Resident wallets and transaction history for payment reconciliation

BEGIN;

-- 1. Create wallet transaction type enum
DO $$ BEGIN
    CREATE TYPE wallet_transaction_type AS ENUM ('credit', 'debit');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 2. Create resident_wallets table
CREATE TABLE IF NOT EXISTS public.resident_wallets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    resident_id UUID NOT NULL UNIQUE REFERENCES public.residents(id) ON DELETE CASCADE,
    balance DECIMAL(12, 2) NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for resident lookup
CREATE INDEX IF NOT EXISTS idx_resident_wallets_resident ON public.resident_wallets(resident_id);

-- RLS for resident_wallets
ALTER TABLE public.resident_wallets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins chairmen fin sec can manage wallets" ON public.resident_wallets
    FOR ALL USING (public.get_my_role() IN ('admin', 'chairman', 'financial_secretary'));

CREATE POLICY "Residents can view own wallet" ON public.resident_wallets
    FOR SELECT USING (
        resident_id IN (SELECT id FROM public.residents WHERE profile_id = auth.uid())
    );

-- Trigger for updated_at
CREATE TRIGGER resident_wallets_updated_at
    BEFORE UPDATE ON public.resident_wallets
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();


-- 3. Create wallet_transactions table
CREATE TABLE IF NOT EXISTS public.wallet_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    wallet_id UUID NOT NULL REFERENCES public.resident_wallets(id) ON DELETE CASCADE,
    type wallet_transaction_type NOT NULL,
    amount DECIMAL(12, 2) NOT NULL,
    balance_after DECIMAL(12, 2) NOT NULL,
    reference_type TEXT, -- 'payment', 'invoice', 'adjustment', 'levy'
    reference_id UUID,   -- ID of the related entity
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for transaction queries
CREATE INDEX IF NOT EXISTS idx_wallet_transactions_wallet ON public.wallet_transactions(wallet_id);
CREATE INDEX IF NOT EXISTS idx_wallet_transactions_type ON public.wallet_transactions(type);
CREATE INDEX IF NOT EXISTS idx_wallet_transactions_reference ON public.wallet_transactions(reference_type, reference_id);

-- RLS for wallet_transactions
ALTER TABLE public.wallet_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins chairmen fin sec can view all transactions" ON public.wallet_transactions
    FOR ALL USING (public.get_my_role() IN ('admin', 'chairman', 'financial_secretary'));

CREATE POLICY "Residents can view own transactions" ON public.wallet_transactions
    FOR SELECT USING (
        wallet_id IN (
            SELECT w.id FROM public.resident_wallets w
            JOIN public.residents r ON r.id = w.resident_id
            WHERE r.profile_id = auth.uid()
        )
    );

COMMIT;

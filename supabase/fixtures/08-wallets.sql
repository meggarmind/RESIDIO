-- ============================================================================
-- FIXTURE: Wallet System
-- Resident wallets with balances and transaction history
-- Distribution: 30 with positive balances, 15 with zero, 10 with recent activity
-- ============================================================================

-- Reference IDs:
-- Residents: aa000001-0001-0001-0001-000000000001 to 000000000055
-- Payments: ee000001-0001-0001-0001-000000000001 to 000000000060
-- Invoices: ee000001-0001-0001-0001-000000000001 to 000000000120

-- ============================================================================
-- CLEANUP: Remove existing fixture data
-- ============================================================================
-- Delete existing wallet transactions for test residents
DELETE FROM public.wallet_transactions
WHERE wallet_id IN (
  SELECT id FROM public.resident_wallets
  WHERE resident_id::text LIKE 'aa000001-%'
);

-- Delete existing wallets for test residents
DELETE FROM public.resident_wallets
WHERE resident_id::text LIKE 'aa000001-%';

-- ============================================================================
-- RESIDENT WALLETS (45 total)
-- Initial wallets for residents with various balance states
-- ============================================================================

-- Wallets with positive balances (excess payments or prepayments)
INSERT INTO public.resident_wallets (id, resident_id, balance, created_at, updated_at) VALUES
  -- Good standing residents with credit balances
  ('dd000001-0001-0001-0001-000000000001', 'aa000001-0001-0001-0001-000000000001', 15000.00, NOW() - INTERVAL '1 year', NOW() - INTERVAL '1 day'),
  ('dd000001-0001-0001-0001-000000000002', 'aa000001-0001-0001-0001-000000000002', 8500.00, NOW() - INTERVAL '1 year', NOW() - INTERVAL '5 days'),
  ('dd000001-0001-0001-0001-000000000003', 'aa000001-0001-0001-0001-000000000003', 22000.00, NOW() - INTERVAL '1 year', NOW() - INTERVAL '2 days'),
  ('dd000001-0001-0001-0001-000000000004', 'aa000001-0001-0001-0001-000000000004', 5000.00, NOW() - INTERVAL '1 year', NOW() - INTERVAL '10 days'),
  ('dd000001-0001-0001-0001-000000000005', 'aa000001-0001-0001-0001-000000000005', 35000.00, NOW() - INTERVAL '1 year', NOW() - INTERVAL '3 days'),

  -- Premium residents with larger balances (prepaid quarters)
  ('dd000001-0001-0001-0001-000000000006', 'aa000001-0001-0001-0001-000000000006', 45000.00, NOW() - INTERVAL '1 year', NOW() - INTERVAL '7 days'),
  ('dd000001-0001-0001-0001-000000000007', 'aa000001-0001-0001-0001-000000000007', 50000.00, NOW() - INTERVAL '1 year', NOW() - INTERVAL '4 days'),
  ('dd000001-0001-0001-0001-000000000008', 'aa000001-0001-0001-0001-000000000008', 32500.00, NOW() - INTERVAL '1 year', NOW() - INTERVAL '6 days'),
  ('dd000001-0001-0001-0001-000000000009', 'aa000001-0001-0001-0001-000000000009', 12000.00, NOW() - INTERVAL '1 year', NOW() - INTERVAL '2 days'),
  ('dd000001-0001-0001-0001-000000000010', 'aa000001-0001-0001-0001-000000000010', 18000.00, NOW() - INTERVAL '1 year', NOW() - INTERVAL '8 days'),

  -- Moderate balances
  ('dd000001-0001-0001-0001-000000000011', 'aa000001-0001-0001-0001-000000000011', 7500.00, NOW() - INTERVAL '1 year', NOW() - INTERVAL '15 days'),
  ('dd000001-0001-0001-0001-000000000012', 'aa000001-0001-0001-0001-000000000012', 9000.00, NOW() - INTERVAL '1 year', NOW() - INTERVAL '12 days'),
  ('dd000001-0001-0001-0001-000000000013', 'aa000001-0001-0001-0001-000000000013', 3500.00, NOW() - INTERVAL '6 months', NOW() - INTERVAL '20 days'),
  ('dd000001-0001-0001-0001-000000000014', 'aa000001-0001-0001-0001-000000000014', 6000.00, NOW() - INTERVAL '6 months', NOW() - INTERVAL '18 days'),
  ('dd000001-0001-0001-0001-000000000016', 'aa000001-0001-0001-0001-000000000016', 11000.00, NOW() - INTERVAL '1 year', NOW() - INTERVAL '5 days'),

  -- Non-resident landlords with credit
  ('dd000001-0001-0001-0001-000000000017', 'aa000001-0001-0001-0001-000000000017', 25000.00, NOW() - INTERVAL '1 year', NOW() - INTERVAL '10 days'),
  ('dd000001-0001-0001-0001-000000000018', 'aa000001-0001-0001-0001-000000000018', 15500.00, NOW() - INTERVAL '1 year', NOW() - INTERVAL '14 days'),
  ('dd000001-0001-0001-0001-000000000019', 'aa000001-0001-0001-0001-000000000019', 8000.00, NOW() - INTERVAL '1 year', NOW() - INTERVAL '9 days'),
  ('dd000001-0001-0001-0001-000000000020', 'aa000001-0001-0001-0001-000000000020', 12500.00, NOW() - INTERVAL '1 year', NOW() - INTERVAL '11 days'),

  -- Tenants with moderate balances
  ('dd000001-0001-0001-0001-000000000021', 'aa000001-0001-0001-0001-000000000021', 4000.00, NOW() - INTERVAL '8 months', NOW() - INTERVAL '3 days'),
  ('dd000001-0001-0001-0001-000000000022', 'aa000001-0001-0001-0001-000000000022', 7000.00, NOW() - INTERVAL '8 months', NOW() - INTERVAL '4 days'),
  ('dd000001-0001-0001-0001-000000000023', 'aa000001-0001-0001-0001-000000000023', 8000.00, NOW() - INTERVAL '8 months', NOW() - INTERVAL '2 days'),
  ('dd000001-0001-0001-0001-000000000024', 'aa000001-0001-0001-0001-000000000024', 13000.00, NOW() - INTERVAL '8 months', NOW() - INTERVAL '6 days'),
  ('dd000001-0001-0001-0001-000000000025', 'aa000001-0001-0001-0001-000000000025', 5000.00, NOW() - INTERVAL '8 months', NOW() - INTERVAL '7 days'),
  ('dd000001-0001-0001-0001-000000000026', 'aa000001-0001-0001-0001-000000000026', 7500.00, NOW() - INTERVAL '8 months', NOW() - INTERVAL '1 day'),
  ('dd000001-0001-0001-0001-000000000027', 'aa000001-0001-0001-0001-000000000027', 10000.00, NOW() - INTERVAL '8 months', NOW() - INTERVAL '5 days'),
  ('dd000001-0001-0001-0001-000000000028', 'aa000001-0001-0001-0001-000000000028', 5000.00, NOW() - INTERVAL '8 months', NOW() - INTERVAL '8 days'),
  ('dd000001-0001-0001-0001-000000000029', 'aa000001-0001-0001-0001-000000000029', 6000.00, NOW() - INTERVAL '8 months', NOW() - INTERVAL '3 days'),
  ('dd000001-0001-0001-0001-000000000030', 'aa000001-0001-0001-0001-000000000030', 8500.00, NOW() - INTERVAL '8 months', NOW() - INTERVAL '4 days'),

  -- Zero balance wallets (dues fully allocated)
  ('dd000001-0001-0001-0001-000000000031', 'aa000001-0001-0001-0001-000000000031', 0.00, NOW() - INTERVAL '6 months', NOW() - INTERVAL '30 days'),
  ('dd000001-0001-0001-0001-000000000032', 'aa000001-0001-0001-0001-000000000032', 0.00, NOW() - INTERVAL '6 months', NOW() - INTERVAL '25 days'),
  ('dd000001-0001-0001-0001-000000000033', 'aa000001-0001-0001-0001-000000000033', 0.00, NOW() - INTERVAL '6 months', NOW() - INTERVAL '28 days'),
  ('dd000001-0001-0001-0001-000000000034', 'aa000001-0001-0001-0001-000000000034', 0.00, NOW() - INTERVAL '6 months', NOW() - INTERVAL '22 days'),
  ('dd000001-0001-0001-0001-000000000035', 'aa000001-0001-0001-0001-000000000035', 0.00, NOW() - INTERVAL '6 months', NOW() - INTERVAL '27 days'),
  ('dd000001-0001-0001-0001-000000000036', 'aa000001-0001-0001-0001-000000000036', 0.00, NOW() - INTERVAL '6 months', NOW() - INTERVAL '24 days'),
  ('dd000001-0001-0001-0001-000000000037', 'aa000001-0001-0001-0001-000000000037', 0.00, NOW() - INTERVAL '6 months', NOW() - INTERVAL '26 days'),
  ('dd000001-0001-0001-0001-000000000038', 'aa000001-0001-0001-0001-000000000038', 0.00, NOW() - INTERVAL '6 months', NOW() - INTERVAL '21 days'),
  ('dd000001-0001-0001-0001-000000000039', 'aa000001-0001-0001-0001-000000000039', 0.00, NOW() - INTERVAL '6 months', NOW() - INTERVAL '29 days'),
  ('dd000001-0001-0001-0001-000000000040', 'aa000001-0001-0001-0001-000000000040', 0.00, NOW() - INTERVAL '6 months', NOW() - INTERVAL '23 days'),
  ('dd000001-0001-0001-0001-000000000041', 'aa000001-0001-0001-0001-000000000041', 0.00, NOW() - INTERVAL '6 months', NOW() - INTERVAL '20 days'),
  ('dd000001-0001-0001-0001-000000000042', 'aa000001-0001-0001-0001-000000000042', 0.00, NOW() - INTERVAL '6 months', NOW() - INTERVAL '19 days'),
  ('dd000001-0001-0001-0001-000000000043', 'aa000001-0001-0001-0001-000000000043', 0.00, NOW() - INTERVAL '3 months', NOW() - INTERVAL '18 days'),
  ('dd000001-0001-0001-0001-000000000044', 'aa000001-0001-0001-0001-000000000044', 0.00, NOW() - INTERVAL '3 months', NOW() - INTERVAL '17 days'),
  ('dd000001-0001-0001-0001-000000000045', 'aa000001-0001-0001-0001-000000000045', 0.00, NOW() - INTERVAL '3 months', NOW() - INTERVAL '16 days')
ON CONFLICT (id) DO UPDATE SET
  balance = EXCLUDED.balance,
  updated_at = EXCLUDED.updated_at;

-- ============================================================================
-- WALLET TRANSACTIONS (Sample transactions for audit trail)
-- Shows credits from payments and debits for invoice allocations
-- ============================================================================

-- Transactions for Resident 001 (Oluwaseun Adeyemi)
INSERT INTO public.wallet_transactions (id, wallet_id, type, amount, balance_after, reference_type, reference_id, description, created_at) VALUES
  -- Initial payment credit
  ('da000001-0001-0001-0001-000000000001', 'dd000001-0001-0001-0001-000000000001', 'credit', 30000.00, 30000.00, 'payment', 'ee000001-0001-0001-0001-000000000026', 'Payment received - Dec 2025', '2026-01-05'),
  -- Invoice allocation debit
  ('da000001-0001-0001-0001-000000000002', 'dd000001-0001-0001-0001-000000000001', 'debit', 15000.00, 15000.00, 'invoice', 'ee000001-0001-0001-0001-000000000043', 'Allocated to INV-2025-12-0001', '2026-01-05'),

  -- Earlier transactions
  ('da000001-0001-0001-0001-000000000003', 'dd000001-0001-0001-0001-000000000001', 'credit', 15000.00, 15000.00, 'payment', 'ee000001-0001-0001-0001-000000000019', 'Payment received - Jun 2025', '2025-07-10'),
  ('da000001-0001-0001-0001-000000000004', 'dd000001-0001-0001-0001-000000000001', 'debit', 15000.00, 0.00, 'invoice', 'ee000001-0001-0001-0001-000000000026', 'Allocated to INV-2025-06-0001', '2025-07-10')
ON CONFLICT (id) DO NOTHING;

-- Transactions for Resident 003 (Babatunde Williams)
INSERT INTO public.wallet_transactions (id, wallet_id, type, amount, balance_after, reference_type, reference_id, description, created_at) VALUES
  ('da000001-0001-0001-0001-000000000005', 'dd000001-0001-0001-0001-000000000003', 'credit', 45000.00, 45000.00, 'payment', NULL, 'Bulk payment - 3 months advance', '2025-10-01'),
  ('da000001-0001-0001-0001-000000000006', 'dd000001-0001-0001-0001-000000000003', 'debit', 15000.00, 30000.00, 'invoice', 'ee000001-0001-0001-0001-000000000033', 'Allocated to INV-2025-08-0001', '2025-10-02'),
  ('da000001-0001-0001-0001-000000000007', 'dd000001-0001-0001-0001-000000000003', 'debit', 15000.00, 15000.00, 'invoice', NULL, 'Allocated to Sep invoice', '2025-10-15'),
  ('da000001-0001-0001-0001-000000000008', 'dd000001-0001-0001-0001-000000000003', 'credit', 22000.00, 37000.00, 'payment', 'ee000001-0001-0001-0001-000000000028', 'Payment received - Dec 2025', '2026-01-07'),
  ('da000001-0001-0001-0001-000000000009', 'dd000001-0001-0001-0001-000000000003', 'debit', 15000.00, 22000.00, 'invoice', 'ee000001-0001-0001-0001-000000000045', 'Allocated to INV-2025-12-0003', '2026-01-07')
ON CONFLICT (id) DO NOTHING;

-- Transactions for Resident 005 (Ibrahim Mohammed - Premium)
INSERT INTO public.wallet_transactions (id, wallet_id, type, amount, balance_after, reference_type, reference_id, description, created_at) VALUES
  ('da000001-0001-0001-0001-000000000010', 'dd000001-0001-0001-0001-000000000005', 'credit', 75000.00, 75000.00, 'payment', NULL, 'Quarterly prepayment Q4 2025', '2025-10-01'),
  ('da000001-0001-0001-0001-000000000011', 'dd000001-0001-0001-0001-000000000005', 'debit', 25000.00, 50000.00, 'invoice', NULL, 'Allocated to Oct invoice', '2025-10-15'),
  ('da000001-0001-0001-0001-000000000012', 'dd000001-0001-0001-0001-000000000005', 'debit', 25000.00, 25000.00, 'invoice', NULL, 'Allocated to Nov invoice', '2025-11-15'),
  ('da000001-0001-0001-0001-000000000013', 'dd000001-0001-0001-0001-000000000005', 'credit', 35000.00, 60000.00, 'payment', 'ee000001-0001-0001-0001-000000000030', 'Payment received - Dec 2025', '2026-01-04'),
  ('da000001-0001-0001-0001-000000000014', 'dd000001-0001-0001-0001-000000000005', 'debit', 25000.00, 35000.00, 'invoice', 'ee000001-0001-0001-0001-000000000047', 'Allocated to INV-2025-12-0005', '2026-01-04')
ON CONFLICT (id) DO NOTHING;

-- Transactions for Resident 007 (Emeka Nwankwo - Premium CED-1)
INSERT INTO public.wallet_transactions (id, wallet_id, type, amount, balance_after, reference_type, reference_id, description, created_at) VALUES
  ('da000001-0001-0001-0001-000000000015', 'dd000001-0001-0001-0001-000000000007', 'credit', 100000.00, 100000.00, 'payment', NULL, 'Semi-annual prepayment', '2025-07-01'),
  ('da000001-0001-0001-0001-000000000016', 'dd000001-0001-0001-0001-000000000007', 'debit', 25000.00, 75000.00, 'invoice', NULL, 'Jul 2025 allocation', '2025-07-15'),
  ('da000001-0001-0001-0001-000000000017', 'dd000001-0001-0001-0001-000000000007', 'debit', 25000.00, 50000.00, 'invoice', NULL, 'Aug 2025 allocation', '2025-08-15'),
  ('da000001-0001-0001-0001-000000000018', 'dd000001-0001-0001-0001-000000000007', 'credit', 25000.00, 75000.00, 'payment', 'ee000001-0001-0001-0001-000000000045', 'Cash payment Dec', '2026-01-08'),
  ('da000001-0001-0001-0001-000000000019', 'dd000001-0001-0001-0001-000000000007', 'debit', 25000.00, 50000.00, 'invoice', 'ee000001-0001-0001-0001-000000000049', 'Allocated to INV-2025-12-0007', '2026-01-08')
ON CONFLICT (id) DO NOTHING;

-- Transactions for Tenant Resident 021 (Temitope Adegoke)
INSERT INTO public.wallet_transactions (id, wallet_id, type, amount, balance_after, reference_type, reference_id, description, created_at) VALUES
  ('da000001-0001-0001-0001-000000000020', 'dd000001-0001-0001-0001-000000000021', 'credit', 15000.00, 15000.00, 'payment', 'ee000001-0001-0001-0001-000000000031', 'Cash payment Oct', '2025-10-18'),
  ('da000001-0001-0001-0001-000000000021', 'dd000001-0001-0001-0001-000000000021', 'debit', 15000.00, 0.00, 'invoice', NULL, 'Oct invoice allocation', '2025-10-18'),
  ('da000001-0001-0001-0001-000000000022', 'dd000001-0001-0001-0001-000000000021', 'credit', 10000.00, 10000.00, 'payment', 'ee000001-0001-0001-0001-000000000036', 'Partial cash Oct balance', '2025-11-05'),
  ('da000001-0001-0001-0001-000000000023', 'dd000001-0001-0001-0001-000000000021', 'credit', 11000.00, 21000.00, 'payment', 'ee000001-0001-0001-0001-000000000053', 'POS payment Jan partial', '2026-01-03'),
  ('da000001-0001-0001-0001-000000000024', 'dd000001-0001-0001-0001-000000000021', 'debit', 11000.00, 10000.00, 'invoice', 'ee000001-0001-0001-0001-000000000063', 'Allocated to INV-2026-01-0010', '2026-01-03'),
  ('da000001-0001-0001-0001-000000000025', 'dd000001-0001-0001-0001-000000000021', 'debit', 6000.00, 4000.00, 'invoice', NULL, 'Part allocation to backlog', '2026-01-05')
ON CONFLICT (id) DO NOTHING;

-- Transactions for Tenant Resident 023 (Bolaji Oladipo - Premium)
INSERT INTO public.wallet_transactions (id, wallet_id, type, amount, balance_after, reference_type, reference_id, description, created_at) VALUES
  ('da000001-0001-0001-0001-000000000026', 'dd000001-0001-0001-0001-000000000023', 'credit', 25000.00, 25000.00, 'payment', 'ee000001-0001-0001-0001-000000000033', 'Cash premium payment Nov', '2025-11-10'),
  ('da000001-0001-0001-0001-000000000027', 'dd000001-0001-0001-0001-000000000023', 'debit', 15000.00, 10000.00, 'invoice', 'ee000001-0001-0001-0001-000000000053', 'Partial to INV-2025-11-0010', '2025-11-12'),
  ('da000001-0001-0001-0001-000000000028', 'dd000001-0001-0001-0001-000000000023', 'credit', 17000.00, 27000.00, 'payment', 'ee000001-0001-0001-0001-000000000055', 'POS partial Jan', '2026-01-05'),
  ('da000001-0001-0001-0001-000000000029', 'dd000001-0001-0001-0001-000000000023', 'debit', 17000.00, 10000.00, 'invoice', 'ee000001-0001-0001-0001-000000000065', 'Allocated to INV-2026-01-0012', '2026-01-05'),
  ('da000001-0001-0001-0001-000000000030', 'dd000001-0001-0001-0001-000000000023', 'debit', 2000.00, 8000.00, 'invoice', NULL, 'Backlog adjustment', '2026-01-06')
ON CONFLICT (id) DO NOTHING;

-- Adjustment transactions (corrections)
INSERT INTO public.wallet_transactions (id, wallet_id, type, amount, balance_after, reference_type, reference_id, description, created_at) VALUES
  ('da000001-0001-0001-0001-000000000031', 'dd000001-0001-0001-0001-000000000006', 'credit', 5000.00, 50000.00, 'adjustment', NULL, 'Admin correction - overpayment returned', '2025-12-15'),
  ('da000001-0001-0001-0001-000000000032', 'dd000001-0001-0001-0001-000000000006', 'debit', 5000.00, 45000.00, 'invoice', NULL, 'Allocated to Dec invoice', '2025-12-20'),
  ('da000001-0001-0001-0001-000000000033', 'dd000001-0001-0001-0001-000000000017', 'credit', 5000.00, 30000.00, 'adjustment', NULL, 'Goodwill credit - early payment', '2025-11-01'),
  ('da000001-0001-0001-0001-000000000034', 'dd000001-0001-0001-0001-000000000017', 'debit', 5000.00, 25000.00, 'invoice', NULL, 'Nov invoice allocation', '2025-11-15')
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- VERIFICATION
-- ============================================================================
DO $$
DECLARE
  v_total_wallets INT;
  v_positive INT;
  v_zero INT;
  v_transactions INT;
  v_total_balance NUMERIC;
  v_total_credits NUMERIC;
  v_total_debits NUMERIC;
BEGIN
  SELECT COUNT(*) INTO v_total_wallets FROM resident_wallets WHERE id::text LIKE 'dd000001-%';
  SELECT COUNT(*) INTO v_positive FROM resident_wallets WHERE balance > 0 AND id::text LIKE 'dd000001-%';
  SELECT COUNT(*) INTO v_zero FROM resident_wallets WHERE balance = 0 AND id::text LIKE 'dd000001-%';
  SELECT COUNT(*) INTO v_transactions FROM wallet_transactions WHERE id::text LIKE 'da000001-%';
  SELECT COALESCE(SUM(balance), 0) INTO v_total_balance FROM resident_wallets WHERE id::text LIKE 'dd000001-%';
  SELECT COALESCE(SUM(amount), 0) INTO v_total_credits FROM wallet_transactions WHERE type = 'credit' AND id::text LIKE 'da000001-%';
  SELECT COALESCE(SUM(amount), 0) INTO v_total_debits FROM wallet_transactions WHERE type = 'debit' AND id::text LIKE 'da000001-%';

  RAISE NOTICE 'Wallet System Created:';
  RAISE NOTICE '  Total Wallets: %', v_total_wallets;
  RAISE NOTICE '  Positive Balance: %', v_positive;
  RAISE NOTICE '  Zero Balance: %', v_zero;
  RAISE NOTICE '  Total Transactions: %', v_transactions;
  RAISE NOTICE '  Total Balance Sum: %', v_total_balance;
  RAISE NOTICE '  Transaction Credits: %', v_total_credits;
  RAISE NOTICE '  Transaction Debits: %', v_total_debits;
END $$;

-- Issue #1443: two more charge categories for classifying bank alerts on Awaiting verification.
--   toll_gate_levy  Toll Gate Levy  (sort 4)
--   other           Other           (sort 99) -- no billing profile uses it, so an Other payment pays no bill.
-- Each resident gets a wallet per category on first credit (#1189).
--
-- ROLLBACK (only while no payment, wallet or invoice uses the codes; check first:
--   SELECT count(*) FROM public.payment_records WHERE charge_category IN ('toll_gate_levy','other');  -- must be 0
--   SELECT count(*) FROM public.resident_wallets WHERE charge_category IN ('toll_gate_levy','other'); -- must be 0):
-- DELETE FROM public.charge_categories WHERE code IN ('toll_gate_levy', 'other');

BEGIN;

INSERT INTO public.charge_categories (code, name, sort_order, is_active) VALUES
    ('toll_gate_levy', 'Toll Gate Levy', 4, true),
    ('other', 'Other', 99, true)
ON CONFLICT (code) DO NOTHING;

COMMIT;

-- ============================================================================
-- FIXTURE: Houses
-- 28 houses across 5 streets with various configurations
-- ============================================================================

-- Reference IDs from 01-reference-data.sql
-- Streets:
--   OAK: 11111111-0001-0001-0001-000000000001
--   PALM: 11111111-0001-0001-0001-000000000002
--   CED: 11111111-0001-0001-0001-000000000003
--   MAP: 11111111-0001-0001-0001-000000000004
--   BAO: 11111111-0001-0001-0001-000000000005
-- House Types:
--   Standard 3BR: 22222222-0002-0002-0002-000000000001
--   Duplex 4BR: 22222222-0002-0002-0002-000000000002
--   Penthouse 5BR: 22222222-0002-0002-0002-000000000003
--   Commercial: 22222222-0002-0002-0002-000000000004

-- ============================================================================
-- OAK AVENUE HOUSES (10 houses)
-- Mixed standard and duplex residences
-- ============================================================================
INSERT INTO public.houses (id, house_number, short_name, street_id, house_type_id, number_of_plots, is_active, created_at) VALUES
  -- Standard houses
  ('cc000001-0001-0001-0001-000000000001', '1', 'OAK-1', '11111111-0001-0001-0001-000000000001', '22222222-0002-0002-0002-000000000001', 1, true, NOW() - INTERVAL '2 years'),
  ('cc000001-0001-0001-0001-000000000002', '2', 'OAK-2', '11111111-0001-0001-0001-000000000001', '22222222-0002-0002-0002-000000000001', 1, true, NOW() - INTERVAL '2 years'),
  ('cc000001-0001-0001-0001-000000000003', '3', 'OAK-3', '11111111-0001-0001-0001-000000000001', '22222222-0002-0002-0002-000000000001', 1, true, NOW() - INTERVAL '2 years'),
  ('cc000001-0001-0001-0001-000000000004', '4', 'OAK-4', '11111111-0001-0001-0001-000000000001', '22222222-0002-0002-0002-000000000001', 1, true, NOW() - INTERVAL '2 years'),

  -- Duplex houses (split plots)
  ('cc000001-0001-0001-0001-000000000005', '5A', 'OAK-5A', '11111111-0001-0001-0001-000000000001', '22222222-0002-0002-0002-000000000002', 2, true, NOW() - INTERVAL '2 years'),
  ('cc000001-0001-0001-0001-000000000006', '5B', 'OAK-5B', '11111111-0001-0001-0001-000000000001', '22222222-0002-0002-0002-000000000002', 2, true, NOW() - INTERVAL '2 years'),

  -- Standard houses (continued)
  ('cc000001-0001-0001-0001-000000000007', '6', 'OAK-6', '11111111-0001-0001-0001-000000000001', '22222222-0002-0002-0002-000000000001', 1, true, NOW() - INTERVAL '18 months'),
  ('cc000001-0001-0001-0001-000000000008', '7', 'OAK-7', '11111111-0001-0001-0001-000000000001', '22222222-0002-0002-0002-000000000001', 1, true, NOW() - INTERVAL '18 months'),
  ('cc000001-0001-0001-0001-000000000009', '8', 'OAK-8', '11111111-0001-0001-0001-000000000001', '22222222-0002-0002-0002-000000000001', 1, true, NOW() - INTERVAL '1 year'),
  ('cc000001-0001-0001-0001-000000000010', '9', 'OAK-9', '11111111-0001-0001-0001-000000000001', '22222222-0002-0002-0002-000000000001', 1, true, NOW() - INTERVAL '1 year')
ON CONFLICT (id) DO UPDATE SET
  house_number = EXCLUDED.house_number,
  short_name = EXCLUDED.short_name,
  street_id = EXCLUDED.street_id,
  house_type_id = EXCLUDED.house_type_id;

-- ============================================================================
-- PALM CLOSE HOUSES (8 houses)
-- Premium area with penthouses
-- ============================================================================
INSERT INTO public.houses (id, house_number, short_name, street_id, house_type_id, number_of_plots, is_active, created_at) VALUES
  -- Standard houses
  ('cc000001-0001-0001-0001-000000000011', '1', 'PALM-1', '11111111-0001-0001-0001-000000000002', '22222222-0002-0002-0002-000000000001', 1, true, NOW() - INTERVAL '2 years'),
  ('cc000001-0001-0001-0001-000000000012', '2', 'PALM-2', '11111111-0001-0001-0001-000000000002', '22222222-0002-0002-0002-000000000001', 1, true, NOW() - INTERVAL '2 years'),
  ('cc000001-0001-0001-0001-000000000013', '3', 'PALM-3', '11111111-0001-0001-0001-000000000002', '22222222-0002-0002-0002-000000000001', 1, true, NOW() - INTERVAL '2 years'),
  ('cc000001-0001-0001-0001-000000000014', '4', 'PALM-4', '11111111-0001-0001-0001-000000000002', '22222222-0002-0002-0002-000000000001', 1, true, NOW() - INTERVAL '2 years'),

  -- Duplex
  ('cc000001-0001-0001-0001-000000000015', '5', 'PALM-5', '11111111-0001-0001-0001-000000000002', '22222222-0002-0002-0002-000000000002', 1, true, NOW() - INTERVAL '18 months'),
  ('cc000001-0001-0001-0001-000000000016', '6', 'PALM-6', '11111111-0001-0001-0001-000000000002', '22222222-0002-0002-0002-000000000002', 1, true, NOW() - INTERVAL '18 months'),

  -- Penthouses
  ('cc000001-0001-0001-0001-000000000017', '7', 'PALM-7', '11111111-0001-0001-0001-000000000002', '22222222-0002-0002-0002-000000000003', 1, true, NOW() - INTERVAL '1 year'),

  -- Multi-resident house (5+ people)
  ('cc000001-0001-0001-0001-000000000018', '10', 'PALM-10', '11111111-0001-0001-0001-000000000002', '22222222-0002-0002-0002-000000000003', 1, true, NOW() - INTERVAL '2 years')
ON CONFLICT (id) DO UPDATE SET
  house_number = EXCLUDED.house_number,
  short_name = EXCLUDED.short_name;

-- ============================================================================
-- CEDAR LANE HOUSES (5 houses)
-- Premium location, includes property with transfer history
-- ============================================================================
INSERT INTO public.houses (id, house_number, short_name, street_id, house_type_id, number_of_plots, is_active, created_at) VALUES
  -- Property with ownership history (3+ transfers) - CED-1
  ('cc000001-0001-0001-0001-000000000019', '1', 'CED-1', '11111111-0001-0001-0001-000000000003', '22222222-0002-0002-0002-000000000003', 1, true, NOW() - INTERVAL '3 years'),

  -- Standard houses
  ('cc000001-0001-0001-0001-000000000020', '2', 'CED-2', '11111111-0001-0001-0001-000000000003', '22222222-0002-0002-0002-000000000002', 1, true, NOW() - INTERVAL '2 years'),
  ('cc000001-0001-0001-0001-000000000021', '3', 'CED-3', '11111111-0001-0001-0001-000000000003', '22222222-0002-0002-0002-000000000002', 1, true, NOW() - INTERVAL '2 years'),
  ('cc000001-0001-0001-0001-000000000022', '4', 'CED-4', '11111111-0001-0001-0001-000000000003', '22222222-0002-0002-0002-000000000002', 1, true, NOW() - INTERVAL '18 months'),

  -- Commercial unit
  ('cc000001-0001-0001-0001-000000000023', '5', 'CED-5', '11111111-0001-0001-0001-000000000003', '22222222-0002-0002-0002-000000000004', 1, true, NOW() - INTERVAL '1 year')
ON CONFLICT (id) DO UPDATE SET
  house_number = EXCLUDED.house_number,
  short_name = EXCLUDED.short_name;

-- ============================================================================
-- MAPLE DRIVE HOUSES (3 houses)
-- New development area - developer-owned
-- ============================================================================
INSERT INTO public.houses (id, house_number, short_name, street_id, house_type_id, number_of_plots, is_active, created_at) VALUES
  -- New development houses (minimal history)
  ('cc000001-0001-0001-0001-000000000024', '1', 'MAP-1', '11111111-0001-0001-0001-000000000004', '22222222-0002-0002-0002-000000000001', 1, true, NOW() - INTERVAL '6 months'),
  ('cc000001-0001-0001-0001-000000000025', '2', 'MAP-2', '11111111-0001-0001-0001-000000000004', '22222222-0002-0002-0002-000000000001', 1, true, NOW() - INTERVAL '6 months'),
  ('cc000001-0001-0001-0001-000000000026', '3', 'MAP-3', '11111111-0001-0001-0001-000000000004', '22222222-0002-0002-0002-000000000002', 1, true, NOW() - INTERVAL '3 months')
ON CONFLICT (id) DO UPDATE SET
  house_number = EXCLUDED.house_number,
  short_name = EXCLUDED.short_name;

-- ============================================================================
-- BAOBAB STREET HOUSES (2 houses)
-- Test/vacant properties
-- ============================================================================
INSERT INTO public.houses (id, house_number, short_name, street_id, house_type_id, number_of_plots, is_active, created_at) VALUES
  -- Vacant houses
  ('cc000001-0001-0001-0001-000000000027', '1', 'BAO-1', '11111111-0001-0001-0001-000000000005', '22222222-0002-0002-0002-000000000001', 1, true, NOW() - INTERVAL '1 year'),
  ('cc000001-0001-0001-0001-000000000028', '2', 'BAO-2', '11111111-0001-0001-0001-000000000005', '22222222-0002-0002-0002-000000000001', 1, true, NOW() - INTERVAL '1 year')
ON CONFLICT (id) DO UPDATE SET
  house_number = EXCLUDED.house_number,
  short_name = EXCLUDED.short_name;

-- ============================================================================
-- OWNERSHIP HISTORY (for CED-1 with 3+ transfers)
-- ============================================================================
INSERT INTO public.ownership_history (id, house_id, previous_owner_id, new_owner_id, transfer_type, transfer_date, notes) VALUES
  -- CED-1 transfers: Original owner (RES016) → RES017 → RES018 → Current (RES007)
  ('dd000001-0001-0001-0001-000000000001', 'cc000001-0001-0001-0001-000000000019', NULL, 'aa000001-0001-0001-0001-000000000016', 'new_construction', NOW() - INTERVAL '3 years', 'Original purchase from developer'),
  ('dd000001-0001-0001-0001-000000000002', 'cc000001-0001-0001-0001-000000000019', 'aa000001-0001-0001-0001-000000000016', 'aa000001-0001-0001-0001-000000000017', 'sale', NOW() - INTERVAL '2 years', 'Sale to second owner'),
  ('dd000001-0001-0001-0001-000000000003', 'cc000001-0001-0001-0001-000000000019', 'aa000001-0001-0001-0001-000000000017', 'aa000001-0001-0001-0001-000000000018', 'sale', NOW() - INTERVAL '1 year', 'Sale to third owner'),
  ('dd000001-0001-0001-0001-000000000004', 'cc000001-0001-0001-0001-000000000019', 'aa000001-0001-0001-0001-000000000018', 'aa000001-0001-0001-0001-000000000007', 'sale', NOW() - INTERVAL '3 months', 'Sale to current owner')
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- VERIFICATION
-- ============================================================================
DO $$
DECLARE
  v_total INT;
  v_oak INT;
  v_palm INT;
  v_cedar INT;
  v_maple INT;
  v_baobab INT;
  v_history INT;
BEGIN
  SELECT COUNT(*) INTO v_total FROM houses WHERE short_name LIKE 'OAK-%' OR short_name LIKE 'PALM-%' OR short_name LIKE 'CED-%' OR short_name LIKE 'MAP-%' OR short_name LIKE 'BAO-%';
  SELECT COUNT(*) INTO v_oak FROM houses WHERE short_name LIKE 'OAK-%';
  SELECT COUNT(*) INTO v_palm FROM houses WHERE short_name LIKE 'PALM-%';
  SELECT COUNT(*) INTO v_cedar FROM houses WHERE short_name LIKE 'CED-%';
  SELECT COUNT(*) INTO v_maple FROM houses WHERE short_name LIKE 'MAP-%';
  SELECT COUNT(*) INTO v_baobab FROM houses WHERE short_name LIKE 'BAO-%';
  SELECT COUNT(*) INTO v_history FROM ownership_history;

  RAISE NOTICE 'Houses Created:';
  RAISE NOTICE '  Total Houses: %', v_total;
  RAISE NOTICE '  Oak Avenue: %', v_oak;
  RAISE NOTICE '  Palm Close: %', v_palm;
  RAISE NOTICE '  Cedar Lane: %', v_cedar;
  RAISE NOTICE '  Maple Drive: %', v_maple;
  RAISE NOTICE '  Baobab Street: %', v_baobab;
  RAISE NOTICE '  Ownership History Records: %', v_history;
END $$;

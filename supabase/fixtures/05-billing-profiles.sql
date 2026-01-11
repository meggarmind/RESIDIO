-- ============================================================================
-- FIXTURE: Billing Profiles
-- 6 billing profiles with associated billing items
-- ============================================================================

-- ============================================================================
-- BILLING PROFILES (6 total)
-- ============================================================================
INSERT INTO public.billing_profiles (id, name, description, target_type, applicable_roles, is_one_time, is_active, is_development_levy, effective_date, created_at) VALUES
  -- Monthly recurring profiles (house-based)
  ('ff000001-0001-0001-0001-000000000001', 'Standard Monthly (Test)', 'Standard residential billing for 3BR units', 'house', NULL, false, true, false, NOW() - INTERVAL '2 years', NOW() - INTERVAL '2 years'),
  ('ff000001-0001-0001-0001-000000000002', 'Premium Monthly (Test)', 'Premium billing for duplex and larger units', 'house', NULL, false, true, false, NOW() - INTERVAL '2 years', NOW() - INTERVAL '2 years'),
  ('ff000001-0001-0001-0001-000000000003', 'Commercial Monthly (Test)', 'Commercial property billing', 'house', NULL, false, true, false, NOW() - INTERVAL '1 year', NOW() - INTERVAL '1 year'),

  -- One-time levies (house-based for owners/landlords)
  ('ff000001-0001-0001-0001-000000000004', 'Development Levy 2025 (Test)', 'Infrastructure development contribution', 'house', ARRAY['resident_landlord', 'non_resident_landlord', 'developer']::resident_role[], true, true, true, NOW() - INTERVAL '1 year', NOW() - INTERVAL '1 year'),
  ('ff000001-0001-0001-0001-000000000005', 'Transformer Levy (Test)', 'Power infrastructure upgrade', 'house', ARRAY['resident_landlord', 'non_resident_landlord', 'developer']::resident_role[], true, true, false, NOW() - INTERVAL '6 months', NOW() - INTERVAL '6 months'),
  ('ff000001-0001-0001-0001-000000000006', 'Registration Fee (Test)', 'New resident registration fee', 'resident', ARRAY['tenant', 'resident_landlord']::resident_role[], true, true, false, NOW() - INTERVAL '2 years', NOW() - INTERVAL '2 years')
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  target_type = EXCLUDED.target_type,
  applicable_roles = EXCLUDED.applicable_roles,
  is_one_time = EXCLUDED.is_one_time,
  is_development_levy = EXCLUDED.is_development_levy,
  effective_date = EXCLUDED.effective_date;

-- ============================================================================
-- BILLING ITEMS (Line items for each profile)
-- ============================================================================

-- Standard Monthly Profile Items (Total: 15,000)
INSERT INTO public.billing_items (id, billing_profile_id, name, amount, frequency, is_mandatory) VALUES
  ('ff100001-0001-0001-0001-000000000001', 'ff000001-0001-0001-0001-000000000001', 'Service Charge', 8000, 'monthly', true),
  ('ff100001-0001-0001-0001-000000000002', 'ff000001-0001-0001-0001-000000000001', 'Security Levy', 4000, 'monthly', true),
  ('ff100001-0001-0001-0001-000000000003', 'ff000001-0001-0001-0001-000000000001', 'Sanitation Fee', 2000, 'monthly', true),
  ('ff100001-0001-0001-0001-000000000004', 'ff000001-0001-0001-0001-000000000001', 'Water Rate', 1000, 'monthly', true)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  amount = EXCLUDED.amount,
  frequency = EXCLUDED.frequency;

-- Premium Monthly Profile Items (Total: 25,000)
INSERT INTO public.billing_items (id, billing_profile_id, name, amount, frequency, is_mandatory) VALUES
  ('ff100001-0001-0001-0001-000000000011', 'ff000001-0001-0001-0001-000000000002', 'Service Charge', 12000, 'monthly', true),
  ('ff100001-0001-0001-0001-000000000012', 'ff000001-0001-0001-0001-000000000002', 'Security Levy', 6000, 'monthly', true),
  ('ff100001-0001-0001-0001-000000000013', 'ff000001-0001-0001-0001-000000000002', 'Sanitation Fee', 4000, 'monthly', true),
  ('ff100001-0001-0001-0001-000000000014', 'ff000001-0001-0001-0001-000000000002', 'Water Rate', 2000, 'monthly', true),
  ('ff100001-0001-0001-0001-000000000015', 'ff000001-0001-0001-0001-000000000002', 'Estate Maintenance', 1000, 'monthly', false)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  amount = EXCLUDED.amount,
  frequency = EXCLUDED.frequency;

-- Commercial Monthly Profile Items (Total: 50,000)
INSERT INTO public.billing_items (id, billing_profile_id, name, amount, frequency, is_mandatory) VALUES
  ('ff100001-0001-0001-0001-000000000021', 'ff000001-0001-0001-0001-000000000003', 'Commercial Service Charge', 25000, 'monthly', true),
  ('ff100001-0001-0001-0001-000000000022', 'ff000001-0001-0001-0001-000000000003', 'Enhanced Security', 15000, 'monthly', true),
  ('ff100001-0001-0001-0001-000000000023', 'ff000001-0001-0001-0001-000000000003', 'Waste Management', 7000, 'monthly', true),
  ('ff100001-0001-0001-0001-000000000024', 'ff000001-0001-0001-0001-000000000003', 'Water & Utilities', 3000, 'monthly', true)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  amount = EXCLUDED.amount,
  frequency = EXCLUDED.frequency;

-- Development Levy Items (Total: 500,000)
INSERT INTO public.billing_items (id, billing_profile_id, name, amount, frequency, is_mandatory) VALUES
  ('ff100001-0001-0001-0001-000000000031', 'ff000001-0001-0001-0001-000000000004', 'Infrastructure Development Contribution', 500000, 'one_off', true)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  amount = EXCLUDED.amount,
  frequency = EXCLUDED.frequency;

-- Transformer Levy Items (Total: 30,000)
INSERT INTO public.billing_items (id, billing_profile_id, name, amount, frequency, is_mandatory) VALUES
  ('ff100001-0001-0001-0001-000000000041', 'ff000001-0001-0001-0001-000000000005', 'Transformer Upgrade Fund', 30000, 'one_off', true)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  amount = EXCLUDED.amount,
  frequency = EXCLUDED.frequency;

-- Registration Fee Items (Total: 10,000)
INSERT INTO public.billing_items (id, billing_profile_id, name, amount, frequency, is_mandatory) VALUES
  ('ff100001-0001-0001-0001-000000000051', 'ff000001-0001-0001-0001-000000000006', 'Registration Processing Fee', 5000, 'one_off', true),
  ('ff100001-0001-0001-0001-000000000052', 'ff000001-0001-0001-0001-000000000006', 'ID Card & Documentation', 5000, 'one_off', true)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  amount = EXCLUDED.amount,
  frequency = EXCLUDED.frequency;

-- ============================================================================
-- LINK BILLING PROFILES TO HOUSE TYPES
-- ============================================================================
UPDATE public.house_types SET billing_profile_id = 'ff000001-0001-0001-0001-000000000001' WHERE id = '22222222-0002-0002-0002-000000000001';  -- Standard 3BR
UPDATE public.house_types SET billing_profile_id = 'ff000001-0001-0001-0001-000000000002' WHERE id = '22222222-0002-0002-0002-000000000002';  -- Duplex 4BR
UPDATE public.house_types SET billing_profile_id = 'ff000001-0001-0001-0001-000000000002' WHERE id = '22222222-0002-0002-0002-000000000003';  -- Penthouse 5BR
UPDATE public.house_types SET billing_profile_id = 'ff000001-0001-0001-0001-000000000003' WHERE id = '22222222-0002-0002-0002-000000000004';  -- Commercial

-- ============================================================================
-- SET CURRENT DEVELOPMENT LEVY (System Setting)
-- ============================================================================
INSERT INTO public.system_settings (key, value) VALUES
  ('current_development_levy_profile_id', '"ff000001-0001-0001-0001-000000000004"')
ON CONFLICT (key) DO UPDATE SET
  value = EXCLUDED.value;

-- ============================================================================
-- VERIFICATION
-- ============================================================================
DO $$
DECLARE
  v_profiles INT;
  v_items INT;
  v_recurring INT;
  v_onetime INT;
BEGIN
  SELECT COUNT(*) INTO v_profiles FROM billing_profiles WHERE id::text LIKE 'ff000001-%';
  SELECT COUNT(*) INTO v_items FROM billing_items WHERE id::text LIKE 'ff100001-%';
  SELECT COUNT(*) INTO v_recurring FROM billing_profiles WHERE is_one_time = false AND id::text LIKE 'ff000001-%';
  SELECT COUNT(*) INTO v_onetime FROM billing_profiles WHERE is_one_time = true AND id::text LIKE 'ff000001-%';

  RAISE NOTICE 'Billing Profiles Created:';
  RAISE NOTICE '  Total Profiles: %', v_profiles;
  RAISE NOTICE '  Total Items: %', v_items;
  RAISE NOTICE '  Recurring Profiles: %', v_recurring;
  RAISE NOTICE '  One-Time Levies: %', v_onetime;
END $$;

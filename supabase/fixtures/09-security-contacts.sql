-- ============================================================================
-- FIXTURE: Security Contacts
-- 25 security contacts across various categories with access codes
-- Distribution: 8 Family, 5 Contractor, 4 Delivery, 5 Domestic Staff, 3 Expired/Suspended
-- ============================================================================

-- Reference IDs:
-- Residents: aa000001-0001-0001-0001-000000000001 to 000000000055
-- Categories: Look up by name from security_contact_categories
--   Visitor (family, friends, etc.)
--   Service Provider (contractors, delivery, etc.)
--   Domestic Staff (housekeepers, drivers, etc.)

-- ============================================================================
-- FAMILY VISITORS (8 total)
-- Regular family members and friends visiting residents
-- ============================================================================
INSERT INTO public.security_contacts (id, resident_id, category_id, full_name, phone_primary, phone_secondary, id_type, id_number, relationship, status, created_at) VALUES
  -- Family visitors for RES001 (Oluwaseun Adeyemi)
  ('db000001-0001-0001-0001-000000000001', 'aa000001-0001-0001-0001-000000000001', (SELECT id FROM security_contact_categories WHERE name = 'Visitor' LIMIT 1), 'Adebayo Adeyemi', '+2348090001001', '+2348090001101', 'nin', '12345678901', 'Brother', 'active', NOW() - INTERVAL '1 year'),
  ('db000001-0001-0001-0001-000000000002', 'aa000001-0001-0001-0001-000000000001', (SELECT id FROM security_contact_categories WHERE name = 'Visitor' LIMIT 1), 'Folake Adeyemi', '+2348090001002', NULL, 'voters_card', 'VN123456', 'Sister', 'active', NOW() - INTERVAL '1 year'),

  -- Family visitors for RES005 (Ibrahim Mohammed)
  ('db000001-0001-0001-0001-000000000003', 'aa000001-0001-0001-0001-000000000005', (SELECT id FROM security_contact_categories WHERE name = 'Visitor' LIMIT 1), 'Fatima Mohammed', '+2348090001003', NULL, 'nin', '22345678901', 'Daughter', 'active', NOW() - INTERVAL '10 months'),
  ('db000001-0001-0001-0001-000000000004', 'aa000001-0001-0001-0001-000000000005', (SELECT id FROM security_contact_categories WHERE name = 'Visitor' LIMIT 1), 'Yusuf Mohammed', '+2348090001004', '+2348090001104', 'drivers_license', 'DL987654', 'Son', 'active', NOW() - INTERVAL '10 months'),

  -- Family visitors for RES009 (Chukwuemeka Igwe)
  ('db000001-0001-0001-0001-000000000005', 'aa000001-0001-0001-0001-000000000009', (SELECT id FROM security_contact_categories WHERE name = 'Visitor' LIMIT 1), 'Obinna Igwe', '+2348090001005', NULL, 'passport', 'A12345678', 'Uncle', 'active', NOW() - INTERVAL '8 months'),

  -- Family visitors for RES012 (Blessing Udo)
  ('db000001-0001-0001-0001-000000000006', 'aa000001-0001-0001-0001-000000000012', (SELECT id FROM security_contact_categories WHERE name = 'Visitor' LIMIT 1), 'Victor Udo', '+2348090001006', NULL, 'company_id', 'GTB-5678', 'Cousin', 'active', NOW() - INTERVAL '6 months'),
  ('db000001-0001-0001-0001-000000000007', 'aa000001-0001-0001-0001-000000000012', (SELECT id FROM security_contact_categories WHERE name = 'Visitor' LIMIT 1), 'Joy Udo-Peters', '+2348090001007', '+2348090001107', 'nin', '32345678901', 'Aunt', 'active', NOW() - INTERVAL '6 months'),

  -- Family visitor for RES021 (Tenant - Temitope Adegoke)
  ('db000001-0001-0001-0001-000000000008', 'aa000001-0001-0001-0001-000000000021', (SELECT id FROM security_contact_categories WHERE name = 'Visitor' LIMIT 1), 'Kunle Adegoke', '+2348090001008', NULL, 'drivers_license', 'DL654321', 'Brother', 'active', NOW() - INTERVAL '4 months')
ON CONFLICT (id) DO UPDATE SET
  full_name = EXCLUDED.full_name,
  status = EXCLUDED.status;

-- ============================================================================
-- CONTRACTORS (5 total)
-- Service providers for construction, repairs, etc.
-- ============================================================================
INSERT INTO public.security_contacts (id, resident_id, category_id, full_name, phone_primary, employer, id_type, id_number, status, notes, created_at) VALUES
  -- Contractors for various residents
  ('db000001-0001-0001-0001-000000000009', 'aa000001-0001-0001-0001-000000000003', (SELECT id FROM security_contact_categories WHERE name = 'Service Provider' LIMIT 1), 'Musa Aliyu', '+2348090001009', 'BuildRight Construction', 'nin', '42345678901', 'active', 'Ongoing renovation work', NOW() - INTERVAL '3 months'),
  ('db000001-0001-0001-0001-000000000010', 'aa000001-0001-0001-0001-000000000007', (SELECT id FROM security_contact_categories WHERE name = 'Service Provider' LIMIT 1), 'Tunde Electricals', '+2348090001010', 'PowerFix Nigeria Ltd', 'company_id', 'PWR-1234', 'active', 'Electrical maintenance', NOW() - INTERVAL '2 months'),
  ('db000001-0001-0001-0001-000000000011', 'aa000001-0001-0001-0001-000000000008', (SELECT id FROM security_contact_categories WHERE name = 'Service Provider' LIMIT 1), 'Ahmed Plumber', '+2348090001011', 'Self Employed', 'voters_card', 'VN789012', 'active', 'Plumbing repairs', NOW() - INTERVAL '6 months'),
  ('db000001-0001-0001-0001-000000000012', 'aa000001-0001-0001-0001-000000000006', (SELECT id FROM security_contact_categories WHERE name = 'Service Provider' LIMIT 1), 'Chidi Painters', '+2348090001012', 'Elite Painters Co', 'nin', '52345678901', 'active', 'Interior painting contract', NOW() - INTERVAL '1 month'),
  ('db000001-0001-0001-0001-000000000013', 'aa000001-0001-0001-0001-000000000011', (SELECT id FROM security_contact_categories WHERE name = 'Service Provider' LIMIT 1), 'Garba Welder', '+2348090001013', 'Metalworks Plus', 'drivers_license', 'DL112233', 'active', 'Gate repairs', NOW() - INTERVAL '4 months')
ON CONFLICT (id) DO UPDATE SET
  full_name = EXCLUDED.full_name,
  status = EXCLUDED.status;

-- ============================================================================
-- DELIVERY SERVICE (4 total)
-- Regular delivery personnel
-- ============================================================================
INSERT INTO public.security_contacts (id, resident_id, category_id, full_name, phone_primary, employer, id_type, id_number, status, notes, created_at) VALUES
  ('db000001-0001-0001-0001-000000000014', 'aa000001-0001-0001-0001-000000000001', (SELECT id FROM security_contact_categories WHERE name = 'Service Provider' LIMIT 1), 'Jumia Delivery - Emeka', '+2348090001014', 'Jumia Nigeria', 'company_id', 'JUM-5678', 'active', 'Regular Jumia deliveries', NOW() - INTERVAL '8 months'),
  ('db000001-0001-0001-0001-000000000015', 'aa000001-0001-0001-0001-000000000002', (SELECT id FROM security_contact_categories WHERE name = 'Service Provider' LIMIT 1), 'Konga Rider - Seyi', '+2348090001015', 'Konga', 'company_id', 'KON-9012', 'active', 'Konga deliveries', NOW() - INTERVAL '6 months'),
  ('db000001-0001-0001-0001-000000000016', 'aa000001-0001-0001-0001-000000000004', (SELECT id FROM security_contact_categories WHERE name = 'Service Provider' LIMIT 1), 'GIG Logistics - Uche', '+2348090001016', 'GIG Logistics', 'company_id', 'GIG-3456', 'active', 'GIG dispatch', NOW() - INTERVAL '5 months'),
  ('db000001-0001-0001-0001-000000000017', 'aa000001-0001-0001-0001-000000000010', (SELECT id FROM security_contact_categories WHERE name = 'Service Provider' LIMIT 1), 'DHL Courier - Tola', '+2348090001017', 'DHL Nigeria', 'company_id', 'DHL-7890', 'active', 'International packages', NOW() - INTERVAL '4 months')
ON CONFLICT (id) DO UPDATE SET
  full_name = EXCLUDED.full_name,
  status = EXCLUDED.status;

-- ============================================================================
-- DOMESTIC STAFF (5 total)
-- Housekeepers, nannies, drivers for residents
-- ============================================================================
INSERT INTO public.security_contacts (id, resident_id, category_id, full_name, phone_primary, phone_secondary, id_type, id_number, address, next_of_kin_name, next_of_kin_phone, status, notes, created_at) VALUES
  -- Full-time domestic staff
  ('db000001-0001-0001-0001-000000000018', 'aa000001-0001-0001-0001-000000000009', (SELECT id FROM security_contact_categories WHERE name = 'Domestic Staff' LIMIT 1), 'Mary Johnson', '+2348090001018', '+2348090001118', 'nin', '62345678901', '15 Ikeja Road, Lagos', 'John Johnson', '+2348091001018', 'active', 'Full-time housekeeper - Live in', NOW() - INTERVAL '2 years'),
  ('db000001-0001-0001-0001-000000000019', 'aa000001-0001-0001-0001-000000000010', (SELECT id FROM security_contact_categories WHERE name = 'Domestic Staff' LIMIT 1), 'Agnes Okoro', '+2348090001019', NULL, 'voters_card', 'VN345678', '22 Surulere St, Lagos', 'Peter Okoro', '+2348091001019', 'active', 'Nanny - Daily visits', NOW() - INTERVAL '18 months'),
  ('db000001-0001-0001-0001-000000000020', 'aa000001-0001-0001-0001-000000000011', (SELECT id FROM security_contact_categories WHERE name = 'Domestic Staff' LIMIT 1), 'Bala Garba', '+2348090001020', '+2348090001120', 'drivers_license', 'DL445566', '8 Yaba Close, Lagos', 'Amina Garba', '+2348091001020', 'active', 'Family driver', NOW() - INTERVAL '2 years'),
  ('db000001-0001-0001-0001-000000000021', 'aa000001-0001-0001-0001-000000000012', (SELECT id FROM security_contact_categories WHERE name = 'Domestic Staff' LIMIT 1), 'Chinenye Eze', '+2348090001021', NULL, 'nin', '72345678901', '45 Maryland, Lagos', 'Emeka Eze', '+2348091001021', 'active', 'Housekeeper - Weekdays only', NOW() - INTERVAL '1 year'),
  ('db000001-0001-0001-0001-000000000022', 'aa000001-0001-0001-0001-000000000007', (SELECT id FROM security_contact_categories WHERE name = 'Domestic Staff' LIMIT 1), 'Samuel Okon', '+2348090001022', '+2348090001122', 'nin', '82345678901', '12 Lekki, Lagos', 'Grace Okon', '+2348091001022', 'active', 'Security/Driver combo', NOW() - INTERVAL '14 months')
ON CONFLICT (id) DO UPDATE SET
  full_name = EXCLUDED.full_name,
  status = EXCLUDED.status;

-- ============================================================================
-- EXPIRED/SUSPENDED CONTACTS (3 total)
-- For testing various status scenarios
-- ============================================================================
INSERT INTO public.security_contacts (id, resident_id, category_id, full_name, phone_primary, id_type, id_number, status, notes, created_at) VALUES
  -- Expired contact (visitor authorization ended)
  ('db000001-0001-0001-0001-000000000023', 'aa000001-0001-0001-0001-000000000015', (SELECT id FROM security_contact_categories WHERE name = 'Visitor' LIMIT 1), 'Former Visitor John', '+2348090001023', 'nin', '92345678901', 'expired', 'Authorization expired - resident moved', NOW() - INTERVAL '2 years'),
  -- Suspended contact (behavioral issue)
  ('db000001-0001-0001-0001-000000000024', 'aa000001-0001-0001-0001-000000000003', (SELECT id FROM security_contact_categories WHERE name = 'Service Provider' LIMIT 1), 'Problematic Contractor', '+2348090001024', 'voters_card', 'VN567890', 'suspended', 'Suspended due to security concerns', NOW() - INTERVAL '6 months'),
  -- Revoked contact
  ('db000001-0001-0001-0001-000000000025', 'aa000001-0001-0001-0001-000000000021', (SELECT id FROM security_contact_categories WHERE name = 'Domestic Staff' LIMIT 1), 'Former Staff Member', '+2348090001025', 'nin', '99345678901', 'revoked', 'Employment terminated', NOW() - INTERVAL '4 months')
ON CONFLICT (id) DO UPDATE SET
  full_name = EXCLUDED.full_name,
  status = EXCLUDED.status;

-- ============================================================================
-- ACCESS CODES (25 total - one for each contact)
-- Mix of permanent and one-time codes
-- ============================================================================

-- Permanent access codes (20)
INSERT INTO public.access_codes (id, contact_id, code, code_type, valid_from, is_active, created_at) VALUES
  -- Family visitors - permanent codes
  ('ac000001-0001-0001-0001-000000000001', 'db000001-0001-0001-0001-000000000001', 'RES-A1K-7M3N', 'permanent', NOW() - INTERVAL '1 year', true, NOW() - INTERVAL '1 year'),
  ('ac000001-0001-0001-0001-000000000002', 'db000001-0001-0001-0001-000000000002', 'RES-B2L-8P4Q', 'permanent', NOW() - INTERVAL '1 year', true, NOW() - INTERVAL '1 year'),
  ('ac000001-0001-0001-0001-000000000003', 'db000001-0001-0001-0001-000000000003', 'RES-C3M-9R5S', 'permanent', NOW() - INTERVAL '10 months', true, NOW() - INTERVAL '10 months'),
  ('ac000001-0001-0001-0001-000000000004', 'db000001-0001-0001-0001-000000000004', 'RES-D4N-2T6U', 'permanent', NOW() - INTERVAL '10 months', true, NOW() - INTERVAL '10 months'),
  ('ac000001-0001-0001-0001-000000000005', 'db000001-0001-0001-0001-000000000005', 'RES-E5P-3V7W', 'permanent', NOW() - INTERVAL '8 months', true, NOW() - INTERVAL '8 months'),
  ('ac000001-0001-0001-0001-000000000006', 'db000001-0001-0001-0001-000000000006', 'RES-F6Q-4X8Y', 'permanent', NOW() - INTERVAL '6 months', true, NOW() - INTERVAL '6 months'),
  ('ac000001-0001-0001-0001-000000000007', 'db000001-0001-0001-0001-000000000007', 'RES-G7R-5Z9A', 'permanent', NOW() - INTERVAL '6 months', true, NOW() - INTERVAL '6 months'),
  ('ac000001-0001-0001-0001-000000000008', 'db000001-0001-0001-0001-000000000008', 'RES-H8S-6B2C', 'permanent', NOW() - INTERVAL '4 months', true, NOW() - INTERVAL '4 months'),

  -- Contractors - permanent codes
  ('ac000001-0001-0001-0001-000000000009', 'db000001-0001-0001-0001-000000000009', 'RES-J9T-7D3E', 'permanent', NOW() - INTERVAL '3 months', true, NOW() - INTERVAL '3 months'),
  ('ac000001-0001-0001-0001-000000000010', 'db000001-0001-0001-0001-000000000010', 'RES-K2U-8F4G', 'permanent', NOW() - INTERVAL '2 months', true, NOW() - INTERVAL '2 months'),
  ('ac000001-0001-0001-0001-000000000011', 'db000001-0001-0001-0001-000000000011', 'RES-L3V-9H5J', 'permanent', NOW() - INTERVAL '6 months', true, NOW() - INTERVAL '6 months'),
  ('ac000001-0001-0001-0001-000000000012', 'db000001-0001-0001-0001-000000000012', 'RES-M4W-2K6L', 'permanent', NOW() - INTERVAL '1 month', true, NOW() - INTERVAL '1 month'),
  ('ac000001-0001-0001-0001-000000000013', 'db000001-0001-0001-0001-000000000013', 'RES-N5X-3M7N', 'permanent', NOW() - INTERVAL '4 months', true, NOW() - INTERVAL '4 months'),

  -- Delivery - permanent codes
  ('ac000001-0001-0001-0001-000000000014', 'db000001-0001-0001-0001-000000000014', 'RES-P6Y-4P8Q', 'permanent', NOW() - INTERVAL '8 months', true, NOW() - INTERVAL '8 months'),
  ('ac000001-0001-0001-0001-000000000015', 'db000001-0001-0001-0001-000000000015', 'RES-Q7Z-5R9S', 'permanent', NOW() - INTERVAL '6 months', true, NOW() - INTERVAL '6 months'),
  ('ac000001-0001-0001-0001-000000000016', 'db000001-0001-0001-0001-000000000016', 'RES-R8A-6T2U', 'permanent', NOW() - INTERVAL '5 months', true, NOW() - INTERVAL '5 months'),
  ('ac000001-0001-0001-0001-000000000017', 'db000001-0001-0001-0001-000000000017', 'RES-S9B-7V3W', 'permanent', NOW() - INTERVAL '4 months', true, NOW() - INTERVAL '4 months'),

  -- Domestic staff - permanent codes
  ('ac000001-0001-0001-0001-000000000018', 'db000001-0001-0001-0001-000000000018', 'RES-T2C-8X4Y', 'permanent', NOW() - INTERVAL '2 years', true, NOW() - INTERVAL '2 years'),
  ('ac000001-0001-0001-0001-000000000019', 'db000001-0001-0001-0001-000000000019', 'RES-U3D-9Z5A', 'permanent', NOW() - INTERVAL '18 months', true, NOW() - INTERVAL '18 months'),
  ('ac000001-0001-0001-0001-000000000020', 'db000001-0001-0001-0001-000000000020', 'RES-V4E-2B6C', 'permanent', NOW() - INTERVAL '2 years', true, NOW() - INTERVAL '2 years')
ON CONFLICT (id) DO UPDATE SET
  is_active = EXCLUDED.is_active;

-- More domestic staff codes
INSERT INTO public.access_codes (id, contact_id, code, code_type, valid_from, is_active, created_at) VALUES
  ('ac000001-0001-0001-0001-000000000021', 'db000001-0001-0001-0001-000000000021', 'RES-W5F-3D7E', 'permanent', NOW() - INTERVAL '1 year', true, NOW() - INTERVAL '1 year'),
  ('ac000001-0001-0001-0001-000000000022', 'db000001-0001-0001-0001-000000000022', 'RES-X6G-4F8H', 'permanent', NOW() - INTERVAL '14 months', true, NOW() - INTERVAL '14 months')
ON CONFLICT (id) DO UPDATE SET
  is_active = EXCLUDED.is_active;

-- Inactive codes (for expired/suspended contacts)
INSERT INTO public.access_codes (id, contact_id, code, code_type, valid_from, is_active, revoked_at, created_at) VALUES
  ('ac000001-0001-0001-0001-000000000023', 'db000001-0001-0001-0001-000000000023', 'RES-Y7H-5G9J', 'permanent', NOW() - INTERVAL '2 years', false, NOW() - INTERVAL '3 months', NOW() - INTERVAL '2 years'),
  ('ac000001-0001-0001-0001-000000000024', 'db000001-0001-0001-0001-000000000024', 'RES-Z8J-6H2K', 'permanent', NOW() - INTERVAL '6 months', false, NOW() - INTERVAL '2 months', NOW() - INTERVAL '6 months'),
  ('ac000001-0001-0001-0001-000000000025', 'db000001-0001-0001-0001-000000000025', 'RES-A9K-7J3L', 'permanent', NOW() - INTERVAL '4 months', false, NOW() - INTERVAL '2 months', NOW() - INTERVAL '4 months')
ON CONFLICT (id) DO UPDATE SET
  is_active = EXCLUDED.is_active,
  revoked_at = EXCLUDED.revoked_at;

-- One-time codes (5 additional - for testing)
INSERT INTO public.access_codes (id, contact_id, code, code_type, valid_from, valid_until, max_uses, current_uses, is_active, created_at) VALUES
  -- Used one-time codes
  ('ac000001-0001-0001-0001-000000000026', 'db000001-0001-0001-0001-000000000001', 'RES-OT1-XY12', 'one_time', NOW() - INTERVAL '2 weeks', NOW() - INTERVAL '1 week', 1, 1, false, NOW() - INTERVAL '2 weeks'),
  ('ac000001-0001-0001-0001-000000000027', 'db000001-0001-0001-0001-000000000003', 'RES-OT2-AB34', 'one_time', NOW() - INTERVAL '1 week', NOW() - INTERVAL '3 days', 1, 1, false, NOW() - INTERVAL '1 week'),
  ('ac000001-0001-0001-0001-000000000028', 'db000001-0001-0001-0001-000000000005', 'RES-OT3-CD56', 'one_time', NOW() - INTERVAL '5 days', NOW() - INTERVAL '2 days', 1, 1, false, NOW() - INTERVAL '5 days'),
  -- Active unused one-time codes
  ('ac000001-0001-0001-0001-000000000029', 'db000001-0001-0001-0001-000000000006', 'RES-OT4-EF78', 'one_time', NOW() - INTERVAL '1 day', NOW() + INTERVAL '2 days', 1, 0, true, NOW() - INTERVAL '1 day'),
  ('ac000001-0001-0001-0001-000000000030', 'db000001-0001-0001-0001-000000000007', 'RES-OT5-GH90', 'one_time', NOW(), NOW() + INTERVAL '7 days', 1, 0, true, NOW())
ON CONFLICT (id) DO UPDATE SET
  is_active = EXCLUDED.is_active,
  current_uses = EXCLUDED.current_uses;

-- ============================================================================
-- VERIFICATION
-- ============================================================================
DO $$
DECLARE
  v_contacts INT;
  v_active INT;
  v_suspended INT;
  v_codes INT;
  v_permanent INT;
  v_onetime INT;
BEGIN
  SELECT COUNT(*) INTO v_contacts FROM security_contacts WHERE id::text LIKE 'db000001-%';
  SELECT COUNT(*) INTO v_active FROM security_contacts WHERE status = 'active' AND id::text LIKE 'db000001-%';
  SELECT COUNT(*) INTO v_suspended FROM security_contacts WHERE status IN ('suspended', 'expired', 'revoked') AND id::text LIKE 'db000001-%';
  SELECT COUNT(*) INTO v_codes FROM access_codes WHERE id::text LIKE 'ac000001-%';
  SELECT COUNT(*) INTO v_permanent FROM access_codes WHERE code_type = 'permanent' AND id::text LIKE 'ac000001-%';
  SELECT COUNT(*) INTO v_onetime FROM access_codes WHERE code_type = 'one_time' AND id::text LIKE 'ac000001-%';

  RAISE NOTICE 'Security Contacts Created:';
  RAISE NOTICE '  Total Contacts: %', v_contacts;
  RAISE NOTICE '  Active: %', v_active;
  RAISE NOTICE '  Suspended/Expired: %', v_suspended;
  RAISE NOTICE '  Access Codes: %', v_codes;
  RAISE NOTICE '  Permanent Codes: %', v_permanent;
  RAISE NOTICE '  One-Time Codes: %', v_onetime;
END $$;

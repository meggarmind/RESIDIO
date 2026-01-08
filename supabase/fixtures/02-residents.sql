-- ============================================================================
-- FIXTURE: Residents
-- 55 residents across all roles with payment aliases and verification statuses
-- ============================================================================

-- ============================================================================
-- RESIDENT LANDLORDS (15 total) - Owner-occupiers
-- RES001-RES015
-- ============================================================================
INSERT INTO public.residents (id, resident_code, first_name, last_name, email, phone_primary, phone_secondary, resident_type, verification_status, account_status, entity_type) VALUES
  -- Standard landlords
  ('aa000001-0001-0001-0001-000000000001', 'RES001', 'Oluwaseun', 'Adeyemi', 'seun.adeyemi@email.com', '+2348012345001', '+2348012345101', 'primary', 'verified', 'active', 'individual'),
  ('aa000001-0001-0001-0001-000000000002', 'RES002', 'Chidinma', 'Okonkwo', 'chidinma.ok@email.com', '+2348012345002', NULL, 'primary', 'verified', 'active', 'individual'),
  ('aa000001-0001-0001-0001-000000000003', 'RES003', 'Babatunde', 'Williams', 'tunde.williams@email.com', '+2348012345003', '+2348012345103', 'primary', 'verified', 'active', 'individual'),
  ('aa000001-0001-0001-0001-000000000004', 'RES004', 'Ngozi', 'Eze', 'ngozi.eze@email.com', '+2348012345004', NULL, 'primary', 'verified', 'active', 'individual'),
  ('aa000001-0001-0001-0001-000000000005', 'RES005', 'Ibrahim', 'Mohammed', 'ibrahim.m@email.com', '+2348012345005', '+2348012345105', 'primary', 'verified', 'active', 'individual'),

  -- Landlords with multiple properties
  ('aa000001-0001-0001-0001-000000000006', 'RES006', 'Funmilayo', 'Ogundimu', 'funmi.ogundimu@email.com', '+2348012345006', NULL, 'primary', 'verified', 'active', 'individual'),
  ('aa000001-0001-0001-0001-000000000007', 'RES007', 'Emeka', 'Nwankwo', 'emeka.nwankwo@email.com', '+2348012345007', '+2348012345107', 'primary', 'verified', 'active', 'individual'),
  ('aa000001-0001-0001-0001-000000000008', 'RES008', 'Amaka', 'Okoro', 'amaka.okoro@email.com', '+2348012345008', NULL, 'primary', 'verified', 'active', 'individual'),

  -- Landlords with household members (sponsors)
  ('aa000001-0001-0001-0001-000000000009', 'RES009', 'Chukwuemeka', 'Igwe', 'chukwuemeka.igwe@email.com', '+2348012345009', '+2348012345109', 'primary', 'verified', 'active', 'individual'),
  ('aa000001-0001-0001-0001-000000000010', 'RES010', 'Adaeze', 'Obi', 'adaeze.obi@email.com', '+2348012345010', NULL, 'primary', 'verified', 'active', 'individual'),
  ('aa000001-0001-0001-0001-000000000011', 'RES011', 'Olumide', 'Akinola', 'olumide.akinola@email.com', '+2348012345011', '+2348012345111', 'primary', 'verified', 'active', 'individual'),
  ('aa000001-0001-0001-0001-000000000012', 'RES012', 'Blessing', 'Udo', 'blessing.udo@email.com', '+2348012345012', NULL, 'primary', 'verified', 'active', 'individual'),

  -- Pending verification landlords
  ('aa000001-0001-0001-0001-000000000013', 'RES013', 'Kayode', 'Fashola', 'kayode.fashola@email.com', '+2348012345013', NULL, 'primary', 'pending', 'active', 'individual'),
  ('aa000001-0001-0001-0001-000000000014', 'RES014', 'Nneka', 'Anyanwu', 'nneka.anyanwu@email.com', '+2348012345014', '+2348012345114', 'primary', 'pending', 'active', 'individual'),

  -- Inactive landlord
  ('aa000001-0001-0001-0001-000000000015', 'RES015', 'Tochukwu', 'Madu', 'tochukwu.madu@email.com', '+2348012345015', NULL, 'primary', 'verified', 'inactive', 'individual')
ON CONFLICT (id) DO UPDATE SET
  first_name = EXCLUDED.first_name,
  last_name = EXCLUDED.last_name,
  email = EXCLUDED.email,
  phone_primary = EXCLUDED.phone_primary;

-- ============================================================================
-- NON-RESIDENT LANDLORDS (5 total) - Absentee owners
-- RES016-RES020
-- ============================================================================
INSERT INTO public.residents (id, resident_code, first_name, last_name, email, phone_primary, resident_type, verification_status, account_status, entity_type) VALUES
  ('aa000001-0001-0001-0001-000000000016', 'RES016', 'Adenike', 'Bakare', 'adenike.bakare@email.com', '+2348012345016', 'primary', 'verified', 'active', 'individual'),
  ('aa000001-0001-0001-0001-000000000017', 'RES017', 'Obinna', 'Agu', 'obinna.agu@email.com', '+2348012345017', 'primary', 'verified', 'active', 'individual'),
  ('aa000001-0001-0001-0001-000000000018', 'RES018', 'Folashade', 'Oyewole', 'folashade.oyewole@email.com', '+2348012345018', 'primary', 'verified', 'active', 'individual'),
  ('aa000001-0001-0001-0001-000000000019', 'RES019', 'Uche', 'Okeke', 'uche.okeke@email.com', '+2348012345019', 'primary', 'verified', 'active', 'individual'),
  ('aa000001-0001-0001-0001-000000000020', 'RES020', 'Yetunde', 'Coker', 'yetunde.coker@email.com', '+2348012345020', 'primary', 'verified', 'active', 'individual')
ON CONFLICT (id) DO UPDATE SET
  first_name = EXCLUDED.first_name,
  last_name = EXCLUDED.last_name;

-- ============================================================================
-- TENANTS (12 total) - Renters
-- RES021-RES032
-- ============================================================================
INSERT INTO public.residents (id, resident_code, first_name, last_name, email, phone_primary, resident_type, verification_status, account_status, entity_type) VALUES
  ('aa000001-0001-0001-0001-000000000021', 'RES021', 'Temitope', 'Adegoke', 'temitope.adegoke@email.com', '+2348012345021', 'primary', 'verified', 'active', 'individual'),
  ('aa000001-0001-0001-0001-000000000022', 'RES022', 'Ifeanyi', 'Chukwu', 'ifeanyi.chukwu@email.com', '+2348012345022', 'primary', 'verified', 'active', 'individual'),
  ('aa000001-0001-0001-0001-000000000023', 'RES023', 'Bolaji', 'Oladipo', 'bolaji.oladipo@email.com', '+2348012345023', 'primary', 'verified', 'active', 'individual'),
  ('aa000001-0001-0001-0001-000000000024', 'RES024', 'Chioma', 'Ebere', 'chioma.ebere@email.com', '+2348012345024', 'primary', 'verified', 'active', 'individual'),
  ('aa000001-0001-0001-0001-000000000025', 'RES025', 'Segun', 'Alabi', 'segun.alabi@email.com', '+2348012345025', 'primary', 'verified', 'active', 'individual'),
  ('aa000001-0001-0001-0001-000000000026', 'RES026', 'Adaobi', 'Nnamdi', 'adaobi.nnamdi@email.com', '+2348012345026', 'primary', 'verified', 'active', 'individual'),
  ('aa000001-0001-0001-0001-000000000027', 'RES027', 'Kolawole', 'Bello', 'kola.bello@email.com', '+2348012345027', 'primary', 'verified', 'active', 'individual'),
  ('aa000001-0001-0001-0001-000000000028', 'RES028', 'Chiamaka', 'Onuoha', 'chiamaka.onuoha@email.com', '+2348012345028', 'primary', 'verified', 'active', 'individual'),
  -- Tenants with pending verification
  ('aa000001-0001-0001-0001-000000000029', 'RES029', 'Damilola', 'Idowu', 'damilola.idowu@email.com', '+2348012345029', 'primary', 'pending', 'active', 'individual'),
  ('aa000001-0001-0001-0001-000000000030', 'RES030', 'Nkechi', 'Okafor', 'nkechi.okafor@email.com', '+2348012345030', 'primary', 'pending', 'active', 'individual'),
  -- Suspended tenant
  ('aa000001-0001-0001-0001-000000000031', 'RES031', 'Femi', 'Ojo', 'femi.ojo@email.com', '+2348012345031', 'primary', 'verified', 'suspended', 'individual'),
  ('aa000001-0001-0001-0001-000000000032', 'RES032', 'Ifeoma', 'Nnadi', 'ifeoma.nnadi@email.com', '+2348012345032', 'primary', 'verified', 'active', 'individual')
ON CONFLICT (id) DO UPDATE SET
  first_name = EXCLUDED.first_name,
  last_name = EXCLUDED.last_name;

-- ============================================================================
-- HOUSEHOLD MEMBERS (10 total) - Family members (sponsored)
-- RES033-RES042
-- ============================================================================
INSERT INTO public.residents (id, resident_code, first_name, last_name, email, phone_primary, resident_type, verification_status, account_status, entity_type, sponsor_id) VALUES
  -- Household members for RES009 (Chukwuemeka Igwe)
  ('aa000001-0001-0001-0001-000000000033', 'RES033', 'Adaora', 'Igwe', 'adaora.igwe@email.com', '+2348012345033', 'family_member', 'verified', 'active', 'individual', 'aa000001-0001-0001-0001-000000000009'),
  ('aa000001-0001-0001-0001-000000000034', 'RES034', 'Kenechukwu', 'Igwe', NULL, '+2348012345034', 'family_member', 'verified', 'active', 'individual', 'aa000001-0001-0001-0001-000000000009'),

  -- Household members for RES010 (Adaeze Obi)
  ('aa000001-0001-0001-0001-000000000035', 'RES035', 'Obiora', 'Obi', 'obiora.obi@email.com', '+2348012345035', 'family_member', 'verified', 'active', 'individual', 'aa000001-0001-0001-0001-000000000010'),
  ('aa000001-0001-0001-0001-000000000036', 'RES036', 'Adanna', 'Obi', NULL, '+2348012345036', 'family_member', 'verified', 'active', 'individual', 'aa000001-0001-0001-0001-000000000010'),

  -- Household members for RES011 (Olumide Akinola)
  ('aa000001-0001-0001-0001-000000000037', 'RES037', 'Yinka', 'Akinola', 'yinka.akinola@email.com', '+2348012345037', 'family_member', 'verified', 'active', 'individual', 'aa000001-0001-0001-0001-000000000011'),
  ('aa000001-0001-0001-0001-000000000038', 'RES038', 'Tolu', 'Akinola', NULL, '+2348012345038', 'family_member', 'verified', 'active', 'individual', 'aa000001-0001-0001-0001-000000000011'),
  ('aa000001-0001-0001-0001-000000000039', 'RES039', 'Sade', 'Akinola', NULL, '+2348012345039', 'family_member', 'verified', 'active', 'individual', 'aa000001-0001-0001-0001-000000000011'),

  -- Household members for RES012 (Blessing Udo)
  ('aa000001-0001-0001-0001-000000000040', 'RES040', 'Emmanuel', 'Udo', 'emmanuel.udo@email.com', '+2348012345040', 'family_member', 'verified', 'active', 'individual', 'aa000001-0001-0001-0001-000000000012'),
  ('aa000001-0001-0001-0001-000000000041', 'RES041', 'Grace', 'Udo', NULL, '+2348012345041', 'family_member', 'verified', 'active', 'individual', 'aa000001-0001-0001-0001-000000000012'),
  ('aa000001-0001-0001-0001-000000000042', 'RES042', 'David', 'Udo', NULL, '+2348012345042', 'family_member', 'pending', 'active', 'individual', 'aa000001-0001-0001-0001-000000000012')
ON CONFLICT (id) DO UPDATE SET
  first_name = EXCLUDED.first_name,
  last_name = EXCLUDED.last_name,
  sponsor_id = EXCLUDED.sponsor_id;

-- ============================================================================
-- DOMESTIC STAFF (8 total) - Staff members (sponsored)
-- RES043-RES050
-- ============================================================================
INSERT INTO public.residents (id, resident_code, first_name, last_name, email, phone_primary, resident_type, verification_status, account_status, entity_type, sponsor_id) VALUES
  -- Live-in staff for RES001
  ('aa000001-0001-0001-0001-000000000043', 'RES043', 'Patience', 'Akpan', NULL, '+2348012345043', 'domestic_staff', 'verified', 'active', 'individual', 'aa000001-0001-0001-0001-000000000001'),

  -- Live-in staff for RES003
  ('aa000001-0001-0001-0001-000000000044', 'RES044', 'Sunday', 'Okon', NULL, '+2348012345044', 'domestic_staff', 'verified', 'active', 'individual', 'aa000001-0001-0001-0001-000000000003'),

  -- Visiting staff for RES005
  ('aa000001-0001-0001-0001-000000000045', 'RES045', 'Mary', 'Edet', NULL, '+2348012345045', 'domestic_staff', 'verified', 'active', 'individual', 'aa000001-0001-0001-0001-000000000005'),

  -- Staff for RES009
  ('aa000001-0001-0001-0001-000000000046', 'RES046', 'John', 'Bassey', NULL, '+2348012345046', 'domestic_staff', 'verified', 'active', 'individual', 'aa000001-0001-0001-0001-000000000009'),
  ('aa000001-0001-0001-0001-000000000047', 'RES047', 'Grace', 'Effiong', NULL, '+2348012345047', 'domestic_staff', 'verified', 'active', 'individual', 'aa000001-0001-0001-0001-000000000009'),

  -- Staff for tenants
  ('aa000001-0001-0001-0001-000000000048', 'RES048', 'Peter', 'Udo', NULL, '+2348012345048', 'domestic_staff', 'verified', 'active', 'individual', 'aa000001-0001-0001-0001-000000000021'),
  ('aa000001-0001-0001-0001-000000000049', 'RES049', 'Rebecca', 'Inyang', NULL, '+2348012345049', 'domestic_staff', 'pending', 'active', 'individual', 'aa000001-0001-0001-0001-000000000024'),

  -- Inactive staff
  ('aa000001-0001-0001-0001-000000000050', 'RES050', 'James', 'Offiong', NULL, '+2348012345050', 'domestic_staff', 'verified', 'inactive', 'individual', 'aa000001-0001-0001-0001-000000000003')
ON CONFLICT (id) DO UPDATE SET
  first_name = EXCLUDED.first_name,
  last_name = EXCLUDED.last_name,
  sponsor_id = EXCLUDED.sponsor_id;

-- ============================================================================
-- CORPORATE ENTITIES (3 total) - Companies
-- RES051-RES053
-- ============================================================================
INSERT INTO public.residents (id, resident_code, first_name, last_name, email, phone_primary, resident_type, verification_status, account_status, entity_type, company_name) VALUES
  ('aa000001-0001-0001-0001-000000000051', 'RES051', 'Contact', 'Person', 'contact@acmeltd.com', '+2348012345051', 'primary', 'verified', 'active', 'corporate', 'Acme Properties Ltd'),
  ('aa000001-0001-0001-0001-000000000052', 'RES052', 'Property', 'Manager', 'manager@sunriseinv.com', '+2348012345052', 'primary', 'verified', 'active', 'corporate', 'Sunrise Investments Ltd'),
  ('aa000001-0001-0001-0001-000000000053', 'RES053', 'Admin', 'Office', 'admin@legacyhomes.com', '+2348012345053', 'primary', 'pending', 'active', 'corporate', 'Legacy Homes Nigeria')
ON CONFLICT (id) DO UPDATE SET
  first_name = EXCLUDED.first_name,
  last_name = EXCLUDED.last_name,
  company_name = EXCLUDED.company_name;

-- ============================================================================
-- DEVELOPERS (2 total) - With unsold units
-- RES054-RES055
-- ============================================================================
INSERT INTO public.residents (id, resident_code, first_name, last_name, email, phone_primary, resident_type, verification_status, account_status, entity_type, company_name) VALUES
  ('aa000001-0001-0001-0001-000000000054', 'RES054', 'Builder', 'One', 'dev@premiumestates.com', '+2348012345054', 'primary', 'verified', 'active', 'corporate', 'Premium Estates Development'),
  ('aa000001-0001-0001-0001-000000000055', 'RES055', 'Sales', 'Manager', 'sales@mapledrive.com', '+2348012345055', 'primary', 'verified', 'active', 'corporate', 'Maple Drive Developers')
ON CONFLICT (id) DO UPDATE SET
  first_name = EXCLUDED.first_name,
  last_name = EXCLUDED.last_name,
  company_name = EXCLUDED.company_name;

-- ============================================================================
-- PAYMENT ALIASES (for matching tests)
-- ============================================================================
INSERT INTO public.payment_aliases (id, resident_id, alias_name) VALUES
  -- RES001 aliases
  ('bb000001-0001-0001-0001-000000000001', 'aa000001-0001-0001-0001-000000000001', 'SEUN ADEYEMI'),
  ('bb000001-0001-0001-0001-000000000002', 'aa000001-0001-0001-0001-000000000001', 'O. ADEYEMI'),
  ('bb000001-0001-0001-0001-000000000003', 'aa000001-0001-0001-0001-000000000001', 'ADEYEMI OLUWASEUN'),

  -- RES002 aliases
  ('bb000001-0001-0001-0001-000000000004', 'aa000001-0001-0001-0001-000000000002', 'CHIDINMA OKONKWO'),
  ('bb000001-0001-0001-0001-000000000005', 'aa000001-0001-0001-0001-000000000002', 'C. OKONKWO'),

  -- RES003 aliases
  ('bb000001-0001-0001-0001-000000000006', 'aa000001-0001-0001-0001-000000000003', 'BABATUNDE WILLIAMS'),
  ('bb000001-0001-0001-0001-000000000007', 'aa000001-0001-0001-0001-000000000003', 'TUNDE WILLIAMS'),
  ('bb000001-0001-0001-0001-000000000008', 'aa000001-0001-0001-0001-000000000003', 'B. WILLIAMS'),

  -- RES006 aliases (multiple properties)
  ('bb000001-0001-0001-0001-000000000009', 'aa000001-0001-0001-0001-000000000006', 'FUNMILAYO OGUNDIMU'),
  ('bb000001-0001-0001-0001-000000000010', 'aa000001-0001-0001-0001-000000000006', 'FUNMI OGUNDIMU'),

  -- Corporate aliases
  ('bb000001-0001-0001-0001-000000000011', 'aa000001-0001-0001-0001-000000000051', 'ACME PROPERTIES LTD'),
  ('bb000001-0001-0001-0001-000000000012', 'aa000001-0001-0001-0001-000000000051', 'ACME PROPERTIES'),
  ('bb000001-0001-0001-0001-000000000013', 'aa000001-0001-0001-0001-000000000052', 'SUNRISE INVESTMENTS'),
  ('bb000001-0001-0001-0001-000000000014', 'aa000001-0001-0001-0001-000000000052', 'SUNRISE INV LTD')
ON CONFLICT (id) DO UPDATE SET
  alias_name = EXCLUDED.alias_name;

-- ============================================================================
-- VERIFICATION
-- ============================================================================
DO $$
DECLARE
  v_total INT;
  v_landlords INT;
  v_tenants INT;
  v_household INT;
  v_staff INT;
  v_corporate INT;
  v_aliases INT;
BEGIN
  SELECT COUNT(*) INTO v_total FROM residents WHERE resident_code LIKE 'RES0%';
  SELECT COUNT(*) INTO v_landlords FROM residents WHERE resident_code IN ('RES001','RES002','RES003','RES004','RES005','RES006','RES007','RES008','RES009','RES010','RES011','RES012','RES013','RES014','RES015','RES016','RES017','RES018','RES019','RES020');
  SELECT COUNT(*) INTO v_tenants FROM residents WHERE resident_code BETWEEN 'RES021' AND 'RES032';
  SELECT COUNT(*) INTO v_household FROM residents WHERE resident_code BETWEEN 'RES033' AND 'RES042';
  SELECT COUNT(*) INTO v_staff FROM residents WHERE resident_code BETWEEN 'RES043' AND 'RES050';
  SELECT COUNT(*) INTO v_corporate FROM residents WHERE entity_type = 'corporate' AND resident_code LIKE 'RES0%';
  SELECT COUNT(*) INTO v_aliases FROM payment_aliases;

  RAISE NOTICE 'Residents Created:';
  RAISE NOTICE '  Total Fixture Residents: %', v_total;
  RAISE NOTICE '  Landlords (owner + non-resident): %', v_landlords;
  RAISE NOTICE '  Tenants: %', v_tenants;
  RAISE NOTICE '  Household Members: %', v_household;
  RAISE NOTICE '  Domestic Staff: %', v_staff;
  RAISE NOTICE '  Corporate Entities: %', v_corporate;
  RAISE NOTICE '  Payment Aliases: %', v_aliases;
END $$;

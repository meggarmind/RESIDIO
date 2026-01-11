-- ============================================================================
-- Residio Comprehensive Seed Data
-- File: 13-notes.sql
-- Description: Notes for residents and houses (polymorphic entity notes)
-- Dependencies: 01-reference-data.sql, 02-residents.sql, 03-houses.sql
-- ============================================================================

-- ============================================================================
-- ENTITY NOTES (40 total)
-- ============================================================================
-- Entity Distribution:
--   - Resident notes: 25
--   - House notes: 15
--
-- Category Distribution (valid values: general, agreement, complaint, reminder,
--                       financial, security, maintenance, legal):
--   - general: 15
--   - financial: 10
--   - legal: 8
--   - maintenance: 7
--
-- Visibility (is_confidential):
--   - Confidential (admin only): 25
--   - Non-confidential (visible to entity): 15
-- ============================================================================

INSERT INTO entity_notes (
  id,
  entity_type,
  entity_id,
  title,
  content,
  category,
  is_confidential,
  created_by,
  created_at,
  updated_at
)
VALUES
  -- ========== RESIDENT NOTES (25) ==========

  -- RES002: Resident landlord with multiple properties - financial notes
  (
    'be000001-0001-0001-0001-000000000001'::uuid,
    'resident',
    'aa000001-0001-0001-0001-000000000002'::uuid,
    'Payment History - Excellent',
    'Excellent payment history. Always pays before due date. Owns 2 properties on Oak Avenue.',
    'financial',
    true,
    '00000000-0000-0000-0000-000000000001'::uuid,
    NOW() - INTERVAL '180 days',
    NOW() - INTERVAL '180 days'
  ),

  (
    'be000001-0001-0001-0001-000000000002'::uuid,
    'resident',
    'aa000001-0001-0001-0001-000000000002'::uuid,
    'Committee Membership',
    'Committee member since 2023. Very active in estate affairs. Contact for community events coordination.',
    'general',
    true,
    '00000000-0000-0000-0000-000000000001'::uuid,
    NOW() - INTERVAL '150 days',
    NOW() - INTERVAL '150 days'
  ),

  -- RES003: Resident with legal/compliance issues
  (
    'be000001-0001-0001-0001-000000000003'::uuid,
    'resident',
    'aa000001-0001-0001-0001-000000000003'::uuid,
    'Building Modification Warning',
    'Building modification noticed without approval. Verbal warning issued on 15th Oct 2025. Follow up required.',
    'legal',
    true,
    '00000000-0000-0000-0000-000000000001'::uuid,
    NOW() - INTERVAL '90 days',
    NOW() - INTERVAL '90 days'
  ),

  (
    'be000001-0001-0001-0001-000000000004'::uuid,
    'resident',
    'aa000001-0001-0001-0001-000000000003'::uuid,
    'Renovation Approval Follow-up',
    'Follow-up: Resident submitted renovation approval form. Under review by building committee.',
    'legal',
    true,
    '00000000-0000-0000-0000-000000000001'::uuid,
    NOW() - INTERVAL '60 days',
    NOW() - INTERVAL '60 days'
  ),

  -- RES005: Non-resident landlord
  (
    'be000001-0001-0001-0001-000000000005'::uuid,
    'resident',
    'aa000001-0001-0001-0001-000000000005'::uuid,
    'Contact Information',
    'Non-resident landlord. Property managed by caretaker Mr. James (RES045). Contact via email only.',
    'general',
    true,
    '00000000-0000-0000-0000-000000000001'::uuid,
    NOW() - INTERVAL '200 days',
    NOW() - INTERVAL '200 days'
  ),

  (
    'be000001-0001-0001-0001-000000000006'::uuid,
    'resident',
    'aa000001-0001-0001-0001-000000000005'::uuid,
    'Annual Payment Preference',
    'Prefers annual payment. Usually pays Q1 for entire year. Set reminder for January invoicing.',
    'financial',
    true,
    '00000000-0000-0000-0000-000000000001'::uuid,
    NOW() - INTERVAL '120 days',
    NOW() - INTERVAL '120 days'
  ),

  -- RES010: Tenant with history
  (
    'be000001-0001-0001-0001-000000000007'::uuid,
    'resident',
    'aa000001-0001-0001-0001-000000000010'::uuid,
    'Tenant Commendation',
    'Long-term tenant (3+ years). Very cooperative. Reports maintenance issues promptly.',
    'general',
    false,
    '00000000-0000-0000-0000-000000000001'::uuid,
    NOW() - INTERVAL '100 days',
    NOW() - INTERVAL '100 days'
  ),

  -- RES015: Household member
  (
    'be000001-0001-0001-0001-000000000008'::uuid,
    'resident',
    'aa000001-0001-0001-0001-000000000015'::uuid,
    'Household Member Authorization',
    'Household member (spouse) of RES002. Can make payments on behalf of primary resident.',
    'general',
    true,
    '00000000-0000-0000-0000-000000000001'::uuid,
    NOW() - INTERVAL '180 days',
    NOW() - INTERVAL '180 days'
  ),

  -- RES020: Resident with payment issues
  (
    'be000001-0001-0001-0001-000000000009'::uuid,
    'resident',
    'aa000001-0001-0001-0001-000000000020'::uuid,
    'Payment Plan Agreement',
    'Frequent late payments. Payment plan agreed: 50% on due date, 50% within 2 weeks. Monitor closely.',
    'financial',
    true,
    '00000000-0000-0000-0000-000000000001'::uuid,
    NOW() - INTERVAL '90 days',
    NOW() - INTERVAL '30 days'
  ),

  (
    'be000001-0001-0001-0001-000000000010'::uuid,
    'resident',
    'aa000001-0001-0001-0001-000000000020'::uuid,
    'Payment Plan Progress',
    'Dec 2025 payment received in full. Payment plan working well. Continue monitoring.',
    'financial',
    true,
    '00000000-0000-0000-0000-000000000001'::uuid,
    NOW() - INTERVAL '15 days',
    NOW() - INTERVAL '15 days'
  ),

  -- RES025: Developer with unsold units
  (
    'be000001-0001-0001-0001-000000000011'::uuid,
    'resident',
    'aa000001-0001-0001-0001-000000000025'::uuid,
    'Developer Account Info',
    'Developer (Maple Properties Ltd). Owns 3 unsold units on Maple Drive. Corporate account - invoice to company address.',
    'general',
    true,
    '00000000-0000-0000-0000-000000000001'::uuid,
    NOW() - INTERVAL '250 days',
    NOW() - INTERVAL '250 days'
  ),

  (
    'be000001-0001-0001-0001-000000000012'::uuid,
    'resident',
    'aa000001-0001-0001-0001-000000000025'::uuid,
    'Development Levy Negotiation',
    'Development levy outstanding for 2 units. Negotiating payment schedule. Meeting scheduled for Jan 15.',
    'financial',
    true,
    '00000000-0000-0000-0000-000000000001'::uuid,
    NOW() - INTERVAL '30 days',
    NOW() - INTERVAL '30 days'
  ),

  -- RES030: Domestic staff
  (
    'be000001-0001-0001-0001-000000000013'::uuid,
    'resident',
    'aa000001-0001-0001-0001-000000000030'::uuid,
    'Staff Registration',
    'Live-in domestic staff for RES002. Gate access confirmed. ID verification completed Dec 2025.',
    'general',
    true,
    '00000000-0000-0000-0000-000000000001'::uuid,
    NOW() - INTERVAL '45 days',
    NOW() - INTERVAL '45 days'
  ),

  -- RES035: Caretaker
  (
    'be000001-0001-0001-0001-000000000014'::uuid,
    'resident',
    'aa000001-0001-0001-0001-000000000035'::uuid,
    'Caretaker Authorization',
    'Caretaker for PALM-08. Authorized to receive deliveries and handle minor maintenance. Contact landlord for major issues.',
    'general',
    false,
    '00000000-0000-0000-0000-000000000001'::uuid,
    NOW() - INTERVAL '150 days',
    NOW() - INTERVAL '150 days'
  ),

  -- RES040: New resident
  (
    'be000001-0001-0001-0001-000000000015'::uuid,
    'resident',
    'aa000001-0001-0001-0001-000000000040'::uuid,
    'Welcome - New Resident',
    'New resident. Moved in Nov 2025. Registration complete. Welcome pack delivered.',
    'general',
    false,
    '00000000-0000-0000-0000-000000000001'::uuid,
    NOW() - INTERVAL '60 days',
    NOW() - INTERVAL '60 days'
  ),

  (
    'be000001-0001-0001-0001-000000000016'::uuid,
    'resident',
    'aa000001-0001-0001-0001-000000000040'::uuid,
    'Registration Fee Waiver',
    'First invoice issued for Dec 2025. Registration fee waived as part of promotion.',
    'financial',
    true,
    '00000000-0000-0000-0000-000000000001'::uuid,
    NOW() - INTERVAL '50 days',
    NOW() - INTERVAL '50 days'
  ),

  -- RES045: Resident with disputes
  (
    'be000001-0001-0001-0001-000000000017'::uuid,
    'resident',
    'aa000001-0001-0001-0001-000000000045'::uuid,
    'Boundary Dispute',
    'Boundary dispute with neighbor (RES046). Mediation attempted. Referred to legal committee.',
    'legal',
    true,
    '00000000-0000-0000-0000-000000000001'::uuid,
    NOW() - INTERVAL '75 days',
    NOW() - INTERVAL '75 days'
  ),

  (
    'be000001-0001-0001-0001-000000000018'::uuid,
    'resident',
    'aa000001-0001-0001-0001-000000000045'::uuid,
    'Boundary Dispute Resolution',
    'Legal committee decision: Boundary markers to be reinstalled. Both parties agreed. Case closed.',
    'legal',
    true,
    '00000000-0000-0000-0000-000000000001'::uuid,
    NOW() - INTERVAL '30 days',
    NOW() - INTERVAL '30 days'
  ),

  -- More resident notes for variety
  (
    'be000001-0001-0001-0001-000000000019'::uuid,
    'resident',
    'aa000001-0001-0001-0001-000000000004'::uuid,
    'Advance Payment Credit',
    'Consistently overpays. Wallet balance of ₦45,000 from advance payments. Prefers credit to be applied automatically.',
    'financial',
    true,
    '00000000-0000-0000-0000-000000000001'::uuid,
    NOW() - INTERVAL '90 days',
    NOW() - INTERVAL '90 days'
  ),

  (
    'be000001-0001-0001-0001-000000000020'::uuid,
    'resident',
    'aa000001-0001-0001-0001-000000000006'::uuid,
    'Security Committee Member',
    'Security committee member. Coordinates night patrol scheduling. Key contact for security matters.',
    'security',
    true,
    '00000000-0000-0000-0000-000000000001'::uuid,
    NOW() - INTERVAL '200 days',
    NOW() - INTERVAL '200 days'
  ),

  (
    'be000001-0001-0001-0001-000000000021'::uuid,
    'resident',
    'aa000001-0001-0001-0001-000000000007'::uuid,
    'Drainage Issue Report',
    'Reported recurring drainage issue. Maintenance team investigating. May require street-level works.',
    'maintenance',
    false,
    '00000000-0000-0000-0000-000000000001'::uuid,
    NOW() - INTERVAL '20 days',
    NOW() - INTERVAL '20 days'
  ),

  (
    'be000001-0001-0001-0001-000000000022'::uuid,
    'resident',
    'aa000001-0001-0001-0001-000000000008'::uuid,
    'Special Assistance Required',
    'Elderly resident. Requires assistance with online portal. Daughter (household member RES018) handles digital communications.',
    'general',
    true,
    '00000000-0000-0000-0000-000000000001'::uuid,
    NOW() - INTERVAL '120 days',
    NOW() - INTERVAL '120 days'
  ),

  (
    'be000001-0001-0001-0001-000000000023'::uuid,
    'resident',
    'aa000001-0001-0001-0001-000000000009'::uuid,
    'Parking Violation Warning',
    'Parking violation warning issued. Vehicle blocking communal area. Second warning.',
    'legal',
    true,
    '00000000-0000-0000-0000-000000000001'::uuid,
    NOW() - INTERVAL '45 days',
    NOW() - INTERVAL '45 days'
  ),

  (
    'be000001-0001-0001-0001-000000000024'::uuid,
    'resident',
    'aa000001-0001-0001-0001-000000000011'::uuid,
    'Corporate Billing Info',
    'Corporate tenant. Invoice to company: TechStart Nigeria Ltd. VAT registration confirmed.',
    'financial',
    true,
    '00000000-0000-0000-0000-000000000001'::uuid,
    NOW() - INTERVAL '180 days',
    NOW() - INTERVAL '180 days'
  ),

  (
    'be000001-0001-0001-0001-000000000025'::uuid,
    'resident',
    'aa000001-0001-0001-0001-000000000012'::uuid,
    'Garden Committee Volunteer',
    'Volunteered for garden maintenance committee. Coordinates landscaping schedule for Cedar Lane.',
    'maintenance',
    false,
    '00000000-0000-0000-0000-000000000001'::uuid,
    NOW() - INTERVAL '100 days',
    NOW() - INTERVAL '100 days'
  ),

  -- ========== HOUSE NOTES (15) ==========

  -- OAK-01
  (
    'be000001-0001-0001-0001-000000000026'::uuid,
    'house',
    'bb000001-0001-0001-0001-000000000001'::uuid,
    'Property Overview',
    'Corner plot with extra parking space. Original owner since estate inception.',
    'general',
    true,
    '00000000-0000-0000-0000-000000000001'::uuid,
    NOW() - INTERVAL '300 days',
    NOW() - INTERVAL '300 days'
  ),

  -- OAK-02
  (
    'be000001-0001-0001-0001-000000000027'::uuid,
    'house',
    'bb000001-0001-0001-0001-000000000002'::uuid,
    'Roof Repair Warranty',
    'Roof repair completed Sept 2025. 5-year warranty from contractor (ABC Roofing). Documents filed.',
    'maintenance',
    true,
    '00000000-0000-0000-0000-000000000001'::uuid,
    NOW() - INTERVAL '120 days',
    NOW() - INTERVAL '120 days'
  ),

  -- OAK-05 (Duplex)
  (
    'be000001-0001-0001-0001-000000000028'::uuid,
    'house',
    'bb000001-0001-0001-0001-000000000005'::uuid,
    'Duplex Property Info',
    'Duplex property (5A/5B). plot_count = 2. Premium billing rate applies. Two separate meters installed.',
    'general',
    true,
    '00000000-0000-0000-0000-000000000001'::uuid,
    NOW() - INTERVAL '250 days',
    NOW() - INTERVAL '250 days'
  ),

  -- PALM-03
  (
    'be000001-0001-0001-0001-000000000029'::uuid,
    'house',
    'bb000001-0001-0001-0001-000000000011'::uuid,
    'Fence Extension Notice',
    'Unauthorized fence extension. Notice served. Resident has 30 days to rectify or submit retrospective approval.',
    'legal',
    true,
    '00000000-0000-0000-0000-000000000001'::uuid,
    NOW() - INTERVAL '45 days',
    NOW() - INTERVAL '45 days'
  ),

  -- PALM-05
  (
    'be000001-0001-0001-0001-000000000030'::uuid,
    'house',
    'bb000001-0001-0001-0001-000000000013'::uuid,
    'Water Damage Report',
    'Water damage to external wall reported. Drainage issue from neighboring plot identified. Joint repair scheduled.',
    'maintenance',
    false,
    '00000000-0000-0000-0000-000000000001'::uuid,
    NOW() - INTERVAL '30 days',
    NOW() - INTERVAL '30 days'
  ),

  -- PALM-08 (Vacant)
  (
    'be000001-0001-0001-0001-000000000031'::uuid,
    'house',
    'bb000001-0001-0001-0001-000000000016'::uuid,
    'Vacant Property Status',
    'Vacant property. Owner abroad. Caretaker (RES035) on-site for security. Monthly inspection by estate.',
    'general',
    true,
    '00000000-0000-0000-0000-000000000001'::uuid,
    NOW() - INTERVAL '150 days',
    NOW() - INTERVAL '150 days'
  ),

  -- PALM-10 (Multi-resident)
  (
    'be000001-0001-0001-0001-000000000032'::uuid,
    'house',
    'bb000001-0001-0001-0001-000000000018'::uuid,
    'Household Composition',
    'Multi-resident household: Landlord + spouse + 2 children + domestic staff. Total 5 persons registered.',
    'general',
    true,
    '00000000-0000-0000-0000-000000000001'::uuid,
    NOW() - INTERVAL '180 days',
    NOW() - INTERVAL '180 days'
  ),

  -- CED-01
  (
    'be000001-0001-0001-0001-000000000033'::uuid,
    'house',
    'bb000001-0001-0001-0001-000000000019'::uuid,
    'Ownership History',
    'Property has had 3 ownership transfers since 2020. Current owner since May 2025. Full title documentation verified.',
    'general',
    true,
    '00000000-0000-0000-0000-000000000001'::uuid,
    NOW() - INTERVAL '240 days',
    NOW() - INTERVAL '240 days'
  ),

  -- CED-03
  (
    'be000001-0001-0001-0001-000000000034'::uuid,
    'house',
    'bb000001-0001-0001-0001-000000000021'::uuid,
    'Septic Tank Maintenance',
    'Septic tank pumped Nov 2025. Next scheduled maintenance: Nov 2026. Contractor: CleanFlow Services.',
    'maintenance',
    false,
    '00000000-0000-0000-0000-000000000001'::uuid,
    NOW() - INTERVAL '60 days',
    NOW() - INTERVAL '60 days'
  ),

  -- MAP-01 (New development)
  (
    'be000001-0001-0001-0001-000000000035'::uuid,
    'house',
    'bb000001-0001-0001-0001-000000000024'::uuid,
    'New Development Unit',
    'New development unit. Completed Dec 2025. Developer-owned (Maple Properties). Development levy: PAID. Marketing for sale.',
    'general',
    true,
    '00000000-0000-0000-0000-000000000001'::uuid,
    NOW() - INTERVAL '30 days',
    NOW() - INTERVAL '30 days'
  ),

  -- MAP-02 (New development)
  (
    'be000001-0001-0001-0001-000000000036'::uuid,
    'house',
    'bb000001-0001-0001-0001-000000000025'::uuid,
    'Development Levy Balance',
    'Development levy outstanding. 60% paid. Balance of ₦200,000 due by Feb 2026. Payment plan agreed.',
    'financial',
    true,
    '00000000-0000-0000-0000-000000000001'::uuid,
    NOW() - INTERVAL '45 days',
    NOW() - INTERVAL '45 days'
  ),

  -- Commercial unit
  (
    'be000001-0001-0001-0001-000000000037'::uuid,
    'house',
    'bb000001-0001-0001-0001-000000000026'::uuid,
    'Commercial Operations',
    'Commercial unit. Business operating hours: 8am-6pm Mon-Sat. No Sunday operations per estate rules. Compliant.',
    'legal',
    true,
    '00000000-0000-0000-0000-000000000001'::uuid,
    NOW() - INTERVAL '200 days',
    NOW() - INTERVAL '200 days'
  ),

  (
    'be000001-0001-0001-0001-000000000038'::uuid,
    'house',
    'bb000001-0001-0001-0001-000000000026'::uuid,
    'Commercial Billing Details',
    'Commercial billing rate: ₦50,000/month. Paid via standing order. Account: GTBank 0123456789.',
    'financial',
    true,
    '00000000-0000-0000-0000-000000000001'::uuid,
    NOW() - INTERVAL '180 days',
    NOW() - INTERVAL '180 days'
  ),

  -- OAK-08
  (
    'be000001-0001-0001-0001-000000000039'::uuid,
    'house',
    'bb000001-0001-0001-0001-000000000008'::uuid,
    'Generator Installation Approval',
    'Generator installation approved. Soundproofing requirements met. Inspection passed Oct 2025.',
    'maintenance',
    false,
    '00000000-0000-0000-0000-000000000001'::uuid,
    NOW() - INTERVAL '90 days',
    NOW() - INTERVAL '90 days'
  ),

  -- PALM-01
  (
    'be000001-0001-0001-0001-000000000040'::uuid,
    'house',
    'bb000001-0001-0001-0001-000000000009'::uuid,
    'Swimming Pool Compliance',
    'Swimming pool installed 2024. Safety compliance certificate on file. Annual inspection due March 2026.',
    'general',
    true,
    '00000000-0000-0000-0000-000000000001'::uuid,
    NOW() - INTERVAL '150 days',
    NOW() - INTERVAL '150 days'
  )
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title,
  content = EXCLUDED.content,
  category = EXCLUDED.category,
  is_confidential = EXCLUDED.is_confidential,
  updated_at = NOW();


-- ============================================================================
-- VERIFICATION
-- ============================================================================
DO $$
DECLARE
  v_total INT;
  v_resident_notes INT;
  v_house_notes INT;
  v_general INT;
  v_financial INT;
  v_legal INT;
  v_maintenance INT;
  v_security INT;
  v_confidential INT;
  v_public INT;
BEGIN
  SELECT COUNT(*) INTO v_total FROM entity_notes WHERE id::text LIKE 'be000001%';
  SELECT COUNT(*) INTO v_resident_notes FROM entity_notes WHERE id::text LIKE 'be000001%' AND entity_type = 'resident';
  SELECT COUNT(*) INTO v_house_notes FROM entity_notes WHERE id::text LIKE 'be000001%' AND entity_type = 'house';

  SELECT COUNT(*) INTO v_general FROM entity_notes WHERE id::text LIKE 'be000001%' AND category = 'general';
  SELECT COUNT(*) INTO v_financial FROM entity_notes WHERE id::text LIKE 'be000001%' AND category = 'financial';
  SELECT COUNT(*) INTO v_legal FROM entity_notes WHERE id::text LIKE 'be000001%' AND category = 'legal';
  SELECT COUNT(*) INTO v_maintenance FROM entity_notes WHERE id::text LIKE 'be000001%' AND category = 'maintenance';
  SELECT COUNT(*) INTO v_security FROM entity_notes WHERE id::text LIKE 'be000001%' AND category = 'security';

  SELECT COUNT(*) INTO v_confidential FROM entity_notes WHERE id::text LIKE 'be000001%' AND is_confidential = true;
  SELECT COUNT(*) INTO v_public FROM entity_notes WHERE id::text LIKE 'be000001%' AND is_confidential = false;

  RAISE NOTICE '';
  RAISE NOTICE '=== Notes Fixture Verification ===';
  RAISE NOTICE 'Total Notes: % (target: 40)', v_total;
  RAISE NOTICE '  By Entity Type:';
  RAISE NOTICE '    - Resident notes: % (target: 25)', v_resident_notes;
  RAISE NOTICE '    - House notes: % (target: 15)', v_house_notes;
  RAISE NOTICE '  By Category:';
  RAISE NOTICE '    - General: %', v_general;
  RAISE NOTICE '    - Financial: %', v_financial;
  RAISE NOTICE '    - Legal: %', v_legal;
  RAISE NOTICE '    - Maintenance: %', v_maintenance;
  RAISE NOTICE '    - Security: %', v_security;
  RAISE NOTICE '  By Visibility:';
  RAISE NOTICE '    - Confidential: % (target: ~25)', v_confidential;
  RAISE NOTICE '    - Public: % (target: ~15)', v_public;
  RAISE NOTICE '==================================';
END $$;

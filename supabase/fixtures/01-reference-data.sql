-- ============================================================================
-- FIXTURE: Reference Data
-- Streets, House Types, Security Contact Categories, Document Categories,
-- Announcement Categories, Transaction Tags
-- ============================================================================

-- ============================================================================
-- STREETS (5 total)
-- ============================================================================
INSERT INTO public.streets (id, name, short_name, description) VALUES
  ('11111111-0001-0001-0001-000000000001', 'Oak Avenue', 'OAK', 'Main residential street with 10 houses'),
  ('11111111-0001-0001-0001-000000000002', 'Palm Close', 'PALM', 'Quiet cul-de-sac with 8 houses'),
  ('11111111-0001-0001-0001-000000000003', 'Cedar Lane', 'CED', 'Premium location with 5 houses'),
  ('11111111-0001-0001-0001-000000000004', 'Maple Drive', 'MAP', 'New development area with 2 houses'),
  ('11111111-0001-0001-0001-000000000005', 'Baobab Street', 'BAO', 'Test street for development')
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  short_name = EXCLUDED.short_name,
  description = EXCLUDED.description;

-- ============================================================================
-- HOUSE TYPES (4 total)
-- ============================================================================
INSERT INTO public.house_types (id, name, description) VALUES
  ('22222222-0002-0002-0002-000000000001', 'Standard 3BR', 'Standard 3-bedroom residence'),
  ('22222222-0002-0002-0002-000000000002', 'Duplex 4BR', 'Duplex with 4 bedrooms'),
  ('22222222-0002-0002-0002-000000000003', 'Penthouse 5BR', 'Premium penthouse with 5 bedrooms'),
  ('22222222-0002-0002-0002-000000000004', 'Commercial Unit', 'Commercial property unit')
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description;

-- ============================================================================
-- SECURITY CONTACT CATEGORIES (5 total)
-- ============================================================================
INSERT INTO public.security_contact_categories (id, name, description, default_validity_days) VALUES
  ('33333333-0003-0003-0003-000000000001', 'Family Visitor', 'Family members and close relatives visiting', 365),
  ('33333333-0003-0003-0003-000000000002', 'Contractor', 'Construction workers and service providers', 90),
  ('33333333-0003-0003-0003-000000000003', 'Delivery Service', 'Regular delivery personnel', 30),
  ('33333333-0003-0003-0003-000000000004', 'Domestic Staff', 'Household staff with regular access', 365),
  ('33333333-0003-0003-0003-000000000005', 'Estate Worker', 'Estate maintenance and service staff', 365)
ON CONFLICT (name) DO UPDATE SET
  description = EXCLUDED.description,
  default_validity_days = EXCLUDED.default_validity_days;

-- ============================================================================
-- DOCUMENT CATEGORIES (5 total)
-- ============================================================================
INSERT INTO public.document_categories (id, name, description, is_resident_accessible) VALUES
  ('44444444-0004-0004-0004-000000000001', 'Estate Rules', 'Estate bylaws and regulations', true),
  ('44444444-0004-0004-0004-000000000002', 'Financial Reports', 'Monthly and annual financial statements', true),
  ('44444444-0004-0004-0004-000000000003', 'Meeting Minutes', 'AGM and board meeting minutes', true),
  ('44444444-0004-0004-0004-000000000004', 'Legal Documents', 'Contracts and legal agreements', false),
  ('44444444-0004-0004-0004-000000000005', 'Forms & Templates', 'Application forms and templates', true)
ON CONFLICT (name) DO UPDATE SET
  description = EXCLUDED.description,
  is_resident_accessible = EXCLUDED.is_resident_accessible;

-- ============================================================================
-- ANNOUNCEMENT CATEGORIES (4 total)
-- ============================================================================
INSERT INTO public.announcement_categories (id, name, slug, description, color, icon, display_order) VALUES
  ('55555555-0005-0005-0005-000000000001', 'General Notice', 'general-notice', 'General estate announcements', '#3B82F6', 'megaphone', 10),
  ('55555555-0005-0005-0005-000000000002', 'Financial', 'financial', 'Billing and payment notices', '#10B981', 'banknotes', 11),
  ('55555555-0005-0005-0005-000000000003', 'Security Alert', 'security-alert', 'Security-related announcements', '#EF4444', 'shield-alert', 12),
  ('55555555-0005-0005-0005-000000000004', 'Estate Updates', 'estate-updates', 'General estate maintenance and updates', '#F59E0B', 'wrench', 13)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  color = EXCLUDED.color,
  icon = EXCLUDED.icon,
  display_order = EXCLUDED.display_order;

-- ============================================================================
-- TRANSACTION TAGS (8 total)
-- ============================================================================
INSERT INTO public.transaction_tags (id, name, transaction_type, description, color, keywords) VALUES
  ('66666666-0006-0006-0006-000000000001', 'Service Charge', 'debit', 'Monthly service charge payments', '#3B82F6', ARRAY['service charge', 'monthly dues', 'estate levy']),
  ('66666666-0006-0006-0006-000000000002', 'Security Levy', 'debit', 'Security and surveillance fees', '#EF4444', ARRAY['security', 'guard', 'surveillance']),
  ('66666666-0006-0006-0006-000000000003', 'Development Levy', 'debit', 'Infrastructure development contributions', '#8B5CF6', ARRAY['development', 'infrastructure', 'capital']),
  ('66666666-0006-0006-0006-000000000004', 'Water Bill', 'debit', 'Water supply payments', '#06B6D4', ARRAY['water', 'borehole', 'supply']),
  ('66666666-0006-0006-0006-000000000005', 'Electricity', 'debit', 'Power-related payments', '#F59E0B', ARRAY['electricity', 'power', 'transformer', 'nepa']),
  ('66666666-0006-0006-0006-000000000006', 'Sanitation', 'debit', 'Waste management fees', '#10B981', ARRAY['sanitation', 'waste', 'refuse', 'garbage']),
  ('66666666-0006-0006-0006-000000000007', 'Late Fee', 'debit', 'Penalties for late payment', '#DC2626', ARRAY['late fee', 'penalty', 'interest']),
  ('66666666-0006-0006-0006-000000000008', 'Miscellaneous', 'debit', 'Other uncategorized payments', '#6B7280', ARRAY['misc', 'other', 'sundry'])
ON CONFLICT (name) DO UPDATE SET
  transaction_type = EXCLUDED.transaction_type,
  description = EXCLUDED.description,
  color = EXCLUDED.color,
  keywords = EXCLUDED.keywords;

-- ============================================================================
-- NOTIFICATION CATEGORIES (seed if table exists)
-- ============================================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'notification_categories') THEN
    INSERT INTO public.notification_categories (id, name, description) VALUES
      ('77777777-0007-0007-0007-000000000001', 'billing', 'Billing and payment notifications'),
      ('77777777-0007-0007-0007-000000000002', 'security', 'Security alerts and updates'),
      ('77777777-0007-0007-0007-000000000003', 'announcements', 'General announcements'),
      ('77777777-0007-0007-0007-000000000004', 'system', 'System notifications')
    ON CONFLICT (id) DO NOTHING;
  END IF;
END $$;

-- ============================================================================
-- VERIFICATION
-- ============================================================================
DO $$
DECLARE
  v_streets INT;
  v_house_types INT;
  v_sec_cats INT;
  v_doc_cats INT;
  v_ann_cats INT;
  v_tags INT;
BEGIN
  SELECT COUNT(*) INTO v_streets FROM streets;
  SELECT COUNT(*) INTO v_house_types FROM house_types;
  SELECT COUNT(*) INTO v_sec_cats FROM security_contact_categories;
  SELECT COUNT(*) INTO v_doc_cats FROM document_categories;
  SELECT COUNT(*) INTO v_ann_cats FROM announcement_categories;
  SELECT COUNT(*) INTO v_tags FROM transaction_tags;

  RAISE NOTICE 'Reference Data Created:';
  RAISE NOTICE '  Streets: %', v_streets;
  RAISE NOTICE '  House Types: %', v_house_types;
  RAISE NOTICE '  Security Categories: %', v_sec_cats;
  RAISE NOTICE '  Document Categories: %', v_doc_cats;
  RAISE NOTICE '  Announcement Categories: %', v_ann_cats;
  RAISE NOTICE '  Transaction Tags: %', v_tags;
END $$;

-- Seed file for Residio database
-- This file will be used to populate initial data

-- Create test users for each role
-- Password for all test users: password123

-- Admin user
INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at,
  raw_user_meta_data, confirmation_token, recovery_token,
  email_change_token_new, email_change
) VALUES (
  '00000000-0000-0000-0000-000000000000',
  'a1111111-1111-1111-1111-111111111111',
  'authenticated', 'authenticated',
  'admin@residio.test',
  crypt('password123', gen_salt('bf')),
  NOW(), NOW(), NOW(),
  '{"full_name": "Admin User", "role": "admin"}',
  '', '', '', ''
);

-- Chairman user
INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at,
  raw_user_meta_data, confirmation_token, recovery_token,
  email_change_token_new, email_change
) VALUES (
  '00000000-0000-0000-0000-000000000000',
  'b2222222-2222-2222-2222-222222222222',
  'authenticated', 'authenticated',
  'chairman@residio.test',
  crypt('password123', gen_salt('bf')),
  NOW(), NOW(), NOW(),
  '{"full_name": "Chairman User", "role": "chairman"}',
  '', '', '', ''
);

-- Financial Secretary user
INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at,
  raw_user_meta_data, confirmation_token, recovery_token,
  email_change_token_new, email_change
) VALUES (
  '00000000-0000-0000-0000-000000000000',
  'c3333333-3333-3333-3333-333333333333',
  'authenticated', 'authenticated',
  'finance@residio.test',
  crypt('password123', gen_salt('bf')),
  NOW(), NOW(), NOW(),
  '{"full_name": "Finance Secretary", "role": "financial_secretary"}',
  '', '', '', ''
);

-- Security Officer user
INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at,
  raw_user_meta_data, confirmation_token, recovery_token,
  email_change_token_new, email_change
) VALUES (
  '00000000-0000-0000-0000-000000000000',
  'd4444444-4444-4444-4444-444444444444',
  'authenticated', 'authenticated',
  'security@residio.test',
  crypt('password123', gen_salt('bf')),
  NOW(), NOW(), NOW(),
  '{"full_name": "Security Officer", "role": "security_officer"}',
  '', '', '', ''
);

-- Create identity records for each user (required for auth.uid() to work in RLS)
INSERT INTO auth.identities (
  id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
) VALUES (
  'a1111111-1111-1111-1111-111111111111',
  'a1111111-1111-1111-1111-111111111111',
  '{"sub": "a1111111-1111-1111-1111-111111111111", "email": "admin@residio.test", "email_verified": true}',
  'email', 'a1111111-1111-1111-1111-111111111111', NOW(), NOW(), NOW()
);

INSERT INTO auth.identities (
  id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
) VALUES (
  'b2222222-2222-2222-2222-222222222222',
  'b2222222-2222-2222-2222-222222222222',
  '{"sub": "b2222222-2222-2222-2222-222222222222", "email": "chairman@residio.test", "email_verified": true}',
  'email', 'b2222222-2222-2222-2222-222222222222', NOW(), NOW(), NOW()
);

INSERT INTO auth.identities (
  id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
) VALUES (
  'c3333333-3333-3333-3333-333333333333',
  'c3333333-3333-3333-3333-333333333333',
  '{"sub": "c3333333-3333-3333-3333-333333333333", "email": "finance@residio.test", "email_verified": true}',
  'email', 'c3333333-3333-3333-3333-333333333333', NOW(), NOW(), NOW()
);

INSERT INTO auth.identities (
  id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
) VALUES (
  'd4444444-4444-4444-4444-444444444444',
  'd4444444-4444-4444-4444-444444444444',
  '{"sub": "d4444444-4444-4444-4444-444444444444", "email": "security@residio.test", "email_verified": true}',
  'email', 'd4444444-4444-4444-4444-444444444444', NOW(), NOW(), NOW()
);

-- Note: The profiles will be auto-created by the trigger on auth.users insert

-- ============================================================================
-- TEST DATA: Super Resident
-- Email: resident@residio.test
-- Password: password123
-- ============================================================================

DO $$
DECLARE
  v_user_id UUID := '55555555-5555-5555-5555-555555555555';
  v_resident_id UUID := '66666666-6666-6666-6666-666666666666';
  v_street_id UUID := '77777777-7777-7777-7777-777777777777';
  v_house_type_id UUID := '88888888-8888-8888-8888-888888888888';
  v_billing_profile_id UUID := '99999999-9999-9999-9999-999999999999';
  v_house1_id UUID := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  v_house2_id UUID := 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  v_invoice1_id UUID := 'cccccccc-cccc-cccc-cccc-cccccccccccc';
  v_invoice2_id UUID := 'dddddddd-dddd-dddd-dddd-dddddddddddd';
  v_visitor_cat_id UUID;
BEGIN

  -- 1. Create Auth User
  INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, created_at, updated_at,
    raw_user_meta_data
  ) VALUES (
    '00000000-0000-0000-0000-000000000000',
    v_user_id,
    'authenticated', 'authenticated',
    'resident@residio.test',
    crypt('password123', gen_salt('bf')),
    NOW(), NOW(), NOW(),
    '{"full_name": "Test Resident", "role": "security_officer"}'
  ) ON CONFLICT (id) DO NOTHING;

  -- 2. Create Identity
  INSERT INTO auth.identities (
    id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
  ) VALUES (
    v_user_id,
    v_user_id,
    jsonb_build_object('sub', v_user_id, 'email', 'resident@residio.test', 'email_verified', true),
    'email', v_user_id, NOW(), NOW(), NOW()
  ) ON CONFLICT (id) DO NOTHING;

  -- 3. Create Resident
  INSERT INTO public.residents (
    id, resident_code, first_name, last_name, email, phone_primary,
    resident_type, verification_status, account_status
  ) VALUES (
    v_resident_id,
    'RES999', 'Test', 'Resident', 'resident@residio.test', '+2348000000001',
    'primary', 'verified', 'active'
  ) ON CONFLICT (id) DO NOTHING;

  -- 4. Link Profile (The profile exists because auth.users trigger fired on step 1)
  UPDATE public.profiles
  SET resident_id = v_resident_id
  WHERE id = v_user_id;

  -- 5. Street
  INSERT INTO public.streets (id, name) VALUES (v_street_id, 'Main Street') ON CONFLICT (id) DO NOTHING;

  -- 6. Billing Profile & House Type
  INSERT INTO public.billing_profiles (id, name, description) 
  VALUES (v_billing_profile_id, 'Standard Residential', 'Default billing')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.house_types (id, name, billing_profile_id) 
  VALUES (v_house_type_id, 'Duplex', v_billing_profile_id)
  ON CONFLICT (id) DO NOTHING;

  -- 7. Houses
  INSERT INTO public.houses (id, house_number, street_id, house_type_id, is_active)
  VALUES (v_house1_id, '1', v_street_id, v_house_type_id, true)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.houses (id, house_number, street_id, house_type_id, is_active)
  VALUES (v_house2_id, '2', v_street_id, v_house_type_id, true)
  ON CONFLICT (id) DO NOTHING;

  -- 8. Resident Houses
  INSERT INTO public.resident_houses (resident_id, house_id, resident_role, is_primary)
  VALUES (v_resident_id, v_house1_id, 'landlord', true)
  ON CONFLICT (resident_id, house_id) DO NOTHING;

  INSERT INTO public.resident_houses (resident_id, house_id, resident_role, is_primary)
  VALUES (v_resident_id, v_house2_id, 'tenant', false)
  ON CONFLICT (resident_id, house_id) DO NOTHING;

  -- 9. Wallet
  INSERT INTO public.resident_wallets (resident_id, balance)
  VALUES (v_resident_id, 50000.00)
  ON CONFLICT (resident_id) DO UPDATE SET balance = 50000.00;

  -- 10. Invoices
  INSERT INTO public.invoices (id, resident_id, invoice_number, amount_due, amount_paid, status, due_date)
  VALUES (v_invoice1_id, v_resident_id, 'INV-TEST-001', 25000, 25000, 'paid', NOW() - INTERVAL '30 days')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.invoices (id, resident_id, invoice_number, amount_due, amount_paid, status, due_date)
  VALUES (v_invoice2_id, v_resident_id, 'INV-TEST-002', 15000, 0, 'unpaid', NOW() + INTERVAL '7 days')
  ON CONFLICT (id) DO NOTHING;

  -- 11. Invoice Items
  INSERT INTO public.invoice_items (invoice_id, description, amount)
  VALUES (v_invoice1_id, 'Service Charge - Jan', 25000);
  
  INSERT INTO public.invoice_items (invoice_id, description, amount)
  VALUES (v_invoice2_id, 'Security Levy - Feb', 15000);

  -- 12. Security Contacts
  SELECT id INTO v_visitor_cat_id FROM public.security_contact_categories WHERE name = 'Visitor' LIMIT 1;
  
  -- Fallback if not exists (though migration should have inserted it)
  IF v_visitor_cat_id IS NULL THEN
     INSERT INTO security_contact_categories (name, description) VALUES ('Visitor', 'Guest') RETURNING id INTO v_visitor_cat_id;
  END IF;

  INSERT INTO public.security_contacts (resident_id, category_id, full_name, phone_primary, status)
  VALUES (v_resident_id, v_visitor_cat_id, 'John Visitor', '08012345678', 'active');

  -- 13. Announcements
  INSERT INTO public.announcements (title, content, status, published_at, target_audience)
  VALUES ('Welcome to Residio', 'This is a test announcement for the resident portal.', 'published', NOW(), 'all');

END $$;

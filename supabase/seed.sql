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

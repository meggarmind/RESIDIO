#!/usr/bin/env node
/**
 * Seed the well-known test accounts into a Supabase project.
 *
 * ⚠️  LOCAL / TEST ENVIRONMENTS ONLY. These accounts use a password published in
 * this repository. Never run this against production or any internet-reachable
 * database.
 *
 * Credentials are read from the environment (.env.local is loaded
 * automatically). The service role key bypasses every RLS policy and must never
 * be committed — an earlier version of this file had one hardcoded.
 *
 * Usage:
 *   node scripts/seed-users.mjs
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

function loadEnvLocal() {
  const path = resolve(process.cwd(), '.env.local');
  if (!existsSync(path)) return;

  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!match) continue;
    const [, key, rawValue] = match;
    if (process.env[key] !== undefined) continue;
    process.env[key] = rawValue.replace(/^["']|["']$/g, '');
  }
}

loadEnvLocal();

const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL_CLOUD || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY_CLOUD || process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error(
    'Missing NEXT_PUBLIC_SUPABASE_URL_CLOUD / SUPABASE_SERVICE_ROLE_KEY_CLOUD.\n' +
      'Set them in .env.local or export them before running.'
  );
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

// roleName is the app_roles.name to assign. The deprecated profiles.role
// column is gone (#193); role_id is the only role a seeded account carries.
const testUsers = [
  { email: 'admin@residio.test', password: 'password123', roleName: 'super_admin' },
  { email: 'chairman@residio.test', password: 'password123', roleName: 'chairman' },
  { email: 'finance@residio.test', password: 'password123', roleName: 'financial_officer' },
  { email: 'security@residio.test', password: 'password123', roleName: 'security_officer' },
];

async function seedUsers() {
  console.log('\nSeeding test users');
  console.log(`Project: ${supabaseUrl}\n`);

  // Resolve role ids up front. handle_new_user() deliberately ignores any role
  // in user_metadata (it is client-supplied in real signups and was a
  // privilege-escalation vector), so each account has to be role-assigned and
  // activated explicitly after creation.
  const { data: roles, error: rolesError } = await supabase
    .from('app_roles')
    .select('id, name');

  if (rolesError || !roles?.length) {
    console.error('Could not load app_roles. Have the migrations been applied?');
    process.exit(1);
  }

  const roleIdByName = new Map(roles.map((role) => [role.name, role.id]));

  for (const user of testUsers) {
    console.log(`${user.email} (${user.roleName})`);

    const roleId = roleIdByName.get(user.roleName);
    if (!roleId) {
      console.error(`  Role ${user.roleName} not found, skipping.`);
      continue;
    }

    let userId = null;

    const { data, error } = await supabase.auth.admin.createUser({
      email: user.email,
      password: user.password,
      email_confirm: true,
      user_metadata: { full_name: user.email },
    });

    if (error) {
      if (error.message.includes('already registered')) {
        console.log('  Account already exists, updating role instead.');
        const { data: existing } = await supabase
          .from('profiles')
          .select('id')
          .ilike('email', user.email)
          .maybeSingle();
        userId = existing?.id ?? null;
      } else {
        console.error(`  Failed to create: ${error.message}`);
        continue;
      }
    } else {
      userId = data.user.id;
      console.log(`  Created: ${userId}`);
    }

    if (!userId) {
      console.error('  Could not resolve the account id, skipping role assignment.');
      continue;
    }

    // The trigger has already created the profile row, so this is an update.
    const { error: updateError } = await supabase
      .from('profiles')
      .update({
        role_id: roleId,
        approval_status: 'active',
        approved_at: new Date().toISOString(),
      })
      .eq('id', userId);

    if (updateError) {
      console.error(`  Failed to assign role: ${updateError.message}`);
    } else {
      console.log(`  Role assigned and account activated.`);
    }

    console.log('');
  }

  console.log('Seeding complete.\n');
  console.log('Test users:');
  testUsers.forEach((u) => console.log(`  - ${u.email} / ${u.password} (${u.roleName})`));
  console.log('');
}

seedUsers().catch((error) => {
  console.error('Unexpected error:', error);
  process.exit(1);
});

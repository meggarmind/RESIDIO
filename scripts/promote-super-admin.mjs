#!/usr/bin/env node
/**
 * Promote an existing account to Super Administrator.
 *
 * This is the bootstrap step. The Super Administrator role cannot be granted
 * from inside the app unless a Super Administrator already exists to grant it,
 * so the very first one has to be minted out of band. Run this once against
 * your own account (sign in with Google first so the account exists), and from
 * then on super admins can appoint others from Settings -> Roles.
 *
 * Usage:
 *   node scripts/promote-super-admin.mjs you@example.com
 *
 * Requires NEXT_PUBLIC_SUPABASE_URL_CLOUD and SUPABASE_SERVICE_ROLE_KEY_CLOUD
 * in the environment (they are read from .env.local automatically). The service
 * role key is never hardcoded here — it bypasses every RLS policy, so it must
 * not live in the repository.
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

// --- Minimal .env.local loader (no dependency on dotenv) ---------------------
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

const email = process.argv[2];

if (!email) {
  console.error('Usage: node scripts/promote-super-admin.mjs <email>');
  process.exit(1);
}

const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL_CLOUD || process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY_CLOUD || process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceKey) {
  console.error(
    'Missing NEXT_PUBLIC_SUPABASE_URL_CLOUD / SUPABASE_SERVICE_ROLE_KEY_CLOUD.\n' +
      'Set them in .env.local or export them before running.'
  );
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function main() {
  console.log(`\nPromoting ${email} to Super Administrator`);
  console.log(`Project: ${supabaseUrl}\n`);

  // 1. Resolve the profile. The account must already exist — sign in once first.
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('id, email, full_name, role_id, approval_status')
    .ilike('email', email)
    .maybeSingle();

  if (profileError) {
    console.error('Failed to look up account:', profileError.message);
    process.exit(1);
  }

  if (!profile) {
    console.error(
      `No account found for ${email}.\n` +
        'Sign in once (Google or email/password) so the account is created, then re-run this.'
    );
    process.exit(1);
  }

  // 2. Resolve the super_admin role.
  const { data: role, error: roleError } = await supabase
    .from('app_roles')
    .select('id, display_name')
    .eq('name', 'super_admin')
    .single();

  if (roleError || !role) {
    console.error('super_admin role not found. Has the RBAC migration been applied?');
    process.exit(1);
  }

  if (profile.role_id === role.id && profile.approval_status === 'active') {
    console.log(`${profile.email} is already an active Super Administrator. Nothing to do.`);
    return;
  }

  // 3. Promote and approve in one write.
  const { error: updateError } = await supabase
    .from('profiles')
    .update({
      role_id: role.id,
      role: 'admin', // legacy column, still read by some server actions
      approval_status: 'active',
      approved_at: new Date().toISOString(),
    })
    .eq('id', profile.id);

  if (updateError) {
    console.error('Failed to promote account:', updateError.message);
    process.exit(1);
  }

  // 4. Leave a trail. This runs with the service role and has no session, and
  //    audit_logs.actor_id is NOT NULL, so the promoted account is recorded as
  //    its own actor. The description makes clear it came from this script.
  const { error: auditError } = await supabase.from('audit_logs').insert({
    actor_id: profile.id,
    action: 'ASSIGN',
    entity_type: 'profiles',
    entity_id: profile.id,
    entity_display: profile.full_name || profile.email,
    old_values: { role_id: profile.role_id, approval_status: profile.approval_status },
    new_values: { role_id: role.id, role_name: role.display_name, approval_status: 'active' },
    description: 'Bootstrap promotion to Super Administrator via scripts/promote-super-admin.mjs',
  });

  if (auditError) {
    console.warn('Promotion succeeded but the audit entry failed:', auditError.message);
  }

  console.log(`Done. ${profile.email} is now an active Super Administrator.`);
  console.log('Sign out and back in to pick up the new role.\n');
}

main().catch((error) => {
  console.error('Unexpected error:', error);
  process.exit(1);
});

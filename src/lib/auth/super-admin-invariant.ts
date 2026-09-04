import { createAdminClient } from '@/lib/supabase/server';

/**
 * Residio's bootstrap invariant (ADR-0007, issue #184): **at least one active
 * profile must always hold the `super_admin` role.**
 *
 * The real boundary is a pair of deferred constraint triggers installed by
 * `20260904230000_require_active_super_admin.sql`, because administrators on
 * this project have historically been created and modified by direct database
 * access, which no server action can intercept. What lives here exists only so
 * that an administrator using the dashboard sees "this is the last Super
 * Administrator" instead of a raw Postgres exception.
 *
 * Treat a `false` from this module as "no readable objection", never as
 * permission — the trigger still gets the last word at COMMIT.
 */

export const LAST_SUPER_ADMIN_ERROR =
  'This is the last active Super Administrator. Grant the Super Administrator role to another active account first.';

/**
 * True when `profileId` is the *only* active account holding `super_admin`, so
 * demoting, rejecting or deleting it would leave the estate with no
 * administrator.
 *
 * Reads through the service role deliberately: `profiles` is under RLS and the
 * caller can generally see only their own row, so a caller-scoped count would
 * report one holder — themselves — no matter how many others exist.
 */
export async function isLastActiveSuperAdmin(profileId: string): Promise<boolean> {
  const admin = createAdminClient();

  const { data: role } = await admin
    .from('app_roles')
    .select('id')
    .eq('name', 'super_admin')
    .single();

  if (!role) return false;

  const { data: holders, error } = await admin
    .from('profiles')
    .select('id')
    .eq('role_id', role.id)
    .eq('approval_status', 'active');

  // On a read failure, say nothing rather than inventing an objection: the
  // trigger is the boundary, and a false positive here blocks a legitimate
  // change with a message that would be wrong.
  if (error || !holders) return false;

  return holders.length === 1 && holders[0].id === profileId;
}

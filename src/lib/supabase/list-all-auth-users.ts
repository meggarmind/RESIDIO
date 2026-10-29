import type { User } from '@supabase/supabase-js';
import { createAdminClient } from '@/lib/supabase/server';

/**
 * `auth.admin.listUsers()` returns one page (50 users by default) and says nothing about the
 * rest. Use this wherever the whole login list is needed: linking, orphan checks, pending
 * sign-up details (#1315). Any page error fails the whole read rather than returning a partial list.
 */

const PER_PAGE = 1000;
const MAX_PAGES = 1000;

export type ListAllAuthUsersResult = { users: User[]; error: null } | { users: null; error: string };

export async function listAllAuthUsers(
  adminClient: ReturnType<typeof createAdminClient> = createAdminClient()
): Promise<ListAllAuthUsersResult> {
  const users: User[] = [];

  for (let page = 1; page <= MAX_PAGES; page++) {
    const { data, error } = await adminClient.auth.admin.listUsers({ page, perPage: PER_PAGE });
    if (error) return { users: null, error: error.message };
    const batch = data?.users ?? [];
    // Stop on an empty page, not a short one: the server may cap perPage below what we asked.
    if (batch.length === 0) return { users, error: null };
    users.push(...batch);
  }

  return { users: null, error: 'Too many auth users to list' };
}

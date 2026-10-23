'use server';

import { authorizePermission } from '@/lib/auth/authorize';
import { PERMISSIONS } from '@/lib/auth/action-roles';
import { createAdminClient } from '@/lib/supabase/server';
import { countResidentRoles, type ResidentRoleCounts, type RoleGroup, type RoleMembership } from '@/lib/groups/resident-role-counts';

const PAGE = 1000;

type Rows<T> = PromiseLike<{ data: T[] | null; error: { message: string } | null }>;
type Untyped = {
  from: (table: string) => {
    select: (cols: string) => {
      order: (col: string) => Rows<RoleGroup> & {
        order: (col: string) => { range: (from: number, to: number) => Rows<RoleMembership> };
      };
    };
  };
};

/** Counts of residents per role and per resident group (#1094). Read-only: the view and table are service-role only. */
export async function getResidentRoleCounts(): Promise<{ data: ResidentRoleCounts | null; error: string | null }> {
  const auth = await authorizePermission(PERMISSIONS.RESIDENTS_VIEW_GROUPS);
  if (!auth.authorized) return { data: null, error: auth.error || 'Unauthorized' };

  // shortcut: view and table are not in database.generated.ts until the migration is applied and db:types is rerun
  const supabase = createAdminClient() as unknown as Untyped;

  const { data: groups, error: groupsError } = await supabase
    .from('resident_role_groups')
    .select('slug, name, roles')
    .order('sort_order');
  if (groupsError) {
    console.error('getResidentRoleCounts: resident_role_groups read failed', groupsError);
    return { data: null, error: groupsError.message };
  }

  const memberships: RoleMembership[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from('resident_role_memberships')
      .select('resident_id, role')
      .order('resident_id')
      .order('role')
      .range(from, from + PAGE - 1);
    if (error) {
      console.error('getResidentRoleCounts: resident_role_memberships read failed', error);
      return { data: null, error: error.message };
    }
    memberships.push(...(data ?? []));
    if ((data ?? []).length < PAGE) break;
  }

  return { data: countResidentRoles(memberships, groups ?? []), error: null };
}

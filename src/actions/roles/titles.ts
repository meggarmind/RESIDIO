'use server';

import { z } from 'zod';
import { createServerSupabaseClient, createAdminClient } from '@/lib/supabase/server';
import { authorizeAnyPermission, authorizePermission } from '@/lib/auth/authorize';
import { PERMISSIONS } from '@/lib/auth/action-roles';
import { logAudit } from '@/lib/audit/logger';
import { getChangedValues } from '@/lib/audit/helpers';
import { roleWriteBlock } from '@/lib/auth/role-write-access';
import { fetchAllRows } from '@/lib/supabase/fetch-all-rows';
import type { AdminTitle, AdminTitleWithHolders } from '@/types/database';

const TITLE_COLUMNS = 'id, role_id, name, is_principal, seats, sort_order';
const TITLE_WITH_ROLE = `${TITLE_COLUMNS}, app_roles:role_id (id, name, display_name, is_system_role)`;

const titleFields = {
  name: z.string().trim().min(1, 'Title name is required').max(80, 'Title name is too long'),
  // null is unlimited; a seat count below 1 is refused by the table too.
  seats: z
    .number()
    .int('Seats must be a whole number')
    .min(1, 'Seats must be at least 1')
    .max(99, 'Seats must be 99 or fewer')
    .nullable(),
};

const createTitleSchema = z.object({ role_id: z.guid(), ...titleFields });
// role_id moves the title to another role (#1318); left out, the title stays where it is.
const updateTitleSchema = z.object({ ...titleFields, role_id: z.guid().optional() });

export type TitleInput = z.input<typeof updateTitleSchema>;

type Caller = { roleName: string | null; roleId: string | null };
type TitleRole = { id: string; name: string; display_name: string; is_system_role: boolean | null };

/**
 * Rank guard for titles (#1318), the same rule as updateRole: only a super admin
 * may change the titles of super_admin, a system role, or the role they hold.
 */
function titleRoleRefusal(caller: Caller, role: TitleRole | null): string | null {
  if (!role) return 'Role not found';
  const block = roleWriteBlock(caller, role);
  if (block === 'rank') return 'Only Super Administrator can change the titles of system roles';
  if (block === 'own') return 'You cannot change the titles of your own role';
  return null;
}

async function readTitleRole(roleId: string): Promise<{ role: TitleRole | null; failed: boolean }> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from('app_roles')
    .select('id, name, display_name, is_system_role')
    .eq('id', roleId)
    .maybeSingle();
  if (error) console.error('Error reading the role for a title:', error);
  return { role: (data as TitleRole | null) ?? null, failed: Boolean(error) };
}

/**
 * People holding a title, whatever their account status, or null when the count
 * failed: the seat rule in the database (enforce_profile_role_rules) counts every
 * profile, so the app does too. Service role: profiles is under RLS.
 */
async function countTitleHolders(titleId: string): Promise<number | null> {
  const { count, error } = await createAdminClient()
    .from('profiles')
    .select('id', { count: 'exact', head: true })
    .eq('title_id', titleId);
  if (error) {
    console.error('Error counting title holders:', error);
    return null;
  }
  return count ?? 0;
}

const holdersText = (count: number) => `${count} ${count === 1 ? 'person holds' : 'people hold'} this title`;

/** The title's own columns, without the role join, for the audit record. */
const titleRow = (title: Record<string, unknown>) =>
  Object.fromEntries(TITLE_COLUMNS.split(', ').map((column) => [column, title[column]]));

/**
 * Every title with the people holding it, for the role assignment picker and the
 * Roles tab. Holders are read with the service role because profiles is under
 * RLS and an assigner sees only their own row; the caller is authorised first.
 */
export async function getAdminTitles(): Promise<{
  success: boolean;
  data?: AdminTitleWithHolders[];
  error?: string;
}> {
  // The Roles tab (manage_roles) and the assignment forms (assign_roles) both read titles.
  const auth = await authorizeAnyPermission([
    PERMISSIONS.SYSTEM_ASSIGN_ROLES,
    PERMISSIONS.SYSTEM_MANAGE_ROLES,
  ]);
  if (!auth.authorized) {
    return { success: false, error: auth.error || 'Unauthorized' };
  }

  const admin = createAdminClient();
  type Holder = {
    id: string;
    full_name: string | null;
    email: string | null;
    title_id: string;
    approval_status: string | null;
  };
  const [titlesResult, holdersResult] = await Promise.all([
    admin.from('admin_titles').select(TITLE_COLUMNS).order('sort_order').order('name'),
    // Every status, as the seat rule counts them; a non-active holder is labelled (#1318).
    // Paged by id, so holders past max_rows are not dropped.
    fetchAllRows<Holder>((from, to) =>
      admin
        .from('profiles')
        .select('id, full_name, email, title_id, approval_status')
        .not('title_id', 'is', null)
        .order('id', { ascending: true })
        .range(from, to)
    ),
  ]);

  if (titlesResult.error || holdersResult.error !== null) {
    console.error('Error fetching admin titles:', titlesResult.error ?? holdersResult.error);
    return { success: false, error: 'Failed to load titles' };
  }

  const data = ((titlesResult.data ?? []) as AdminTitle[]).map((title) => ({
    ...title,
    holders: (holdersResult.data ?? [])
      .filter((p) => p.title_id === title.id)
      .map((p) => {
        const name = (p.full_name || p.email) as string;
        const status = p.approval_status as string | null | undefined;
        return {
          profile_id: p.id as string,
          name: status && status !== 'active' ? `${name} (${status})` : name,
        };
      }),
  }));

  return { success: true, data };
}

/** Add a title under a role. */
export async function createAdminTitle(input: {
  role_id: string;
  name: string;
  seats: number | null;
}): Promise<{ success: boolean; data?: AdminTitle; error?: string }> {
  const auth = await authorizePermission(PERMISSIONS.SYSTEM_MANAGE_ROLES);
  if (!auth.authorized) {
    return { success: false, error: auth.error || 'Unauthorized' };
  }

  const parsed = createTitleSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? 'Invalid title' };
  }

  const { role, failed } = await readTitleRole(parsed.data.role_id);
  if (failed) {
    return { success: false, error: 'Could not check the role' };
  }
  const refusal = titleRoleRefusal(auth, role);
  if (refusal || !role) {
    return { success: false, error: refusal ?? 'Role not found' };
  }

  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase
    .from('admin_titles')
    .insert({ ...parsed.data, is_principal: false })
    .select(TITLE_COLUMNS)
    .single();

  if (error || !data) {
    // 23505: admin_titles_role_name_key
    return {
      success: false,
      error: error?.code === '23505'
        ? `${role.display_name} already has a title called "${parsed.data.name}"`
        : 'Failed to add title',
    };
  }

  await logAudit({
    action: 'CREATE',
    entityType: 'admin_titles',
    entityId: data.id,
    entityDisplay: `${data.name} (${role.display_name})`,
    newValues: data,
  });

  return { success: true, data: data as AdminTitle };
}

/**
 * Rename a title, change its seats, or move it to another role. Lowering the
 * seats below the number of people holding it is refused: the table would accept
 * it and leave the title over-full with no one to move. A move is refused while
 * anyone holds the title, since a holder's title must belong to their role.
 */
export async function updateAdminTitle(
  titleId: string,
  input: TitleInput
): Promise<{ success: boolean; data?: AdminTitle; error?: string }> {
  const auth = await authorizePermission(PERMISSIONS.SYSTEM_MANAGE_ROLES);
  if (!auth.authorized) {
    return { success: false, error: auth.error || 'Unauthorized' };
  }

  const parsed = updateTitleSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? 'Invalid title' };
  }

  const supabase = await createServerSupabaseClient();

  const { data: oldTitle } = await supabase
    .from('admin_titles')
    .select(TITLE_WITH_ROLE)
    .eq('id', titleId)
    .maybeSingle();
  if (!oldTitle) {
    return { success: false, error: 'Title not found' };
  }

  const currentRole = (oldTitle.app_roles as unknown as TitleRole | null) ?? null;
  const refusal = titleRoleRefusal(auth, currentRole);
  if (refusal) {
    return { success: false, error: refusal };
  }

  const { role_id: newRoleId, ...fields } = parsed.data;
  const moving = newRoleId !== undefined && newRoleId !== oldTitle.role_id;
  let roleName = currentRole?.display_name;

  if (moving) {
    if (oldTitle.is_principal) {
      return { success: false, error: 'A principal title stays with its role. Rename it instead.' };
    }
    const { role: target, failed } = await readTitleRole(newRoleId);
    if (failed) {
      return { success: false, error: 'Could not check the role' };
    }
    const targetRefusal = titleRoleRefusal(auth, target);
    if (targetRefusal) {
      return { success: false, error: targetRefusal };
    }
    // A holder's title must belong to their role, so any holder blocks the move.
    const holders = await countTitleHolders(titleId);
    if (holders === null) {
      return { success: false, error: 'Could not check who holds this title' };
    }
    if (holders > 0) {
      return {
        success: false,
        error: `${holdersText(holders)}. Remove it from them before moving it to another role.`,
      };
    }
    roleName = target?.display_name;
  }

  if (fields.seats !== null) {
    const holders = await countTitleHolders(titleId);
    if (holders === null) {
      return { success: false, error: 'Could not check who holds this title' };
    }
    if (holders > fields.seats) {
      return {
        success: false,
        error: `${holders} people hold this title. Move some of them first, or set at least ${holders} seats.`,
      };
    }
  }

  const { data, error } = await supabase
    .from('admin_titles')
    .update(moving ? { ...fields, role_id: newRoleId } : fields)
    .eq('id', titleId)
    .select(TITLE_COLUMNS)
    .single();

  if (error || !data) {
    return {
      success: false,
      error: error?.code === '23505'
        ? `This role already has a title called "${fields.name}"`
        : 'Failed to update title',
    };
  }

  const changes = getChangedValues(titleRow(oldTitle as Record<string, unknown>), data);
  await logAudit({
    action: 'UPDATE',
    entityType: 'admin_titles',
    entityId: titleId,
    entityDisplay: roleName ? `${data.name} (${roleName})` : data.name,
    oldValues: changes.old,
    newValues: changes.new,
  });

  return { success: true, data: data as AdminTitle };
}

/**
 * Delete a title (#1318). Refused while anyone holds it, and for a role's
 * principal title, which carries the role's own name.
 */
export async function deleteAdminTitle(
  titleId: string
): Promise<{ success: boolean; error?: string }> {
  const auth = await authorizePermission(PERMISSIONS.SYSTEM_MANAGE_ROLES);
  if (!auth.authorized) {
    return { success: false, error: auth.error || 'Unauthorized' };
  }

  const supabase = await createServerSupabaseClient();

  const { data: title } = await supabase
    .from('admin_titles')
    .select(TITLE_WITH_ROLE)
    .eq('id', titleId)
    .maybeSingle();
  if (!title) {
    return { success: false, error: 'Title not found' };
  }

  const role = (title.app_roles as unknown as TitleRole | null) ?? null;
  const refusal = titleRoleRefusal(auth, role);
  if (refusal) {
    return { success: false, error: refusal };
  }

  if (title.is_principal) {
    return { success: false, error: 'A principal title cannot be deleted. Rename it instead.' };
  }

  const holders = await countTitleHolders(titleId);
  if (holders === null) {
    return { success: false, error: 'Could not check who holds this title' };
  }
  if (holders > 0) {
    return { success: false, error: `${holdersText(holders)}. Remove it from them first.` };
  }

  // .select() makes a delete that RLS filtered out show as zero rows.
  const { data: deleted, error } = await supabase
    .from('admin_titles')
    .delete()
    .eq('id', titleId)
    .select('id');

  if (error || !deleted || deleted.length === 0) {
    if (error) console.error('Error deleting title:', error);
    return { success: false, error: 'Failed to delete title' };
  }

  await logAudit({
    action: 'DELETE',
    entityType: 'admin_titles',
    entityId: titleId,
    entityDisplay: role ? `${title.name} (${role.display_name})` : title.name,
    oldValues: titleRow(title as Record<string, unknown>),
  });

  return { success: true };
}

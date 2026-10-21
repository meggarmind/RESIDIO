'use server';

import { z } from 'zod';
import { createServerSupabaseClient, createAdminClient } from '@/lib/supabase/server';
import { authorizeAnyPermission, authorizePermission } from '@/lib/auth/authorize';
import { PERMISSIONS } from '@/lib/auth/action-roles';
import { logAudit } from '@/lib/audit/logger';
import { getChangedValues } from '@/lib/audit/helpers';
import type { AdminTitle, AdminTitleWithHolders } from '@/types/database';

const TITLE_COLUMNS = 'id, role_id, name, is_principal, seats, sort_order';

const titleFields = {
  name: z.string().trim().min(1, 'Title name is required').max(80, 'Title name is too long'),
  // null is unlimited; a seat count below 1 is refused by the table too.
  seats: z.number().int('Seats must be a whole number').min(1, 'Seats must be at least 1').nullable(),
};

const createTitleSchema = z.object({ role_id: z.string().uuid(), ...titleFields });
const updateTitleSchema = z.object(titleFields);

export type TitleInput = z.input<typeof updateTitleSchema>;

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
  const [titlesResult, holdersResult] = await Promise.all([
    admin.from('admin_titles').select(TITLE_COLUMNS).order('sort_order').order('name'),
    admin.from('profiles').select('id, full_name, email, title_id').not('title_id', 'is', null),
  ]);

  if (titlesResult.error || holdersResult.error) {
    console.error('Error fetching admin titles:', titlesResult.error ?? holdersResult.error);
    return { success: false, error: 'Failed to load titles' };
  }

  const data = ((titlesResult.data ?? []) as AdminTitle[]).map((title) => ({
    ...title,
    holders: (holdersResult.data ?? [])
      .filter((p) => p.title_id === title.id)
      .map((p) => ({ profile_id: p.id as string, name: (p.full_name || p.email) as string })),
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

  const supabase = await createServerSupabaseClient();

  const { data: role } = await supabase
    .from('app_roles')
    .select('id, display_name')
    .eq('id', parsed.data.role_id)
    .maybeSingle();
  if (!role) {
    return { success: false, error: 'Role not found' };
  }

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
 * Rename a title or change its seats. Lowering the seats below the number of
 * people holding it is refused: the table would accept it and leave the title
 * over-full with no one to move.
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
    .select(`${TITLE_COLUMNS}, app_roles:role_id (display_name)`)
    .eq('id', titleId)
    .maybeSingle();
  if (!oldTitle) {
    return { success: false, error: 'Title not found' };
  }

  if (parsed.data.seats !== null) {
    const { count, error: countError } = await createAdminClient()
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .eq('title_id', titleId);
    if (countError) {
      console.error('Error counting title holders:', countError);
      return { success: false, error: 'Could not check who holds this title' };
    }
    if ((count ?? 0) > parsed.data.seats) {
      return {
        success: false,
        error: `${count} people hold this title. Move some of them first, or set at least ${count} seats.`,
      };
    }
  }

  const { data, error } = await supabase
    .from('admin_titles')
    .update(parsed.data)
    .eq('id', titleId)
    .select(TITLE_COLUMNS)
    .single();

  if (error || !data) {
    return {
      success: false,
      error: error?.code === '23505'
        ? `This role already has a title called "${parsed.data.name}"`
        : 'Failed to update title',
    };
  }

  const roleName = (oldTitle.app_roles as unknown as { display_name: string } | null)?.display_name;
  const oldRow = Object.fromEntries(
    TITLE_COLUMNS.split(', ').map((column) => [column, (oldTitle as Record<string, unknown>)[column]])
  );
  const changes = getChangedValues(oldRow, data);
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

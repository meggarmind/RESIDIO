'use server';

import { revalidatePath } from 'next/cache';
import { authorizePermission } from '@/lib/auth/authorize';
import { PERMISSIONS } from '@/lib/auth/action-roles';
import { logAudit } from '@/lib/audit/logger';
import { createAdminClient } from '@/lib/supabase/server';
import { fetchResidentOptions, type ResidentOption } from '@/lib/residents/resident-options';
import { getGroupUsage, loadRecipientGroups, type RecipientGroup } from '@/lib/groups/recipient-groups';

type Result<T> = { data: T | null; error: string | null };
type GroupInput = { name: string; description?: string | null };

const PATH = '/settings/groups';

function cleanInput(input: GroupInput): { name: string; description: string | null } | string {
  const name = input.name?.trim() ?? '';
  if (!name) return 'Enter a group name';
  if (name.length > 100) return 'Group name must be 100 characters or fewer';
  const description = input.description?.trim() || null;
  return { name, description };
}

function writeError(error: { code?: string; message: string }): string {
  return error.code === '23505' ? 'A group with that name already exists' : error.message;
}

export async function getRecipientGroups(): Promise<Result<RecipientGroup[]>> {
  const auth = await authorizePermission(PERMISSIONS.GROUPS_VIEW);
  if (!auth.authorized) return { data: null, error: auth.error || 'Unauthorized' };
  const { data, error } = await loadRecipientGroups(createAdminClient());
  return error ? { data: null, error } : { data, error: null };
}

/** Picker source for group members: name and a non-contact disambiguator only (#819 decision 5). */
export async function getRecipientGroupResidentOptions(): Promise<{ data: ResidentOption[]; error: string | null }> {
  const auth = await authorizePermission(PERMISSIONS.GROUPS_VIEW);
  if (!auth.authorized) return { data: [], error: auth.error || 'Unauthorized' };
  return fetchResidentOptions(createAdminClient());
}

export async function createRecipientGroup(input: GroupInput): Promise<Result<{ id: string }>> {
  const auth = await authorizePermission(PERMISSIONS.GROUPS_MANAGE);
  if (!auth.authorized) return { data: null, error: auth.error || 'Unauthorized' };
  const values = cleanInput(input);
  if (typeof values === 'string') return { data: null, error: values };

  const { data, error } = await createAdminClient()
    .from('recipient_groups')
    .insert({ ...values, created_by: auth.userId, updated_by: auth.userId })
    .select('id, name, description')
    .single();
  if (error || !data) return { data: null, error: error ? writeError(error) : 'Could not create the group' };

  await logAudit({
    action: 'CREATE',
    entityType: 'recipient_groups',
    entityId: data.id,
    entityDisplay: data.name,
    newValues: { name: data.name, description: data.description },
  });
  revalidatePath(PATH);
  return { data: { id: data.id }, error: null };
}

export async function updateRecipientGroup(id: string, input: GroupInput): Promise<Result<{ id: string }>> {
  const auth = await authorizePermission(PERMISSIONS.GROUPS_MANAGE);
  if (!auth.authorized) return { data: null, error: auth.error || 'Unauthorized' };
  const values = cleanInput(input);
  if (typeof values === 'string') return { data: null, error: values };

  const client = createAdminClient();
  const { data: old, error: readError } = await client.from('recipient_groups').select('id, name, description').eq('id', id).single();
  if (readError || !old) return { data: null, error: 'Group not found' };

  const { data, error } = await client
    .from('recipient_groups')
    .update({ ...values, updated_by: auth.userId, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select('id, name, description')
    .single();
  if (error || !data) return { data: null, error: error ? writeError(error) : 'Could not update the group' };

  await logAudit({
    action: 'UPDATE',
    entityType: 'recipient_groups',
    entityId: id,
    entityDisplay: data.name,
    oldValues: { name: old.name, description: old.description },
    newValues: { name: data.name, description: data.description },
  });
  revalidatePath(PATH);
  return { data: { id }, error: null };
}

/** Replace a group's members with exactly `residentIds`. */
export async function setRecipientGroupMembers(id: string, residentIds: string[]): Promise<Result<{ id: string }>> {
  const auth = await authorizePermission(PERMISSIONS.GROUPS_MANAGE);
  if (!auth.authorized) return { data: null, error: auth.error || 'Unauthorized' };

  const client = createAdminClient();
  const { data: group, error: groupError } = await client.from('recipient_groups').select('id, name').eq('id', id).single();
  if (groupError || !group) return { data: null, error: 'Group not found' };

  const { data: current, error: readError } = await client.from('recipient_group_members').select('resident_id').eq('group_id', id);
  if (readError) return { data: null, error: readError.message };

  const before = new Set(((current || []) as Array<{ resident_id: string }>).map((row) => row.resident_id));
  const after = new Set(residentIds);
  const added = [...after].filter((residentId) => !before.has(residentId));
  const removed = [...before].filter((residentId) => !after.has(residentId));
  if (added.length === 0 && removed.length === 0) return { data: { id }, error: null };

  if (added.length > 0) {
    const { error } = await client
      .from('recipient_group_members')
      .insert(added.map((residentId) => ({ group_id: id, resident_id: residentId, created_by: auth.userId })));
    if (error) return { data: null, error: error.message };
  }
  let removeError: string | null = null;
  if (removed.length > 0) {
    const { error } = await client.from('recipient_group_members').delete().eq('group_id', id).in('resident_id', removed);
    if (error) removeError = error.message;
  }
  if (removeError && added.length === 0) return { data: null, error: removeError };
  const applied = removeError ? [...before, ...added] : [...after];
  const removedCount = removeError ? 0 : removed.length;

  await logAudit({
    action: 'UPDATE',
    entityType: 'recipient_groups',
    entityId: id,
    entityDisplay: group.name,
    oldValues: { member_resident_ids: [...before] },
    newValues: { member_resident_ids: applied },
    description: `Members changed: ${added.length} added, ${removedCount} removed`,
  });
  revalidatePath(PATH);
  return removeError ? { data: null, error: removeError } : { data: { id }, error: null };
}

/** Delete a group no setting selects. A group in use is refused with what uses it (#819 decision 4). */
export async function deleteRecipientGroup(id: string): Promise<Result<{ id: string }>> {
  const auth = await authorizePermission(PERMISSIONS.GROUPS_MANAGE);
  if (!auth.authorized) return { data: null, error: auth.error || 'Unauthorized' };

  const client = createAdminClient();
  const { data: group, error: groupError } = await client.from('recipient_groups').select('id, name, description').eq('id', id).single();
  if (groupError || !group) return { data: null, error: 'Group not found' };

  const usage = await getGroupUsage(client);
  // Fail closed: if usage cannot be read, the group may be in use.
  if (usage.error) return { data: null, error: usage.error };
  const usedBy = usage.data.get(id) ?? [];
  if (usedBy.length > 0) return { data: null, error: `Used by: ${usedBy.join(', ')}` };

  const { error } = await client.from('recipient_groups').delete().eq('id', id);
  if (error) return { data: null, error: error.message };

  await logAudit({
    action: 'DELETE',
    entityType: 'recipient_groups',
    entityId: id,
    entityDisplay: group.name,
    oldValues: { name: group.name, description: group.description },
  });
  revalidatePath(PATH);
  return { data: { id }, error: null };
}

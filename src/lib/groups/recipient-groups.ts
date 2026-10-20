import { normalizePhoneNumber } from '@/lib/sms/termii';
import { createAdminClient } from '@/lib/supabase/server';

type AdminClient = ReturnType<typeof createAdminClient>;

/**
 * Settings that point at a recipient group, and the name each is shown under. A group any of
 * these selects is in use and cannot be deleted (#819 decision 4). Clearance certificate copies
 * (#816) is the only consumer; add a row here when another feature starts sending to a group.
 */
export const GROUP_USAGES = [
  { settingKey: 'clearance_copy_recipient_group_id', label: 'Clearance certificate copies' },
] as const;

export type RecipientGroupMember = {
  residentId: string;
  name: string;
  /** Moved out (no active house) or account not active: listed and flagged, but skipped when sending. */
  inactive: boolean;
  /** Why this member cannot get a WhatsApp copy or will be skipped, e.g. `not opted in`; null when they can. */
  warning: string | null;
};

export type RecipientGroup = {
  id: string;
  name: string;
  description: string | null;
  members: RecipientGroupMember[];
  usedBy: string[];
};

type ResidentRow = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  account_status: string | null;
  phone_primary: string | null;
  resident_houses: Array<{ is_active: boolean }> | null;
};

/** Decide a member's flags from their resident record and whether their number is opted in. */
export function describeMember(resident: ResidentRow, optedIn: boolean): RecipientGroupMember {
  const name = [resident.first_name, resident.last_name].filter(Boolean).join(' ') || 'Unnamed resident';
  const deactivated = resident.account_status !== 'active';
  const movedOut = !resident.resident_houses?.some((link) => link.is_active);
  const warning = deactivated
    ? 'deactivated'
    : movedOut
      ? 'moved out'
      : !resident.phone_primary?.trim()
        ? 'no WhatsApp number'
        : !optedIn
          ? 'not opted in'
          : null;
  return { residentId: resident.id, name, inactive: deactivated || movedOut, warning };
}

/** The members a send should go to: everyone listed except moved-out or deactivated residents. */
export function sendableMembers(members: RecipientGroupMember[]): RecipientGroupMember[] {
  return members.filter((member) => !member.inactive);
}

/** Labels of the settings that currently select each group, keyed by group id. */
export async function getGroupUsage(client: AdminClient): Promise<{ data: Map<string, string[]>; error: string | null }> {
  const { data, error } = await client
    .from('system_settings')
    .select('key, value')
    .in('key', GROUP_USAGES.map((usage) => usage.settingKey));
  if (error) return { data: new Map(), error: error.message };
  const usage = new Map<string, string[]>();
  for (const row of (data || []) as Array<{ key: string; value: unknown }>) {
    const groupId = typeof row.value === 'string' ? row.value : null;
    const label = GROUP_USAGES.find((u) => u.settingKey === row.key)?.label;
    if (!groupId || !label) continue;
    usage.set(groupId, [...(usage.get(groupId) ?? []), label]);
  }
  return { data: usage, error: null };
}

/** Every group with its members' flags and what uses it, ordered by name. */
export async function loadRecipientGroups(client: AdminClient): Promise<{ data: RecipientGroup[]; error: string | null }> {
  const { data: groups, error } = await client
    .from('recipient_groups')
    .select('id, name, description, recipient_group_members(resident:residents(id, first_name, last_name, account_status, phone_primary, resident_houses!resident_id(is_active)))')
    .order('name');
  if (error) return { data: [], error: error.message };

  type GroupRow = { id: string; name: string; description: string | null; recipient_group_members: Array<{ resident: ResidentRow | null }> | null };
  const rows = (groups || []) as unknown as GroupRow[];
  const residents = rows.flatMap((group) => (group.recipient_group_members || []).flatMap((m) => (m.resident ? [m.resident] : [])));

  const optedIn = new Set<string>();
  if (residents.length > 0) {
    const { data: optins, error: optinError } = await client
      .from('whatsapp_optins')
      .select('resident_id, phone_number')
      .in('resident_id', [...new Set(residents.map((r) => r.id))])
      .eq('opted_in', true)
      .is('deactivated_at', null);
    if (optinError) return { data: [], error: optinError.message };
    // Same match as isWhatsAppOptedIn: the opt-in must be for the resident's current number.
    for (const row of (optins || []) as Array<{ resident_id: string; phone_number: string }>) optedIn.add(`${row.resident_id}|${row.phone_number}`);
  }

  const usage = await getGroupUsage(client);
  if (usage.error) return { data: [], error: usage.error };

  return {
    data: rows.map((group) => ({
      id: group.id,
      name: group.name,
      description: group.description,
      members: (group.recipient_group_members || [])
        .flatMap((m) => (m.resident ? [m.resident] : []))
        .map((r) => describeMember(r, !!r.phone_primary && optedIn.has(`${r.id}|${normalizePhoneNumber(r.phone_primary)}`)))
        .sort((a, b) => a.name.localeCompare(b.name)),
      usedBy: usage.data.get(group.id) ?? [],
    })),
    error: null,
  };
}

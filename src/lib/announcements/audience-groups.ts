import type { TargetAudience } from '@/types/database';

/**
 * Resident-group audiences for announcements (#1095). The group table and membership view are
 * service-role only (#1094), so callers pass the admin client. NOT a server action.
 */

type Result<T> = PromiseLike<{ data: T[] | null; error: { message: string } | null }>;
type Query<T> = Result<T> & {
  select: (cols: string) => Query<T>;
  eq: (col: string, value: unknown) => Query<T>;
  in: (col: string, values: unknown[]) => Query<T>;
  is: (col: string, value: unknown) => Query<T>;
  order: (col: string) => Query<T>;
  range: (from: number, to: number) => Query<T>;
};
// shortcut: view and table are not in database.generated.ts until db:types is rerun after the migrations are applied
export type GroupDb = { from: <T>(table: string) => Query<T> };

export type AudienceGroup = { slug: string; name: string; roles: string[] };
export type GroupReach = { reach: number; optedIn: number; optIns: Map<string, { phone_number: string }> };

const PAGE = 1000;
const CHUNK = 100;
const OWNER_ROLES = new Set(['resident_landlord', 'non_resident_landlord']);

/** Nearest enum audience that is not wider than the group's roles. */
export function enumAudienceForRoles(roles: string[]): TargetAudience {
  if (roles.every((r) => OWNER_ROLES.has(r))) return 'owners';
  if (roles.every((r) => r === 'tenant')) return 'tenants';
  return 'residents';
}

export async function listAudienceGroups(db: GroupDb): Promise<{ data: AudienceGroup[]; error: string | null }> {
  const { data, error } = await db.from<AudienceGroup>('resident_role_groups').select('slug, name, roles').order('sort_order');
  if (error) return { data: [], error: error.message };
  return { data: data ?? [], error: null };
}

/**
 * Residents in the group with an active account, and which of them hold a WhatsApp opt-in.
 * A person in several of the group's roles is one member. `optIns` maps resident id to the phone to message.
 */
export async function resolveGroupReach(db: GroupDb, slug: string): Promise<GroupReach & { error: null } | { error: string }> {
  const { data: groups, error: groupError } = await db
    .from<AudienceGroup>('resident_role_groups')
    .select('slug, name, roles')
    .eq('slug', slug);
  if (groupError) return { error: groupError.message };
  const group = groups?.[0];
  if (!group) return { error: `Resident group "${slug}" not found` };

  const members = new Set<string>();
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await db
      .from<{ resident_id: string }>('resident_role_memberships')
      .select('resident_id')
      .in('role', group.roles)
      .order('resident_id')
      .range(from, from + PAGE - 1);
    if (error) return { error: error.message };
    for (const row of data ?? []) members.add(row.resident_id);
    if ((data ?? []).length < PAGE) break;
  }

  const ids = [...members];
  const active = new Set<string>();
  for (let i = 0; i < ids.length; i += CHUNK) {
    const { data, error } = await db
      .from<{ id: string }>('residents')
      .select('id')
      .in('id', ids.slice(i, i + CHUNK))
      .eq('account_status', 'active');
    if (error) return { error: error.message };
    for (const row of data ?? []) active.add(row.id);
  }

  const optIns: GroupReach['optIns'] = new Map();
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await db
      .from<{ resident_id: string; phone_number: string }>('whatsapp_optins')
      .select('resident_id, phone_number')
      .eq('opted_in', true)
      .is('deactivated_at', null)
      .order('resident_id')
      .range(from, from + PAGE - 1);
    if (error) return { error: error.message };
    for (const row of data ?? []) {
      if (active.has(row.resident_id) && !optIns.has(row.resident_id)) optIns.set(row.resident_id, { phone_number: row.phone_number });
    }
    if ((data ?? []).length < PAGE) break;
  }

  return { error: null, reach: active.size, optedIn: optIns.size, optIns };
}

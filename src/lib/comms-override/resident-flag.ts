import { createAdminClient } from '@/lib/supabase/server';
import { PERMISSIONS } from '@/lib/auth/action-roles';

/**
 * The per-resident communications override flag (#713 decision 2, #716).
 *
 *   null  follow the environment default
 *   true  redirect this resident's messages
 *   false send to the real recipient (Debug Mode still redirects)
 *
 * `residents.use_override_comms` is not in `database.generated.ts` until
 * `npm run db:types` is re-run after the migration is applied, so this module
 * reads it through a narrow structural client type instead of the generated one.
 * TODO(#716 follow-up): drop the cast once the generated types carry the column.
 */
export type ResidentOverrideFlag = boolean | null;

/** A row type for code that selects `*` from residents. */
export type WithOverrideFlag = { use_override_comms?: ResidentOverrideFlag };

interface FlagQueryClient {
  from(table: 'residents'): {
    select(columns: string): {
      in(
        column: string,
        values: string[]
      ): PromiseLike<{
        data: Array<{ id: string; use_override_comms: unknown }> | null;
        error: { message: string } | null;
      }>;
    };
  };
}

export type ResidentFlagLookup =
  | { ok: true; flags: ReadonlyMap<string, ResidentOverrideFlag> }
  | { ok: false; error: string };

export type ResidentOverrideResult =
  | { ok: true; residentOverride: ResidentOverrideFlag }
  | { ok: false; error: string };

/**
 * Reads the flag for each resident id in one query. Fails closed: a query
 * error, or a stored value that is not boolean/null, is an error, never `null`.
 */
export async function loadResidentOverrideFlags(
  residentIds: string[],
  client: FlagQueryClient = createAdminClient() as unknown as FlagQueryClient
): Promise<ResidentFlagLookup> {
  const ids = [...new Set(residentIds)];
  if (ids.length === 0) return { ok: true, flags: new Map() };

  let data: Array<{ id: string; use_override_comms: unknown }> | null;
  let error: { message: string } | null;
  try {
    ({ data, error } = await client.from('residents').select('id, use_override_comms').in('id', ids));
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'resident flag lookup threw' };
  }
  if (error) return { ok: false, error: error.message };

  const flags = new Map<string, ResidentOverrideFlag>();
  for (const row of data ?? []) {
    const value = row.use_override_comms;
    if (value !== null && typeof value !== 'boolean') {
      return { ok: false, error: `unrecognised use_override_comms value for resident ${row.id}` };
    }
    flags.set(row.id, value);
  }
  return { ok: true, flags };
}

/**
 * One value for a send that addresses several residents at once. The seam takes
 * a single flag, so the answer must lean toward redirecting: `true` beats
 * `null` beats `false`. That order holds in both environments (`null` redirects
 * outside production and sends real in production), so a mixed group can only
 * be redirected more than strictly needed, never less.
 */
export function combineResidentOverrides(flags: ResidentOverrideFlag[]): ResidentOverrideFlag {
  if (flags.some((f) => f === true)) return true;
  if (flags.some((f) => f === null)) return null;
  return false;
}

/**
 * The context value for a send to these residents, from an earlier lookup.
 * A resident missing from the lookup is an error: fail closed.
 */
export function residentOverrideFrom(lookup: ResidentFlagLookup, residentIds: string[]): ResidentOverrideResult {
  if (!lookup.ok) return { ok: false, error: `comms override: could not read resident flag (${lookup.error})` };
  if (residentIds.length === 0) return { ok: false, error: 'comms override: no resident to read the flag for' };
  const values: ResidentOverrideFlag[] = [];
  for (const id of residentIds) {
    const flag = lookup.flags.get(id);
    if (flag === undefined) {
      return { ok: false, error: `comms override: resident ${id} not found when reading the flag` };
    }
    values.push(flag);
  }
  return { ok: true, residentOverride: combineResidentOverrides(values) };
}

/** Look up and combine in one step. Callers must NOT send when `ok` is false. */
export async function resolveResidentOverride(
  residentIds: string[],
  client?: FlagQueryClient
): Promise<ResidentOverrideResult> {
  return residentOverrideFrom(await loadResidentOverrideFlags(residentIds, client), residentIds);
}

/** Only users who hold `settings.manage_general` may see or change the flag (#713 decision 2). */
export function canManageResidentOverride(permissions: readonly string[]): boolean {
  return permissions.includes(PERMISSIONS.SETTINGS_MANAGE_GENERAL);
}

import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * The Access module: resolves the signed-in user's Role and Permissions in one
 * round trip through the `get_my_access()` database function (#534).
 *
 * Deliberately NOT a 'use server' file: it exports a type-rich interface and a
 * sync adapter, neither of which a server-action file may export.
 */

export interface AccessRow {
  role_id: string;
  role_name: string;
  permission_name: string | null;
}

/** The narrow slice of a Supabase client the module needs. Easy to fake in tests. */
export interface AccessClient {
  auth: { getUser(): Promise<{ data: { user: { id: string } | null } }> };
  rpc(
    fn: 'get_my_access'
  ): PromiseLike<{ data: AccessRow[] | null; error: { message: string } | null }>;
}

export type AccessResult =
  | { status: 'resolved'; userId: string; roleId: string; roleName: string; permissions: string[] }
  | { status: 'no-access'; userId: string | null }
  | { status: 'lookup-failed'; userId: string | null; error: string };

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** Never throws. A failed lookup is reported as `lookup-failed`, never as access. */
export async function resolveAccess(
  client: AccessClient,
  options?: { userId?: string }
): Promise<AccessResult> {
  let userId: string | null = options?.userId ?? null;

  try {
    if (!userId) {
      const {
        data: { user },
      } = await client.auth.getUser();
      if (!user) return { status: 'no-access', userId: null };
      userId = user.id;
    }

    const { data, error } = await client.rpc('get_my_access');
    if (error) return { status: 'lookup-failed', userId, error: error.message };

    const rows = data ?? [];
    if (rows.length === 0) return { status: 'no-access', userId };

    const permissions = [
      ...new Set(
        rows.map((r) => r.permission_name).filter((p): p is string => p !== null)
      ),
    ];
    return {
      status: 'resolved',
      userId,
      roleId: rows[0].role_id,
      roleName: rows[0].role_name,
      permissions,
    };
  } catch (err) {
    return { status: 'lookup-failed', userId, error: messageOf(err) };
  }
}

/**
 * Adapts a real Supabase client to `AccessClient`.
 *
 * The generated Database types do not know `get_my_access` yet; they will once
 * `db:types` is rerun against the cloud database after the migration is applied.
 * Until then the cast is confined to this one wrapper.
 */
export function toAccessClient(supabase: SupabaseClient<any, any, any>): AccessClient { // eslint-disable-line @typescript-eslint/no-explicit-any
  type UntypedRpc = (fn: string) => PromiseLike<{
    data: AccessRow[] | null;
    error: { message: string } | null;
  }>;
  return {
    auth: supabase.auth,
    rpc: (fn) => (supabase.rpc as unknown as UntypedRpc).call(supabase, fn),
  };
}

/**
 * Minimal recording Supabase client for behavioural tests of server actions.
 *
 * Every query is a thenable chain. The first of select/insert/update/delete/
 * upsert called on it decides the operation; the result comes from
 * `results['<table>.<op>']`, falling back to `{ data: null, error: null }`.
 * Every non-select operation is appended to `calls` as `write:<table>.<op>`
 * (at the moment it is awaited), so a test can assert audit ordering.
 */
export type QueryResult = { data?: unknown; error?: unknown; count?: number | null };

export function makeRecordingSupabase(opts: {
  results: Record<string, QueryResult>;
  calls: string[];
  user?: { id: string } | null;
  /** Receives `<table>:<columns>` for every select() call. */
  selects?: string[];
}) {
  const { results, calls, selects } = opts;
  const user = opts.user === undefined ? { id: 'user-1' } : opts.user;

  return {
    auth: { getUser: async () => ({ data: { user }, error: null }) },
    from(table: string) {
      let op: string | null = null;
      const chain: Record<string, unknown> = {};
      const settle = () => {
        const key = `${table}.${op ?? 'select'}`;
        if (op && op !== 'select') calls.push(`write:${key}`);
        const r = results[key] ?? {};
        return { data: r.data ?? null, error: r.error ?? null, count: r.count ?? null };
      };
      for (const m of ['select', 'insert', 'update', 'delete', 'upsert']) {
        chain[m] = (...args: unknown[]) => {
          if (m === 'select') selects?.push(`${table}:${String(args[0] ?? '*')}`);
          if (!op) op = m;
          return chain;
        };
      }
      for (const m of ['eq', 'in', 'or', 'order', 'limit', 'range', 'neq', 'is', 'gte', 'lte']) {
        chain[m] = () => chain;
      }
      chain.single = async () => settle();
      chain.maybeSingle = async () => settle();
      chain.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
        Promise.resolve(settle()).then(resolve, reject);
      return chain;
    },
  };
}

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** audit_logs.entity_id is uuid NOT NULL; logAudit swallows insert errors, so a non-uuid id silently logs nothing. */
export function expectUuidEntityId(logAudit: { mock: { calls: unknown[][] } }, callIndex = 0) {
  const arg = logAudit.mock.calls[callIndex][0] as { entityId?: unknown };
  if (typeof arg.entityId !== 'string' || !UUID_RE.test(arg.entityId)) {
    throw new Error(`audit entityId is not a uuid: ${String(arg.entityId)}`);
  }
}

/** Deterministic uuid-shaped id for tests. */
export const uid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

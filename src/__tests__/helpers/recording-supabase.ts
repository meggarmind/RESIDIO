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
}) {
  const { results, calls } = opts;
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
        chain[m] = () => {
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

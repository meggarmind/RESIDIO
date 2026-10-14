/**
 * Minimal stateful in-memory stand-in for the Supabase query builder, used by
 * tests that need two real code paths to read and write the SAME rows (#6).
 * Supports only what the notification/WhatsApp paths use.
 */
export type Row = Record<string, unknown>;

type Filter =
  | { kind: 'eq'; column: string; value: unknown }
  | { kind: 'in'; column: string; values: unknown[] }
  | { kind: 'gte'; column: string; value: unknown }
  | { kind: 'lte'; column: string; value: unknown }
  | { kind: 'is'; column: string; value: unknown };

export interface FakeSupabaseState {
  tables: Record<string, Row[]>;
}

export function createFakeSupabase(initial: Record<string, Row[]> = {}) {
  const state: FakeSupabaseState = { tables: {} };
  for (const [name, rows] of Object.entries(initial)) {
    state.tables[name] = rows.map((r) => ({ ...r }));
  }
  let idCounter = 0;

  function rowsOf(table: string): Row[] {
    if (!state.tables[table]) state.tables[table] = [];
    return state.tables[table];
  }

  function matches(row: Row, filters: Filter[]): boolean {
    return filters.every((f) => {
      const v = row[f.column];
      switch (f.kind) {
        case 'eq':
          return v === f.value;
        case 'in':
          return f.values.includes(v);
        case 'gte':
          return v != null && String(v) >= String(f.value);
        case 'lte':
          return v != null && String(v) <= String(f.value);
        case 'is':
          return (v ?? null) === f.value;
      }
    });
  }

  function from(table: string) {
    const filters: Filter[] = [];
    let op: 'select' | 'insert' | 'update' | 'upsert' = 'select';
    let payload: Row | undefined;
    let upsertKeys: string[] = [];
    let head = false;
    let wantCount = false;
    const orders: Array<{ column: string; ascending: boolean }> = [];
    let limitN: number | undefined;

    function execute(): { data: unknown; error: null; count?: number } {
      const rows = rowsOf(table);
      if (op === 'insert') {
        const row = { id: `${table}-${++idCounter}`, ...payload };
        rows.push(row);
        return { data: row, error: null };
      }
      if (op === 'upsert') {
        const existing = rows.find((r) => upsertKeys.every((k) => r[k] === payload![k]));
        if (existing) Object.assign(existing, payload);
        else rows.push({ id: `${table}-${++idCounter}`, ...payload });
        return { data: null, error: null };
      }
      const hit = rows.filter((r) => matches(r, filters));
      if (op === 'update') {
        hit.forEach((r) => Object.assign(r, payload));
        return { data: hit, error: null };
      }
      const sorted = orders.length
        ? [...hit].sort((a, b) => {
            for (const o of orders) {
              const av = String(a[o.column]);
              const bv = String(b[o.column]);
              if (av !== bv) return (av < bv ? -1 : 1) * (o.ascending ? 1 : -1);
            }
            return 0;
          })
        : hit;
      const limited = limitN === undefined ? sorted : sorted.slice(0, limitN);
      return {
        data: head ? null : limited,
        error: null,
        ...(wantCount ? { count: hit.length } : {}),
      };
    }

    const builder: Record<string, unknown> = {};
    builder.select = (_cols?: string, opts?: { count?: string; head?: boolean }) => {
      if (opts?.count) wantCount = true;
      if (opts?.head) head = true;
      return builder;
    };
    builder.insert = (p: Row) => {
      op = 'insert';
      payload = p;
      return builder;
    };
    builder.update = (p: Row) => {
      op = 'update';
      payload = p;
      return builder;
    };
    builder.upsert = (p: Row, opts?: { onConflict?: string }) => {
      op = 'upsert';
      payload = p;
      upsertKeys = (opts?.onConflict ?? 'id').split(',').map((s) => s.trim());
      return builder;
    };
    builder.eq = (column: string, value: unknown) => {
      filters.push({ kind: 'eq', column, value });
      return builder;
    };
    builder.in = (column: string, values: unknown[]) => {
      filters.push({ kind: 'in', column, values });
      return builder;
    };
    builder.gte = (column: string, value: unknown) => {
      filters.push({ kind: 'gte', column, value });
      return builder;
    };
    builder.lte = (column: string, value: unknown) => {
      filters.push({ kind: 'lte', column, value });
      return builder;
    };
    builder.order = (column: string, opts?: { ascending?: boolean }) => {
      orders.push({ column, ascending: opts?.ascending ?? true });
      return builder;
    };
    builder.limit = (n: number) => {
      limitN = n;
      return builder;
    };
    builder.is = (column: string, value: unknown) => {
      filters.push({ kind: 'is', column, value });
      return builder;
    };
    builder.maybeSingle = async () => {
      const r = execute();
      const data = Array.isArray(r.data) ? (r.data[0] ?? null) : r.data;
      return { data, error: null };
    };
    builder.single = builder.maybeSingle;
    builder.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
      Promise.resolve(execute()).then(resolve, reject);
    return builder;
  }

  return { client: { from }, state };
}

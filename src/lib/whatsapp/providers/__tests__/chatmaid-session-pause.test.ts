import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Minimal stand-in for the `whatsapp_sessions` table behind the admin client,
 * supporting exactly the calls the pause store makes.
 */
function fakeSessionsTable(initialRows: Record<string, unknown>[] = []) {
  const rows = [...initialRows];
  const inserts: Record<string, unknown>[] = [];

  const from = vi.fn(() => ({
    select: () => ({
      eq: (_column: string, value: string) => ({
        maybeSingle: async () => ({ data: rows.find((r) => r.phone_number === value) ?? null, error: null }),
      }),
    }),
    update: (patch: Record<string, unknown>) => ({
      eq: (_column: string, value: string) => ({
        select: async () => {
          const matched = rows.filter((r) => r.phone_number === value);
          matched.forEach((r) => Object.assign(r, patch));
          return { data: matched.map((r) => ({ id: r.id })), error: null };
        },
      }),
    }),
    insert: async (row: Record<string, unknown>) => {
      inserts.push(row);
      rows.push({ id: `new-${rows.length}`, ...row });
      return { error: null };
    },
  }));

  return { client: { from }, rows, inserts };
}

describe('createSupabaseChatmaidSessionPauseStore', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  async function load(table: ReturnType<typeof fakeSessionsTable>) {
    vi.doMock('@/lib/supabase/server', () => ({ createAdminClient: () => table.client }));
    const mod = await import('@/lib/whatsapp/providers/chatmaid-inbound');
    return mod.createSupabaseChatmaidSessionPauseStore();
  }

  it('sets paused_until on an existing session without inserting', async () => {
    const table = fakeSessionsTable([{ id: 's1', phone_number: '+2348000000000', expires_at: 'x' }]);
    const store = await load(table);
    const until = new Date('2026-09-22T12:30:00.000Z');

    await store.pause('2348000000000', until);

    expect(table.inserts).toEqual([]);
    expect(table.rows[0].paused_until).toBe(until.toISOString());
    expect(table.rows[0].expires_at).toBe('x');
  });

  it('inserts an already-expired row carrying the pause when no session exists', async () => {
    const table = fakeSessionsTable();
    const store = await load(table);
    const until = new Date('2026-09-22T12:30:00.000Z');

    await store.pause('+2348000000000', until);

    expect(table.inserts).toHaveLength(1);
    expect(table.inserts[0]).toMatchObject({
      phone_number: '+2348000000000',
      paused_until: until.toISOString(),
      expires_at: expect.any(String),
    });
    expect(Date.parse(table.inserts[0].expires_at as string)).toBeLessThanOrEqual(Date.now());
  });

  it('reads paused_until back for the normalised number', async () => {
    const table = fakeSessionsTable([
      { id: 's1', phone_number: '+2348000000000', paused_until: '2026-09-22T12:30:00.000Z' },
    ]);
    const store = await load(table);

    await expect(store.getPausedUntil('08000000000')).resolves.toEqual(new Date('2026-09-22T12:30:00.000Z'));
    await expect(store.getPausedUntil('+2349999999999')).resolves.toBeNull();
  });
});

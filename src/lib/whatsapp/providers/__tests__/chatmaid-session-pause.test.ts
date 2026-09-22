import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Minimal stand-in for the `whatsapp_sessions` table behind the admin client,
 * supporting exactly the calls the pause store makes.
 */
function fakeSessionsTable(
  initialRows: Record<string, unknown>[] = [],
  options: { insertConflictRow?: Record<string, unknown> } = {}
) {
  const rows = [...initialRows];
  const inserts: Record<string, unknown>[] = [];
  const updates: Record<string, unknown>[] = [];

  const from = vi.fn(() => ({
    select: () => ({
      eq: (_column: string, value: string) => ({
        maybeSingle: async () => ({ data: rows.find((r) => r.phone_number === value) ?? null, error: null }),
      }),
    }),
    update: (patch: Record<string, unknown>) => ({
      eq: (_column: string, value: string) => ({
        select: async () => {
          updates.push(patch);
          const matched = rows.filter((r) => r.phone_number === value);
          matched.forEach((r) => Object.assign(r, patch));
          return { data: matched.map((r) => ({ id: r.id })), error: null };
        },
      }),
    }),
    insert: async (row: Record<string, unknown>) => {
      inserts.push(row);
      if (options.insertConflictRow) {
        // Another request created the session between our update and insert.
        rows.push(options.insertConflictRow);
        return { error: { code: '23505', message: 'duplicate key' } };
      }
      rows.push({ id: `new-${rows.length}`, ...row });
      return { error: null };
    },
  }));

  return { client: { from }, rows, inserts, updates };
}

describe('createSupabaseChatmaidSessionPauseStore', () => {
  const NOW = new Date('2026-09-22T12:00:00.000Z');

  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
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

  it('updates only paused_until and updated_at on an existing session (exact payload)', async () => {
    const table = fakeSessionsTable([{ id: 's1', phone_number: '+2348000000000', expires_at: 'x' }]);
    const store = await load(table);
    const until = new Date('2026-09-22T12:30:00.000Z');

    await store.pause('+2348000000000', until);

    expect(table.updates).toEqual([{ paused_until: until.toISOString(), updated_at: NOW.toISOString() }]);
  });

  it('inserts exactly phone_number, paused_until and an already-expired expires_at (exact payload)', async () => {
    const table = fakeSessionsTable();
    const store = await load(table);
    const until = new Date('2026-09-22T12:30:00.000Z');

    await store.pause('+2348000000000', until);

    // No resident_id, no pin_authenticated, no live session: a pause row must
    // never grant or imply an authenticated conversation.
    expect(table.inserts).toEqual([
      { phone_number: '+2348000000000', paused_until: until.toISOString(), expires_at: NOW.toISOString() },
    ]);
  });

  it('retries the update when the insert hits a unique violation (row created concurrently)', async () => {
    const table = fakeSessionsTable([], {
      insertConflictRow: { id: 'raced', phone_number: '+2348000000000', expires_at: 'live' },
    });
    const store = await load(table);
    const until = new Date('2026-09-22T12:30:00.000Z');

    await expect(store.pause('+2348000000000', until)).resolves.toBeUndefined();

    expect(table.inserts).toHaveLength(1);
    expect(table.updates).toHaveLength(2);
    const raced = table.rows.find((r) => r.id === 'raced');
    expect(raced?.paused_until).toBe(until.toISOString());
    expect(raced?.expires_at).toBe('live');
  });

  it('propagates a read error instead of treating it as "not paused"', async () => {
    const failing = {
      from: () => ({
        select: () => ({
          eq: () => ({ maybeSingle: async () => ({ data: null, error: new Error('db down') }) }),
        }),
      }),
    };
    vi.doMock('@/lib/supabase/server', () => ({ createAdminClient: () => failing }));
    const mod = await import('@/lib/whatsapp/providers/chatmaid-inbound');

    await expect(mod.createSupabaseChatmaidSessionPauseStore().getPausedUntil('+2348000000000')).rejects.toThrow(
      'db down'
    );
  });
});

import { describe, expect, it, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  authorizePermission: vi.fn(),
  logAudit: vi.fn(),
  getChangedValues: vi.fn(),
  createServerSupabaseClient: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock('@/lib/auth/authorize', () => ({ authorizePermission: mocks.authorizePermission }));
vi.mock('@/lib/audit/logger', () => ({
  logAudit: mocks.logAudit,
  getChangedValues: mocks.getChangedValues,
}));
vi.mock('@/lib/supabase/server', () => ({ createServerSupabaseClient: mocks.createServerSupabaseClient }));
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }));

import { clearIdentifierFlag } from '../clear-identifier-flag';
import { PERMISSIONS } from '@/lib/auth/action-roles';

const CURRENT_HOUSE = {
  id: 'house-1',
  house_number: '3?F?',
  short_name: 'IBB-3?F?',
  identifier_unverified: true,
  identifier_note: 'Register character illegible.',
};

/**
 * The `select` spy is exposed so the joined-shape assertion can read what the
 * update actually asked Postgres for.
 */
function buildClient({
  current = CURRENT_HOUSE as Record<string, unknown> | null,
  fetchError = null as unknown,
  updated = { ...CURRENT_HOUSE, identifier_unverified: false, street: { name: 'Ibrahim Babatunde' }, house_type: null } as Record<string, unknown> | null,
  updateError = null as unknown,
}) {
  const updateSelect = vi.fn();

  const from = vi.fn(() => {
    const chain: Record<string, unknown> = {};
    let isUpdate = false;

    chain.select = vi.fn((cols?: string) => {
      if (isUpdate) updateSelect(cols);
      return chain;
    });
    chain.update = vi.fn((values: unknown) => {
      isUpdate = true;
      (chain as { updateValues?: unknown }).updateValues = values;
      return chain;
    });
    chain.eq = vi.fn(() => chain);
    chain.single = vi.fn(() =>
      Promise.resolve(
        isUpdate ? { data: updated, error: updateError } : { data: current, error: fetchError }
      )
    );

    return chain;
  });

  return { client: { from }, from, updateSelect };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.authorizePermission.mockResolvedValue({ authorized: true, userId: 'admin-1' });
  mocks.getChangedValues.mockReturnValue({
    old: { identifier_unverified: true },
    new: { identifier_unverified: false },
  });
});

describe('clearIdentifierFlag (issue #119)', () => {
  it('refuses a caller without houses.update and never touches the database', async () => {
    mocks.authorizePermission.mockResolvedValue({ authorized: false, error: 'Insufficient permissions' });
    const { client, from } = buildClient({});
    mocks.createServerSupabaseClient.mockResolvedValue(client);

    const result = await clearIdentifierFlag('house-1');

    expect(result.data).toBeNull();
    expect(result.error).toBe('Insufficient permissions');
    // The guard must run before any query, so an unauthorized caller cannot
    // even read the row it was refused permission to change.
    expect(from).not.toHaveBeenCalled();
    expect(mocks.logAudit).not.toHaveBeenCalled();
  });

  it('checks houses.update specifically, not the view permission', async () => {
    const { client } = buildClient({});
    mocks.createServerSupabaseClient.mockResolvedValue(client);

    await clearIdentifierFlag('house-1');

    expect(mocks.authorizePermission).toHaveBeenCalledWith(PERMISSIONS.HOUSES_UPDATE);
    expect(mocks.authorizePermission).not.toHaveBeenCalledWith(PERMISSIONS.HOUSES_VIEW);
  });

  it('clears the flag and writes an audit record on success', async () => {
    const { client } = buildClient({});
    mocks.createServerSupabaseClient.mockResolvedValue(client);

    const result = await clearIdentifierFlag('house-1', 'Confirmed on site 9 Sep 2026');

    expect(result.error).toBeNull();
    expect(result.data).toMatchObject({ identifier_unverified: false });

    expect(mocks.logAudit).toHaveBeenCalledTimes(1);
    expect(mocks.logAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'UPDATE',
        entityType: 'houses',
        entityId: 'house-1',
        oldValues: { identifier_unverified: true },
        newValues: { identifier_unverified: false },
      })
    );
  });

  it('does not rewrite the recorded identifier', async () => {
    const { client, from } = buildClient({});
    mocks.createServerSupabaseClient.mockResolvedValue(client);

    await clearIdentifierFlag('house-1', 'Confirmed');

    // from() is called twice: [0] reads the current row, [1] performs the update.
    const chain = from.mock.results[1].value as {
      updateValues: Record<string, unknown>;
    };
    expect(chain.updateValues).toEqual({
      identifier_unverified: false,
      identifier_note: 'Confirmed',
    });
    // The owner's decision: `3?F?` stays `3?F?`.
    expect(chain.updateValues).not.toHaveProperty('house_number');
    expect(chain.updateValues).not.toHaveProperty('short_name');
  });

  it('returns the same joined shape as the list query so the row does not blank', async () => {
    const { client, updateSelect } = buildClient({});
    mocks.createServerSupabaseClient.mockResolvedValue(client);

    const result = await clearIdentifierFlag('house-1');

    const requestedColumns = updateSelect.mock.calls[0][0] as string;
    expect(requestedColumns).toContain('street:streets(*)');
    expect(requestedColumns).toContain('house_type:house_types(*)');
    expect(result.data).toHaveProperty('street');
  });

  it('leaves the existing note alone when no note is supplied', async () => {
    const { client, from } = buildClient({});
    mocks.createServerSupabaseClient.mockResolvedValue(client);

    await clearIdentifierFlag('house-1');

    const chain = from.mock.results[1].value as { updateValues: Record<string, unknown> };
    expect(chain.updateValues.identifier_note).toBe('Register character illegible.');
  });

  it('reports a missing house without auditing anything', async () => {
    const { client } = buildClient({ current: null });
    mocks.createServerSupabaseClient.mockResolvedValue(client);

    const result = await clearIdentifierFlag('missing');

    expect(result.error).toBe('House not found');
    expect(mocks.logAudit).not.toHaveBeenCalled();
  });

  it('does not audit a failed write', async () => {
    const { client } = buildClient({ updated: null, updateError: { message: 'db exploded' } });
    mocks.createServerSupabaseClient.mockResolvedValue(client);

    const result = await clearIdentifierFlag('house-1');

    expect(result.error).toBe('db exploded');
    expect(mocks.logAudit).not.toHaveBeenCalled();
  });
});

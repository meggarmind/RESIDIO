import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Issue #464: getResidentOptions is the slim replacement for
 * `useResidents({ limit: 500 })` in name-only dropdowns. It must stay slim
 * (no nested resident_houses join) and keep the same RESIDENTS_VIEW gate.
 */

const state = vi.hoisted(() => ({
  authorized: true,
  select: vi.fn(),
  from: vi.fn(),
}));

vi.mock('@/lib/auth/authorize', () => ({
  authorizePermission: vi.fn(async () =>
    state.authorized ? { authorized: true } : { authorized: false, error: 'Unauthorized' },
  ),
}));

vi.mock('@/lib/supabase/server', () => {
  const chain = {
    select: (...args: unknown[]) => {
      state.select(...args);
      return chain;
    },
    order: () => chain,
    limit: async () => ({ data: [{ id: 'r1', first_name: 'A', last_name: 'B', resident_code: 'R1' }], error: null }),
  };
  return {
    createServerSupabaseClient: async () => ({
      from: (table: string) => {
        state.from(table);
        return chain;
      },
    }),
    createAdminClient: () => ({}),
  };
});

import { getResidentOptions } from '@/actions/residents/get-residents';

beforeEach(() => {
  state.authorized = true;
  state.select.mockClear();
  state.from.mockClear();
});

describe('getResidentOptions', () => {
  it('selects only id, names and code, with no nested joins', async () => {
    const result = await getResidentOptions();
    expect(state.from).toHaveBeenCalledWith('residents');
    expect(state.select).toHaveBeenCalledWith('id, first_name, last_name, resident_code');
    expect(result.error).toBeNull();
    expect(result.data).toHaveLength(1);
  });

  it('is gated by RESIDENTS_VIEW and does not query when unauthorized', async () => {
    state.authorized = false;
    const result = await getResidentOptions();
    expect(result).toEqual({ data: [], error: 'Unauthorized' });
    expect(state.from).not.toHaveBeenCalled();
  });
});

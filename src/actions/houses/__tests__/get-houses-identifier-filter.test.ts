import { describe, expect, it, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  createServerSupabaseClient: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({ createServerSupabaseClient: mocks.createServerSupabaseClient }));

import { getHouses } from '../get-houses';

const FLAGGED = {
  id: 'h-1',
  house_number: '3?F?',
  short_name: 'IBB-3?F?',
  identifier_unverified: true,
  identifier_note: 'Register character illegible.',
};
const CONFIRMED = {
  id: 'h-2',
  house_number: '30F-1',
  short_name: 'IBB-30F-1',
  identifier_unverified: false,
  identifier_note: null,
};

const ALL_ROWS = [FLAGGED, CONFIRMED];

/**
 * A query double that actually honours `.eq()`. Asserting only that `.eq` was
 * called would pass even if the filter were wired to the wrong column, so the
 * double filters the fixture rows and the tests assert on the returned set.
 */
function buildClient() {
  const eqCalls: Array<[string, unknown]> = [];

  const chain: Record<string, unknown> = {};
  let rows = ALL_ROWS;
  let selectedColumns = '';

  chain.select = vi.fn((cols: string) => {
    selectedColumns = cols;
    return chain;
  });
  chain.eq = vi.fn((column: string, value: unknown) => {
    eqCalls.push([column, value]);
    rows = rows.filter((row) => (row as unknown as Record<string, unknown>)[column] === value
      // `is_active` is not on the fixtures; treat it as satisfied.
      || column === 'is_active');
    return chain;
  });
  chain.ilike = vi.fn(() => chain);
  chain.order = vi.fn(() => chain);
  chain.range = vi.fn(() => chain);
  chain.then = (resolve: (value: unknown) => unknown) =>
    Promise.resolve({ data: rows, error: null, count: rows.length }).then(resolve);

  return {
    client: { from: vi.fn(() => chain) },
    eqCalls,
    getSelectedColumns: () => selectedColumns,
  };
}

beforeEach(() => vi.clearAllMocks());

describe('getHouses identifier_unverified filter (issue #119)', () => {
  it('returns only flagged houses when the filter is true', async () => {
    const { client, eqCalls } = buildClient();
    mocks.createServerSupabaseClient.mockResolvedValue(client);

    const result = await getHouses({ identifier_unverified: true });

    expect(eqCalls).toContainEqual(['identifier_unverified', true]);
    expect(result.data.map((h) => h.id)).toEqual(['h-1']);
    expect(result.data.every((h) => h.identifier_unverified)).toBe(true);
  });

  it('returns only confirmed houses when the filter is false', async () => {
    const { client } = buildClient();
    mocks.createServerSupabaseClient.mockResolvedValue(client);

    const result = await getHouses({ identifier_unverified: false });

    expect(result.data.map((h) => h.id)).toEqual(['h-2']);
  });

  it('returns every house when the filter is omitted', async () => {
    const { client, eqCalls } = buildClient();
    mocks.createServerSupabaseClient.mockResolvedValue(client);

    const result = await getHouses({});

    expect(eqCalls.map(([column]) => column)).not.toContain('identifier_unverified');
    expect(result.data.map((h) => h.id).sort()).toEqual(['h-1', 'h-2']);
  });

  it('selects the flag columns so the list can render the badge', async () => {
    const { client, getSelectedColumns } = buildClient();
    mocks.createServerSupabaseClient.mockResolvedValue(client);

    await getHouses({});

    // The list selects `*`, which carries both new columns once the migration
    // is applied; the joins are named explicitly so the badge and the street
    // arrive in one round trip.
    expect(getSelectedColumns()).toContain('*');
    expect(getSelectedColumns()).toContain('street:streets(*)');
  });
});

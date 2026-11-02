import { beforeEach, describe, expect, it, vi } from 'vitest';

// A chainable, awaitable stand-in for a supabase query builder.
function builder(result: unknown) {
  const calls: Array<[string, unknown[]]> = [];
  const b: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'gt', 'order', 'range', 'limit']) {
    b[m] = (...args: unknown[]) => {
      calls.push([m, args]);
      return b;
    };
  }
  b.then = (resolve: (v: unknown) => unknown) => Promise.resolve(result).then(resolve);
  return { b, calls };
}

const mocks = vi.hoisted(() => ({ from: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: async () => ({ from: mocks.from }),
}));

import { getEmailImportSummary, listEmailImports } from '@/actions/email-imports/create-email-import';

describe('listEmailImports', () => {
  beforeEach(() => mocks.from.mockReset());

  it('filters has=queued on transactions_queued', async () => {
    const { b, calls } = builder({ data: [], count: 0, error: null });
    mocks.from.mockReturnValue(b);
    await listEmailImports({ has: 'queued' });
    expect(calls).toContainEqual(['gt', ['transactions_queued', 0]]);
  });

  it('filters has=auto_processed on transactions_auto_processed', async () => {
    const { b, calls } = builder({ data: [], count: 0, error: null });
    mocks.from.mockReturnValue(b);
    await listEmailImports({ has: 'auto_processed' });
    expect(calls).toContainEqual(['gt', ['transactions_auto_processed', 0]]);
  });

  it('turns limit + offset into one inclusive range', async () => {
    const { b, calls } = builder({ data: [], count: 60, error: null });
    mocks.from.mockReturnValue(b);
    await listEmailImports({ limit: 25, offset: 50 });
    expect(calls.filter(([m]) => m === 'range')).toEqual([['range', [50, 74]]]);
    expect(calls.some(([m]) => m === 'limit')).toBe(false);
  });

  it('starts at 0 when only limit is given', async () => {
    const { b, calls } = builder({ data: [], count: 0, error: null });
    mocks.from.mockReturnValue(b);
    await listEmailImports({ limit: 25 });
    expect(calls).toContainEqual(['range', [0, 24]]);
  });
});

describe('getEmailImportSummary', () => {
  beforeEach(() => mocks.from.mockReset());

  it('counts and sums over every row, paging past 1000', async () => {
    const full = Array.from({ length: 1000 }, () => ({
      transactions_queued: 1,
      transactions_auto_processed: 2,
    }));
    const tail = [{ transactions_queued: 5, transactions_auto_processed: null }];
    const rangeCalls: unknown[][] = [];
    let pageIdx = 0;

    mocks.from.mockImplementation(() => {
      let completedOnly = false;
      const b: Record<string, unknown> = {};
      b.select = () => b;
      b.eq = () => {
        completedOnly = true;
        return b;
      };
      b.order = () => b;
      b.range = (...args: unknown[]) => {
        rangeCalls.push(args);
        return Promise.resolve({ data: pageIdx++ === 0 ? full : tail, error: null });
      };
      b.then = (resolve: (v: unknown) => unknown) =>
        Promise.resolve({ count: completedOnly ? 1500 : 1700, error: null }).then(resolve);
      return b;
    });

    const res = await getEmailImportSummary();
    expect(res.error).toBeNull();
    expect(res.data).toEqual({
      total: 1700,
      completed: 1500,
      queued: 1000 + 5,
      autoProcessed: 2000,
    });
    expect(rangeCalls).toEqual([
      [0, 999],
      [1000, 1999],
    ]);
  });

  it('returns the error reason when a query fails', async () => {
    const { b } = builder({ count: null, error: { message: 'boom' } });
    mocks.from.mockReturnValue(b);
    const res = await getEmailImportSummary();
    expect(res).toEqual({ data: null, error: 'boom' });
  });
});

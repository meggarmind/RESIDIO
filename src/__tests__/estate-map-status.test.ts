import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getEstateMapStatus } from '@/actions/dashboard/get-estate-map-status';
import { PERMISSIONS } from '@/lib/auth/action-roles';

const { authorizePermission, createServerSupabaseClient } = vi.hoisted(() => ({
  authorizePermission: vi.fn(),
  createServerSupabaseClient: vi.fn(),
}));

vi.mock('@/lib/auth/authorize', () => ({ authorizePermission }));
vi.mock('@/lib/supabase/server', () => ({ createServerSupabaseClient }));

type Rows = Record<string, unknown>[];

// Chainable query that honours .range so paging is exercised.
function table(rows: Rows, error: { message: string } | null = null) {
  let from = 0;
  let to = Infinity;
  const q: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'in', 'not', 'order']) q[m] = vi.fn(() => q);
  q.range = vi.fn((f: number, t: number) => {
    from = f;
    to = t;
    return q;
  });
  q.then = (resolve: (v: unknown) => unknown) =>
    Promise.resolve({ data: error ? null : rows.slice(from, to + 1), error }).then(resolve);
  return q;
}

const iso = (offsetDays: number) => new Date(Date.now() + offsetDays * 86_400_000).toISOString().slice(0, 10);

const house = (id: string, num: string, street = 'Alpha') => ({
  id,
  house_number: num,
  street_id: `s-${street}`,
  streets: { name: street },
});

function setup(houses: Rows, invoices: Rows, invoiceError: { message: string } | null = null) {
  const from = vi.fn((name: string) => (name === 'houses' ? table(houses) : table(invoices, invoiceError)));
  createServerSupabaseClient.mockResolvedValue({ from });
  return from;
}

const inv = (house_id: string, status: string, due: number) => ({ house_id, status, due_date: iso(due) });

describe('getEstateMapStatus', () => {
  beforeEach(() => {
    authorizePermission.mockReset().mockResolvedValue({ authorized: true });
    createServerSupabaseClient.mockReset();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('rejects unauthorized reads before querying', async () => {
    authorizePermission.mockResolvedValue({ authorized: false, error: 'Unauthorized: nope' });
    const result = await getEstateMapStatus();
    expect(result).toEqual({ data: null, error: 'Unauthorized: nope' });
    expect(authorizePermission).toHaveBeenCalledWith(PERMISSIONS.BILLING_VIEW);
    expect(createServerSupabaseClient).not.toHaveBeenCalled();
  });

  it('classifies all four statuses', async () => {
    setup(
      [house('h1', '1'), house('h2', '2'), house('h3', '3'), house('h4', '4')],
      [inv('h1', 'paid', -30), inv('h2', 'unpaid', 10), inv('h3', 'partially_paid', -5)]
    );
    const { data } = await getEstateMapStatus();
    const by = Object.fromEntries(data!.houses.map((h) => [h.id, h.status]));
    expect(by).toEqual({ h1: 'paid_up', h2: 'outstanding', h3: 'overdue', h4: 'no_invoice' });
  });

  it('overdue wins over outstanding regardless of row order', async () => {
    setup([house('h1', '1'), house('h2', '2')], [
      inv('h1', 'unpaid', 10),
      inv('h1', 'unpaid', -10),
      inv('h2', 'unpaid', -10),
      inv('h2', 'unpaid', 10),
    ]);
    const { data } = await getEstateMapStatus();
    expect(data!.houses.map((h) => h.status)).toEqual(['overdue', 'overdue']);
  });

  it('an open invoice beats paid history', async () => {
    setup([house('h1', '1')], [inv('h1', 'paid', -60), inv('h1', 'unpaid', 5)]);
    const { data } = await getEstateMapStatus();
    expect(data!.houses[0].status).toBe('outstanding');
  });

  it('ignores void invoices and does not request them', async () => {
    const from = setup([house('h1', '1')], [inv('h1', 'void', -30)]);
    const { data } = await getEstateMapStatus();
    expect(data!.houses[0].status).toBe('no_invoice');
    const invoiceQuery = from.mock.results[1].value as { in: ReturnType<typeof vi.fn> };
    expect(invoiceQuery.in).toHaveBeenCalledWith('status', ['unpaid', 'partially_paid', 'paid']);
  });

  it('counts equal the tallies and sum to houses length', async () => {
    setup(
      [house('h1', '1'), house('h2', '2'), house('h3', '3'), house('h4', '4'), house('h5', '5')],
      [inv('h1', 'paid', -1), inv('h2', 'unpaid', -1), inv('h3', 'unpaid', 1), inv('h5', 'paid', -1)]
    );
    const { data } = await getEstateMapStatus();
    expect(data!.counts).toEqual({ paid_up: 2, outstanding: 1, overdue: 1, no_invoice: 1 });
    expect(Object.values(data!.counts).reduce((a, b) => a + b, 0)).toBe(data!.houses.length);
    expect(Number.isNaN(Date.parse(data!.asOf))).toBe(false);
  });

  it('sorts by street then natural house number', async () => {
    setup([house('a', '10', 'Beta'), house('b', '2', 'Beta'), house('c', '1', 'Alpha')], []);
    const { data } = await getEstateMapStatus();
    expect(data!.houses.map((h) => h.id)).toEqual(['c', 'b', 'a']);
  });

  it('pages past the 1000 row cap', async () => {
    const houses = Array.from({ length: 1500 }, (_, i) => house(`h${i}`, String(i + 1)));
    setup(houses, []);
    const { data } = await getEstateMapStatus();
    expect(data!.houses).toHaveLength(1500);
  });

  it('returns the error message and logs context on failure', async () => {
    setup([house('h1', '1')], [], { message: 'boom' });
    const result = await getEstateMapStatus();
    expect(result).toEqual({ data: null, error: 'boom' });
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('getEstateMapStatus'), expect.anything());
  });
});

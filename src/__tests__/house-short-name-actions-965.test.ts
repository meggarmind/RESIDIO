import { beforeEach, describe, expect, it, vi } from 'vitest';

const insert = vi.fn();
const update = vi.fn();
let storedShortName: string | null = null;

const chain = (result: unknown) => {
  const c: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'insert', 'update']) c[m] = vi.fn(() => c);
  c.single = vi.fn(async () => result);
  return c;
};

const supabase = {
  auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }) },
  from: vi.fn((table: string) => {
    if (table !== 'houses') return chain({ data: [], error: null });
    const c = chain({ data: null, error: null });
    c.single = vi.fn(async () => ({
      data: { id: 'h1', house_number: '14', short_name: storedShortName, number_of_plots: 1, identifier_unverified: false },
      error: null,
    }));
    c.insert = vi.fn((v) => { insert(v); return c; });
    c.update = vi.fn((v) => { update(v); return c; });
    return c;
  }),
};

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: async () => supabase,
  createAdminClient: () => supabase,
}));
vi.mock('@/lib/auth/authorize', () => ({ authorizePermission: async () => ({ authorized: true }) }));
vi.mock('@/lib/audit/logger', () => ({ logAudit: vi.fn(), getChangedValues: () => ({ old: {}, new: {} }) }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/actions/approvals', () => ({ canAutoApprove: async () => true }));
vi.mock('@/lib/approvals/create-approval-request', () => ({ createApprovalRequest: vi.fn() }));
vi.mock('@/actions/billing/generate-levies', () => ({ generateLeviesForHouse: vi.fn() }));

import { createHouse } from '@/actions/houses/create-house';
import { updateHouse } from '@/actions/houses/update-house';

const form = (short_name: string) => ({
  house_number: '14',
  street_id: '11111111-1111-4111-8111-111111111111',
  number_of_plots: 1,
  short_name,
});

beforeEach(() => {
  insert.mockClear();
  update.mockClear();
  storedShortName = null;
});

describe('house short_name server-side (#965)', () => {
  it('rejects a bad value on create without writing', async () => {
    const res = await createHouse(form('GLB-14 F1'));
    expect(res.error).toBe('Use letters, digits, dots and hyphens only');
    expect(insert).not.toHaveBeenCalled();
  });

  it('accepts a good value on create', async () => {
    await createHouse(form('GLB-14-F1'));
    expect(insert).toHaveBeenCalled();
  });

  it('rejects a changed bad value on update without writing', async () => {
    storedShortName = 'GLB-14';
    const res = await updateHouse('h1', form('GLB-14 F1'));
    expect(res.error).toBe('Use letters, digits, dots and hyphens only');
    expect(update).not.toHaveBeenCalled();
  });

  it('accepts an unchanged stored value containing "?" on update', async () => {
    storedShortName = 'IBB-3?F?';
    const res = await updateHouse('h1', form('IBB-3?F?'));
    expect(res.error).toBeNull();
    expect(update).toHaveBeenCalled();
  });
});

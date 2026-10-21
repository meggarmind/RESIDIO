import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  authorizePermission: vi.fn(),
  createServerSupabaseClient: vi.fn(),
  logAudit: vi.fn(),
}));

vi.mock('@/lib/auth/authorize', () => ({ authorizePermission: mocks.authorizePermission }));
vi.mock('@/lib/supabase/server', () => ({ createServerSupabaseClient: mocks.createServerSupabaseClient }));
vi.mock('@/lib/audit/logger', () => ({ logAudit: mocks.logAudit }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

import { updateExpenseStatus } from '@/actions/expenses/update-expense';

/** Production builds redact a thrown server-action message, so failures are returned (#785). */
describe('updateExpenseStatus returns its failure instead of throwing', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns Unauthorized without touching the database', async () => {
    mocks.authorizePermission.mockResolvedValue({ authorized: false });

    await expect(updateExpenseStatus('exp-1', 'paid')).resolves.toEqual({ error: 'Unauthorized' });
    expect(mocks.createServerSupabaseClient).not.toHaveBeenCalled();
  });

  it('returns Expense not found when the row is missing', async () => {
    mocks.authorizePermission.mockResolvedValue({ authorized: true });
    const single = vi.fn().mockResolvedValue({ data: null, error: { message: 'no rows' } });
    mocks.createServerSupabaseClient.mockResolvedValue({
      from: () => ({ select: () => ({ eq: () => ({ single }) }) }),
    });

    await expect(updateExpenseStatus('exp-1', 'paid')).resolves.toEqual({ error: 'Expense not found' });
    expect(mocks.logAudit).not.toHaveBeenCalled();
  });
});

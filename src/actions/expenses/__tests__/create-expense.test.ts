import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  authorizePermission: vi.fn(),
  createServerSupabaseClient: vi.fn(),
  checkDuplicateGuardrail: vi.fn(),
  logAudit: vi.fn(),
}));

vi.mock('@/lib/auth/authorize', () => ({ authorizePermission: mocks.authorizePermission }));
vi.mock('@/lib/supabase/server', () => ({ createServerSupabaseClient: mocks.createServerSupabaseClient }));
vi.mock('@/lib/matching/duplicate-matcher', () => ({ checkDuplicateGuardrail: mocks.checkDuplicateGuardrail }));
vi.mock('@/lib/audit/logger', () => ({ logAudit: mocks.logAudit }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

import { createExpense } from '@/actions/expenses/create-expense';

const input = { amount: 10, category_id: 'cat-1', expense_date: '2026-10-01', description: 'd' };

/** Production builds redact a thrown server-action message, so failures are returned (#845). */
describe('createExpense returns its failure instead of throwing', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns Unauthorized without touching the database', async () => {
    mocks.authorizePermission.mockResolvedValue({ authorized: false });

    await expect(createExpense(input)).resolves.toEqual({ data: null, error: 'Unauthorized' });
    expect(mocks.createServerSupabaseClient).not.toHaveBeenCalled();
  });

  it('returns the duplicate reason without inserting', async () => {
    mocks.authorizePermission.mockResolvedValue({ authorized: true, userId: 'user-1' });
    const from = vi.fn();
    mocks.createServerSupabaseClient.mockResolvedValue({ from });
    mocks.checkDuplicateGuardrail.mockResolvedValue({ isDuplicate: true, reason: 'same amount and date' });

    await expect(createExpense(input)).resolves.toEqual({
      data: null,
      error: 'Duplicate Expense Detected: same amount and date',
    });
    expect(from).not.toHaveBeenCalled();
    expect(mocks.logAudit).not.toHaveBeenCalled();
  });
});

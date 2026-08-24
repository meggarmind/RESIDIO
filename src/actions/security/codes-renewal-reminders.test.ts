import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createServerSupabaseClient: vi.fn(),
  authorizePermission: vi.fn(),
  logAudit: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({ createServerSupabaseClient: mocks.createServerSupabaseClient }));
vi.mock('@/lib/auth/authorize', () => ({ authorizePermission: mocks.authorizePermission }));
vi.mock('@/lib/audit/logger', () => ({ logAudit: mocks.logAudit }));

import { getCodesNeedingRenewalReminder, markReminderSent } from '@/actions/security/codes';

function queryResult<T>(data: T, error: { message: string } | null = null) {
  const chain = {
    select: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    not: vi.fn(() => chain),
    order: vi.fn(() => chain),
    in: vi.fn(() => chain),
    then: (resolve: (value: { data: T; error: { message: string } | null }) => unknown) =>
      Promise.resolve({ data, error }).then(resolve),
  };
  return chain;
}

describe('security renewal reminder reads', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authorizePermission.mockResolvedValue({ authorized: true, userId: 'user-1' });
    mocks.logAudit.mockResolvedValue(undefined);
  });

  it('loads all per-code settings in one batch query', async () => {
    const codes = [
      {
        id: 'code-1',
        code: 'ABC',
        valid_until: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        contact: { id: 'contact-1', full_name: 'Resident One', resident: null },
      },
      {
        id: 'code-2',
        code: 'DEF',
        valid_until: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(),
        contact: { id: 'contact-2', full_name: 'Resident Two', resident: null },
      },
    ];
    const accessCodesQuery = queryResult(codes);
    const settingsQuery = queryResult([
      { key: 'access_code_reminder_code-1', value: '3' },
      { key: 'access_code_reminder_sent_code-2', value: 'true' },
    ]);
    const from = vi.fn((table: string) => table === 'access_codes' ? accessCodesQuery : settingsQuery);
    mocks.createServerSupabaseClient.mockResolvedValue({ from });

    const result = await getCodesNeedingRenewalReminder();

    expect(result.error).toBeNull();
    expect(result.data.map((code) => code.code_id)).toEqual(['code-1']);
    expect(from).toHaveBeenCalledTimes(2);
    expect(settingsQuery.in).toHaveBeenCalledWith('key', [
      'access_code_reminder_code-1',
      'access_code_reminder_sent_code-1',
      'access_code_reminder_code-2',
      'access_code_reminder_sent_code-2',
    ]);
  });

  it('denies reminder writes before database access', async () => {
    mocks.authorizePermission.mockResolvedValue({ authorized: false, error: 'Denied' });

    await expect(markReminderSent('code-1')).resolves.toEqual({ success: false, error: 'Denied' });
    expect(mocks.createServerSupabaseClient).not.toHaveBeenCalled();
    expect(mocks.logAudit).not.toHaveBeenCalled();
  });

  it('audits after a successful reminder write', async () => {
    const upsert = vi.fn().mockResolvedValue({ error: null });
    mocks.createServerSupabaseClient.mockResolvedValue({ from: vi.fn(() => ({ upsert })) });

    await expect(markReminderSent('code-1')).resolves.toEqual({ success: true, error: null });
    expect(upsert).toHaveBeenCalledTimes(1);
    expect(mocks.logAudit).toHaveBeenCalledTimes(1);
  });

  it('fails closed when the batched settings read fails', async () => {
    const accessCodesQuery = queryResult([{
      id: 'code-1',
      code: 'ABC',
      valid_until: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      contact: null,
    }]);
    const settingsQuery = queryResult([], { message: 'settings unavailable' });
    mocks.createServerSupabaseClient.mockResolvedValue({
      from: vi.fn((table: string) => table === 'access_codes' ? accessCodesQuery : settingsQuery),
    });

    await expect(getCodesNeedingRenewalReminder()).resolves.toEqual({
      data: [],
      error: 'Failed to fetch reminder settings',
    });
  });
});

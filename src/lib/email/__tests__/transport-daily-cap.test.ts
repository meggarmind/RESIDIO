import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  send: vi.fn(),
  getSettingValueAsService: vi.fn(),
  count: vi.fn(),
}));

vi.mock('@/lib/email/resend', () => ({
  resend: { emails: { send: mocks.send } },
  emailConfig: { fromAddress: 'noreply@test.example', replyTo: 'reply@test.example' },
  isEmailConfigured: () => true,
}));
vi.mock('@/lib/comms-override/gate', () => ({
  decideSend: async () => ({ result: { redirect: false }, envLabel: 'TEST' }),
  loadSnapshotFor: async () => ({ status: 'error', message: 'unused' }),
}));
vi.mock('@/lib/settings/service', () => ({
  getSettingValueAsService: mocks.getSettingValueAsService,
  getSettingResultAsService: vi.fn(),
}));
vi.mock('@/lib/supabase/server', () => ({
  createAdminClient: () => ({
    from: () => ({ select: () => ({ eq: () => ({ eq: () => ({ gte: mocks.count }) }) }) }),
  }),
}));

import { EMAIL_DAILY_LIMIT_ERROR, sendViaResend } from '@/lib/email/transport';

const params = { to: 'a@test.example', subject: 'Hi', text: 'Body' };

function setCap(value: unknown) {
  mocks.getSettingValueAsService.mockImplementation(async (key: string) =>
    key === 'email_outbound_daily_cap' ? value : null
  );
}

describe('sendViaResend daily cap (#1265)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-28T10:00:00Z'));
    mocks.send.mockResolvedValue({ data: { id: 'email-1' }, error: null });
    setCap(null);
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('sends under the default cap of 90', async () => {
    mocks.count.mockResolvedValue({ count: 89, error: null });
    const result = await sendViaResend(params);
    expect(result.ok).toBe(true);
    expect(mocks.send).toHaveBeenCalledTimes(1);
  });

  it('defers to the next UTC midnight at the default cap', async () => {
    mocks.count.mockResolvedValue({ count: 90, error: null });
    const result = await sendViaResend(params);
    expect(result).toEqual({
      ok: false,
      error: EMAIL_DAILY_LIMIT_ERROR,
      retryable: true,
      retryAt: '2026-10-29T00:00:00.000Z',
      override: undefined,
    });
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it('reads the cap from the email_outbound_daily_cap setting, also as a string', async () => {
    setCap('10');
    mocks.count.mockResolvedValue({ count: 10, error: null });
    expect((await sendViaResend(params)).ok).toBe(false);
    expect(mocks.send).not.toHaveBeenCalled();

    mocks.count.mockResolvedValue({ count: 9, error: null });
    expect((await sendViaResend(params)).ok).toBe(true);
    expect(mocks.send).toHaveBeenCalledTimes(1);
  });

  it('never caps a login code', async () => {
    mocks.count.mockResolvedValue({ count: 90, error: null });
    const result = await sendViaResend(params, { purpose: 'self_auth_2fa' });
    expect(result.ok).toBe(true);
    expect(mocks.send).toHaveBeenCalledTimes(1);
    expect(mocks.count).not.toHaveBeenCalled();
  });

  it('sends when the count cannot be read', async () => {
    mocks.count.mockResolvedValue({ count: null, error: { message: 'boom' } });
    const result = await sendViaResend(params);
    expect(result.ok).toBe(true);
    expect(mocks.send).toHaveBeenCalledTimes(1);
  });

  it('blocks all sends when the cap is 0, without counting', async () => {
    setCap('0');
    const result = await sendViaResend(params);
    expect(result.ok).toBe(false);
    expect(mocks.count).not.toHaveBeenCalled();
    expect(mocks.send).not.toHaveBeenCalled();
  });
});

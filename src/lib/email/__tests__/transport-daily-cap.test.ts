import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  send: vi.fn(),
  getSettingValueAsService: vi.fn(),
  decideSend: vi.fn(),
  count: vi.fn(),
}));

vi.mock('@/lib/email/resend', () => ({
  resend: { emails: { send: mocks.send } },
  emailConfig: { fromAddress: 'noreply@test.example', replyTo: 'reply@test.example' },
  isEmailConfigured: () => true,
}));
vi.mock('@/lib/comms-override/gate', () => ({ decideSend: mocks.decideSend }));
vi.mock('@/lib/settings/service', () => ({ getSettingValueAsService: mocks.getSettingValueAsService }));
vi.mock('@/lib/supabase/server', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      const chain: Record<string, unknown> = {};
      chain.select = () => chain;
      chain.eq = (column: string, value: unknown) => {
        mocks.count({ table, column, value });
        return chain;
      };
      chain.gte = async (column: string, value: string) => {
        mocks.count({ table, column, value });
        return countResult;
      };
      return chain;
    },
  }),
}));

import { sendViaResend } from '@/lib/email/transport';

const params = { to: 'a@test.example', subject: 'Hi', text: 'x' };
let countResult: { count: number | null; error: unknown };

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-28T15:30:00Z'));
  countResult = { count: 0, error: null };
  mocks.send.mockResolvedValue({ data: { id: 'rid-1' }, error: null });
  mocks.getSettingValueAsService.mockResolvedValue(null);
  mocks.decideSend.mockResolvedValue({ result: { redirect: false }, envLabel: 'TEST' });
});
afterEach(() => vi.useRealTimers());

describe('sendViaResend daily cap (#1265)', () => {
  it('defers to the next UTC midnight at the default cap of 90', async () => {
    countResult = { count: 90, error: null };
    const result = await sendViaResend(params);
    expect(result).toMatchObject({
      ok: false,
      error: 'Daily email limit reached',
      retryable: true,
      retryAt: '2026-10-29T00:00:00.000Z',
    });
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it('counts sent email history since UTC midnight', async () => {
    await sendViaResend(params);
    expect(mocks.count).toHaveBeenCalledWith({ table: 'notification_history', column: 'channel', value: 'email' });
    expect(mocks.count).toHaveBeenCalledWith({ table: 'notification_history', column: 'status', value: 'sent' });
    expect(mocks.count).toHaveBeenCalledWith({ table: 'notification_history', column: 'sent_at', value: '2026-10-28T00:00:00.000Z' });
  });

  it('sends under the cap, and honours a configured cap', async () => {
    countResult = { count: 89, error: null };
    expect(await sendViaResend(params)).toMatchObject({ ok: true, id: 'rid-1' });

    mocks.getSettingValueAsService.mockImplementation(async (key: string) => (key === 'email_outbound_daily_cap' ? 5 : null));
    countResult = { count: 5, error: null };
    expect(await sendViaResend(params)).toMatchObject({ ok: false, retryable: true });
  });

  it('refuses every send when the cap is 0', async () => {
    mocks.getSettingValueAsService.mockImplementation(async (key: string) => (key === 'email_outbound_daily_cap' ? 0 : null));
    const result = await sendViaResend(params);
    expect(result).toMatchObject({ ok: false });
    expect(result).not.toHaveProperty('retryable');
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it('exempts two-factor codes, without counting', async () => {
    countResult = { count: 500, error: null };
    expect(await sendViaResend(params, { purpose: 'self_auth_2fa' })).toMatchObject({ ok: true });
    expect(mocks.count).not.toHaveBeenCalled();
  });

  it('refuses without sending when the count fails', async () => {
    countResult = { count: null, error: { message: 'down' } };
    const result = await sendViaResend(params);
    expect(result).toMatchObject({ ok: false, error: 'Unable to verify email daily limit' });
    expect(result).not.toHaveProperty('retryable');
    expect(mocks.send).not.toHaveBeenCalled();
  });
});

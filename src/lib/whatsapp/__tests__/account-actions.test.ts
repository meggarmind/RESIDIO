import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createAdminClient } from '@/lib/supabase/server';
import { recordAudit } from '@/lib/audit/recorder';
import { sendEmail } from '@/lib/email/send-email';
import { updatePreference } from '@/lib/notifications/preferences';
import { checkRateLimit, recordFailedAttemptRpc } from '@/lib/verification/tokens';
import { releaseStatementsAwaitingEmail } from '@/lib/whatsapp/statement-delivery';
import { confirmEmailChange, getRemindersOn, setRemindersOn, startEmailChange } from '@/lib/whatsapp/account-actions';

vi.mock('@/lib/supabase/server', () => ({ createAdminClient: vi.fn() }));
vi.mock('@/lib/audit/recorder', () => ({ recordAudit: vi.fn().mockResolvedValue({ recorded: true }) }));
vi.mock('@/lib/email/send-email', () => ({ sendEmail: vi.fn() }));
vi.mock('@/lib/notifications/preferences', () => ({ updatePreference: vi.fn() }));
vi.mock('@/lib/comms-override/resident-flag', () => ({ resolveResidentOverride: vi.fn().mockResolvedValue({ ok: true, residentOverride: null }) }));
vi.mock('@/lib/whatsapp/statement-delivery', () => ({ releaseStatementsAwaitingEmail: vi.fn() }));
vi.mock('@/lib/settings/service', () => ({
  getRawSettingsAsService: vi.fn().mockResolvedValue({ status: 'ok', values: new Map([['estate_name', 'Palm Estate']]) }),
}));
vi.mock('@/lib/verification/tokens', async (importActual) => ({
  ...(await importActual<typeof import('@/lib/verification/tokens')>()),
  checkRateLimit: vi.fn(),
  generateOTP: vi.fn().mockReturnValue('482915'),
  invalidateExistingTokens: vi.fn().mockResolvedValue(undefined),
  recordFailedAttemptRpc: vi.fn(),
}));

type Call = { table: string; op: string; args: unknown[] };

/** A recording PostgREST stand-in: every chain resolves to the next queued result for its table. */
function mockDb(results: Record<string, unknown[]>) {
  const calls: Call[] = [];
  const from = vi.fn((table: string) => {
    const chain: Record<string, unknown> = {};
    for (const op of ['select', 'insert', 'update', 'eq', 'is', 'in', 'limit', 'order']) {
      chain[op] = vi.fn((...args: unknown[]) => {
        calls.push({ table, op, args });
        return chain;
      });
    }
    const next = () => (results[table] || []).shift() ?? { data: null, error: null };
    chain.single = vi.fn(() => Promise.resolve(next()));
    chain.maybeSingle = vi.fn(() => Promise.resolve(next()));
    chain.then = (resolve: (value: unknown) => unknown) => resolve(next());
    return chain;
  });
  vi.mocked(createAdminClient).mockReturnValue({ from } as unknown as ReturnType<typeof createAdminClient>);
  return { calls };
}

const ADA = { id: 'resident-1', first_name: 'Ada', email: 'ada.old@example.com', email_verified_at: '2026-01-01T00:00:00Z' };
const ACTOR = { userId: null, residentId: 'resident-1' };

beforeEach(() => {
  vi.mocked(recordAudit).mockClear();
  vi.mocked(sendEmail).mockReset().mockResolvedValue({ success: true });
  vi.mocked(updatePreference).mockReset().mockResolvedValue({ success: true });
  vi.mocked(checkRateLimit).mockReset().mockResolvedValue({ allowed: true, remainingAttempts: 3 });
  vi.mocked(recordFailedAttemptRpc).mockReset();
  vi.mocked(releaseStatementsAwaitingEmail).mockReset().mockResolvedValue(0);
});

describe('WhatsApp reminders (#816 decisions 2-3)', () => {
  it('is on when nothing is stored, and off when either category is off', async () => {
    mockDb({ notification_preferences: [{ data: [], error: null }] });
    expect(await getRemindersOn('resident-1')).toBe(true);
    mockDb({ notification_preferences: [{ data: [{ enabled: true }, { enabled: false }], error: null }] });
    expect(await getRemindersOn('resident-1')).toBe(false);
  });

  it('reads only the WhatsApp channel', async () => {
    const { calls } = mockDb({ notification_preferences: [{ data: [], error: null }] });
    await getRemindersOn('resident-1');
    expect(calls).toContainEqual({ table: 'notification_preferences', op: 'eq', args: ['channel', 'whatsapp'] });
    expect(calls).toContainEqual({ table: 'notification_preferences', op: 'in', args: ['category', ['invoice', 'payment']] });
  });

  it('switches payment and invoice reminders on WhatsApp and audits the resident as the actor', async () => {
    await setRemindersOn('resident-1', false);

    expect(updatePreference).toHaveBeenCalledWith({ resident_id: 'resident-1', category: 'invoice', channel: 'whatsapp', enabled: false });
    expect(updatePreference).toHaveBeenCalledWith({ resident_id: 'resident-1', category: 'payment', channel: 'whatsapp', enabled: false });
    expect(updatePreference).toHaveBeenCalledTimes(2);
    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'UPDATE', entityType: 'notification_preferences', entityId: 'resident-1', newValues: { whatsapp_payment_reminders: false } }),
      ACTOR
    );
  });

  it('does not audit a change that was not saved', async () => {
    vi.mocked(updatePreference).mockResolvedValue({ success: false, error: 'denied' });
    await expect(setRemindersOn('resident-1', true)).rejects.toThrow('Reminder preference not saved: denied');
    expect(recordAudit).not.toHaveBeenCalled();
  });
});

describe('WhatsApp update email: sending the code (#816 decision 5)', () => {
  it('sends the 6-digit code to the NEW address and stores it against that address', async () => {
    const { calls } = mockDb({ residents: [{ data: ADA, error: null }], verification_tokens: [{ error: null }] });

    const result = await startEmailChange('resident-1', '  New.Name@Example.com ');

    expect(result).toEqual({ status: 'sent', email: 'new.name@example.com' });
    const insert = calls.find((call) => call.table === 'verification_tokens' && call.op === 'insert')!;
    expect(insert.args[0]).toMatchObject({ resident_id: 'resident-1', token_type: 'email', token: '482915', target_value: 'new.name@example.com' });
    expect(sendEmail).toHaveBeenCalledWith(expect.objectContaining({ to: expect.objectContaining({ email: 'new.name@example.com' }), subject: 'Verify Your Email Address' }));
  });

  it('refuses an address that is not an email, without reading or sending anything', async () => {
    const { calls } = mockDb({});
    expect(await startEmailChange('resident-1', 'not an email')).toEqual({ status: 'invalid' });
    expect(calls).toHaveLength(0);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('says same when the address is already the verified one, but verifies an unverified one', async () => {
    mockDb({ residents: [{ data: ADA, error: null }] });
    expect(await startEmailChange('resident-1', 'ADA.OLD@example.com')).toEqual({ status: 'same' });
    expect(sendEmail).not.toHaveBeenCalled();

    mockDb({ residents: [{ data: { ...ADA, email_verified_at: null }, error: null }], verification_tokens: [{ error: null }] });
    expect(await startEmailChange('resident-1', 'ada.old@example.com')).toEqual({ status: 'sent', email: 'ada.old@example.com' });
  });

  it('applies the existing rate limit before creating a token', async () => {
    vi.mocked(checkRateLimit).mockResolvedValue({ allowed: false, remainingAttempts: 0, waitMinutes: 60 });
    const { calls } = mockDb({ residents: [{ data: ADA, error: null }] });

    expect(await startEmailChange('resident-1', 'new@example.com')).toEqual({ status: 'rate_limited' });
    expect(calls.some((call) => call.table === 'verification_tokens')).toBe(false);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('cancels the token when the email cannot be sent', async () => {
    vi.mocked(sendEmail).mockResolvedValue({ success: false, error: 'Resend down' });
    const { calls } = mockDb({ residents: [{ data: ADA, error: null }], verification_tokens: [{ error: null }, { error: null }] });

    expect(await startEmailChange('resident-1', 'new@example.com')).toEqual({ status: 'failed' });
    const update = calls.find((call) => call.table === 'verification_tokens' && call.op === 'update')!;
    expect(update.args[0]).toMatchObject({ used_at: expect.any(String) });
  });
});

describe('WhatsApp update email: saving the verified address (#816 decisions 5, 7, 8)', () => {
  const token = { id: 'token-1', token: '482915', target_value: 'new@example.com', expires_at: new Date(Date.now() + 60_000).toISOString() };

  it('saves the address and sets email_verified_at only when the code matches', async () => {
    const { calls } = mockDb({
      verification_tokens: [{ data: token, error: null }, { data: { id: 'token-1' }, error: null }],
      residents: [{ data: { first_name: 'Ada', last_name: 'Example', email: 'ada.old@example.com', email_verified_at: null }, error: null }, { error: null }],
    });
    vi.mocked(releaseStatementsAwaitingEmail).mockResolvedValue(2);

    const result = await confirmEmailChange('resident-1', '482915');

    expect(result).toEqual({ status: 'saved', email: 'new@example.com', statementsQueued: 2 });
    const update = calls.find((call) => call.table === 'residents' && call.op === 'update')!;
    expect(update.args[0]).toMatchObject({ email: 'new@example.com', email_verified_at: expect.any(String) });
    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'UPDATE', entityType: 'residents', entityId: 'resident-1', oldValues: expect.objectContaining({ email: 'ada.old@example.com' }), newValues: expect.objectContaining({ email: 'new@example.com' }) }),
      ACTOR
    );
    expect(releaseStatementsAwaitingEmail).toHaveBeenCalledWith('resident-1', 'new@example.com');
  });

  it('tells the OLD address, naming the new one only in masked form', async () => {
    mockDb({
      verification_tokens: [{ data: token, error: null }, { data: { id: 'token-1' }, error: null }],
      residents: [{ data: { first_name: 'Ada', last_name: 'Example', email: 'ada.old@example.com', email_verified_at: null }, error: null }, { error: null }],
    });

    await confirmEmailChange('resident-1', '482915');

    const notice = vi.mocked(sendEmail).mock.calls[0][0];
    expect(notice.to).toMatchObject({ email: 'ada.old@example.com' });
    expect(JSON.stringify(notice.react)).toContain('n***@example.com');
    expect(JSON.stringify(notice.react)).not.toContain('new@example.com');
  });

  it('counts a wrong code, saves nothing, and reports locked once the token is used up', async () => {
    vi.mocked(recordFailedAttemptRpc).mockResolvedValueOnce({ data: [{ attempts: 1, invalidated: false }], error: null });
    vi.mocked(recordFailedAttemptRpc).mockResolvedValueOnce({ data: [{ attempts: 5, invalidated: true }], error: null });
    const { calls } = mockDb({ verification_tokens: [{ data: token, error: null }, { data: token, error: null }] });

    expect(await confirmEmailChange('resident-1', '000000')).toEqual({ status: 'wrong' });
    expect(await confirmEmailChange('resident-1', '111111')).toEqual({ status: 'locked' });
    expect(calls.some((call) => call.table === 'residents')).toBe(false);
    expect(recordAudit).not.toHaveBeenCalled();
  });

  it('fails closed when a wrong attempt cannot be counted', async () => {
    vi.mocked(recordFailedAttemptRpc).mockResolvedValue({ data: null, error: { message: 'rpc down' } });
    mockDb({ verification_tokens: [{ data: token, error: null }] });
    expect(await confirmEmailChange('resident-1', '000000')).toEqual({ status: 'failed' });
  });

  it('reports expired for a missing, expired or already used token', async () => {
    mockDb({ verification_tokens: [{ data: null, error: null }] });
    expect(await confirmEmailChange('resident-1', '482915')).toEqual({ status: 'expired' });
    mockDb({ verification_tokens: [{ data: { ...token, expires_at: new Date(Date.now() - 1000).toISOString() }, error: null }] });
    expect(await confirmEmailChange('resident-1', '482915')).toEqual({ status: 'expired' });
    // Another message used the token between the read and the claim.
    const { calls } = mockDb({ verification_tokens: [{ data: token, error: null }, { data: null, error: null }] });
    expect(await confirmEmailChange('resident-1', '482915')).toEqual({ status: 'expired' });
    expect(calls.some((call) => call.table === 'residents')).toBe(false);
  });

  it('keeps the saved address when the old-address notice or the queued statements fail', async () => {
    vi.mocked(sendEmail).mockRejectedValue(new Error('Resend down'));
    vi.mocked(releaseStatementsAwaitingEmail).mockRejectedValue(new Error('queue down'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    mockDb({
      verification_tokens: [{ data: token, error: null }, { data: { id: 'token-1' }, error: null }],
      residents: [{ data: { first_name: 'Ada', last_name: 'Example', email: 'ada.old@example.com', email_verified_at: null }, error: null }, { error: null }],
    });

    expect(await confirmEmailChange('resident-1', '482915')).toEqual({ status: 'saved', email: 'new@example.com', statementsQueued: 0 });
  });
});

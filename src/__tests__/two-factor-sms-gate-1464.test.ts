import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { isChannelImplemented } from '@/lib/notifications/types';

/**
 * #1464: two-factor SMS codes follow the SMS switch (isChannelImplemented('sms')).
 * While SMS is off, setup and sign-in refuse before any token is stored or sent.
 */

const mocks = vi.hoisted(() => ({
  inserts: [] as { table: string; row: unknown }[],
  updates: [] as string[],
  twoFactorEnabled: false,
}));

function chain(table: string) {
  const b: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'is', 'gte', 'order', 'limit', 'not', 'gt']) b[m] = () => b;
  b.update = () => {
    mocks.updates.push(table);
    return b;
  };
  b.insert = async (row: unknown) => {
    mocks.inserts.push({ table, row });
    return { error: null };
  };
  const data =
    table === 'residents'
      ? { phone_primary: '08012345678' }
      : {
          email: 'a@b.test',
          full_name: 'Ada Obi',
          two_factor_enabled: mocks.twoFactorEnabled,
          two_factor_method: 'sms',
          two_factor_secret_encrypted: null,
        };
  b.single = async () => ({ data, error: null });
  b.then = (resolve: (v: unknown) => unknown) =>
    Promise.resolve({ data: [], count: 0, error: null }).then(resolve);
  return b;
}

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }) },
    from: (t: string) => chain(t),
  }),
  createAdminClient: () => ({ from: (t: string) => chain(t) }),
}));
vi.mock('@/lib/auth/authorize', () => ({ authorizePermission: vi.fn(async () => ({ authorized: true })) }));
vi.mock('@/lib/auth/action-roles', () => ({ PERMISSIONS: { TWO_FACTOR_ENABLE: 'two_factor.enable' } }));
vi.mock('@/lib/audit/logger', () => ({ logAudit: vi.fn(async () => undefined) }));
vi.mock('@/lib/auth/two-factor-session', () => ({
  getTwoFactorSessionContext: vi.fn(async () => ({ userId: 'u1' })),
  issueTwoFactorMarkerCookie: vi.fn(),
}));
vi.mock('@/lib/auth/two-factor-guard', () => ({
  isTwoFactorLocked: vi.fn(async () => false),
  tooManyTriesMessage: () => 'locked',
  checkAccountCode: vi.fn(),
  claimTwoFactorTry: vi.fn(),
  clearTwoFactorTries: vi.fn(),
  acceptAuthenticatorCode: vi.fn(),
}));
vi.mock('@/lib/auth/two-factor-secrets', () => ({
  generateOtp: () => '123456',
  hashOtp: (_u: string, o: string) => `h:${o}`,
  otpMatches: vi.fn(),
  encryptTotpSecret: (s: string) => `enc:${s}`,
  readTotpSecret: vi.fn(),
  hashBackupCode: vi.fn(),
  verifyBackupCodeHash: vi.fn(),
}));
vi.mock('@/lib/email/send-email', () => ({
  sendEmail: vi.fn(async () => ({ success: true })),
  getEstateEmailSettings: vi.fn(async () => ({ estateName: 'E', estateLogoUrl: null })),
}));
vi.mock('@/emails/verification-code', () => ({ VerificationCodeEmail: vi.fn(() => null) }));
vi.mock('@/lib/sms/send-sms', () => ({ sendVerificationSms: vi.fn(async () => ({ success: true })) }));
vi.mock('@/lib/notifications/types', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/notifications/types')>();
  return { ...actual, isChannelImplemented: vi.fn(actual.isChannelImplemented) };
});

import { sendVerificationSms } from '@/lib/sms/send-sms';
import { sendEmail } from '@/lib/email/send-email';
import { initiateTwoFactorSetup } from '@/actions/two-factor/setup';
import { sendTwoFactorCode } from '@/actions/two-factor/verify';
import { POST } from '@/app/api/auth/2fa/send-code/route';

const tokenInserts = () => mocks.inserts.filter((i) => i.table === 'two_factor_tokens');
const smsOn = (on: boolean) =>
  vi.mocked(isChannelImplemented).mockImplementation((c) => (c === 'sms' ? on : true));

function post(method: string) {
  return POST(
    new NextRequest('http://localhost/api/auth/2fa/send-code', {
      method: 'POST',
      body: JSON.stringify({ method }),
    })
  );
}

beforeEach(() => {
  mocks.inserts = [];
  mocks.updates = [];
  mocks.twoFactorEnabled = false;
  vi.mocked(sendVerificationSms).mockClear();
  vi.mocked(sendEmail).mockClear();
  smsOn(false);
});

describe('SMS off (the shipped state)', () => {
  it('setup with sms is refused before any token or send', async () => {
    const r = await initiateTwoFactorSetup({ method: 'sms' });
    expect(r.success).toBe(false);
    expect(r.message).toMatch(/SMS codes are switched off/);
    expect(tokenInserts()).toHaveLength(0);
    expect(mocks.updates).toHaveLength(0);
    expect(sendVerificationSms).not.toHaveBeenCalled();
  });

  it('sign-in send with sms is refused and names real recovery options', async () => {
    mocks.twoFactorEnabled = true;
    const r = await sendTwoFactorCode('sms');
    expect(r.success).toBe(false);
    expect(r.message).toMatch(/SMS codes are switched off/);
    expect(r.message).toMatch(/backup code/);
    expect(r.message).toMatch(/admin/);
    expect(tokenInserts()).toHaveLength(0);
    expect(mocks.updates).toHaveLength(0);
    expect(sendVerificationSms).not.toHaveBeenCalled();
  });

  it('send-code route refuses sms with the usual 200 + success:false shape', async () => {
    mocks.twoFactorEnabled = true;
    const res = await post('sms');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.message).toMatch(/SMS codes are switched off/);
    expect(sendVerificationSms).not.toHaveBeenCalled();
  });

  it('email sign-in code still sends', async () => {
    mocks.twoFactorEnabled = true;
    const r = await sendTwoFactorCode('email');
    expect(r.success).toBe(true);
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(tokenInserts()).toHaveLength(1);
  });

  it('authenticator sign-in and setup still work', async () => {
    mocks.twoFactorEnabled = true;
    const a = await sendTwoFactorCode('authenticator');
    expect(a.success).toBe(true);
    mocks.twoFactorEnabled = false;
    const s = await initiateTwoFactorSetup({ method: 'authenticator' });
    expect(s.success).toBe(true);
    expect(s.qrCode).toBeTruthy();
  });

  it('email setup still sends', async () => {
    const r = await initiateTwoFactorSetup({ method: 'email' });
    expect(r.success).toBe(true);
    expect(sendEmail).toHaveBeenCalledTimes(1);
  });
});

describe('SMS on (the gate is the only change)', () => {
  beforeEach(() => smsOn(true));

  it('setup with sms stores a token and sends', async () => {
    const r = await initiateTwoFactorSetup({ method: 'sms' });
    expect(r.success).toBe(true);
    expect(tokenInserts()).toHaveLength(1);
    expect(sendVerificationSms).toHaveBeenCalledTimes(1);
  });

  it('sign-in with sms stores a token and sends', async () => {
    mocks.twoFactorEnabled = true;
    const r = await sendTwoFactorCode('sms');
    expect(r.success).toBe(true);
    expect(tokenInserts()).toHaveLength(1);
    expect(sendVerificationSms).toHaveBeenCalledTimes(1);
  });

  it('route passes sms through to a send', async () => {
    mocks.twoFactorEnabled = true;
    const body = await (await post('sms')).json();
    expect(body.success).toBe(true);
    expect(sendVerificationSms).toHaveBeenCalledTimes(1);
  });
});

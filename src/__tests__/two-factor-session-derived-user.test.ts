import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * #455: the 2FA endpoints take the user from the session, never from the body.
 * Also: the signed marker cookie is issued only after a successful code check.
 */

const mocks = vi.hoisted(() => ({
  sessionUserId: 'session-user' as string | null,
  profileQueriedFor: [] as string[],
  cookieSet: vi.fn(),
  failedLogins: 0,
}));

function jwt(sessionId: string) {
  return `h.${Buffer.from(JSON.stringify({ session_id: sessionId })).toString('base64url')}.s`;
}

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: async () => ({
    auth: {
      getUser: async () => ({ data: { user: mocks.sessionUserId ? { id: mocks.sessionUserId } : null } }),
      getSession: async () => ({ data: { session: mocks.sessionUserId ? { access_token: jwt('sess-1') } : null } }),
    },
  }),
  createAdminClient: () => ({
    from: (table: string) => {
      const filters: Record<string, unknown> = {};
      const b: Record<string, unknown> = {
        select: () => b,
        update: () => b,
        insert: async () => ({ error: null }),
        is: () => b,
        gt: () => b,
        gte: () => b,
        order: () => b,
        limit: () => b,
        eq: (col: string, val: unknown) => {
          filters[col] = val;
          if (table === 'profiles' && col === 'id') mocks.profileQueriedFor.push(String(val));
          return b;
        },
        single: async () => {
          if (table === 'profiles') {
            return { data: { email: 'a@b.c', full_name: 'A B', two_factor_enabled: true, two_factor_method: 'authenticator', two_factor_secret_encrypted: 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP' }, error: null };
          }
          return { data: null, error: null };
        },
        then: (resolve: (v: unknown) => unknown) =>
          Promise.resolve({ count: table === 'two_factor_audit_log' ? mocks.failedLogins : 0, data: [], error: null }).then(resolve),
      };
      return b;
    },
  }),
}));

vi.mock('next/headers', () => ({
  cookies: async () => ({ set: mocks.cookieSet }),
}));
vi.mock('@/lib/email/send-email', () => ({ sendEmail: vi.fn(), getEstateEmailSettings: vi.fn() }));
vi.mock('@/lib/sms/send-sms', () => ({ sendVerificationSms: vi.fn() }));
vi.mock('@/emails/verification-code', () => ({ VerificationCodeEmail: () => null }));

const { sendTwoFactorCode, verifyTwoFactorCode, verifyBackupCode } = await import('@/actions/two-factor/verify');
const { POST: sendCodeRoute } = await import('@/app/api/auth/2fa/send-code/route');
const { POST: verifyRoute } = await import('@/app/api/auth/2fa/verify/route');

const post = (url: string, body: unknown) =>
  new NextRequest(`http://localhost:3000${url}`, { method: 'POST', body: JSON.stringify(body) });

beforeEach(() => {
  mocks.sessionUserId = 'session-user';
  mocks.profileQueriedFor = [];
  mocks.cookieSet.mockReset();
  mocks.failedLogins = 0;
});

describe('2FA actions derive the user from the session', () => {
  it('sendTwoFactorCode queries the session user, not any other id', async () => {
    await sendTwoFactorCode('authenticator');
    expect(mocks.profileQueriedFor).toEqual(['session-user']);
  });

  it('verifyTwoFactorCode and verifyBackupCode query the session user only', async () => {
    await verifyTwoFactorCode({ code: '000000' });
    await verifyBackupCode('ABCD1234');
    expect(new Set(mocks.profileQueriedFor)).toEqual(new Set(['session-user']));
  });

  it('all three refuse without a session and touch no profile', async () => {
    mocks.sessionUserId = null;
    expect((await sendTwoFactorCode('email')).success).toBe(false);
    expect((await verifyTwoFactorCode({ code: '123456' })).success).toBe(false);
    expect((await verifyBackupCode('ABCD1234')).success).toBe(false);
    expect(mocks.profileQueriedFor).toEqual([]);
  });
});

describe('2FA routes ignore a body-supplied userId', () => {
  it('send-code uses the session user even when the body names someone else', async () => {
    const res = await sendCodeRoute(post('/api/auth/2fa/send-code', { userId: 'victim', method: 'authenticator' }));
    expect(res.status).toBe(200);
    expect(mocks.profileQueriedFor).toEqual(['session-user']);
    expect(mocks.profileQueriedFor).not.toContain('victim');
  });

  it('send-code returns 401 with no session', async () => {
    mocks.sessionUserId = null;
    const res = await sendCodeRoute(post('/api/auth/2fa/send-code', { userId: 'victim', method: 'email' }));
    expect(res.status).toBe(401);
  });

  it('verify sets no cookie on a wrong code', async () => {
    const res = await verifyRoute(post('/api/auth/2fa/verify', { userId: 'victim', code: '000000' }));
    const json = await res.json();
    expect(json.success).toBe(false);
    expect(mocks.cookieSet).not.toHaveBeenCalled();
    expect(mocks.profileQueriedFor).not.toContain('victim');
  });

  it('verify sets the signed marker cookie (and not the legacy one) on a correct TOTP code', async () => {
    const { createHmac } = await import('crypto');
    // Compute the current TOTP for the fixture secret.
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    let bits = 0, value = 0;
    const out: number[] = [];
    for (const ch of 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP') {
      value = (value << 5) | alphabet.indexOf(ch);
      bits += 5;
      if (bits >= 8) { out.push((value >>> (bits - 8)) & 255); bits -= 8; }
    }
    const t = Buffer.alloc(8);
    t.writeBigInt64BE(BigInt(Math.floor(Date.now() / 1000 / 30)));
    const h = createHmac('sha1', Buffer.from(out)).update(t).digest();
    const o = h[h.length - 1] & 0xf;
    const code = String((((h[o] & 0x7f) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3]) % 1000000).padStart(6, '0');

    const res = await verifyRoute(post('/api/auth/2fa/verify', { code }));
    expect((await res.json()).verified).toBe(true);
    expect(mocks.cookieSet).toHaveBeenCalledTimes(1);
    const [name, value2, opts] = mocks.cookieSet.mock.calls[0];
    expect(name).toBe('residio_2fa');
    expect(value2).not.toBe('true');
    expect(value2).toContain('.');
    expect(opts).toMatchObject({ httpOnly: true, sameSite: 'lax', path: '/' });
  });
});

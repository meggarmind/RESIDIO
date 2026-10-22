import { createHmac } from 'crypto';
import { NextRequest } from 'next/server';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { encryptTotpSecret, hashBackupCode, hashOtp, readTotpSecret } from '@/lib/auth/two-factor-secrets';

/**
 * #455: the 2FA endpoints take the user from the session, never from the body;
 * the signed marker cookie is issued only after a successful check; lockout,
 * single-use backup codes, hashed OTPs and lazy TOTP re-encryption.
 */

const SECRET = 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP';

type Row = Record<string, unknown>;

const mocks = vi.hoisted(() => ({
  sessionUserId: 'session-user' as string | null,
  profileQueriedFor: [] as string[],
  profile: {} as Row,
  profileUpdates: [] as Row[],
  backupRows: [] as Row[],
  tokenRows: [] as Row[],
  inserts: {} as Record<string, Row[]>,
  raceOnClaim: false,
  cookieSet: vi.fn(),
  failedLogins: 0,
  claims: 0,
  lastStep: null as number | null,
  sessions: [] as Row[],
  sentOtps: [] as string[],
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
    // The #1029 try limit and single-use authenticator steps.
    rpc: async (fn: string, args: Row) => {
      if (fn === 'two_factor_claim_attempt') {
        mocks.claims++;
        const allowed = mocks.failedLogins < 5;
        if (allowed) mocks.failedLogins++;
        return { data: [{ allowed, remaining: allowed ? 5 - mocks.failedLogins : 0, retry_at: null }], error: null };
      }
      if (fn === 'two_factor_accept_totp_step') {
        const step = Number(args.p_step);
        if (mocks.lastStep !== null && step <= mocks.lastStep) return { data: false, error: null };
        mocks.lastStep = step;
        return { data: true, error: null };
      }
      return { data: null, error: { message: `unexpected rpc ${fn}` } };
    },
    from: (table: string) => {
      let op: 'select' | 'update' = 'select';
      let payload: Row = {};
      let returning = false;
      const eqs: Record<string, unknown> = {};
      const nulls: string[] = [];

      const matches = (row: Row) =>
        Object.entries(eqs).every(([k, v]) => row[k] === v) && nulls.every((c) => row[c] == null);
      const rowsFor = () => (table === 'two_factor_backup_codes' ? mocks.backupRows : mocks.tokenRows);

      const b: Record<string, unknown> = {
        select: () => {
          if (op === 'update') returning = true;
          return b;
        },
        update: (p: Row) => {
          op = 'update';
          payload = p;
          return b;
        },
        upsert: async (p: Row) => {
          if (table === 'two_factor_verified_sessions') mocks.sessions.push(p);
          return { error: null };
        },
        delete: () => {
          if (table === 'two_factor_attempts') mocks.failedLogins = 0;
          return b;
        },
        not: () => b,
        maybeSingle: async () => {
          if (table === 'two_factor_attempts') return { data: { attempts: mocks.failedLogins }, error: null };
          if (table === 'two_factor_tokens') return { data: mocks.tokenRows.find(matches) ?? null, error: null };
          return { data: null, error: null };
        },
        insert: async (p: Row | Row[]) => {
          (mocks.inserts[table] ??= []).push(...(Array.isArray(p) ? p : [p]));
          return { error: null };
        },
        is: (col: string) => {
          nulls.push(col);
          return b;
        },
        gt: () => b,
        gte: () => b,
        order: () => b,
        limit: () => b,
        eq: (col: string, val: unknown) => {
          eqs[col] = val;
          if (table === 'profiles' && col === 'id') mocks.profileQueriedFor.push(String(val));
          return b;
        },
        single: async () => {
          if (table === 'profiles') return { data: mocks.profile, error: null };
          if (table === 'two_factor_tokens') {
            return { data: mocks.tokenRows.find(matches) ?? null, error: null };
          }
          return { data: null, error: null };
        },
        then: (resolve: (v: unknown) => unknown) => {
          let result: Record<string, unknown> = { data: [], count: 0, error: null };
          if (table === 'two_factor_audit_log') {
            result = { data: [], count: mocks.failedLogins, error: null };
          } else if (op === 'update' && table === 'profiles') {
            mocks.profileUpdates.push(payload);
          } else if (op === 'update') {
            if (mocks.raceOnClaim) {
              for (const r of rowsFor()) if (r.id === eqs.id) r.used_at = 'someone-else-won';
            }
            const hit = rowsFor().filter(matches);
            hit.forEach((r) => Object.assign(r, payload));
            result = { data: returning ? hit.map((r) => ({ id: r.id })) : null, error: null };
          } else if (table === 'two_factor_backup_codes') {
            result = { data: mocks.backupRows.filter(matches), error: null };
          }
          return Promise.resolve(result).then(resolve);
        },
      };
      return b;
    },
  }),
}));

vi.mock('next/headers', () => ({
  cookies: async () => ({ set: mocks.cookieSet }),
}));
vi.mock('@/lib/email/send-email', () => ({
  sendEmail: vi.fn(async () => ({ success: true })),
  getEstateEmailSettings: vi.fn(async () => ({ estateName: 'Estate' })),
}));
vi.mock('@/lib/sms/send-sms', () => ({ sendVerificationSms: vi.fn() }));
vi.mock('@/emails/verification-code', () => ({
  VerificationCodeEmail: (props: { otp: string }) => {
    mocks.sentOtps.push(props.otp);
    return null;
  },
}));

vi.mock('@/lib/auth/authorize', () => ({
  authorizePermission: vi.fn(async () => ({ authorized: true, userId: 'session-user', error: null })),
}));
vi.mock('@/lib/audit/logger', () => ({ logAudit: vi.fn(async () => undefined) }));

const { sendTwoFactorCode, verifyTwoFactorCode, verifyBackupCode } = await import('@/actions/two-factor/verify');
const { generateBackupCodes } = await import('@/actions/two-factor/backup-codes');
const { disableTwoFactor } = await import('@/actions/two-factor/disable');
const { POST: sendCodeRoute } = await import('@/app/api/auth/2fa/send-code/route');
const { POST: verifyRoute } = await import('@/app/api/auth/2fa/verify/route');
const { POST: verifyBackupRoute } = await import('@/app/api/auth/2fa/verify-backup/route');

const post = (url: string, body: unknown) =>
  new NextRequest(`http://localhost:3000${url}`, { method: 'POST', body: JSON.stringify(body) });

function currentTotp(secret = SECRET): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of secret) {
    value = (value << 5) | alphabet.indexOf(ch);
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  const t = Buffer.alloc(8);
  t.writeBigInt64BE(BigInt(Math.floor(Date.now() / 1000 / 30)));
  const h = createHmac('sha1', Buffer.from(out)).update(t).digest();
  const o = h[h.length - 1] & 0xf;
  const n = ((h[o] & 0x7f) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3];
  return String(n % 1000000).padStart(6, '0');
}

const profileFor = (method: string, secret: string | null = SECRET): Row => ({
  email: 'a@b.c',
  full_name: 'A B',
  two_factor_enabled: true,
  two_factor_method: method,
  two_factor_secret_encrypted: secret,
});

beforeEach(() => {
  vi.stubEnv('DATA_ENCRYPTION_KEY', 'd'.repeat(64));
  mocks.sessionUserId = 'session-user';
  mocks.profileQueriedFor = [];
  mocks.profile = profileFor('authenticator');
  mocks.profileUpdates = [];
  mocks.backupRows = [];
  mocks.tokenRows = [];
  mocks.inserts = {};
  mocks.raceOnClaim = false;
  mocks.cookieSet.mockReset();
  mocks.failedLogins = 0;
  mocks.claims = 0;
  mocks.lastStep = null;
  mocks.sessions = [];
  mocks.sentOtps = [];
});
afterEach(() => vi.unstubAllEnvs());

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
  });

  it('send-code returns 401 with no session', async () => {
    mocks.sessionUserId = null;
    const res = await sendCodeRoute(post('/api/auth/2fa/send-code', { userId: 'victim', method: 'email' }));
    expect(res.status).toBe(401);
  });

  it('verify sets no cookie on a wrong code', async () => {
    const res = await verifyRoute(post('/api/auth/2fa/verify', { userId: 'victim', code: '000000' }));
    expect((await res.json()).success).toBe(false);
    expect(mocks.cookieSet).not.toHaveBeenCalled();
    expect(mocks.profileQueriedFor).not.toContain('victim');
  });

  it('verify sets the signed marker cookie (and not the legacy one) on a correct TOTP code', async () => {
    const res = await verifyRoute(post('/api/auth/2fa/verify', { code: currentTotp() }));
    expect((await res.json()).verified).toBe(true);
    expect(mocks.cookieSet).toHaveBeenCalledTimes(1);
    const [name, value, opts] = mocks.cookieSet.mock.calls[0];
    expect(name).toBe('residio_2fa');
    expect(value).not.toBe('true');
    expect(value).toContain('.');
    expect(opts).toMatchObject({ httpOnly: true, sameSite: 'lax', path: '/' });
  });
});

describe('request validation', () => {
  it.each([
    ['numeric code', { code: 123456 }],
    ['array code', { code: ['123456'] }],
    ['object code', { code: { a: 1 } }],
    ['missing code', {}],
    ['empty code', { code: '' }],
  ])('verify and verify-backup reject a %s with 400 and never reach the action', async (_n, body) => {
    expect((await verifyRoute(post('/api/auth/2fa/verify', body))).status).toBe(400);
    expect((await verifyBackupRoute(post('/api/auth/2fa/verify-backup', body))).status).toBe(400);
    expect(mocks.profileQueriedFor).toEqual([]);
  });

  it('send-code rejects an unknown method', async () => {
    const res = await sendCodeRoute(post('/api/auth/2fa/send-code', { method: 'carrier-pigeon' }));
    expect(res.status).toBe(400);
  });
});

describe('lockout', () => {
  it('verifyTwoFactorCode refuses a CORRECT code while locked out', async () => {
    mocks.failedLogins = 5;
    const result = await verifyTwoFactorCode({ code: currentTotp() });
    expect(result.success).toBe(false);
    expect(result.message).toMatch(/too many/i);
    expect(mocks.profileQueriedFor).toEqual([]);
  });

  it('verifyBackupCode refuses a correct code while locked out and does not consume it', async () => {
    mocks.failedLogins = 5;
    mocks.backupRows = [{ id: 'b1', profile_id: 'session-user', code_hash: hashBackupCode('ABCD1234'), used_at: null }];
    const result = await verifyBackupCode('ABCD1234');
    expect(result.success).toBe(false);
    expect(mocks.backupRows[0].used_at).toBeNull();
  });

  it('sendTwoFactorCode refuses while locked out', async () => {
    mocks.failedLogins = 5;
    mocks.profile = profileFor('email');
    const result = await sendTwoFactorCode('email');
    expect(result.success).toBe(false);
    expect(mocks.inserts.two_factor_tokens).toBeUndefined();
  });

  it('the verify routes set no cookie while locked out', async () => {
    mocks.failedLogins = 5;
    await verifyRoute(post('/api/auth/2fa/verify', { code: currentTotp() }));
    expect(mocks.cookieSet).not.toHaveBeenCalled();
  });
});

describe('backup codes', () => {
  const rows = (): Row[] => [
    { id: 'used', profile_id: 'session-user', code_hash: hashBackupCode('USED0001'), used_at: '2026-01-01' },
    { id: 'fresh', profile_id: 'session-user', code_hash: hashBackupCode('FRESH002'), used_at: null },
  ];

  it('an already-used code does not verify', async () => {
    mocks.backupRows = rows();
    const result = await verifyBackupCode('USED0001');
    expect(result.success).toBe(false);
    expect(mocks.backupRows[0].used_at).toBe('2026-01-01');
  });

  it('only considers unused rows: a spent duplicate of the same code never shadows the live one', async () => {
    mocks.backupRows = [
      { id: 'spent', profile_id: 'session-user', code_hash: hashBackupCode('SAME0003'), used_at: '2026-01-01' },
      { id: 'live', profile_id: 'session-user', code_hash: hashBackupCode('SAME0003'), used_at: null },
    ];
    expect((await verifyBackupCode('SAME0003')).verified).toBe(true);
    expect(mocks.backupRows[1].used_at).not.toBeNull();
  });

  it('an unused code verifies once and is then spent', async () => {
    mocks.backupRows = rows();
    expect((await verifyBackupCode('FRESH002')).verified).toBe(true);
    expect(mocks.backupRows[1].used_at).not.toBeNull();
    expect((await verifyBackupCode('FRESH002')).success).toBe(false);
  });

  it('loses a concurrent double-spend: the claim must return a row', async () => {
    mocks.backupRows = rows();
    mocks.raceOnClaim = true;
    const result = await verifyBackupCode('FRESH002');
    expect(result.success).toBe(false);
    expect(mocks.inserts.two_factor_audit_log?.some((r) => r.action === 'failed_login')).toBe(true);
    expect(mocks.inserts.two_factor_audit_log?.some((r) => r.action === 'backup_code_used')).toBeFalsy();
  });

  it('verify-backup route: cookie only on success, never on failure', async () => {
    mocks.backupRows = rows();
    await verifyBackupRoute(post('/api/auth/2fa/verify-backup', { code: 'WRONG000' }));
    expect(mocks.cookieSet).not.toHaveBeenCalled();
    await verifyBackupRoute(post('/api/auth/2fa/verify-backup', { code: 'USED0001' }));
    expect(mocks.cookieSet).not.toHaveBeenCalled();
    const res = await verifyBackupRoute(post('/api/auth/2fa/verify-backup', { code: 'FRESH002' }));
    expect((await res.json()).verified).toBe(true);
    expect(mocks.cookieSet).toHaveBeenCalledTimes(1);
    expect(mocks.cookieSet.mock.calls[0][0]).toBe('residio_2fa');
  });
});

describe('OTP at rest', () => {
  it('stores an HMAC, not the code, and emails the real code', async () => {
    mocks.profile = profileFor('email', null);
    const result = await sendTwoFactorCode('email');
    expect(result.success).toBe(true);
    const stored = String(mocks.inserts.two_factor_tokens[0].token);
    expect(mocks.sentOtps).toHaveLength(1);
    expect(stored).not.toContain(mocks.sentOtps[0]);
    expect(stored).toBe(hashOtp('session-user', mocks.sentOtps[0]));
  });

  const token = (value: string): Row => ({
    id: 't1', profile_id: 'session-user', purpose: 'login', token_type: 'email', token: value, used_at: null,
  });

  it('verifies a hashed token with the right code only', async () => {
    mocks.profile = profileFor('email', null);
    mocks.tokenRows = [token(hashOtp('session-user', '482913'))];
    expect((await verifyTwoFactorCode({ code: '000000' })).success).toBe(false);
    expect((await verifyTwoFactorCode({ code: '482913' })).verified).toBe(true);
    expect(mocks.tokenRows[0].used_at).not.toBeNull();
  });

  it('does not accept a hash minted for a different profile', async () => {
    mocks.profile = profileFor('email', null);
    mocks.tokenRows = [token(hashOtp('someone-else', '482913'))];
    expect((await verifyTwoFactorCode({ code: '482913' })).success).toBe(false);
  });

  it('still accepts an unexpired legacy plaintext token', async () => {
    mocks.profile = profileFor('email', null);
    mocks.tokenRows = [token('482913')];
    expect((await verifyTwoFactorCode({ code: '482913' })).verified).toBe(true);
  });

  it('a replay that loses the claim race fails', async () => {
    mocks.profile = profileFor('email', null);
    mocks.tokenRows = [token(hashOtp('session-user', '482913'))];
    mocks.raceOnClaim = true;
    expect((await verifyTwoFactorCode({ code: '482913' })).success).toBe(false);
  });
});

describe('lazy TOTP re-encryption', () => {
  it('rewrites a legacy plaintext secret encrypted after a successful verify', async () => {
    const result = await verifyTwoFactorCode({ code: currentTotp() });
    expect(result.verified).toBe(true);
    expect(mocks.profileUpdates).toHaveLength(2); // re-encryption + last-verified stamp
    const written = String(mocks.profileUpdates[0].two_factor_secret_encrypted);
    expect(written).not.toBe(SECRET);
    expect(readTotpSecret(written)).toBe(SECRET);
  });

  it('does not rewrite on a failed verify', async () => {
    await verifyTwoFactorCode({ code: '000000' });
    expect(mocks.profileUpdates.some((u) => 'two_factor_secret_encrypted' in u)).toBe(false);
  });

  it('does not rewrite an already-encrypted secret', async () => {
    mocks.profile = profileFor('authenticator', encryptTotpSecret(SECRET));
    expect((await verifyTwoFactorCode({ code: currentTotp() })).verified).toBe(true);
    expect(mocks.profileUpdates.some((u) => 'two_factor_secret_encrypted' in u)).toBe(false);
  });
});

describe('finish two-factor login (#1029)', () => {
  it('an authenticator code works once: a replay of the same code is refused', async () => {
    const code = currentTotp();
    expect((await verifyTwoFactorCode({ code })).verified).toBe(true);
    expect((await verifyTwoFactorCode({ code })).success).toBe(false);
  });

  it('parallel guesses cannot pass the limit: the correct sixth code is refused', async () => {
    const guesses = ['000001', '000002', '000003', '000004', '000005'].map((code) => verifyTwoFactorCode({ code }));
    const results = await Promise.all([...guesses, verifyTwoFactorCode({ code: currentTotp() })]);
    expect(results.every((r) => !r.success)).toBe(true);
    expect(results[5].message).toMatch(/too many/i);
    expect(mocks.claims).toBe(6);
  });

  it('a correct code clears the tries', async () => {
    await verifyTwoFactorCode({ code: '000001' });
    expect(mocks.failedLogins).toBe(1);
    expect((await verifyTwoFactorCode({ code: currentTotp() })).verified).toBe(true);
    expect(mocks.failedLogins).toBe(0);
  });

  it('the verify route records this login token session for the database check', async () => {
    await verifyRoute(post('/api/auth/2fa/verify', { code: currentTotp() }));
    expect(mocks.sessions).toHaveLength(1);
    expect(mocks.sessions[0]).toMatchObject({ session_id: 'sess-1', profile_id: 'session-user' });
  });

  it('no session record and no cookie on a wrong code', async () => {
    await verifyRoute(post('/api/auth/2fa/verify', { code: '000000' }));
    expect(mocks.sessions).toHaveLength(0);
    expect(mocks.cookieSet).not.toHaveBeenCalled();
  });

  it('making new backup codes has a try limit and refuses a correct code once locked', async () => {
    mocks.failedLogins = 5;
    const result = await generateBackupCodes(currentTotp());
    expect(result.success).toBe(false);
    expect(result.message).toMatch(/too many/i);
    expect(mocks.inserts.two_factor_backup_codes).toBeUndefined();
  });

  it('making new backup codes takes one try per code and needs a fresh code', async () => {
    const code = currentTotp();
    expect((await verifyTwoFactorCode({ code })).verified).toBe(true);
    const reused = await generateBackupCodes(code);
    expect(reused.success).toBe(false);
    expect(mocks.claims).toBe(2);
    expect(mocks.inserts.two_factor_backup_codes).toBeUndefined();
  });

  it('turning two-factor off refuses a used code and is limited', async () => {
    const code = currentTotp();
    expect((await verifyTwoFactorCode({ code })).verified).toBe(true);
    expect((await disableTwoFactor(code)).success).toBe(false);
    expect(mocks.profileUpdates.some((u) => u.two_factor_enabled === false)).toBe(false);

    mocks.failedLogins = 5;
    mocks.lastStep = null;
    expect((await disableTwoFactor(currentTotp())).message).toMatch(/too many/i);
  });
});

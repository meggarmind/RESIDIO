import { beforeEach, describe, expect, it, vi } from 'vitest';
import type React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { hashBackupCode } from '@/lib/auth/two-factor-secrets';

/**
 * sendBackupCodes: sends the backup codes just shown to the signed-in admin's own email or
 * WhatsApp. It must send only a fresh, unused code set of this user, and never log the codes.
 */

type Row = Record<string, unknown>;

const mocks = vi.hoisted(() => ({
  authorized: true,
  userId: 'user-1' as string | null,
  profile: null as Record<string, unknown> | null,
  backupRows: [] as Record<string, unknown>[],
  recentSends: 0,
  phone: '08012345678' as string | null,
  inserts: [] as { table: string; row: Record<string, unknown> }[],
  countFilters: [] as [string, unknown][],
  codeFilters: [] as [string, unknown][],
  countError: null as { message: string } | null,
  insertError: null as { message: string } | null,
  tryAllowed: true,
  claims: 0,
  sendEmail: vi.fn(),
  sendWhatsAppMessage: vi.fn(),
  logAudit: vi.fn(),
}));

vi.mock('@/lib/auth/authorize', () => ({
  authorizePermission: async () => (mocks.authorized ? { authorized: true } : { authorized: false, error: 'Forbidden' }),
}));
vi.mock('@/lib/audit/logger', () => ({ logAudit: mocks.logAudit }));
vi.mock('@/lib/email/send-email', () => ({
  sendEmail: mocks.sendEmail,
  getEstateEmailSettings: async () => ({ estateName: 'Test Estate' }),
}));
vi.mock('@/lib/whatsapp/provider', () => ({ sendWhatsAppMessage: mocks.sendWhatsAppMessage }));
vi.mock('@/lib/auth/two-factor-guard', () => ({
  claimTwoFactorTry: async () => {
    mocks.claims++;
    return { allowed: mocks.tryAllowed };
  },
  clearTwoFactorTries: async () => {},
  checkAccountCode: async () => false,
  tooManyTriesMessage: () => 'Too many wrong codes. Please try again in 15 minutes.',
}));

function builder(table: string) {
  let head = false;
  const b: Record<string, unknown> = {
    select: (_cols: string, opts?: { head?: boolean }) => {
      head = Boolean(opts?.head);
      return b;
    },
    eq: (col: string, val: unknown) => {
      if (table === 'two_factor_audit_log') mocks.countFilters.push([col, val]);
      if (table === 'two_factor_backup_codes') mocks.codeFilters.push([col, val]);
      return b;
    },
    gte: (col: string, val: unknown) => {
      if (table === 'two_factor_audit_log') mocks.countFilters.push([col, val]);
      return b;
    },
    is: (col: string, val: unknown) => {
      if (table === 'two_factor_backup_codes') mocks.codeFilters.push([col, val]);
      return b;
    },
    limit: () => b,
    single: async () => {
      if (table === 'profiles') return { data: mocks.profile, error: null };
      return { data: null, error: null };
    },
    maybeSingle: async () => {
      if (table === 'residents') return { data: mocks.phone ? { phone_primary: mocks.phone } : null, error: null };
      return { data: null, error: null };
    },
    insert: async (row: Row) => {
      mocks.inserts.push({ table, row });
      return { error: mocks.insertError };
    },
    then: (resolve: (v: unknown) => unknown) => {
      if (table === 'two_factor_audit_log' && head) {
        return Promise.resolve(resolve(mocks.countError ? { count: null, error: mocks.countError } : { count: mocks.recentSends, error: null }));
      }
      if (table === 'two_factor_backup_codes') return Promise.resolve(resolve({ data: mocks.backupRows, error: null }));
      return Promise.resolve(resolve({ data: null, error: null }));
    },
  };
  return b;
}

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: async () => ({
    auth: { getUser: async () => ({ data: { user: mocks.userId ? { id: mocks.userId } : null } }) },
    from: builder,
  }),
  createAdminClient: () => ({ from: builder }),
}));

import { sendBackupCodes } from '@/actions/two-factor/backup-codes';

const CODES = ['AAAA1111', 'BBBB2222', 'CCCC3333'];
const minutesAgo = (m: number) => new Date(Date.now() - m * 60 * 1000).toISOString();
const rowsFor = (codes: string[], createdAt = minutesAgo(1)) =>
  codes.map((code, i) => ({ id: `row-${i}`, code_hash: hashBackupCode(code), created_at: createdAt }));

/** Everything the action wrote or sent, as one string, to check no code leaks into it. */
const recorded = () =>
  JSON.stringify([mocks.inserts, mocks.logAudit.mock.calls, mocks.sendEmail.mock.calls.map(([o]) => ({ ...o, react: undefined }))]);

const nothingSent = () => {
  expect(mocks.sendEmail).not.toHaveBeenCalled();
  expect(mocks.sendWhatsAppMessage).not.toHaveBeenCalled();
  expect(mocks.inserts).toEqual([]);
  expect(mocks.logAudit).not.toHaveBeenCalled();
};

beforeEach(() => {
  mocks.authorized = true;
  mocks.userId = 'user-1';
  mocks.profile = { email: 'fola@example.com', full_name: 'Fola Ade', two_factor_enabled: true, two_factor_method: 'authenticator' };
  mocks.backupRows = rowsFor(CODES);
  mocks.recentSends = 0;
  mocks.phone = '08012345678';
  mocks.inserts = [];
  mocks.countFilters = [];
  mocks.codeFilters = [];
  mocks.countError = null;
  mocks.insertError = null;
  mocks.tryAllowed = true;
  mocks.claims = 0;
  mocks.sendEmail.mockReset().mockResolvedValue({ success: true, resendId: 'r1' });
  mocks.sendWhatsAppMessage.mockReset().mockResolvedValue({ success: true, messageId: 'm1' });
  mocks.logAudit.mockReset();
});

describe('sendBackupCodes refusals', () => {
  it('refuses without the permission', async () => {
    mocks.authorized = false;
    expect(await sendBackupCodes('email', CODES)).toEqual({ success: false, message: 'Forbidden' });
    nothingSent();
  });

  it('refuses when two-factor is off', async () => {
    mocks.profile = { ...mocks.profile, two_factor_enabled: false };
    const result = await sendBackupCodes('email', CODES);
    expect(result.success).toBe(false);
    nothingSent();
  });

  it.each([
    ['no codes', []],
    ['more than 10 codes', Array.from({ length: 11 }, (_, i) => `AAAA00${String(i).padStart(2, '0')}`)],
    ['wrong format', ['NOT-A-CODE']],
    ['free text', ['Hello, please click http://evil.example']],
    ['duplicates', ['AAAA1111', 'aaaa1111']],
  ])('refuses %s', async (_label, codes) => {
    const result = await sendBackupCodes('email', codes as string[]);
    expect(result).toEqual({ success: false, message: 'Invalid backup codes' });
    nothingSent();
  });

  it('refuses when one code is not an unused code of this user, and sends nothing', async () => {
    const result = await sendBackupCodes('email', ['AAAA1111', 'DDDD4444']);
    expect(result).toEqual({ success: false, message: 'These codes can no longer be sent. Make new backup codes.' });
    nothingSent();
  });

  it('looks codes up only among the unused codes of the signed-in user', async () => {
    await sendBackupCodes('email', CODES);
    expect(mocks.codeFilters).toEqual(expect.arrayContaining([['profile_id', 'user-1'], ['used_at', null]]));
  });

  it('takes a try before checking codes, and sends nothing when tries are used up', async () => {
    mocks.tryAllowed = false;
    const result = await sendBackupCodes('email', CODES);
    expect(result).toEqual({ success: false, message: 'Too many wrong codes. Please try again in 15 minutes.' });
    expect(mocks.claims).toBe(1);
    nothingSent();
  });

  it('refuses more codes than there are fresh unused rows', async () => {
    mocks.backupRows = rowsFor(['AAAA1111']);
    const result = await sendBackupCodes('email', ['AAAA1111', 'BBBB2222']);
    expect(result).toEqual({ success: false, message: 'These codes can no longer be sent. Make new backup codes.' });
    nothingSent();
  });

  it('sends nothing when the send count cannot be read', async () => {
    mocks.countError = { message: 'db down' };
    const result = await sendBackupCodes('email', CODES);
    expect(result).toEqual({ success: false, message: 'Could not send the codes. Please try again.' });
    nothingSent();
  });

  it('refuses codes made more than 15 minutes ago, and sends nothing', async () => {
    mocks.backupRows = rowsFor(CODES, minutesAgo(16));
    const result = await sendBackupCodes('whatsapp', CODES);
    expect(result).toEqual({ success: false, message: 'These codes can no longer be sent. Make new backup codes.' });
    nothingSent();
  });

  it('refuses a fourth send in 15 minutes', async () => {
    mocks.recentSends = 3;
    const result = await sendBackupCodes('email', CODES);
    expect(result.success).toBe(false);
    expect(result.message).toMatch(/Try again in 15 minutes/);
    nothingSent();
    // Counted for this profile, for backup-code sends only, in the last 15 minutes.
    expect(mocks.countFilters).toEqual(expect.arrayContaining([
      ['profile_id', 'user-1'],
      ['metadata->>event', 'backup_codes_sent'],
    ]));
    const since = mocks.countFilters.find(([c]) => c === 'created_at')?.[1] as string;
    expect(Math.abs(Date.parse(since) - Date.parse(minutesAgo(15)))).toBeLessThan(5000);
  });

  it('allows a third send in 15 minutes', async () => {
    mocks.recentSends = 2;
    expect((await sendBackupCodes('email', CODES)).success).toBe(true);
  });
});

describe('sendBackupCodes by email', () => {
  it('sends to the profile email with the 2FA purpose, a code-free subject and code-free audit records', async () => {
    const result = await sendBackupCodes('email', ['aaaa1111', 'BBBB2222']);

    expect(result).toEqual({ success: true, message: 'Backup codes sent to f***@example.com' });
    expect(mocks.sendEmail).toHaveBeenCalledTimes(1);
    const [options] = mocks.sendEmail.mock.calls[0] as [Row];
    expect(options.to).toEqual({ email: 'fola@example.com', name: 'Fola Ade' });
    expect(options.purpose).toBe('self_auth_2fa');
    expect(options.emailType).toBe('notification');
    expect(options.metadata).toEqual({ purpose: '2fa_backup_codes' });
    expect(options.subject).not.toMatch(/AAAA1111|BBBB2222/);
    // The email itself carries the (normalised) codes and says to delete it.
    const html = renderToStaticMarkup(options.react as React.ReactElement);
    expect(html).toContain('AAAA1111');
    expect(html).toContain('BBBB2222');
    expect(html).toMatch(/Each code works once/);
    expect(html).toMatch(/delete this email/);

    expect(mocks.inserts).toEqual([{
      table: 'two_factor_audit_log',
      row: {
        profile_id: 'user-1',
        action: 'settings_updated',
        method: 'authenticator',
        metadata: { event: 'backup_codes_sent', channel: 'email', codes_count: 2 },
      },
    }]);
    expect(mocks.logAudit).toHaveBeenCalledWith({
      action: 'UPDATE',
      entityType: 'two_factor_backup_codes',
      entityId: 'user-1',
      entityDisplay: 'Backup codes sent by email',
      newValues: { channel: 'email', codes_count: 2 },
    });
    expect(recorded()).not.toMatch(/AAAA1111|BBBB2222/);
    expect(mocks.sendWhatsAppMessage).not.toHaveBeenCalled();
  });

  it('reports a failed audit row without the codes, and still returns success', async () => {
    mocks.insertError = { message: 'insert failed' };
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const result = await sendBackupCodes('email', CODES);
    expect(result.success).toBe(true);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(spy.mock.calls)).toMatch(/backup codes sent by email/);
    expect(JSON.stringify(spy.mock.calls)).not.toMatch(/AAAA1111|BBBB2222|CCCC3333/);
    spy.mockRestore();
  });

  it('records nothing when the email fails', async () => {
    mocks.sendEmail.mockResolvedValue({ success: false, error: 'Daily email limit reached' });
    const result = await sendBackupCodes('email', CODES);
    expect(result.success).toBe(false);
    expect(mocks.inserts).toEqual([]);
    expect(mocks.logAudit).not.toHaveBeenCalled();
  });
});

describe('sendBackupCodes by WhatsApp', () => {
  it('sends a plain text message to the resident phone with the 2FA purpose and no tracking', async () => {
    const result = await sendBackupCodes('whatsapp', CODES);

    expect(result).toEqual({ success: true, message: 'Backup codes sent to 080****5678' });
    expect(mocks.sendWhatsAppMessage).toHaveBeenCalledTimes(1);
    const args = mocks.sendWhatsAppMessage.mock.calls[0];
    expect(args).toHaveLength(3);
    const [message, provider, context] = args as [{ to: string; body: string }, unknown, Row];
    expect(message.to).toBe('08012345678');
    expect(message.body.split('\n')).toEqual(expect.arrayContaining([...CODES, 'Each code works once. Delete this message after you save the codes.']));
    expect(provider).toBeUndefined();
    expect(context).toEqual({ purpose: 'self_auth_2fa' });

    expect(mocks.inserts[0].row.metadata).toEqual({ event: 'backup_codes_sent', channel: 'whatsapp', codes_count: 3 });
    expect(mocks.logAudit).toHaveBeenCalledWith(expect.objectContaining({ entityDisplay: 'Backup codes sent by whatsapp' }));
    expect(recorded()).not.toMatch(/AAAA1111|BBBB2222|CCCC3333/);
    expect(mocks.sendEmail).not.toHaveBeenCalled();
  });

  it('refuses when the profile has no phone number', async () => {
    mocks.phone = null;
    expect(await sendBackupCodes('whatsapp', CODES)).toEqual({ success: false, message: 'No phone number on your profile.' });
    nothingSent();
  });
});

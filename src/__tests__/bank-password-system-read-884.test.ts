import { beforeEach, describe, expect, it, vi } from 'vitest';
import { makeRecordingSupabase } from '@/__tests__/helpers/recording-supabase';

/**
 * #884: the scheduled email import has no session, so the RLS-gated (#568) password reads hid
 * every row and protected statement PDFs were skipped. With `systemSource` the parser's two
 * lookups use the service-role client and record each read in the System Action Log; without it
 * they stay on the session client.
 */

const mocks = vi.hoisted(() => ({
  createServerSupabaseClient: vi.fn(),
  createAdminClient: vi.fn(),
  recordSystemAction: vi.fn(),
  getDocument: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: mocks.createServerSupabaseClient,
  createAdminClient: mocks.createAdminClient,
}));
vi.mock('@/lib/encryption', () => ({ decrypt: (v: string) => `plain:${v}` }));
vi.mock('@/lib/system-log/recorder', () => ({ recordSystemAction: mocks.recordSystemAction }));
vi.mock('pdfjs-dist/legacy/build/pdf.mjs', () => ({ getDocument: mocks.getDocument }));

import * as passwords from '@/lib/email-imports/bank-passwords';
import { parseFirstBankPdf } from '@/lib/email-imports/parsers/first-bank-pdf';

const SOURCE = 'cron:fetch-emails';

function clientWithPasswords() {
  return makeRecordingSupabase({
    results: {
      'estate_bank_accounts.select': { data: [{ id: 'acct-1', account_number: '0123451234' }] },
      'estate_bank_account_passwords.select': { data: { password_encrypted: 'enc-1' } },
    },
    calls: [],
    user: null,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.createServerSupabaseClient.mockRejectedValue(new Error('no session in cron'));
  mocks.createAdminClient.mockReturnValue(clientWithPasswords());
});

describe('system bank-password reads (#884)', () => {
  it('reads by account last 4 with the service role and logs the read without the secret', async () => {
    const result = await passwords.getPasswordByAccountLast4('1234', { systemSource: SOURCE });

    expect(result).toEqual({ data: 'plain:enc-1', bankAccountId: 'acct-1', error: null });
    expect(mocks.createServerSupabaseClient).not.toHaveBeenCalled();
    expect(mocks.recordSystemAction).toHaveBeenCalledWith({
      source: SOURCE,
      action: 'read_bank_pdf_password',
      outcome: 'success',
      summary: { lookup: 'account_last4', bankAccountId: 'acct-1', found: true },
      error: null,
    });
    expect(JSON.stringify(mocks.recordSystemAction.mock.calls)).not.toContain('plain:');
  });

  it('reads all passwords with the service role and logs only the count', async () => {
    mocks.createAdminClient.mockReturnValue(
      makeRecordingSupabase({
        results: {
          'estate_bank_account_passwords.select': {
            data: [{ password_encrypted: 'a' }, { password_encrypted: 'b' }],
          },
        },
        calls: [],
        user: null,
      }),
    );

    const result = await passwords.getAllBankPasswords({ systemSource: SOURCE });

    expect(result).toEqual({ data: ['plain:a', 'plain:b'], error: null });
    expect(mocks.createServerSupabaseClient).not.toHaveBeenCalled();
    expect(mocks.recordSystemAction).toHaveBeenCalledWith(
      expect.objectContaining({ source: SOURCE, outcome: 'success', summary: { lookup: 'all', count: 2 } }),
    );
  });

  it('logs a failed system read', async () => {
    mocks.createAdminClient.mockReturnValue(
      makeRecordingSupabase({
        results: { 'estate_bank_account_passwords.select': { error: { message: 'db down' } } },
        calls: [],
        user: null,
      }),
    );

    await passwords.getAllBankPasswords({ systemSource: SOURCE });

    expect(mocks.recordSystemAction).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: 'failure', error: 'db down' }),
    );
  });

  it('keeps reads without systemSource on the session client, unlogged', async () => {
    mocks.createServerSupabaseClient.mockResolvedValue(clientWithPasswords());

    const result = await passwords.getPasswordByAccountLast4('1234');

    expect(result.data).toBe('plain:enc-1');
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
    expect(mocks.recordSystemAction).not.toHaveBeenCalled();
  });
});

describe('parseFirstBankPdf forwards systemSource to the password reads (#884)', () => {
  it('passes it to both the account lookup and the fallback over all passwords', async () => {
    mocks.getDocument.mockImplementation(() => ({ promise: Promise.reject(new Error('No password given')) }));
    const byLast4 = vi
      .spyOn(passwords, 'getPasswordByAccountLast4')
      .mockResolvedValue({ data: null, bankAccountId: null, error: 'none' });
    const all = vi.spyOn(passwords, 'getAllBankPasswords').mockResolvedValue({ data: [], error: null });

    const result = await parseFirstBankPdf(Buffer.from('%PDF'), {
      accountLast4: '1234',
      systemSource: SOURCE,
    });

    expect(result.passwordRequired).toBe(true);
    expect(byLast4).toHaveBeenCalledWith('1234', { systemSource: SOURCE });
    expect(all).toHaveBeenCalledWith({ systemSource: SOURCE });
  });
});

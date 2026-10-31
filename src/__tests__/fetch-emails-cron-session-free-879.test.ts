import { beforeEach, describe, expect, it, vi } from 'vitest';
import { makeRecordingSupabase, type QueryResult } from '@/__tests__/helpers/recording-supabase';

/**
 * #879 (owner decision: option B). The scheduled fetch-emails run has no user session, so the
 * fetch pipeline must not need one, and it must never write money: it queues every transaction
 * for admin review instead of calling processEmailTransactions.
 */

const mocks = vi.hoisted(() => ({
  createServerSupabaseClient: vi.fn(),
  createAdminClient: vi.fn(),
  processEmailTransactions: vi.fn(),
  parseAllPendingEmails: vi.fn(),
  matchEmailTransactions: vi.fn(),
  notifyAdmins: vi.fn(),
  logAudit: vi.fn(),
  listMessagesByCriteria: vi.fn(),
  getMessage: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: mocks.createServerSupabaseClient,
  createAdminClient: mocks.createAdminClient,
}));
vi.mock('@/actions/email-imports/process-email-import', () => ({
  processEmailTransactions: mocks.processEmailTransactions,
}));
vi.mock('@/lib/email-imports/parse-email', () => ({ parseAllPendingEmails: mocks.parseAllPendingEmails }));
vi.mock('@/lib/email-imports/process-email-matching', () => ({
  matchEmailTransactions: mocks.matchEmailTransactions,
}));
vi.mock('@/lib/notifications/admin-notifier', () => ({ notifyAdmins: mocks.notifyAdmins }));
vi.mock('@/lib/audit/logger', () => ({ logAudit: mocks.logAudit }));
vi.mock('@/lib/email-imports/store-attachments', () => ({
  storeEmailAttachments: vi.fn(async () => ({ stored: [], skipped: [] })),
}));
vi.mock('@/lib/email-imports/gmail-client', () => ({
  getGmailClient: vi.fn(async () => ({})),
  listMessagesByCriteria: mocks.listMessagesByCriteria,
  getMessage: mocks.getMessage,
  getAttachment: vi.fn(),
  extractEmailMetadata: vi.fn(() => ({
    subject: 'Credit Alert', from: 'FirstBank <FirstAlert@firstbanknigeria.com>', to: 'estate@x', date: new Date(), threadId: 't1',
  })),
  extractEmailBody: vi.fn(() => ({ text: 'Your account has been credited', html: null })),
  extractAttachments: vi.fn(() => []),
}));

import { runEmailFetch } from '@/lib/email-imports/fetch-emails';
import { queueEmailTransactionsForReview } from '@/lib/email-imports/queue-for-review';

const IMPORT_ID = '00000000-0000-4000-8000-000000000001';

function adminWith(results: Record<string, QueryResult>, calls: string[]) {
  const client = makeRecordingSupabase({ results, calls, user: null });
  mocks.createAdminClient.mockResolvedValue(client);
  return client;
}

beforeEach(() => {
  vi.clearAllMocks();
  // A session client has no user on a cron run; RLS would hide every row from it.
  mocks.createServerSupabaseClient.mockRejectedValue(new Error('no session in cron'));
  mocks.listMessagesByCriteria.mockResolvedValue({ messages: [{ id: 'm1' }] });
  mocks.getMessage.mockResolvedValue({});
});

describe('runEmailFetch on the cron trigger (#879)', () => {
  it('fetches and records the import with the service-role client, never a session', async () => {
    const calls: string[] = [];
    adminWith(
      {
        'gmail_oauth_credentials.select': { data: { email_address: 'estate@x', sync_criteria: {} } },
        'email_imports.insert': { data: { id: IMPORT_ID } },
      },
      calls,
    );

    const result = await runEmailFetch('cron', { maxEmails: 5, sinceDays: 1 });

    expect(result).toMatchObject({ success: true, importId: IMPORT_ID, emailsFetched: 1 });
    expect(mocks.createServerSupabaseClient).not.toHaveBeenCalled();
    expect(calls).toContain('write:email_imports.insert');
    expect(calls).toContain('write:email_messages.insert');
  });

  it('stores the sender check on each message for the auto-record step (#1340)', async () => {
    const client = adminWith(
      {
        'gmail_oauth_credentials.select': { data: { email_address: 'estate@x', sync_criteria: {} } },
        'email_imports.insert': { data: { id: IMPORT_ID } },
      },
      [],
    );
    const inserts: Record<string, unknown>[] = [];
    const from = client.from.bind(client);
    client.from = (table: string) => {
      const chain = from(table) as Record<string, unknown> & { insert: (...a: unknown[]) => unknown };
      const insert = chain.insert;
      chain.insert = (...args: unknown[]) => {
        if (table === 'email_messages') inserts.push(args[0] as Record<string, unknown>);
        return insert(...args);
      };
      return chain;
    };
    mocks.getMessage
      .mockResolvedValueOnce({
        payload: { headers: [{ name: 'Authentication-Results', value: 'mx.google.com; dkim=pass header.i=@firstbanknigeria.com; dmarc=pass (p=REJECT) header.from=firstbanknigeria.com' }] },
      })
      .mockResolvedValueOnce({});
    mocks.listMessagesByCriteria.mockResolvedValue({ messages: [{ id: 'm1' }, { id: 'm2' }] });

    await runEmailFetch('cron');

    expect(inserts.map((r) => [r.sender_verified, r.sender_check])).toEqual([
      [true, 'dkim=pass header.d=firstbanknigeria.com; dmarc=pass header.from=firstbanknigeria.com; From firstalert@firstbanknigeria.com'],
      [false, 'No Authentication-Results header'],
    ]);
  });

  it('does not chain into processEmailTransactions, so no money is written on schedule', async () => {
    adminWith({ 'email_imports.insert': { data: { id: IMPORT_ID } } }, []);

    await runEmailFetch('cron');

    expect(mocks.processEmailTransactions).not.toHaveBeenCalled();
    expect(mocks.parseAllPendingEmails).not.toHaveBeenCalled();
  });

  it('still chains parse, match and process for a manual fetch', async () => {
    adminWith({ 'email_imports.insert': { data: { id: IMPORT_ID } } }, []);
    mocks.createServerSupabaseClient.mockResolvedValue(
      makeRecordingSupabase({ results: {}, calls: [], user: { id: 'admin-1' } }),
    );

    await runEmailFetch('manual');

    expect(mocks.processEmailTransactions).toHaveBeenCalledWith(IMPORT_ID);
    expect(mocks.logAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'CREATE', entityType: 'email_imports', entityId: IMPORT_ID }),
    );
  });
});

describe('queueEmailTransactionsForReview (#879)', () => {
  it('queues the import\'s open transactions, completes the import and notifies admins', async () => {
    const calls: string[] = [];
    const client = adminWith(
      { 'email_transactions.update': { data: [{ id: 'tx1' }, { id: 'tx2' }] } },
      calls,
    );
    const from = vi.spyOn(client, 'from');

    const result = await queueEmailTransactionsForReview(IMPORT_ID);

    expect(result).toEqual({ queuedForReview: 2, error: null });
    expect(from.mock.calls.map(([t]) => t)).toEqual(['email_transactions', 'email_imports']);
    expect(calls).toEqual(['write:email_transactions.update', 'write:email_imports.update']);
    expect(mocks.notifyAdmins).toHaveBeenCalledWith(
      expect.objectContaining({ actionUrl: `/payments/email-imports/${IMPORT_ID}` }),
    );
    expect(mocks.createServerSupabaseClient).not.toHaveBeenCalled();
  });

  it('writes the auto-record counts of the run onto the import (#1340)', async () => {
    const client = adminWith({ 'email_transactions.update': { data: [{ id: 'tx1' }] } }, []);
    const importUpdates: Record<string, unknown>[] = [];
    const from = client.from.bind(client);
    client.from = (table: string) => {
      const chain = from(table) as Record<string, unknown> & { update: (...a: unknown[]) => unknown };
      const update = chain.update;
      chain.update = (...args: unknown[]) => {
        if (table === 'email_imports') importUpdates.push(args[0] as Record<string, unknown>);
        return update(...args);
      };
      return chain;
    };

    await queueEmailTransactionsForReview(IMPORT_ID, { autoProcessed: 3, skipped: 1, errored: 2 });

    expect(importUpdates[0]).toMatchObject({
      status: 'completed',
      transactions_auto_processed: 3,
      transactions_queued: 1,
      transactions_skipped: 1,
      transactions_errored: 2,
    });
  });

  it('notifies nobody when nothing was queued', async () => {
    adminWith({ 'email_transactions.update': { data: [] } }, []);

    const result = await queueEmailTransactionsForReview(IMPORT_ID);

    expect(result).toEqual({ queuedForReview: 0, error: null });
    expect(mocks.notifyAdmins).not.toHaveBeenCalled();
  });

  it('marks the import failed and returns the error when the queue update fails', async () => {
    const calls: string[] = [];
    adminWith({ 'email_transactions.update': { error: { message: 'db down' } } }, calls);

    const result = await queueEmailTransactionsForReview(IMPORT_ID);

    expect(result).toEqual({ queuedForReview: 0, error: 'db down' });
    expect(calls).toEqual(['write:email_transactions.update', 'write:email_imports.update']);
    expect(mocks.notifyAdmins).not.toHaveBeenCalled();
  });
});

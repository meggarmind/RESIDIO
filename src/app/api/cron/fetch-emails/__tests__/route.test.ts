import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GET } from '../route';
import { getActiveGmailAddress } from '@/lib/email-imports/gmail-client';
import { runEmailFetch } from '@/lib/email-imports/fetch-emails';
import { parseAllPendingEmails } from '@/lib/email-imports/parse-email';
import { processEmailTransactions } from '@/actions/email-imports/process-email-import';
import { matchEmailTransactions } from '@/lib/email-imports/process-email-matching';
import { queueEmailTransactionsForReview } from '@/lib/email-imports/queue-for-review';
import { authorizePermission } from '@/lib/auth/authorize';
import { recordSystemAction } from '@/lib/system-log/recorder';

vi.mock('@/lib/email-imports/gmail-client', () => ({ getActiveGmailAddress: vi.fn() }));
vi.mock('@/lib/email-imports/queue-for-review', () => ({ queueEmailTransactionsForReview: vi.fn() }));
vi.mock('@/lib/auth/authorize', () => ({ authorizePermission: vi.fn() }));
vi.mock('@/lib/email-imports/fetch-emails', () => ({ runEmailFetch: vi.fn() }));
vi.mock('@/lib/email-imports/parse-email', () => ({ parseAllPendingEmails: vi.fn() }));
vi.mock('@/actions/email-imports/process-email-import', () => ({ processEmailTransactions: vi.fn() }));
vi.mock('@/lib/email-imports/process-email-matching', () => ({ matchEmailTransactions: vi.fn() }));
vi.mock('@/lib/system-log/recorder', () => ({ recordSystemAction: vi.fn() }));

const SECRET = 'cron-secret-for-tests';

function request(authorization?: string): NextRequest {
  return new NextRequest('https://residio.test/api/cron/fetch-emails', {
    headers: authorization ? { authorization } : {},
  });
}

describe('GET /api/cron/fetch-emails system log', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('CRON_SECRET', SECRET);
    vi.mocked(getActiveGmailAddress).mockResolvedValue('estate@example.com');
    // A cron run has no session, so any permission check would fail.
    vi.mocked(authorizePermission).mockResolvedValue({ authorized: false, error: 'Unauthorized' } as never);
    vi.mocked(runEmailFetch).mockResolvedValue({
      success: true,
      importId: 'imp-1',
      emailsFetched: 4,
      emailsSkipped: 0,
      emailsErrored: 0,
    } as never);
    vi.mocked(parseAllPendingEmails).mockResolvedValue({
      messagesParsed: 4,
      transactionsExtracted: 3,
      errored: 0,
    } as never);
    vi.mocked(matchEmailTransactions).mockResolvedValue({ matched: 2, unmatched: 1 } as never);
    vi.mocked(queueEmailTransactionsForReview).mockResolvedValue({ queuedForReview: 3, error: null });
  });
  afterEach(() => vi.unstubAllEnvs());

  it('records nothing for an unauthenticated request', async () => {
    const response = await GET(request());
    expect(response.status).toBe(401);
    expect(recordSystemAction).not.toHaveBeenCalled();
  });

  it('records one success row with phase counts and the import id, but not the mailbox address', async () => {
    const response = await GET(request(`Bearer ${SECRET}`));
    expect(response.status).toBe(200);
    expect(recordSystemAction).toHaveBeenCalledTimes(1);
    const entry = vi.mocked(recordSystemAction).mock.calls[0][0];
    expect(entry).toMatchObject({ source: 'cron:fetch-emails', action: 'import', outcome: 'success' });
    expect(entry.summary).toMatchObject({
      importId: 'imp-1',
      fetchPhase: { emailsFetched: 4 },
      parsePhase: { transactionsExtracted: 3 },
      matchPhase: { matched: 2 },
      queuePhase: { queuedForReview: 3 },
    });
    expect(JSON.stringify(entry)).not.toContain('estate@example.com');
  });

  it('records a skipped run when Gmail is not connected', async () => {
    vi.mocked(getActiveGmailAddress).mockResolvedValue(null);
    const response = await GET(request(`Bearer ${SECRET}`));
    expect(response.status).toBe(200);
    expect(recordSystemAction).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'cron:fetch-emails',
        outcome: 'success',
        summary: { skipped: true, reason: 'gmail_not_connected' },
      })
    );
  });

  it('records failure when the fetch reports failure even though the response is 200', async () => {
    vi.mocked(runEmailFetch).mockResolvedValue({ success: false, error: 'gmail quota', emailsFetched: 0 } as never);
    const response = await GET(request(`Bearer ${SECRET}`));
    expect(response.status).toBe(200);
    expect(recordSystemAction).toHaveBeenCalledWith(
      expect.objectContaining({ source: 'cron:fetch-emails', outcome: 'failure', error: 'gmail quota' })
    );
  });

  it('runs every phase without a session and queues for review instead of processing (#879)', async () => {
    await GET(request(`Bearer ${SECRET}`));
    expect(runEmailFetch).toHaveBeenCalledWith('cron', { maxEmails: 50, sinceDays: 1 });
    expect(queueEmailTransactionsForReview).toHaveBeenCalledWith('imp-1');
    expect(processEmailTransactions).not.toHaveBeenCalled();
    expect(authorizePermission).not.toHaveBeenCalled();
  });

  it('queues even when nothing matched, so unmatched transactions reach the review queue', async () => {
    vi.mocked(matchEmailTransactions).mockResolvedValue({ matched: 0, unmatched: 3 } as never);
    await GET(request(`Bearer ${SECRET}`));
    expect(queueEmailTransactionsForReview).toHaveBeenCalledWith('imp-1');
  });

  it('records failure when queueing for review fails', async () => {
    vi.mocked(queueEmailTransactionsForReview).mockResolvedValue({ queuedForReview: 0, error: 'db down' });
    const response = await GET(request(`Bearer ${SECRET}`));
    expect(response.status).toBe(200);
    expect(recordSystemAction).toHaveBeenCalledWith(
      expect.objectContaining({ source: 'cron:fetch-emails', outcome: 'failure', error: 'db down' })
    );
  });

  it('records failure with the error when a phase throws, and still returns 500', async () => {
    vi.mocked(parseAllPendingEmails).mockRejectedValue(new Error('parse crashed'));
    const response = await GET(request(`Bearer ${SECRET}`));
    expect(response.status).toBe(500);
    expect(recordSystemAction).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: 'failure', error: expect.any(Error) })
    );
  });
});

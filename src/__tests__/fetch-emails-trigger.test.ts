import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextResponse, type NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  authorizePermission: vi.fn(),
  runEmailFetch: vi.fn(),
  verifyCronAuth: vi.fn(),
  getGmailConnectionStatus: vi.fn(),
  parseAllPendingEmails: vi.fn(),
}));

vi.mock('@/lib/auth/authorize', () => ({ authorizePermission: mocks.authorizePermission }));
vi.mock('@/lib/email-imports/fetch-emails', () => ({ runEmailFetch: mocks.runEmailFetch }));
vi.mock('@/lib/auth/cron-auth', () => ({ verifyCronAuth: mocks.verifyCronAuth }));
vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ info: vi.fn(), error: vi.fn(), warn: vi.fn() }),
}));
vi.mock('@/actions/email-imports/gmail-oauth', () => ({
  getGmailConnectionStatus: mocks.getGmailConnectionStatus,
}));
vi.mock('@/actions/email-imports/parse-email', () => ({
  parseAllPendingEmails: mocks.parseAllPendingEmails,
}));
vi.mock('@/actions/email-imports/process-email-import', () => ({
  matchEmailTransactions: vi.fn(),
  processEmailTransactions: vi.fn(),
}));

import { fetchNewEmails } from '@/actions/email-imports/fetch-emails';
import { GET } from '@/app/api/cron/fetch-emails/route';

const okResult = {
  success: true, importId: 'imp-1', emailsFetched: 0, emailsSkipped: 0, emailsErrored: 0,
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('fetchNewEmails action (#488)', () => {
  it('takes only the options argument: no trigger parameter', () => {
    expect(fetchNewEmails.length).toBeLessThanOrEqual(1);
  });

  it('refuses a role-less session that forges trigger: cron, without running the fetch', async () => {
    mocks.authorizePermission.mockResolvedValue({ authorized: false, error: 'Forbidden' });

    const forged = { trigger: 'cron', maxEmails: 5 } as unknown as Parameters<typeof fetchNewEmails>[0];
    const res = await fetchNewEmails(forged);

    expect(res).toEqual({
      success: false, importId: null, emailsFetched: 0, emailsSkipped: 0, emailsErrored: 0,
      error: 'Forbidden',
    });
    expect(mocks.runEmailFetch).not.toHaveBeenCalled();
  });

  it('checks EMAIL_IMPORTS_TRIGGER before running', async () => {
    mocks.authorizePermission.mockResolvedValue({ authorized: false });
    await fetchNewEmails();
    expect(mocks.authorizePermission).toHaveBeenCalledWith('email_imports.trigger');
  });

  it('runs an authorized caller as manual, even if they forge trigger: cron', async () => {
    mocks.authorizePermission.mockResolvedValue({ authorized: true, userId: 'u1' });
    mocks.runEmailFetch.mockResolvedValue(okResult);

    const forged = { trigger: 'cron', maxEmails: 20, sinceDays: 3 } as unknown as Parameters<typeof fetchNewEmails>[0];
    const res = await fetchNewEmails(forged);

    expect(res).toBe(okResult);
    expect(mocks.runEmailFetch).toHaveBeenCalledTimes(1);
    expect(mocks.runEmailFetch).toHaveBeenCalledWith('manual', { maxEmails: 20, sinceDays: 3 });
    expect(mocks.authorizePermission.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.runEmailFetch.mock.invocationCallOrder[0],
    );
  });
});

describe('cron fetch-emails route (#488)', () => {
  const request = {} as NextRequest;

  it('rejects an unauthenticated request without running the service-role fetch', async () => {
    mocks.verifyCronAuth.mockReturnValue(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }));

    const res = await GET(request);

    expect(res.status).toBe(401);
    expect(mocks.runEmailFetch).not.toHaveBeenCalled();
  });

  it('runs the cron-trigger fetch only after verifyCronAuth passes', async () => {
    mocks.verifyCronAuth.mockReturnValue(null);
    mocks.getGmailConnectionStatus.mockResolvedValue({ data: { connected: true, email: 'a@b.c' }, error: null });
    mocks.runEmailFetch.mockResolvedValue(okResult);

    const res = await GET(request);

    expect(res.status).toBe(200);
    expect(mocks.runEmailFetch).toHaveBeenCalledWith('cron', { maxEmails: 50, sinceDays: 1 });
    expect(mocks.verifyCronAuth.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.runEmailFetch.mock.invocationCallOrder[0],
    );
  });
});

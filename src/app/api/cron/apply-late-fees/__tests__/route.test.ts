import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GET } from '../route';
import { getLateFeeSettings } from '@/actions/billing/apply-late-fees';
import { runLateFeeApplication } from '@/lib/billing/apply-late-fees';
import { recordSystemAction } from '@/lib/system-log/recorder';

vi.mock('@/actions/billing/apply-late-fees', () => ({ getLateFeeSettings: vi.fn() }));
vi.mock('@/lib/billing/apply-late-fees', () => ({ runLateFeeApplication: vi.fn() }));
vi.mock('@/lib/system-log/recorder', () => ({ recordSystemAction: vi.fn() }));

const SECRET = 'cron-secret-for-tests';

function request(authorization?: string): NextRequest {
  return new NextRequest('https://residio.test/api/cron/apply-late-fees', {
    headers: authorization ? { authorization } : {},
  });
}

function settings(overrides: Record<string, unknown> = {}) {
  vi.mocked(getLateFeeSettings).mockResolvedValue({
    enabled: true,
    autoApply: true,
    applicationDay: new Date().getDate(),
    ...overrides,
  } as never);
}

function lateFeeResult(overrides: Record<string, unknown> = {}) {
  return {
    success: true,
    processed: 10,
    applied: 8,
    totalLateFees: 4000,
    skippedWaiver: 1,
    skippedAlreadyApplied: 1,
    errors: [],
    logId: 'log-1',
    durationMs: 5,
    ...overrides,
  } as never;
}

describe('GET /api/cron/apply-late-fees system log', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('CRON_SECRET', SECRET);
    vi.mocked(recordSystemAction).mockResolvedValue({ recorded: true });
    settings();
    vi.mocked(runLateFeeApplication).mockResolvedValue(lateFeeResult());
  });
  afterEach(() => vi.unstubAllEnvs());

  it('records nothing for an unauthenticated request', async () => {
    const response = await GET(request('Bearer wrong-secret-xxxxxxxxxx'));
    expect(response.status).toBe(401);
    expect(recordSystemAction).not.toHaveBeenCalled();
  });

  it('records ONE summary row per run, never one per invoice', async () => {
    const response = await GET(request(`Bearer ${SECRET}`));
    expect(response.status).toBe(200);
    expect(recordSystemAction).toHaveBeenCalledTimes(1);
    expect(recordSystemAction).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'cron:apply-late-fees',
        action: 'apply',
        outcome: 'success',
        summary: expect.objectContaining({ processed: 10, applied: 8, totalLateFees: 4000, logId: 'log-1' }),
      })
    );
  });

  it('records a skipped run as a success with the reason', async () => {
    settings({ enabled: false });
    const response = await GET(request(`Bearer ${SECRET}`));
    expect(response.status).toBe(200);
    expect(runLateFeeApplication).not.toHaveBeenCalled();
    expect(recordSystemAction).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'cron:apply-late-fees',
        outcome: 'success',
        summary: { skipped: true, reason: 'late_fees_disabled' },
      })
    );
  });

  it('records partial, with a count but not the error details, when some invoices errored', async () => {
    vi.mocked(runLateFeeApplication).mockResolvedValue(
      lateFeeResult({ errors: [{ invoiceId: 'i-1', error: 'x' }] })
    );
    await GET(request(`Bearer ${SECRET}`));
    const entry = vi.mocked(recordSystemAction).mock.calls[0][0];
    expect(entry.outcome).toBe('partial');
    expect(entry.summary).toMatchObject({ errorCount: 1 });
    expect(entry.summary).not.toHaveProperty('errors');
  });

  it('records failure with the error when the run throws, and still returns 500', async () => {
    vi.mocked(runLateFeeApplication).mockRejectedValue(new Error('db down'));
    const response = await GET(request(`Bearer ${SECRET}`));
    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: 'db down' });
    expect(recordSystemAction).toHaveBeenCalledWith(
      expect.objectContaining({ source: 'cron:apply-late-fees', outcome: 'failure', error: expect.any(Error) })
    );
  });
});

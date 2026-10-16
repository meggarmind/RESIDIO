import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GET } from '../route';
import { expirePendingApprovals } from '@/lib/approvals/expire-approvals';
import { recordSystemAction } from '@/lib/system-log/recorder';

vi.mock('@/lib/approvals/expire-approvals', () => ({ expirePendingApprovals: vi.fn() }));
vi.mock('@/lib/system-log/recorder', () => ({ recordSystemAction: vi.fn() }));

const SECRET = 'cron-secret-for-tests';
const request = (authorization?: string) =>
  new NextRequest('https://residio.test/api/cron/expire-approvals', {
    headers: authorization ? { authorization } : {},
  });

describe('GET /api/cron/expire-approvals (#558)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('CRON_SECRET', SECRET);
    vi.mocked(expirePendingApprovals).mockResolvedValue({ expired: 3, notified: 3 });
  });
  afterEach(() => vi.unstubAllEnvs());

  it('returns 401 without a header and expires nothing', async () => {
    const response = await GET(request());
    expect(response.status).toBe(401);
    expect(expirePendingApprovals).not.toHaveBeenCalled();
    expect(recordSystemAction).not.toHaveBeenCalled();
  });

  it('returns 401 for a wrong secret and expires nothing', async () => {
    const response = await GET(request('Bearer not-the-secret-xxxxx'));
    expect(response.status).toBe(401);
    expect(expirePendingApprovals).not.toHaveBeenCalled();
  });

  it('returns the count and records one success row when authorised', async () => {
    const response = await GET(request(`Bearer ${SECRET}`));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ success: true, expired: 3, notified: 3 });
    expect(recordSystemAction).toHaveBeenCalledTimes(1);
    expect(recordSystemAction).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'cron:expire-approvals',
        action: 'expire',
        outcome: 'success',
        summary: { expired: 3, notified: 3 },
      })
    );
  });

  it('returns 500 and records a failure when expiry throws', async () => {
    vi.mocked(expirePendingApprovals).mockRejectedValue(new Error('db down'));
    const response = await GET(request(`Bearer ${SECRET}`));
    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: 'db down' });
    expect(recordSystemAction).toHaveBeenCalledWith(
      expect.objectContaining({ source: 'cron:expire-approvals', outcome: 'failure', error: expect.objectContaining({ message: 'db down' }) })
    );
  });
});

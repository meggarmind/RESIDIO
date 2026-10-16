import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GET } from '../route';
import { processQueue, purgeOldItems } from '@/lib/notifications/queue';
import { recordSystemAction } from '@/lib/system-log/recorder';

vi.mock('@/lib/notifications/queue', () => ({ processQueue: vi.fn(), purgeOldItems: vi.fn() }));
vi.mock('@/lib/system-log/recorder', () => ({ recordSystemAction: vi.fn() }));

const SECRET = 'cron-secret-for-tests';

function request(authorization?: string): NextRequest {
  return new NextRequest('https://residio.test/api/cron/process-notifications', {
    headers: authorization ? { authorization } : {},
  });
}

function queueResult(overrides: Record<string, unknown> = {}) {
  return { processed: 5, sent: 4, failed: 0, skipped: 1, errors: [], ...overrides } as never;
}

describe('GET /api/cron/process-notifications system log', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('CRON_SECRET', SECRET);
    vi.mocked(processQueue).mockResolvedValue(queueResult());
    vi.mocked(purgeOldItems).mockResolvedValue({ deleted: 0 } as never);
  });
  afterEach(() => vi.unstubAllEnvs());

  it('records nothing for an unauthenticated request', async () => {
    const response = await GET(request('Bearer wrong-secret-xxxxxxxxxx'));
    expect(response.status).toBe(401);
    expect(processQueue).not.toHaveBeenCalled();
    expect(recordSystemAction).not.toHaveBeenCalled();
  });

  it('records one success row with the queue counts', async () => {
    const response = await GET(request(`Bearer ${SECRET}`));
    expect(response.status).toBe(200);
    expect(recordSystemAction).toHaveBeenCalledTimes(1);
    expect(recordSystemAction).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'cron:process-notifications',
        action: 'process',
        outcome: 'success',
        summary: { processed: 5, sent: 4, failed: 0, skipped: 1, purged: 0 },
      })
    );
  });

  it('records partial when some notifications failed but others were sent', async () => {
    vi.mocked(processQueue).mockResolvedValue(queueResult({ failed: 2, errors: ['x'] }));
    await GET(request(`Bearer ${SECRET}`));
    expect(recordSystemAction).toHaveBeenCalledWith(expect.objectContaining({ outcome: 'partial' }));
  });

  it('records failure with the error when the queue throws, and still returns 500', async () => {
    vi.mocked(processQueue).mockRejectedValue(new Error('queue down'));
    const response = await GET(request(`Bearer ${SECRET}`));
    expect(response.status).toBe(500);
    expect(recordSystemAction).toHaveBeenCalledWith(
      expect.objectContaining({ source: 'cron:process-notifications', outcome: 'failure', error: expect.any(Error) })
    );
  });
});

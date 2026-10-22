import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GET } from '../route';
import { createAdminClient } from '@/lib/supabase/server';
import { recordSystemAction } from '@/lib/system-log/recorder';

vi.mock('@/lib/supabase/server', () => ({ createAdminClient: vi.fn() }));
vi.mock('@/lib/system-log/recorder', () => ({ recordSystemAction: vi.fn() }));

const SECRET = 'cron-secret-for-tests';
const lt = vi.fn();

function request(authorization?: string) {
  return new NextRequest('https://residio.test/api/cron/purge-performance-events', {
    headers: authorization ? { authorization } : {},
  });
}

describe('GET /api/cron/purge-performance-events', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('CRON_SECRET', SECRET);
    lt.mockResolvedValue({ count: 4, error: null });
    vi.mocked(createAdminClient).mockReturnValue({ from: () => ({ delete: () => ({ lt }) }) } as never);
  });
  afterEach(() => vi.unstubAllEnvs());

  it('rejects an unauthenticated request without deleting', async () => {
    expect((await GET(request('Bearer wrong-secret-xxxxxxxxxx'))).status).toBe(401);
    expect(lt).not.toHaveBeenCalled();
  });

  it('deletes rows older than 30 days and logs the count', async () => {
    const now = Date.now();
    const res = await GET(request(`Bearer ${SECRET}`));
    expect(res.status).toBe(200);
    const [column, cutoff] = lt.mock.calls[0];
    expect(column).toBe('occurred_at');
    expect(Math.abs(now - Date.parse(cutoff) - 30 * 86_400_000)).toBeLessThan(5000);
    expect(recordSystemAction).toHaveBeenCalledWith(
      expect.objectContaining({ source: 'cron:purge-performance-events', outcome: 'success', summary: { deleted: 4, retentionDays: 30 } })
    );
  });

  it('returns 500 and logs failure when the delete fails', async () => {
    lt.mockResolvedValue({ count: null, error: { message: 'nope' } });
    expect((await GET(request(`Bearer ${SECRET}`))).status).toBe(500);
    expect(recordSystemAction).toHaveBeenCalledWith(expect.objectContaining({ outcome: 'failure' }));
  });
});

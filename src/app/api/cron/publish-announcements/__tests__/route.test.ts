import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GET } from '../route';
import { publishAnnouncementCore } from '@/lib/announcements/publish';
import { insertBulkNotifications } from '@/lib/notifications/in-app';
import { createAdminClient } from '@/lib/supabase/server';
import { recordSystemAction } from '@/lib/system-log/recorder';

vi.mock('@/lib/announcements/publish', () => ({ publishAnnouncementCore: vi.fn() }));
vi.mock('@/lib/notifications/in-app', () => ({ insertBulkNotifications: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({ createAdminClient: vi.fn() }));
vi.mock('@/lib/system-log/recorder', () => ({ recordSystemAction: vi.fn() }));

const SECRET = 'cron-secret-for-tests';

function request(authorization?: string): NextRequest {
  return new NextRequest('https://residio.test/api/cron/publish-announcements', {
    headers: authorization ? { authorization } : {},
  });
}

function announcement(id: string) {
  return {
    id,
    title: 'Water outage',
    summary: 'Tomorrow',
    content: 'Details',
    priority: 'normal',
    target_audience: 'all',
    target_houses: null,
  };
}

/** A chainable supabase stub: the announcements query and the residents query both resolve. */
function supabaseWith(announcements: unknown[] | null, queryError: { message: string } | null = null) {
  const chain = (result: unknown) => {
    const q: Record<string, unknown> = {};
    for (const m of ['select', 'eq', 'lte', 'order', 'in']) q[m] = () => q;
    q.then = (resolve: (v: unknown) => void) => resolve(result);
    return q;
  };
  vi.mocked(createAdminClient).mockReturnValue({
    from: (table: string) =>
      table === 'announcements'
        ? chain({ data: announcements, error: queryError })
        : chain({ data: [{ id: 'res-1' }, { id: 'res-2' }], error: null }),
  } as never);
}

describe('GET /api/cron/publish-announcements system log', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('CRON_SECRET', SECRET);
    supabaseWith([announcement('a-1'), announcement('a-2')]);
    vi.mocked(publishAnnouncementCore).mockResolvedValue({ error: null } as never);
    vi.mocked(insertBulkNotifications).mockResolvedValue({ data: [{ id: 'n-1' }, { id: 'n-2' }], error: null } as never);
  });
  afterEach(() => vi.unstubAllEnvs());

  it('records nothing for an unauthenticated request', async () => {
    const response = await GET(request('Bearer wrong-secret-xxxxxxxxxx'));
    expect(response.status).toBe(401);
    expect(recordSystemAction).not.toHaveBeenCalled();
  });

  it('records one success row with counts, not titles or content', async () => {
    const response = await GET(request(`Bearer ${SECRET}`));
    expect(response.status).toBe(200);
    expect(recordSystemAction).toHaveBeenCalledTimes(1);
    const entry = vi.mocked(recordSystemAction).mock.calls[0][0];
    expect(entry).toMatchObject({
      source: 'cron:publish-announcements',
      action: 'publish',
      outcome: 'success',
      summary: { due: 2, published: 2, notificationsSent: 4, errorCount: 0, failedAnnouncementIds: [] },
    });
    expect(JSON.stringify(entry)).not.toContain('Water outage');
  });

  it('records a run with nothing due as a success', async () => {
    supabaseWith([]);
    await GET(request(`Bearer ${SECRET}`));
    expect(recordSystemAction).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: 'success', summary: { due: 0, published: 0, notificationsSent: 0 } })
    );
  });

  it('records partial with the failed id when one announcement fails to publish (200)', async () => {
    vi.mocked(publishAnnouncementCore)
      .mockResolvedValueOnce({ error: null } as never)
      .mockResolvedValueOnce({ error: 'cannot publish' } as never);
    const response = await GET(request(`Bearer ${SECRET}`));
    expect(response.status).toBe(200);
    expect(recordSystemAction).toHaveBeenCalledWith(
      expect.objectContaining({
        outcome: 'partial',
        error: 'cannot publish',
        summary: expect.objectContaining({ published: 1, errorCount: 1, failedAnnouncementIds: ['a-2'] }),
      })
    );
  });

  it('records failure when every announcement fails', async () => {
    vi.mocked(publishAnnouncementCore).mockResolvedValue({ error: 'cannot publish' } as never);
    await GET(request(`Bearer ${SECRET}`));
    expect(recordSystemAction).toHaveBeenCalledWith(expect.objectContaining({ outcome: 'failure' }));
  });

  it('records failure with the error when the query fails (500)', async () => {
    supabaseWith(null, { message: 'db down' });
    const response = await GET(request(`Bearer ${SECRET}`));
    expect(response.status).toBe(500);
    expect(recordSystemAction).toHaveBeenCalledWith(
      expect.objectContaining({ source: 'cron:publish-announcements', outcome: 'failure' })
    );
  });
});

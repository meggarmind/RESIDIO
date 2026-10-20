import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * #876: the cron has no user session. With every session-bound seam refusing, a due announcement
 * must still be published and its in-app notifications inserted, through the real publish and
 * notification cores and the admin client.
 */
const m = vi.hoisted(() => ({
  createServerSupabaseClient: vi.fn(),
  createAdminClient: vi.fn(),
  authorizePermission: vi.fn(),
  logAudit: vi.fn(),
  addToQueue: vi.fn(),
  recordSystemAction: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: m.createServerSupabaseClient,
  createAdminClient: m.createAdminClient,
}));
vi.mock('@/lib/auth/authorize', () => ({ authorizePermission: m.authorizePermission }));
vi.mock('@/lib/audit/logger', () => ({ logAudit: m.logAudit }));
vi.mock('@/lib/notifications/queue', () => ({ addToQueue: m.addToQueue }));
vi.mock('@/lib/system-log/recorder', () => ({ recordSystemAction: m.recordSystemAction }));

import { GET } from '../route';

const SECRET = 'cron-secret-for-tests';

const DUE = {
  id: 'a-1',
  title: 'Water outage',
  summary: 'Tomorrow',
  content: 'Details',
  status: 'scheduled',
  priority: 'normal',
  target_audience: 'all',
  target_houses: null,
};

type Result = { data: unknown; error: unknown };

function chain(list: Result, single: Result = list) {
  const q: Record<string, unknown> = {};
  for (const method of ['select', 'eq', 'lte', 'order', 'in', 'is']) q[method] = () => q;
  q.single = () => Promise.resolve(single);
  q.then = (resolve: (v: Result) => unknown) => Promise.resolve(list).then(resolve);
  return q;
}

const updates: Record<string, unknown>[] = [];
const inserted: Record<string, unknown>[][] = [];

function adminClient() {
  return {
    from: (table: string) => {
      if (table === 'announcements') {
        const q = chain({ data: [DUE], error: null }, { data: DUE, error: null });
        q.update = (values: Record<string, unknown>) => {
          updates.push(values);
          return chain({ data: null, error: null }, { data: { ...DUE, ...values }, error: null });
        };
        return q;
      }
      if (table === 'residents') return chain({ data: [{ id: 'res-1' }, { id: 'res-2' }], error: null });
      if (table === 'whatsapp_optins') return chain({ data: [], error: null });
      if (table === 'in_app_notifications') {
        return {
          insert: (rows: Record<string, unknown>[]) => {
            inserted.push(rows);
            return { select: () => Promise.resolve({ data: rows.map((_, i) => ({ id: `n-${i}` })), error: null }) };
          },
        };
      }
      return chain({ data: null, error: null });
    },
  };
}

describe('GET /api/cron/publish-announcements without a session (#876)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    updates.length = 0;
    inserted.length = 0;
    vi.stubEnv('CRON_SECRET', SECRET);
    m.createServerSupabaseClient.mockRejectedValue(new Error('no request session'));
    m.authorizePermission.mockResolvedValue({ authorized: false, error: 'Unauthorized' });
    m.createAdminClient.mockImplementation(adminClient);
  });
  afterEach(() => vi.unstubAllEnvs());

  it('publishes the due announcement and notifies its residents with no session', async () => {
    const response = await GET(
      new NextRequest('https://residio.test/api/cron/publish-announcements', {
        headers: { authorization: `Bearer ${SECRET}` },
      })
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ published: 1, notificationsSent: 2, errorCount: 0 });
    expect(updates).toHaveLength(1);
    expect(updates[0]).toMatchObject({ status: 'published', scheduled_for: null });
    expect(updates[0]).not.toHaveProperty('updated_by');
    expect(inserted[0].map((row) => row.recipient_id)).toEqual(['res-1', 'res-2']);
    expect(m.createServerSupabaseClient).not.toHaveBeenCalled();
    expect(m.authorizePermission).not.toHaveBeenCalled();
    expect(m.recordSystemAction).toHaveBeenCalledWith(expect.objectContaining({ outcome: 'success' }));
  });
});

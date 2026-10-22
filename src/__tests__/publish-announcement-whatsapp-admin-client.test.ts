import { beforeEach, describe, expect, it, vi } from 'vitest';
import { publishAnnouncement } from '@/actions/announcements/publish-announcement';
import { publishAnnouncementCore } from '@/lib/announcements/publish';

const { createServerSupabaseClient, createAdminClient, authorizePermission } = vi.hoisted(() => ({
  createServerSupabaseClient: vi.fn(),
  createAdminClient: vi.fn(),
  authorizePermission: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({ createServerSupabaseClient, createAdminClient }));
vi.mock('@/lib/auth/authorize', () => ({ authorizePermission }));
vi.mock('@/lib/audit/logger', () => ({ logAudit: vi.fn() }));
vi.mock('@/lib/notifications/queue', () => ({ addToQueue: vi.fn() }));

const announcement = {
  id: 'a1',
  title: 'T',
  content: 'C',
  summary: null,
  target_audience: null,
  target_houses: null,
  status: 'draft',
  published_at: null,
};

/** Client double: announcements read/update succeed; whatsapp_optins is recorded. */
function client(optInsResult: unknown) {
  const tables: string[] = [];
  const from = vi.fn((table: string) => {
    tables.push(table);
    const result =
      table === 'whatsapp_optins'
        ? optInsResult
        : { data: { ...announcement, status: 'published' }, error: null };
    const q: Record<string, unknown> = { then: (f: (v: unknown) => unknown) => Promise.resolve(result).then(f) };
    for (const m of ['select', 'update', 'eq', 'is', 'in']) q[m] = vi.fn().mockReturnValue(q);
    q.single = vi.fn().mockResolvedValue(
      table === 'announcements' && tables.filter((t) => t === 'announcements').length === 1
        ? { data: announcement, error: null }
        : result
    );
    return q;
  });
  return { from, tables };
}

beforeEach(() => {
  vi.clearAllMocks();
  authorizePermission.mockResolvedValue({ authorized: true, userId: 'u1' });
});

describe('publishAnnouncement WhatsApp delivery', () => {
  it('reads whatsapp_optins with the admin client, not the session client', async () => {
    const session = client({ data: null, error: { message: 'permission denied' } });
    const admin = client({ data: [], error: null });
    createServerSupabaseClient.mockResolvedValue(session);
    createAdminClient.mockReturnValue(admin);

    const res = await publishAnnouncement('a1');

    expect(res.error).toBeNull();
    expect(admin.tables).toContain('whatsapp_optins');
    expect(session.tables).not.toContain('whatsapp_optins');
  });

  it('core defaults delivery to the passed client', async () => {
    const only = client({ data: [], error: null });
    await publishAnnouncementCore(only as never, 'a1', null);
    expect(only.tables).toContain('whatsapp_optins');
  });
});

import { describe, expect, it, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  authorizePermission: vi.fn(),
  logAudit: vi.fn(),
  addToQueue: vi.fn(),
  buildAnnouncementWhatsApp: vi.fn(),
  createServerSupabaseClient: vi.fn(),
  createAdminClient: vi.fn(),
}));

vi.mock('@/lib/auth/authorize', () => ({ authorizePermission: mocks.authorizePermission }));
vi.mock('@/lib/audit/logger', () => ({ logAudit: mocks.logAudit }));
vi.mock('@/lib/notifications/queue', () => ({ addToQueue: mocks.addToQueue }));
vi.mock('@/lib/whatsapp/outbound', () => ({ buildAnnouncementWhatsApp: mocks.buildAnnouncementWhatsApp }));
vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: mocks.createServerSupabaseClient,
  createAdminClient: mocks.createAdminClient,
}));

import { publishAnnouncement } from '../publish-announcement';

type ResolveWith = { data: unknown; error: unknown };

function chain(resolveWith: ResolveWith) {
  const c: Record<string, unknown> = {};
  for (const method of ['select', 'eq', 'in', 'is', 'update', 'order']) {
    c[method] = vi.fn(() => c);
  }
  c.single = vi.fn().mockResolvedValue(resolveWith);
  c.then = (resolve: (value: ResolveWith) => unknown) => Promise.resolve(resolveWith).then(resolve);
  return c;
}

const ANNOUNCEMENT_DRAFT = {
  id: 'ann-1',
  title: 'Test Announcement',
  content: 'Content here',
  summary: 'Summary here',
  status: 'draft',
  target_audience: 'all',
  target_houses: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.authorizePermission.mockResolvedValue({ authorized: true, userId: 'admin-1' });
  mocks.buildAnnouncementWhatsApp.mockImplementation((input) => ({
    recipient_id: input.residentId,
    recipient_phone: input.residentPhone,
    channel: 'whatsapp',
    body: `Announcement: ${input.title}`,
    deduplication_key: `announcement:${input.announcementId}:${input.residentId}`,
    metadata: {
      whatsapp_template: { name: 'announcement', languageCode: 'en_US', parameters: [input.title] },
    },
  }));
  mocks.addToQueue.mockResolvedValue({ success: true });
});

function setupFullMock({
  announcement = ANNOUNCEMENT_DRAFT,
  optIns = [],
  residents = null,
  residentHouses = null,
}: {
  announcement?: Record<string, unknown>;
  optIns?: Array<{ resident_id: string; phone_number: string }>;
  residents?: Array<{ id: string; account_status: string; resident_role: string }> | null;
  residentHouses?: Array<{ resident_id: string }> | null;
}) {
  const defaultResidents = residents ?? optIns.map((r) => ({
    id: r.resident_id,
    account_status: 'active',
    resident_role: 'tenant',
  }));

  // The session client is blocked by RLS from the delivery tables (whatsapp_optins), so it
  // only serves the announcement; the admin client serves the delivery reads.
  mocks.createServerSupabaseClient.mockResolvedValue({
    from: vi.fn((table: string) =>
      table === 'announcements'
        ? chain({ data: announcement, error: null })
        : chain({ data: [], error: null })),
  });
  mocks.createAdminClient.mockReturnValue({
    from: vi.fn((table: string) => {
      if (table === 'whatsapp_optins') return chain({ data: optIns, error: null });
      if (table === 'residents') return chain({ data: defaultResidents, error: null });
      if (table === 'resident_houses') return chain({ data: residentHouses, error: null });
      return chain({ data: null, error: null });
    }),
  });
}

describe('publishAnnouncement', () => {
  it('rejects when unauthorized', async () => {
    mocks.authorizePermission.mockResolvedValue({ authorized: false, error: 'No access' });
    const result = await publishAnnouncement('ann-1');
    expect(result.error).toBe('No access');
  });

  it('returns error when announcement not found', async () => {
    mocks.createServerSupabaseClient.mockResolvedValue({
      from: vi.fn().mockReturnValue(chain({ data: null, error: null })),
    });
    const result = await publishAnnouncement('ann-1');
    expect(result.error).toBe('Announcement not found');
  });

  it('returns error when already published', async () => {
    setupFullMock({ announcement: { ...ANNOUNCEMENT_DRAFT, status: 'published' } });
    const result = await publishAnnouncement('ann-1');
    expect(result.error).toBe('Announcement is already published');
  });

  it('queues WhatsApp to all opted-in residents when target_audience is all', async () => {
    setupFullMock({
      optIns: [
        { resident_id: 'r-1', phone_number: '+234801' },
        { resident_id: 'r-2', phone_number: '+234802' },
      ],
    });
    const result = await publishAnnouncement('ann-1');
    expect(result.error).toBeNull();
    expect(mocks.addToQueue).toHaveBeenCalledTimes(2);
    expect(mocks.buildAnnouncementWhatsApp).toHaveBeenCalledTimes(2);
  });

  it('filters by target_audience owners', async () => {
    const announcement = { ...ANNOUNCEMENT_DRAFT, target_audience: 'owners' };
    setupFullMock({
      announcement,
      optIns: [
        { resident_id: 'r-owner', phone_number: '+234801' },
        { resident_id: 'r-tenant', phone_number: '+234802' },
      ],
      residents: [
        { id: 'r-owner', account_status: 'active', resident_role: 'resident_landlord' },
        { id: 'r-tenant', account_status: 'active', resident_role: 'tenant' },
      ],
    });
    const result = await publishAnnouncement('ann-1');
    expect(result.error).toBeNull();
    expect(mocks.buildAnnouncementWhatsApp).toHaveBeenCalledTimes(1);
    expect(mocks.buildAnnouncementWhatsApp).toHaveBeenCalledWith(
      expect.objectContaining({ residentId: 'r-owner' }),
    );
  });

  it('excludes inactive residents from delivery', async () => {
    setupFullMock({
      optIns: [
        { resident_id: 'r-active', phone_number: '+234801' },
        { resident_id: 'r-inactive', phone_number: '+234802' },
      ],
      residents: [
        { id: 'r-active', account_status: 'active', resident_role: 'tenant' },
      ],
    });
    const result = await publishAnnouncement('ann-1');
    expect(result.error).toBeNull();
    expect(mocks.buildAnnouncementWhatsApp).toHaveBeenCalledTimes(1);
    expect(mocks.buildAnnouncementWhatsApp).toHaveBeenCalledWith(
      expect.objectContaining({ residentId: 'r-active' }),
    );
  });

  it('filters by target_houses', async () => {
    const announcement = { ...ANNOUNCEMENT_DRAFT, target_houses: ['house-1'] };
    setupFullMock({
      announcement,
      optIns: [
        { resident_id: 'r-1', phone_number: '+234801' },
        { resident_id: 'r-2', phone_number: '+234802' },
      ],
      residentHouses: [{ resident_id: 'r-1' }],
    });
    const result = await publishAnnouncement('ann-1');
    expect(result.error).toBeNull();
    expect(mocks.addToQueue).toHaveBeenCalledTimes(1);
    expect(mocks.buildAnnouncementWhatsApp).toHaveBeenCalledWith(
      expect.objectContaining({ residentId: 'r-1' }),
    );
  });

  it('skips WhatsApp audit when no opted-in recipients exist', async () => {
    setupFullMock({ optIns: [] });
    const result = await publishAnnouncement('ann-1');
    expect(result.error).toBeNull();
    expect(mocks.addToQueue).not.toHaveBeenCalled();
  });

  it('deduplicates opt-ins by resident_id', async () => {
    setupFullMock({
      optIns: [
        { resident_id: 'r-1', phone_number: '+234801' },
        { resident_id: 'r-1', phone_number: '+234802' },
      ],
    });
    const result = await publishAnnouncement('ann-1');
    expect(result.error).toBeNull();
    expect(mocks.buildAnnouncementWhatsApp).toHaveBeenCalledTimes(1);
  });
  it('applies the opt-in filter in the query itself (.eq opted_in = true)', async () => {
    setupFullMock({ optIns: [{ resident_id: 'r-1', phone_number: '+234801' }] });
    const client = mocks.createAdminClient();
    const optInChains: Array<Record<string, ReturnType<typeof vi.fn>>> = [];
    const originalFrom = client.from;
    client.from = vi.fn((table: string) => {
      const c = originalFrom(table);
      if (table === 'whatsapp_optins') optInChains.push(c);
      return c;
    });

    await publishAnnouncement('ann-1');

    expect(optInChains).toHaveLength(1);
    expect(optInChains[0].select).toHaveBeenCalledWith('resident_id, phone_number');
    expect(optInChains[0].eq).toHaveBeenCalledWith('opted_in', true);
    expect(optInChains[0].is).toHaveBeenCalledWith('deactivated_at', null);
  });
});

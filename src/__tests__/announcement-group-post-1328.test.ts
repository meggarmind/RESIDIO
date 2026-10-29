import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  authorizePermission: vi.fn(),
  logAudit: vi.fn(),
  createServerSupabaseClient: vi.fn(),
  createAdminClient: vi.fn(),
  checkEstateGroupPost: vi.fn(),
  sendEstateGroupPost: vi.fn(),
}));

vi.mock('@/lib/auth/authorize', () => ({ authorizePermission: mocks.authorizePermission }));
vi.mock('@/lib/audit/logger', () => ({ logAudit: mocks.logAudit }));
vi.mock('@/lib/notifications/queue', () => ({ addToQueue: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: mocks.createServerSupabaseClient,
  createAdminClient: mocks.createAdminClient,
}));
// The action tests stub the group transport; the transport itself is tested below through its facts seam.
vi.mock('@/lib/announcements/group-post', async (orig) => {
  const actual = await orig<typeof import('@/lib/announcements/group-post')>();
  return {
    ...actual,
    createGroupPostFacts: vi.fn(() => ({})),
    checkEstateGroupPost: (...args: Parameters<typeof actual.checkEstateGroupPost>) =>
      mocks.checkEstateGroupPost.getMockImplementation() ? mocks.checkEstateGroupPost(...args) : actual.checkEstateGroupPost(...args),
    sendEstateGroupPost: (...args: Parameters<typeof actual.sendEstateGroupPost>) =>
      mocks.sendEstateGroupPost.getMockImplementation() ? mocks.sendEstateGroupPost(...args) : actual.sendEstateGroupPost(...args),
  };
});

import { publishAnnouncement, scheduleAnnouncement } from '@/actions/announcements/publish-announcement';
import {
  checkEstateGroupPost,
  NO_GROUP_ERROR,
  NOT_TEST_GROUP_ERROR,
  NOT_WAHA_ERROR,
  sendEstateGroupPost,
  type GroupPostFacts,
} from '@/lib/announcements/group-post';
import {
  announcementGroupText,
  GROUP_POST_PERMISSION_REASON,
  isEstateWideAudience,
  wantsEstateGroupPost,
} from '@/lib/announcements/group-post-rules';
import { publishAnnouncementCore } from '@/lib/announcements/publish';
import { PERMISSIONS } from '@/lib/auth/action-roles';
import { renderTemplateToText } from '@/lib/whatsapp/providers/chatmaid';
import { sendWahaGroupText } from '@/lib/whatsapp/providers/waha';
import { evaluateGroupSendPolicy } from '@/lib/whatsapp/send-policy';
import { WHATSAPP_TEMPLATE_NAMES } from '@/lib/whatsapp/templates';
import type { WahaWhatsAppConfig } from '@/lib/whatsapp/config';

const GROUP = '120363000000000001@g.us';
const WAHA: WahaWhatsAppConfig = {
  provider: 'waha',
  baseUrl: 'https://waha.test',
  session: 'default',
  apiKey: 'key',
} as WahaWhatsAppConfig;

const TICKED = {
  id: 'ann-1',
  title: 'Water outage',
  content: 'The water will be off on Saturday.',
  summary: 'Water off Saturday',
  status: 'draft',
  target_audience: 'all',
  target_group_slug: null,
  target_houses: null,
  post_to_whatsapp_group: true,
};

function facts(overrides: Partial<GroupPostFacts> = {}): GroupPostFacts & { sent: string[]; recorded: string[] } {
  const sent: string[] = [];
  const recorded: string[] = [];
  return {
    sent,
    recorded,
    resolveConfig: async () => ({ status: 'ok', config: WAHA }),
    getEstateGroupId: async () => GROUP,
    getTestGroupIds: async () => [GROUP],
    isProduction: () => false,
    evaluatePolicy: async () => ({ outcome: 'allow' }),
    send: async (_config, groupId, text) => {
      sent.push(`${groupId}|${text}`);
      return { success: true, messageId: 'true_g_KEY1' };
    },
    record: async (groupId, id) => {
      recorded.push(`${groupId}|${id}`);
    },
    ...overrides,
  };
}

/** A session client that serves one announcement and records every update. */
function client(announcement: Record<string, unknown>) {
  const updates: unknown[] = [];
  const from = vi.fn(() => {
    const q: Record<string, unknown> = {
      then: (f: (v: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(f),
    };
    for (const m of ['select', 'eq', 'is', 'in']) q[m] = vi.fn().mockReturnValue(q);
    q.update = vi.fn((row: unknown) => {
      updates.push(row);
      return q;
    });
    q.single = vi.fn().mockResolvedValue({ data: { ...announcement, status: updates.length ? 'published' : announcement.status }, error: null });
    return q;
  });
  return { from, updates };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.checkEstateGroupPost.mockReset();
  mocks.sendEstateGroupPost.mockReset();
});

describe('group post rules', () => {
  it('treats only the whole estate as estate-wide', () => {
    expect(isEstateWideAudience({ target_audience: 'all', target_group_slug: null, target_houses: null })).toBe(true);
    expect(isEstateWideAudience({ target_audience: 'tenants', target_group_slug: null, target_houses: null })).toBe(false);
    expect(isEstateWideAudience({ target_audience: 'all', target_group_slug: 'street-a', target_houses: null })).toBe(false);
    expect(isEstateWideAudience({ target_audience: 'all', target_group_slug: null, target_houses: ['h1'] })).toBe(false);
  });

  it('ignores the tick on a street or house audience', () => {
    expect(wantsEstateGroupPost(TICKED as never)).toBe(true);
    expect(wantsEstateGroupPost({ ...TICKED, target_houses: ['h1'] } as never)).toBe(false);
    expect(wantsEstateGroupPost({ ...TICKED, post_to_whatsapp_group: false } as never)).toBe(false);
  });

  it('writes the same text as a one-to-one WhatsApp announcement', async () => {
    for (const a of [TICKED, { ...TICKED, summary: null }]) {
      const oneToOne = await renderTemplateToText(WHATSAPP_TEMPLATE_NAMES.announcement, [
        a.title,
        a.summary || a.content.substring(0, 500),
      ]);
      expect(announcementGroupText(a)).toBe(oneToOne);
    }
  });
});

describe('checkEstateGroupPost', () => {
  it('refuses when WAHA is not the active provider', async () => {
    const f = facts({ resolveConfig: async () => ({ status: 'unconfigured' }) });
    expect(await checkEstateGroupPost(f)).toEqual({ ok: false, error: NOT_WAHA_ERROR });
    const chatmaid = facts({ resolveConfig: async () => ({ status: 'ok', config: { ...WAHA, provider: 'chatmaid' } as never }) });
    expect(await checkEstateGroupPost(chatmaid)).toEqual({ ok: false, error: NOT_WAHA_ERROR });
  });

  it('refuses when no estate group is set', async () => {
    expect(await checkEstateGroupPost(facts({ getEstateGroupId: async () => '' }))).toEqual({ ok: false, error: NO_GROUP_ERROR });
  });

  it('Stage guard: refuses a group that is not a test group, and logs it', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const f = facts({ getTestGroupIds: async () => ['999@g.us'] });
    expect(await checkEstateGroupPost(f)).toEqual({ ok: false, error: NOT_TEST_GROUP_ERROR });
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('not a test group'), { groupId: GROUP });
    warn.mockRestore();
  });

  it('Stage guard: allows the configured test group', async () => {
    expect(await checkEstateGroupPost(facts())).toEqual({ ok: true, target: { config: WAHA, groupId: GROUP } });
  });

  it('production does not need the test list', async () => {
    const f = facts({ isProduction: () => true, getTestGroupIds: async () => [] });
    expect((await checkEstateGroupPost(f)).ok).toBe(true);
  });

  it('refuses when the send caps refuse', async () => {
    const f = facts({
      evaluatePolicy: async () => ({ outcome: 'defer', reason: 'daily_limit_reached', message: 'WhatsApp daily outbound limit reached' }),
    });
    expect(await checkEstateGroupPost(f)).toEqual({ ok: false, error: 'WhatsApp daily outbound limit reached' });
  });
});

describe('sendEstateGroupPost', () => {
  it('records an accepted send so the caps count it', async () => {
    const f = facts();
    expect(await sendEstateGroupPost({ config: WAHA, groupId: GROUP }, 'hi', f)).toEqual({ messageId: 'true_g_KEY1', error: null });
    expect(f.recorded).toEqual([`${GROUP}|true_g_KEY1`]);
  });

  it('records nothing when the send fails', async () => {
    const f = facts({ send: async () => ({ success: false, error: 'WAHA bridge is disconnected' }) });
    expect(await sendEstateGroupPost({ config: WAHA, groupId: GROUP }, 'hi', f)).toEqual({
      messageId: null,
      error: 'WAHA bridge is disconnected',
    });
    expect(f.recorded).toEqual([]);
  });
});

describe('publishAnnouncementCore with the tick', () => {
  it('refuses a publisher without announcements.post_to_group: not published, nothing sent', async () => {
    const c = client(TICKED);
    const f = facts();
    const res = await publishAnnouncementCore(c as never, 'ann-1', 'u1', c as never, { mayPostToGroup: async () => false, facts: f });
    expect(res).toEqual({ data: null, error: GROUP_POST_PERMISSION_REASON });
    expect(c.updates).toEqual([]);
    expect(f.sent).toEqual([]);
  });

  it('fails closed when the caller gives no permission check', async () => {
    const c = client(TICKED);
    const f = facts();
    const res = await publishAnnouncementCore(c as never, 'ann-1', 'u1', c as never, { facts: f });
    expect(res.error).toBe(GROUP_POST_PERMISSION_REASON);
    expect(f.sent).toEqual([]);
  });

  it('Stage with a non-test group: refused before publishing, nothing sent', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const c = client(TICKED);
    const f = facts({ getTestGroupIds: async () => [] });
    const res = await publishAnnouncementCore(c as never, 'ann-1', 'u1', c as never, { mayPostToGroup: async () => true, facts: f });
    expect(res).toEqual({ data: null, error: NOT_TEST_GROUP_ERROR });
    expect(c.updates).toEqual([]);
    expect(f.sent).toEqual([]);
  });

  it('a holder publishes: one group message with the announcement text', async () => {
    const c = client(TICKED);
    const f = facts();
    const res = await publishAnnouncementCore(c as never, 'ann-1', 'u1', c as never, { mayPostToGroup: async () => true, facts: f });
    expect(res.error).toBeNull();
    expect(res.error === null && res.groupPost).toEqual({ messageId: 'true_g_KEY1', error: null });
    expect(f.sent).toEqual([`${GROUP}|${announcementGroupText(TICKED)}`]);
  });

  it('a street audience never posts, whatever the tick', async () => {
    const c = client({ ...TICKED, target_houses: ['h1'] });
    const f = facts();
    const mayPostToGroup = vi.fn(async () => false);
    const res = await publishAnnouncementCore(c as never, 'ann-1', 'u1', c as never, { mayPostToGroup, facts: f });
    expect(res.error).toBeNull();
    expect(res.error === null && res.groupPost).toBeNull();
    expect(mayPostToGroup).not.toHaveBeenCalled();
    expect(f.sent).toEqual([]);
  });
});

describe('publishAnnouncement action', () => {
  function setup(permissions: string[]) {
    mocks.authorizePermission.mockResolvedValue({ authorized: true, userId: 'u1', permissions });
    const c = client(TICKED);
    mocks.createServerSupabaseClient.mockResolvedValue(c);
    mocks.createAdminClient.mockReturnValue(c);
    mocks.checkEstateGroupPost.mockImplementation(async () => ({ ok: true, target: { config: WAHA, groupId: GROUP } }));
    mocks.sendEstateGroupPost.mockImplementation(async () => ({ messageId: 'true_g_KEY1', error: null }));
    return c;
  }

  it('a non-holder cannot publish a ticked announcement', async () => {
    const c = setup([PERMISSIONS.ANNOUNCEMENTS_PUBLISH]);
    const res = await publishAnnouncement('ann-1');
    expect(res.error).toBe(GROUP_POST_PERMISSION_REASON);
    expect(c.updates).toEqual([]);
    expect(mocks.sendEstateGroupPost).not.toHaveBeenCalled();
  });

  it('a holder publishes: one group post and one group audit row', async () => {
    setup([PERMISSIONS.ANNOUNCEMENTS_PUBLISH, PERMISSIONS.ANNOUNCEMENTS_POST_TO_GROUP]);
    const res = await publishAnnouncement('ann-1');
    expect(res.error).toBeNull();
    expect(mocks.sendEstateGroupPost).toHaveBeenCalledTimes(1);
    const groupAudits = mocks.logAudit.mock.calls.filter(([e]) => e.newValues?.whatsapp_group_post);
    expect(groupAudits).toHaveLength(1);
    expect(groupAudits[0][0].newValues).toEqual({ whatsapp_group_post: 'true_g_KEY1' });
  });

  it('scheduling a ticked announcement needs announcements.post_to_group', async () => {
    const c = setup([PERMISSIONS.ANNOUNCEMENTS_PUBLISH]);
    const res = await scheduleAnnouncement('ann-1', new Date(Date.now() + 3_600_000).toISOString());
    expect(res.error).toBe(GROUP_POST_PERMISSION_REASON);
    expect(c.updates).toEqual([]);
  });
});

describe('sendWahaGroupText', () => {
  it('posts the text to the group chat id', async () => {
    const fetchImpl = vi.fn(async (url: string) =>
      url.endsWith('/api/sessions/default')
        ? new Response(JSON.stringify({ status: 'WORKING' }))
        : new Response(JSON.stringify({ id: 'true_g_KEY2' }))
    );
    const res = await sendWahaGroupText(WAHA, GROUP, 'hello', fetchImpl as never);
    expect(res).toEqual({ success: true, messageId: 'true_g_KEY2' });
    const send = fetchImpl.mock.calls.find(([url]) => url.endsWith('/api/sendText')) as unknown as [string, RequestInit];
    expect(JSON.parse(send[1].body as string)).toEqual({ session: 'default', chatId: GROUP, text: 'hello' });
  });

  it('refuses an id that is not a group', async () => {
    const fetchImpl = vi.fn();
    expect((await sendWahaGroupText(WAHA, '2348000000000@c.us', 'hello', fetchImpl as never)).success).toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe('evaluateGroupSendPolicy', () => {
  const base = {
    getWhatsAppEnabled: async () => ({ status: 'ok' as const, value: true }),
    getNumberSetting: async () => undefined,
    countWhatsAppSentSince: async () => ({ count: 0, failed: false }),
    now: () => new Date('2026-10-29T12:00:00Z'),
  };

  it('allows under the caps', async () => {
    expect(await evaluateGroupSendPolicy(base as never)).toEqual({ outcome: 'allow' });
  });

  it('obeys the kill switch', async () => {
    const res = await evaluateGroupSendPolicy({ ...base, getWhatsAppEnabled: async () => ({ status: 'ok', value: false }) } as never);
    expect(res.outcome).toBe('refuse');
  });

  it('counts toward the daily cap', async () => {
    const res = await evaluateGroupSendPolicy({ ...base, countWhatsAppSentSince: async () => ({ count: 100, failed: false }) } as never);
    expect(res).toMatchObject({ outcome: 'defer', reason: 'daily_limit_reached' });
  });
});

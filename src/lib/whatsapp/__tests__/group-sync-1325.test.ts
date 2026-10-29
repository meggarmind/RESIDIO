import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  handleGroupParticipantsEvent,
  phoneFromWahaId,
  syncEstateGroupMembers,
  type GroupMemberRow,
  type GroupMemberStore,
  type LeftMember,
  type ResidentPhones,
} from '@/lib/whatsapp/group-sync';
import type { WahaWhatsAppConfig } from '@/lib/whatsapp/config';

const config: WahaWhatsAppConfig = {
  provider: 'waha',
  apiKey: 'waha-key',
  webhookSecret: 'w',
  baseUrl: 'https://waha.test',
  session: 'default',
  fromNumber: '+2348030000000',
};
const GROUP = '1203@g.us';
const NOW = new Date('2026-10-29T02:00:00.000Z');

const residents: ResidentPhones[] = [
  { id: 'res-1', phone_primary: '08011111111', phone_secondary: null },
  { id: 'res-2', phone_primary: '08022222222', phone_secondary: '+2348033333333' },
];

type StoredRow = GroupMemberRow;

/** An in-memory stand-in for the table, with the same keying: (group_id, member_id). */
function makeStore(options: { groupId?: string; refreshDay?: string | null; rows?: StoredRow[] } = {}) {
  const rows = new Map<string, StoredRow>();
  for (const row of options.rows ?? []) rows.set(`${row.group_id}|${row.member_id}`, row);
  let refreshDay = options.refreshDay ?? null;
  const store: GroupMemberStore = {
    getGroupId: async () => options.groupId ?? GROUP,
    getRefreshDay: async () => refreshDay,
    setRefreshDay: async (day) => {
      refreshDay = day;
    },
    loadResidents: async () => residents,
    loadActiveMembers: async (groupId) =>
      [...rows.values()].filter((r) => r.group_id === groupId && r.left_at === null),
    upsertMembers: async (incoming) => {
      for (const row of incoming) {
        const key = `${row.group_id}|${row.member_id}`;
        rows.set(key, { ...rows.get(key), ...row });
      }
    },
    markLeft: async (groupId, match, at) => {
      const changed: LeftMember[] = [];
      for (const row of rows.values()) {
        if (row.group_id !== groupId || row.left_at !== null) continue;
        if (match.memberIds.includes(row.member_id) || (row.phone && match.phones.includes(row.phone))) {
          row.left_at = at;
          changed.push({ group_id: groupId, member_id: row.member_id, phone: row.phone, resident_id: row.resident_id });
        }
      }
      return changed;
    },
  };
  return { store, rows, getRefreshDay: () => refreshDay };
}

function row(overrides: Partial<StoredRow>): StoredRow {
  return {
    group_id: GROUP,
    member_id: '2348011111111@c.us',
    phone: '+2348011111111',
    role: 'participant',
    resident_id: 'res-1',
    last_seen_at: '2026-10-28T02:00:00.000Z',
    left_at: null,
    ...overrides,
  };
}

/** A fake WAHA: refresh, participants and lid lookups, with every call recorded. */
function fakeWaha(participants: Array<{ id: string; role?: string }>, lids: Record<string, string | null> = {}) {
  const calls: string[] = [];
  const fetchImpl = vi.fn(async (input: string | URL | Request) => {
    const url = String(input);
    calls.push(url.replace(config.baseUrl, ''));
    if (url.endsWith('/groups/refresh')) return new Response('{}');
    if (url.includes('/participants/v2')) return new Response(JSON.stringify(participants.map((p) => ({ role: 'participant', ...p }))));
    const lid = decodeURIComponent(url.split('/lids/')[1] ?? '');
    return new Response(JSON.stringify({ lid, pn: lids[lid] ?? null }));
  });
  return { fetchImpl: fetchImpl as unknown as typeof fetch, calls };
}

describe('phoneFromWahaId', () => {
  it('turns a person id into E.164 and rejects an empty one', () => {
    expect(phoneFromWahaId('2348011111111@c.us')).toBe('+2348011111111');
    expect(phoneFromWahaId('@c.us')).toBeNull();
  });
});

describe('syncEstateGroupMembers (#1325)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('does nothing when no group is chosen', async () => {
    const { store } = makeStore({ groupId: '' });
    const waha = fakeWaha([]);
    const result = await syncEstateGroupMembers(config, { store, fetchImpl: waha.fetchImpl, now: NOW });

    expect(result).toMatchObject({ ok: true, summary: { skipped: 'no_group' } });
    expect(waha.calls).toEqual([]);
  });

  it('makes the table equal to the list: upserts current members, matches residents on either phone, marks the absent as left', async () => {
    const { store, rows } = makeStore({
      rows: [row({ member_id: '2348044444444@c.us', phone: '+2348044444444', resident_id: null })],
    });
    const waha = fakeWaha([
      { id: '2348011111111@c.us' },
      { id: '2348033333333@c.us', role: 'admin' },
      { id: '2348055555555@c.us' },
      { id: '2348030000000@c.us', role: 'superadmin' },
      { id: '2348066666666@c.us', role: 'left' },
    ]);
    const onLeave = vi.fn(async () => {});

    const result = await syncEstateGroupMembers(config, { store, fetchImpl: waha.fetchImpl, now: NOW, onLeave });

    expect(result).toMatchObject({ ok: true, summary: { members: 3, matched: 2, unmatched: 1, left: 1 } });
    expect(rows.get(`${GROUP}|2348011111111@c.us`)).toMatchObject({ resident_id: 'res-1', phone: '+2348011111111', left_at: null });
    expect(rows.get(`${GROUP}|2348033333333@c.us`)).toMatchObject({ resident_id: 'res-2', role: 'admin' });
    expect(rows.get(`${GROUP}|2348055555555@c.us`)).toMatchObject({ resident_id: null });
    expect(rows.has(`${GROUP}|2348030000000@c.us`)).toBe(false); // the bot itself
    expect(rows.has(`${GROUP}|2348066666666@c.us`)).toBe(false); // role "left"
    expect(rows.get(`${GROUP}|2348044444444@c.us`)?.left_at).toBe(NOW.toISOString());
    expect(onLeave).toHaveBeenCalledWith([expect.objectContaining({ member_id: '2348044444444@c.us' })]);
  });

  it('resolves a hidden @lid through WAHA, reuses a stored number, and counts an unresolvable one', async () => {
    const { store, rows } = makeStore({
      rows: [row({ member_id: '777@lid', phone: '+2348022222222', resident_id: 'res-2' })],
    });
    const waha = fakeWaha([{ id: '111@lid' }, { id: '777@lid' }, { id: '222@lid' }], {
      '111@lid': '2348011111111@c.us',
    });

    const result = await syncEstateGroupMembers(config, { store, fetchImpl: waha.fetchImpl, now: NOW });

    expect(result).toMatchObject({ ok: true, summary: { members: 3, matched: 2, unresolved: 1 } });
    expect(rows.get(`${GROUP}|111@lid`)).toMatchObject({ phone: '+2348011111111', resident_id: 'res-1' });
    expect(rows.get(`${GROUP}|222@lid`)).toMatchObject({ phone: null, resident_id: null });
    expect(waha.calls.filter((c) => c.includes('/lids/'))).toHaveLength(2); // 777@lid came from the table
  });

  it('re-matches a member whose resident record now has their number, and brings a re-joiner back', async () => {
    const { store, rows } = makeStore({
      rows: [row({ member_id: '2348011111111@c.us', resident_id: null }), row({ member_id: '2348022222222@c.us', phone: '+2348022222222', resident_id: null, left_at: '2026-10-20T00:00:00.000Z' })],
    });
    const waha = fakeWaha([{ id: '2348011111111@c.us' }, { id: '2348022222222@c.us' }]);

    await syncEstateGroupMembers(config, { store, fetchImpl: waha.fetchImpl, now: NOW });

    expect(rows.get(`${GROUP}|2348011111111@c.us`)?.resident_id).toBe('res-1');
    expect(rows.get(`${GROUP}|2348022222222@c.us`)).toMatchObject({ left_at: null, resident_id: 'res-2' });
  });

  it('refuses an empty participant list and leaves the table alone', async () => {
    const { store, rows } = makeStore({ rows: [row({})] });
    const waha = fakeWaha([]);
    const result = await syncEstateGroupMembers(config, { store, fetchImpl: waha.fetchImpl, now: NOW });

    expect(result.ok).toBe(false);
    expect(rows.get(`${GROUP}|2348011111111@c.us`)?.left_at).toBeNull();
  });

  it('calls groups/refresh at most once per day, before reading participants', async () => {
    const { store, getRefreshDay } = makeStore();
    const waha = fakeWaha([{ id: '2348011111111@c.us' }]);

    const first = await syncEstateGroupMembers(config, { store, fetchImpl: waha.fetchImpl, now: NOW });
    const second = await syncEstateGroupMembers(config, { store, fetchImpl: waha.fetchImpl, now: new Date('2026-10-29T22:00:00.000Z') });
    const nextDay = await syncEstateGroupMembers(config, { store, fetchImpl: waha.fetchImpl, now: new Date('2026-10-30T02:00:00.000Z') });

    expect(first).toMatchObject({ summary: { refreshed: true } });
    expect(second).toMatchObject({ summary: { refreshed: false } });
    expect(nextDay).toMatchObject({ summary: { refreshed: true } });
    expect(waha.calls.filter((c) => c.endsWith('/groups/refresh'))).toHaveLength(2);
    expect(waha.calls[0]).toContain('/groups/refresh');
    expect(getRefreshDay()).toBe('2026-10-30');
  });

  it('keeps going, and does not retry today, when the refresh fails', async () => {
    const { store } = makeStore();
    let refreshes = 0;
    const fetchImpl = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.endsWith('/groups/refresh')) {
        refreshes += 1;
        return new Response('{}', { status: 429 });
      }
      return new Response(JSON.stringify([{ id: '2348011111111@c.us', role: 'participant' }]));
    }) as unknown as typeof fetch;

    const first = await syncEstateGroupMembers(config, { store, fetchImpl, now: NOW });
    await syncEstateGroupMembers(config, { store, fetchImpl, now: NOW });

    expect(first).toMatchObject({ ok: true, summary: { refreshed: false, refreshFailed: true, members: 1 } });
    expect(refreshes).toBe(1);
  });
});

describe('handleGroupParticipantsEvent (#1325)', () => {
  function event(type: string, participants: unknown[], groupId = GROUP) {
    return { event: 'group.v2.participants', payload: { group: { id: groupId }, type, participants } };
  }

  it('join adds a row with the phone and the matched resident', async () => {
    const { store, rows } = makeStore();
    const outcome = await handleGroupParticipantsEvent(event('join', [{ id: '2348011111111@c.us', role: 'participant' }]), config, { store, now: NOW });

    expect(outcome).toMatchObject({ handled: true, joined: 1 });
    expect(rows.get(`${GROUP}|2348011111111@c.us`)).toMatchObject({
      phone: '+2348011111111',
      resident_id: 'res-1',
      joined_at: NOW.toISOString(),
      left_at: null,
    });
  });

  it('join of an unknown number stores it unmatched; join of the bot itself stores nothing', async () => {
    const { store, rows } = makeStore();
    await handleGroupParticipantsEvent(event('join', ['2348099999999@c.us', { id: '2348030000000@c.us' }]), config, { store, now: NOW });

    expect(rows.get(`${GROUP}|2348099999999@c.us`)).toMatchObject({ resident_id: null });
    expect(rows.size).toBe(1);
  });

  it('leave sets left_at and hands the left member to onLeave', async () => {
    const { store, rows } = makeStore({ rows: [row({})] });
    const onLeave = vi.fn(async () => {});
    const outcome = await handleGroupParticipantsEvent(event('leave', [{ id: '2348011111111@c.us' }]), config, { store, now: NOW, onLeave });

    expect(outcome).toMatchObject({ handled: true, left: 1 });
    expect(rows.get(`${GROUP}|2348011111111@c.us`)?.left_at).toBe(NOW.toISOString());
    expect(onLeave).toHaveBeenCalledWith([expect.objectContaining({ resident_id: 'res-1', phone: '+2348011111111' })]);
  });

  it('leave named by @lid finds the row stored under @c.us through the number', async () => {
    const { store, rows } = makeStore({ rows: [row({})] });
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ lid: '111@lid', pn: '2348011111111@c.us' }))) as unknown as typeof fetch;
    const outcome = await handleGroupParticipantsEvent(event('leave', [{ id: '111@lid' }]), config, { store, now: NOW, fetchImpl });

    expect(outcome.left).toBe(1);
    expect(rows.get(`${GROUP}|2348011111111@c.us`)?.left_at).toBe(NOW.toISOString());
  });

  it('a second leave for a member already marked left does not call onLeave again', async () => {
    const { store } = makeStore({ rows: [row({ left_at: '2026-10-28T00:00:00.000Z' })] });
    const onLeave = vi.fn(async () => {});
    const outcome = await handleGroupParticipantsEvent(event('leave', [{ id: '2348011111111@c.us' }]), config, { store, now: NOW, onLeave });

    expect(outcome.left).toBe(0);
    expect(onLeave).not.toHaveBeenCalled();
  });

  it('ignores events for any other group, when no group is chosen, and for other types', async () => {
    const { store, rows } = makeStore({ rows: [row({})] });
    const onLeave = vi.fn(async () => {});

    const other = await handleGroupParticipantsEvent(event('leave', [{ id: '2348011111111@c.us' }], '9999@g.us'), config, { store, now: NOW, onLeave });
    const none = await handleGroupParticipantsEvent(event('leave', [{ id: '2348011111111@c.us' }]), config, { store: makeStore({ groupId: '' }).store, now: NOW, onLeave });
    const promote = await handleGroupParticipantsEvent(event('promote', [{ id: '2348011111111@c.us' }]), config, { store, now: NOW, onLeave });

    expect(other).toMatchObject({ handled: false, ignored: 'other_group' });
    expect(none).toMatchObject({ handled: false, ignored: 'no_group_chosen' });
    expect(promote).toMatchObject({ handled: false, ignored: 'unsupported_type' });
    expect(rows.get(`${GROUP}|2348011111111@c.us`)?.left_at).toBeNull();
    expect(onLeave).not.toHaveBeenCalled();
  });
});

import type { SupabaseClient } from '@supabase/supabase-js';
import { getSettingValueAsService } from '@/lib/settings/service';
import { normalizePhoneNumber } from '@/lib/sms/termii';
import { createAdminClient } from '@/lib/supabase/server';
import type { WahaWhatsAppConfig } from '@/lib/whatsapp/config';
import {
  getWahaGroupParticipants,
  lookupWahaLidPhone,
  refreshWahaGroups,
} from '@/lib/whatsapp/providers/waha';

/**
 * Keeps `whatsapp_group_members` equal to the members of the estate WhatsApp
 * group (#1325, parent #1323). Two writers share this file: the
 * `group.v2.participants` webhook (join and leave as they happen) and the
 * nightly reconcile cron (the table is made equal to WAHA's list).
 *
 * WAHA shapes are read from the docs (29 Oct 2026) and not yet measured on a
 * live container; confirm on Stage before relying on them.
 */

export const ESTATE_GROUP_SETTING = 'whatsapp_estate_group_id';
export const GROUP_REFRESH_DAY_SETTING = 'whatsapp_group_last_refresh_day';
export const UNMATCHED_RETENTION_SETTING = 'whatsapp_group_unmatched_retention_days';
export const DEFAULT_UNMATCHED_RETENTION_DAYS = 30;
const LID_LOOKUP_CONCURRENCY = 10;

export interface GroupMemberRow {
  group_id: string;
  member_id: string;
  phone: string | null;
  role: string;
  resident_id: string | null;
  last_seen_at: string;
  left_at: string | null;
  /** Set only on a join event; the nightly sync leaves the first-seen time alone. */
  joined_at?: string;
}

export interface StoredGroupMember {
  member_id: string;
  phone: string | null;
  resident_id: string | null;
}

export interface LeftMember extends StoredGroupMember {
  group_id: string;
}

export interface ResidentPhones {
  id: string;
  phone_primary: string | null;
  phone_secondary: string | null;
}

/** Everything the sync reads and writes, so tests can run against a fake. */
export interface GroupMemberStore {
  getGroupId(): Promise<string>;
  getRefreshDay(): Promise<string | null>;
  setRefreshDay(day: string): Promise<void>;
  loadResidents(): Promise<ResidentPhones[]>;
  /** Members of the group not yet marked left. */
  loadActiveMembers(groupId: string): Promise<StoredGroupMember[]>;
  upsertMembers(rows: GroupMemberRow[]): Promise<void>;
  /** Marks active rows left, matching `memberIds` or `phones`; returns the rows it changed. */
  markLeft(groupId: string, match: { memberIds: string[]; phones: string[] }, at: string): Promise<LeftMember[]>;
}

type OnLeave = (members: LeftMember[]) => Promise<void>;
type LidLookup = (lid: string) => Promise<string | null>;

function untyped(): SupabaseClient {
  // The generated types do not know whatsapp_group_members until its migration is applied.
  return createAdminClient() as unknown as SupabaseClient;
}

export function createSupabaseGroupMemberStore(): GroupMemberStore {
  return {
    async getGroupId() {
      const value = await getSettingValueAsService(ESTATE_GROUP_SETTING);
      return typeof value === 'string' ? value.trim() : '';
    },
    async getRefreshDay() {
      const value = await getSettingValueAsService(GROUP_REFRESH_DAY_SETTING);
      return typeof value === 'string' && value ? value : null;
    },
    async setRefreshDay(day) {
      const { error } = await untyped()
        .from('system_settings')
        .upsert({ key: GROUP_REFRESH_DAY_SETTING, value: day, category: 'notifications' }, { onConflict: 'key' });
      if (error) throw error;
    },
    async loadResidents() {
      const { data, error } = await untyped()
        .from('residents')
        .select('id, phone_primary, phone_secondary')
        .in('account_status', ['active', 'inactive'])
        .order('id');
      if (error) throw error;
      return (data ?? []) as ResidentPhones[];
    },
    async loadActiveMembers(groupId) {
      const { data, error } = await untyped()
        .from('whatsapp_group_members')
        .select('member_id, phone, resident_id')
        .eq('group_id', groupId)
        .is('left_at', null);
      if (error) throw error;
      return (data ?? []) as StoredGroupMember[];
    },
    async upsertMembers(rows) {
      if (rows.length === 0) return;
      const { error } = await untyped()
        .from('whatsapp_group_members')
        .upsert(rows.map((row) => ({ ...row, updated_at: row.last_seen_at })), { onConflict: 'group_id,member_id' });
      if (error) throw error;
    },
    async markLeft(groupId, match, at) {
      const left = new Map<string, LeftMember>();
      const run = async (column: 'member_id' | 'phone', values: string[]) => {
        if (values.length === 0) return;
        const { data, error } = await untyped()
          .from('whatsapp_group_members')
          .update({ left_at: at, updated_at: at })
          .eq('group_id', groupId)
          .is('left_at', null)
          .in(column, values)
          .select('group_id, member_id, phone, resident_id');
        if (error) throw error;
        for (const row of (data ?? []) as LeftMember[]) left.set(row.member_id, row);
      };
      await run('member_id', match.memberIds);
      await run('phone', match.phones);
      return [...left.values()];
    },
  };
}

/** The E.164 number for a WAHA person id (`2348...@c.us`), or null. */
export function phoneFromWahaId(id: string): string | null {
  const digits = id.split('@')[0].replace(/[^0-9]/g, '');
  return digits ? normalizePhoneNumber(digits) : null;
}

/** `c.us` carries the number; a hidden `@lid` needs WAHA's LID table; anything else is not a person. */
async function resolvePhone(memberId: string, known: string | null, lookup: LidLookup): Promise<string | null> {
  if (memberId.endsWith('@c.us')) return phoneFromWahaId(memberId);
  if (known) return known;
  if (!memberId.endsWith('@lid')) return null;
  try {
    const pn = await lookup(memberId);
    return pn ? phoneFromWahaId(pn) : null;
  } catch {
    // The lookup error names only an HTTP status; the member stays unresolved until the next run.
    return null;
  }
}

/** First resident (by id) whose primary or secondary phone normalises to each number, as `identity.ts` matches. */
function buildPhoneIndex(residents: ResidentPhones[]): Map<string, string> {
  const index = new Map<string, string>();
  for (const resident of residents) {
    for (const phone of [resident.phone_primary, resident.phone_secondary]) {
      if (!phone) continue;
      const normalized = normalizePhoneNumber(phone);
      if (!index.has(normalized)) index.set(normalized, resident.id);
    }
  }
  return index;
}

async function mapInChunks<T, R>(items: T[], size: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(...(await Promise.all(items.slice(i, i + size).map(fn))));
  }
  return out;
}

function isBotNumber(phone: string | null, config: Pick<WahaWhatsAppConfig, 'fromNumber'>): boolean {
  return !!phone && phone === normalizePhoneNumber(config.fromNumber);
}

export interface GroupSyncDeps {
  store?: GroupMemberStore;
  fetchImpl?: typeof fetch;
  now?: Date;
  /** Called with the members a leave (or the nightly sync) marked left. The next slice closes their sessions here. */
  onLeave?: OnLeave;
}

export interface GroupSyncSummary {
  skipped?: 'no_group';
  members: number;
  matched: number;
  unmatched: number;
  /** `@lid` members WAHA could not turn into a number. */
  unresolved: number;
  left: number;
  refreshed: boolean;
  refreshFailed: boolean;
}

export type GroupSyncResult =
  | { ok: true; summary: GroupSyncSummary }
  | { ok: false; summary: GroupSyncSummary; error: string };

function emptySummary(): GroupSyncSummary {
  return { members: 0, matched: 0, unmatched: 0, unresolved: 0, left: 0, refreshed: false, refreshFailed: false };
}

/**
 * Nightly reconcile: makes the table equal to WAHA's participant list for the
 * chosen group. `groups/refresh` runs at most once per UTC day (WAHA warns it
 * rate-limits); the day is stamped before the call, so a failed refresh is not
 * retried until tomorrow. An empty participant list is refused, because the
 * bot itself is always a member, so empty means a bad read, not a vanished group.
 */
export async function syncEstateGroupMembers(
  config: WahaWhatsAppConfig,
  deps: GroupSyncDeps = {}
): Promise<GroupSyncResult> {
  const store = deps.store ?? createSupabaseGroupMemberStore();
  const fetchImpl = deps.fetchImpl ?? fetch;
  const now = deps.now ?? new Date();
  const nowIso = now.toISOString();
  const summary = emptySummary();

  const groupId = await store.getGroupId();
  if (!groupId) return { ok: true, summary: { ...summary, skipped: 'no_group' } };

  const today = nowIso.slice(0, 10);
  if ((await store.getRefreshDay()) !== today) {
    await store.setRefreshDay(today);
    try {
      await refreshWahaGroups(config, fetchImpl);
      summary.refreshed = true;
    } catch {
      summary.refreshFailed = true;
    }
  }

  const participants = (await getWahaGroupParticipants(config, groupId, fetchImpl)).filter(
    (p) => p.role !== 'left' && (p.id.endsWith('@c.us') || p.id.endsWith('@lid'))
  );
  if (participants.length === 0) {
    return { ok: false, summary, error: 'WAHA returned no members for the estate group; the table was not changed' };
  }

  const [existing, residents] = await Promise.all([store.loadActiveMembers(groupId), store.loadResidents()]);
  const knownPhone = new Map(existing.map((m) => [m.member_id, m.phone]));
  const phoneIndex = buildPhoneIndex(residents);
  const lookup: LidLookup = (lid) => lookupWahaLidPhone(config, lid, fetchImpl);

  const resolved = await mapInChunks(participants, LID_LOOKUP_CONCURRENCY, async (p) => ({
    participant: p,
    phone: await resolvePhone(p.id, knownPhone.get(p.id) ?? null, lookup),
  }));

  const rows: GroupMemberRow[] = [];
  for (const { participant, phone } of resolved) {
    if (isBotNumber(phone, config)) continue;
    const residentId = phone ? (phoneIndex.get(phone) ?? null) : null;
    if (participant.id.endsWith('@lid') && !phone) summary.unresolved += 1;
    if (residentId) summary.matched += 1;
    else summary.unmatched += 1;
    rows.push({
      group_id: groupId,
      member_id: participant.id,
      phone,
      role: participant.role,
      resident_id: residentId,
      last_seen_at: nowIso,
      left_at: null,
    });
  }
  summary.members = rows.length;
  await store.upsertMembers(rows);

  const present = new Set(rows.map((r) => r.member_id));
  const gone = existing.filter((m) => !present.has(m.member_id)).map((m) => m.member_id);
  if (gone.length > 0) {
    const left = await store.markLeft(groupId, { memberIds: gone, phones: [] }, nowIso);
    summary.left = left.length;
    if (left.length > 0) await deps.onLeave?.(left);
  }

  return { ok: true, summary };
}

export interface GroupParticipantsOutcome {
  handled: boolean;
  ignored?: 'no_group_chosen' | 'other_group' | 'unsupported_type';
  joined: number;
  left: number;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/**
 * The `group.v2.participants` webhook. Acts only for the chosen estate group:
 * `join` upserts the members, `leave` sets `left_at` and calls `onLeave`.
 * Other types (`promote`, `demote`) are left to the nightly sync. WAHA lists
 * only the changed participants, and may repeat the bot's own id.
 */
export async function handleGroupParticipantsEvent(
  body: unknown,
  config: WahaWhatsAppConfig,
  deps: GroupSyncDeps = {}
): Promise<GroupParticipantsOutcome> {
  const store = deps.store ?? createSupabaseGroupMemberStore();
  const nowIso = (deps.now ?? new Date()).toISOString();
  const payload = asRecord(asRecord(body)?.payload);
  const eventGroupId = asRecord(payload?.group)?.id;

  const groupId = await store.getGroupId();
  if (!groupId) return { handled: false, ignored: 'no_group_chosen', joined: 0, left: 0 };
  if (eventGroupId !== groupId) return { handled: false, ignored: 'other_group', joined: 0, left: 0 };

  const type = payload?.type;
  if (type !== 'join' && type !== 'leave') return { handled: false, ignored: 'unsupported_type', joined: 0, left: 0 };

  const participants = (Array.isArray(payload?.participants) ? payload.participants : [])
    .map((entry) => {
      const record = asRecord(entry);
      const id = typeof entry === 'string' ? entry : record?.id;
      return typeof id === 'string' && (id.endsWith('@c.us') || id.endsWith('@lid'))
        ? { id, role: typeof record?.role === 'string' ? record.role : 'participant' }
        : null;
    })
    .filter((p): p is { id: string; role: string } => p !== null);

  const lookup: LidLookup = (lid) => lookupWahaLidPhone(config, lid, deps.fetchImpl ?? fetch);
  const resolved = await mapInChunks(participants, LID_LOOKUP_CONCURRENCY, async (p) => ({
    participant: p,
    phone: await resolvePhone(p.id, null, lookup),
  }));
  const people = resolved.filter(({ phone }) => !isBotNumber(phone, config));

  if (type === 'join') {
    const phoneIndex = buildPhoneIndex(await store.loadResidents());
    await store.upsertMembers(
      people.map(({ participant, phone }) => ({
        group_id: groupId,
        member_id: participant.id,
        phone,
        role: participant.role,
        resident_id: phone ? (phoneIndex.get(phone) ?? null) : null,
        joined_at: nowIso,
        last_seen_at: nowIso,
        left_at: null,
      }))
    );
    return { handled: true, joined: people.length, left: 0 };
  }

  // WAHA may name a member by `@c.us` in the event and `@lid` in the list (or the reverse), so the number matches too.
  const left = await store.markLeft(
    groupId,
    {
      memberIds: people.map(({ participant }) => participant.id),
      phones: people.flatMap(({ phone }) => (phone ? [phone] : [])),
    },
    nowIso
  );
  if (left.length > 0) await deps.onLeave?.(left);
  return { handled: true, joined: 0, left: left.length };
}

/** Rows older than the retention window that never matched a resident (retention cron, #1325). */
export async function purgeUnmatchedGroupMembers(days: number): Promise<number> {
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const { count, error } = await untyped()
    .from('whatsapp_group_members')
    .delete({ count: 'exact' })
    .is('resident_id', null)
    .lt('last_seen_at', cutoff);
  if (error) throw error;
  return count || 0;
}

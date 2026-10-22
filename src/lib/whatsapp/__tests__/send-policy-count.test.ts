import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createAdminClient } from '@/lib/supabase/server';
import { createSendPolicyFacts, evaluateSendPolicy } from '@/lib/whatsapp/send-policy';

/** #1037: resident sends count toward the caps, and a message in both send tables counts once. */
vi.mock('@/lib/settings/service', () => ({
  getSettingResultAsService: vi.fn(async () => ({ status: 'ok', value: true })),
  getSettingValueAsService: vi.fn(async () => null),
}));
vi.mock('@/lib/supabase/server', () => ({ createAdminClient: vi.fn() }));
vi.mock('@/lib/whatsapp', () => ({ isApprovedWhatsAppTemplateName: vi.fn(() => true) }));
vi.mock('@/lib/whatsapp/rollout', () => ({ isWhatsAppRecipientAllowed: vi.fn(async () => true) }));
vi.mock('@/lib/sms/termii', () => ({ normalizePhoneNumber: vi.fn((phone: string) => phone) }));

type Row = Record<string, unknown>;
let tables: Record<string, Row[]>;

function query(table: string) {
  const filters: Array<(row: Row) => boolean> = [];
  const chain = {
    select: () => chain,
    eq: (column: string, value: unknown) => (filters.push((row) => row[column] === value), chain),
    is: (column: string, value: unknown) => (filters.push((row) => (row[column] ?? null) === value), chain),
    not: (column: string) => (filters.push((row) => row[column] != null), chain),
    gte: (column: string, value: string) => (filters.push((row) => String(row[column]) >= value), chain),
    maybeSingle: async () => ({ data: (tables[table] ?? []).find((row) => filters.every((f) => f(row))) ?? null, error: null }),
    then: (resolve: (value: { count: number; error: null }) => void) =>
      resolve({ count: (tables[table] ?? []).filter((row) => filters.every((f) => f(row))).length, error: null }),
  };
  return chain;
}

const nowIso = () => new Date().toISOString();

beforeEach(() => {
  tables = { notification_history: [], whatsapp_outbound_sends: [], whatsapp_optins: [] };
  vi.mocked(createAdminClient).mockReturnValue({ from: query } as unknown as ReturnType<typeof createAdminClient>);
});

describe('countWhatsAppSentSince', () => {
  it('stops a recipient group larger than the burst cap at the cap, counting each earlier send once', async () => {
    // A queued send and an immediate send: each is recorded in both tables and must count once.
    tables.notification_history.push(
      { channel: 'whatsapp', status: 'sent', sent_at: nowIso(), queue_id: 'queue-1', external_id: 'm-queued' },
      { channel: 'whatsapp', status: 'sent', sent_at: nowIso(), queue_id: null, external_id: 'm-immediate' }
    );
    tables.whatsapp_outbound_sends.push(
      { purpose: 'notification', notification_queue_id: 'queue-1', created_at: nowIso() },
      { purpose: 'notification', notification_queue_id: null, created_at: nowIso() },
      { purpose: 'inbound_reply', notification_queue_id: null, created_at: nowIso() }
    );

    const members = Array.from({ length: 30 }, (_, i) => `resident-${i}`);
    for (const id of members) tables.whatsapp_optins.push({ resident_id: id, phone_number: `080${id}`, opted_in: true, deactivated_at: null });

    const outcomes: string[] = [];
    for (const id of members) {
      const decision = await evaluateSendPolicy({ recipientId: id, recipientPhone: `080${id}`, metadata: null, freeForm: true }, createSendPolicyFacts());
      outcomes.push(decision.outcome === 'defer' ? decision.reason : decision.outcome);
      // What the provider records for an accepted resident send.
      if (decision.outcome === 'allow') tables.whatsapp_outbound_sends.push({ purpose: 'notification', notification_queue_id: null, created_at: nowIso() });
    }

    // Default burst cap 20, two already sent: 18 go out, the other 12 are held back.
    expect(outcomes.filter((o) => o === 'allow')).toHaveLength(18);
    expect(outcomes.slice(18)).toEqual(Array(12).fill('burst_limit_reached'));
  });
});

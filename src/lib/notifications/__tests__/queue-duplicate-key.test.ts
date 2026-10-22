/**
 * #1035: a unique de-duplication key conflict (Postgres 23505) is reported as a duplicate,
 * so callers can tell "already queued" apart from a real insert failure.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({ insertError: null as { code: string; message: string } | null }));

vi.mock('@/lib/supabase/server', () => {
  const chain = {
    insert: () => chain,
    select: () => chain,
    single: async () => (m.insertError ? { data: null, error: m.insertError } : { data: { id: 'q1' }, error: null }),
  };
  return { createAdminClient: () => ({ from: () => chain }) };
});
vi.mock('@/lib/notifications/send', () => ({ sendAndRecordNotification: vi.fn() }));

import { addToQueue } from '@/lib/notifications/queue';

const input = {
  recipient_id: 'r1',
  channel: 'whatsapp' as const,
  body: 'hi',
  deduplication_key: 'invoice-reminder:inv-1:2026-10-22',
};

beforeEach(() => {
  m.insertError = null;
});

describe('addToQueue duplicate key (#1035)', () => {
  it('reports a unique violation as a duplicate', async () => {
    m.insertError = { code: '23505', message: 'duplicate key value violates unique constraint' };
    expect(await addToQueue(input)).toMatchObject({ success: false, isDuplicate: true });
  });

  it('does not report other insert errors as duplicates', async () => {
    m.insertError = { code: '08006', message: 'connection failure' };
    expect(await addToQueue(input)).toMatchObject({ success: false, isDuplicate: false, error: 'connection failure' });
  });

  it('queues when the insert succeeds', async () => {
    expect(await addToQueue(input)).toEqual({ success: true, queueId: 'q1' });
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { processQueue, STALE_PROCESSING_MINUTES } from '@/lib/notifications/queue';

const { createAdminClient, sendAndRecordNotification } = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  sendAndRecordNotification: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({ createAdminClient }));
vi.mock('@/lib/notifications/send', () => ({ sendAndRecordNotification }));

const row = (id: string) => ({ id, attempts: 0, max_attempts: 3, status: 'pending' });

type Call = { method: string; args: unknown[] };

/**
 * Client double. Every chain is recorded; the chain's result is decided by
 * `resolve`, which sees the recorded calls once the chain is awaited.
 */
function client(resolve: (calls: Call[]) => unknown) {
  const chains: Call[][] = [];
  const from = vi.fn(() => {
    const calls: Call[] = [];
    chains.push(calls);
    const q: Record<string, unknown> = {
      then: (f: (v: unknown) => unknown) => Promise.resolve(resolve(calls)).then(f),
    };
    for (const m of ['select', 'update', 'eq', 'is', 'lte', 'or', 'order', 'limit']) {
      q[m] = vi.fn((...args: unknown[]) => {
        calls.push({ method: m, args });
        return q;
      });
    }
    return q;
  });
  return { from, chains };
}

const has = (calls: Call[], method: string, ...args: unknown[]) =>
  calls.some((c) => c.method === method && JSON.stringify(c.args) === JSON.stringify(args));

const isClaim = (calls: Call[]) =>
  calls.some((c) => c.method === 'update' && (c.args[0] as { status?: string }).status === 'processing');

const isFetch = (calls: Call[]) => calls[0]?.method === 'select' && has(calls, 'eq', 'status', 'pending');

const isStuckRead = (calls: Call[]) => calls[0]?.method === 'select' && has(calls, 'eq', 'status', 'processing');

const isReclaim = (calls: Call[]) => calls[0]?.method === 'update' && has(calls, 'eq', 'status', 'processing');

beforeEach(() => {
  vi.clearAllMocks();
  sendAndRecordNotification.mockResolvedValue({ success: true });
});

describe('processQueue claiming', () => {
  it('claims a row only while it is still pending', async () => {
    const db = client((calls) =>
      isFetch(calls) ? { data: [row('q1')], error: null } : isClaim(calls) ? { data: [{ id: 'q1' }], error: null } : { error: null }
    );
    createAdminClient.mockReturnValue(db);

    const res = await processQueue();

    const claim = db.chains.find(isClaim)!;
    expect(has(claim, 'eq', 'status', 'pending')).toBe(true);
    expect(has(claim, 'eq', 'id', 'q1')).toBe(true);
    expect(sendAndRecordNotification).toHaveBeenCalledTimes(1);
    expect(res).toMatchObject({ processed: 1, sent: 1, skipped: 0 });
  });

  it('does not send a row another run already claimed', async () => {
    const db = client((calls) =>
      isFetch(calls) ? { data: [row('q1'), row('q2')], error: null }
      : isClaim(calls) ? { data: has(calls, 'eq', 'id', 'q1') ? [] : [{ id: 'q2' }], error: null }
      : { error: null }
    );
    createAdminClient.mockReturnValue(db);

    const res = await processQueue();

    expect(sendAndRecordNotification).toHaveBeenCalledTimes(1);
    expect(sendAndRecordNotification.mock.calls[0][0]).toMatchObject({ id: 'q2' });
    expect(res).toMatchObject({ processed: 1, sent: 1, skipped: 1 });
  });

  it('reads rows stuck in processing for over 30 minutes before fetching', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-22T12:00:00.000Z'));
    try {
      const db = client((calls) => (isFetch(calls) || isStuckRead(calls) ? { data: [], error: null } : { error: null }));
      createAdminClient.mockReturnValue(db);

      await processQueue();

      const read = db.chains.find(isStuckRead)!;
      expect(read).toBeDefined();
      const cutoff = new Date(Date.now() - STALE_PROCESSING_MINUTES * 60_000).toISOString();
      expect(cutoff).toBe('2026-10-22T11:30:00.000Z');
      expect(has(read, 'or', `last_attempt_at.is.null,last_attempt_at.lt.${cutoff}`)).toBe(true);
      expect(db.chains.indexOf(read)).toBeLessThan(db.chains.findIndex(isFetch));
      expect(db.chains.some(isReclaim)).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it('puts a stuck row back to pending with one more attempt, only if it is unchanged', async () => {
    const stuck = { id: 's1', attempts: 1, max_attempts: 3, last_attempt_at: '2026-10-22T11:00:00.000Z' };
    const db = client((calls) =>
      isStuckRead(calls) ? { data: [stuck], error: null } : isFetch(calls) ? { data: [], error: null } : { error: null }
    );
    createAdminClient.mockReturnValue(db);

    await processQueue();

    const reclaims = db.chains.filter(isReclaim);
    expect(reclaims).toHaveLength(1);
    const [reclaim] = reclaims;
    expect(has(reclaim, 'update', { status: 'pending', attempts: 2 })).toBe(true);
    expect(has(reclaim, 'eq', 'id', 's1')).toBe(true);
    expect(has(reclaim, 'eq', 'attempts', 1)).toBe(true);
    expect(has(reclaim, 'eq', 'last_attempt_at', '2026-10-22T11:00:00.000Z')).toBe(true);
    expect(db.chains.indexOf(reclaim)).toBeLessThan(db.chains.findIndex(isFetch));
  });

  it('fails a stuck row whose next attempt would reach max_attempts', async () => {
    const stuck = { id: 's2', attempts: 2, max_attempts: 3, last_attempt_at: null };
    const db = client((calls) =>
      isStuckRead(calls) ? { data: [stuck], error: null } : isFetch(calls) ? { data: [], error: null } : { error: null }
    );
    createAdminClient.mockReturnValue(db);

    await processQueue();

    const [reclaim] = db.chains.filter(isReclaim);
    expect(has(reclaim, 'update', { status: 'failed', attempts: 3, error_message: 'Max attempts exceeded' })).toBe(true);
    expect(has(reclaim, 'eq', 'attempts', 2)).toBe(true);
    expect(has(reclaim, 'is', 'last_attempt_at', null)).toBe(true);
    expect(sendAndRecordNotification).not.toHaveBeenCalled();
  });
});

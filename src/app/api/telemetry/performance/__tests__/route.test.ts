import { beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from '../route';
import { resetRateLimitForTests } from '@/lib/performance/rate-limit';
import { createAdminClient, createServerSupabaseClient } from '@/lib/supabase/server';

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: vi.fn(),
  createAdminClient: vi.fn(),
}));

const insert = vi.fn();

function session(user: { id: string } | null, role: { name: string; category: string } | null) {
  vi.mocked(createServerSupabaseClient).mockResolvedValue({
    auth: { getUser: async () => ({ data: { user } }) },
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: role ? { app_roles: role } : null }) }) }),
    }),
  } as never);
}

function post(body: unknown) {
  return new Request('https://residio.test/api/telemetry/performance', {
    method: 'POST',
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

const event = { version: 1, occurredAt: Date.now(), type: 'query_duration', operation: 'dashboard.snapshot', durationMs: 12, success: true };

describe('POST /api/telemetry/performance', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetRateLimitForTests();
    insert.mockResolvedValue({ error: null });
    vi.mocked(createAdminClient).mockReturnValue({ from: () => ({ insert }) } as never);
    session({ id: 'u1' }, { name: 'chairman', category: 'executive' });
  });

  it('refuses anonymous traffic', async () => {
    session(null, null);
    expect((await POST(post({ events: [event] }))).status).toBe(401);
    expect(insert).not.toHaveBeenCalled();
  });

  it('refuses a resident-category user', async () => {
    session({ id: 'u2' }, { name: 'resident', category: 'resident' });
    expect((await POST(post({ events: [event] }))).status).toBe(403);
    expect(insert).not.toHaveBeenCalled();
  });

  it('stores a sanitised row for an admin', async () => {
    const res = await POST(post({ events: [{ ...event, operation: 'alice@example.com', userId: 'x' }] }));
    expect(res.status).toBe(200);
    const [rows] = insert.mock.calls[0];
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ event_type: 'query_duration', label: 'redacted', duration_ms: 12, success: true });
    expect(rows[0]).not.toHaveProperty('userId');
  });

  it('drops mutation_failure and unknown types', async () => {
    const res = await POST(
      post({ events: [{ type: 'mutation_failure', mutation: 'a', retryable: true }, { type: 'nope' }] })
    );
    expect(await res.json()).toEqual({ accepted: 0 });
    expect(insert).not.toHaveBeenCalled();
  });

  it('rejects more than 50 events', async () => {
    expect((await POST(post({ events: Array(51).fill({ type: 'cache_miss', cache: 'a' }) }))).status).toBe(400);
  });

  it('rejects a body over 8 KB', async () => {
    expect((await POST(post({ events: [], pad: 'x'.repeat(9000) }))).status).toBe(413);
  });

  it('rejects malformed JSON', async () => {
    expect((await POST(post('{not json'))).status).toBe(400);
  });

  it('rate limits a user after 30 requests in a window', async () => {
    for (let i = 0; i < 30; i++) expect((await POST(post({ events: [] }))).status).toBe(200);
    expect((await POST(post({ events: [] }))).status).toBe(429);
  });

  it('returns 500 when storage fails', async () => {
    insert.mockResolvedValue({ error: { message: 'boom' } });
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect((await POST(post({ events: [event] }))).status).toBe(500);
  });
});

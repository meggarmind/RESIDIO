import { describe, expect, it, vi } from 'vitest';

const counts = new Map<string, number>();
const rpc = vi.fn(async (_fn: string, args: { p_phone: string; p_now: string }) => {
  const next = (counts.get(args.p_phone) ?? 0) + 1;
  if (next >= 5) {
    counts.set(args.p_phone, 0);
    return { data: new Date(new Date(args.p_now).getTime() + 30 * 60_000).toISOString(), error: null };
  }
  counts.set(args.p_phone, next);
  return { data: null, error: null };
});

vi.mock('@/lib/supabase/server', () => ({ createAdminClient: () => ({ rpc }) }));

import { createSupabaseWhatsAppAdminRepository } from '@/lib/whatsapp/admin';

describe('recordWrongCode', () => {
  it('locks on every fifth of ten parallel wrong codes through the atomic function', async () => {
    const repo = createSupabaseWhatsAppAdminRepository();
    const now = new Date('2026-10-22T10:00:00Z');
    const results = await Promise.all(Array.from({ length: 10 }, () => repo.recordWrongCode('+2348000000001', now)));
    expect(results.filter((r) => r.lockedUntil)).toHaveLength(2);
    expect(results.find((r) => r.lockedUntil)?.lockedUntil).toBe('2026-10-22T10:30:00.000Z');
    expect(rpc).toHaveBeenCalledWith('whatsapp_admin_record_wrong_code', { p_phone: '+2348000000001', p_now: now.toISOString() });
  });

  it('throws when the function errors', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: new Error('boom') });
    await expect(createSupabaseWhatsAppAdminRepository().recordWrongCode('+1', new Date())).rejects.toThrow('boom');
  });
});

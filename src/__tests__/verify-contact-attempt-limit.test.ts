/**
 * Issue #556 item 6 -- verifyContactToken counts wrong guesses and invalidates the
 * code after 5. The admin client is an in-memory fake that honours the
 * `used_at IS NULL` filter, so invalidation is observable end to end.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { cryptoSpy, state, rpc, logAudit } = vi.hoisted(() => ({
  cryptoSpy: { fn: null as unknown as ReturnType<typeof vi.fn> },
  state: {
    token: null as null | {
      id: string;
      token: string;
      target_value: string;
      expires_at: string;
      used_at: string | null;
    },
    marked: [] as string[],
    residentUpdates: [] as unknown[],
  },
  rpc: vi.fn(),
  logAudit: vi.fn(),
}));

vi.mock('node:crypto', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:crypto')>();
  cryptoSpy.fn = vi.fn(actual.timingSafeEqual);
  return { ...actual, default: actual, timingSafeEqual: cryptoSpy.fn };
});
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/audit/logger', () => ({ logAudit }));
vi.mock('@/lib/auth/authorize', () => ({ authorizePermission: vi.fn() }));

const RESIDENT = {
  id: 'r1',
  first_name: 'A',
  last_name: 'B',
  email: 'a@b.test',
  phone_primary: '0800',
};

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }) },
    from: () => {
      const c: Record<string, unknown> = {};
      c.select = () => c;
      c.eq = () => c;
      c.single = async () => ({ data: RESIDENT, error: null });
      return c;
    },
  }),
  createAdminClient: () => ({
    rpc,
    from(table: string) {
      let op = 'select';
      let activeOnly = false;
      let updateVals: Record<string, unknown> = {};
      const c: Record<string, unknown> = {};
      c.select = () => c;
      c.update = (v: Record<string, unknown>) => {
        op = 'update';
        updateVals = v;
        return c;
      };
      c.eq = (col: string, val: string) => {
        if (op === 'update' && table === 'verification_tokens' && col === 'id') state.marked.push(val);
        return c;
      };
      c.is = (col: string) => {
        if (col === 'used_at') activeOnly = true;
        return c;
      };
      c.order = () => c;
      c.limit = () => c;
      const find = async () => {
        const t = state.token;
        const visible = t && (!activeOnly || t.used_at === null) ? t : null;
        return { data: visible, error: visible ? null : { message: 'none' } };
      };
      c.maybeSingle = find;
      c.single = find;
      c.then = (res: (v: unknown) => unknown) => {
        if (table === 'residents') state.residentUpdates.push(updateVals);
        return Promise.resolve({ data: null, error: null }).then(res);
      };
      return c;
    },
  }),
}));

import { verifyContactToken } from '@/actions/verification/verify-contact';

const WRONG = 'Invalid or expired verification code';
const TOO_MANY = 'Too many incorrect attempts. Please request a new verification code.';
const future = () => new Date(Date.now() + 600_000).toISOString();

beforeEach(() => {
  vi.clearAllMocks();
  state.marked.length = 0;
  state.residentUpdates.length = 0;
  state.token = {
    id: 't1',
    token: '123456',
    target_value: RESIDENT.email,
    expires_at: future(),
    used_at: null,
  };
  rpc.mockResolvedValue({ data: [{ attempts: 1, invalidated: false }], error: null });
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('verifyContactToken attempt limit (#556)', () => {
  it('verifies a correct code on the first try without touching the RPC', async () => {
    const res = await verifyContactToken('r1', '123456', 'email');
    expect(res.success).toBe(true);
    expect(rpc).not.toHaveBeenCalled();
    expect(state.marked).toEqual(['t1']);
    expect(logAudit).toHaveBeenCalledTimes(1);
  });

  it('records a wrong code once via the RPC with (residentId, tokenType, 5)', async () => {
    const res = await verifyContactToken('r1', '000000', 'email');
    expect(res).toEqual({ success: false, message: WRONG });
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith('record_failed_verification_attempt', {
      p_resident_id: 'r1',
      p_token_type: 'email',
      p_max_attempts: 5,
    });
    expect(state.marked).toEqual([]);
  });

  it('returns the too-many-attempts message when the RPC reports invalidation', async () => {
    rpc.mockResolvedValue({ data: [{ attempts: 5, invalidated: true }], error: null });
    const res = await verifyContactToken('r1', '000000', 'email');
    expect(res).toEqual({ success: false, message: TOO_MANY });
  });

  it('rejects the correct code once the token has been invalidated', async () => {
    state.token!.used_at = new Date().toISOString();
    const res = await verifyContactToken('r1', '123456', 'email');
    expect(res).toEqual({ success: false, message: WRONG });
    expect(state.marked).toEqual([]);
    expect(state.residentUpdates).toEqual([]);
  });

  it('fails closed when the RPC errors on a wrong code', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'rpc down' } });
    const res = await verifyContactToken('r1', '000000', 'email');
    expect(res).toEqual({ success: false, message: WRONG });
    expect(console.error).toHaveBeenCalled();
    expect(state.marked).toEqual([]);
    expect(state.residentUpdates).toEqual([]);
  });

  it('does not count an attempt against an expired code', async () => {
    state.token!.expires_at = new Date(Date.now() - 1000).toISOString();
    const res = await verifyContactToken('r1', '000000', 'email');
    expect(res.success).toBe(false);
    expect(res.message).toContain('expired');
    expect(rpc).not.toHaveBeenCalled();
  });

  it('compares in constant time and survives a wrong-length code', async () => {
    cryptoSpy.fn.mockClear();
    await expect(verifyContactToken('r1', '123456', 'email')).resolves.toMatchObject({ success: true });
    expect(cryptoSpy.fn).toHaveBeenCalledTimes(1);

    state.token!.used_at = null;
    for (const bad of ['12345', '1234567', '']) {
      await expect(verifyContactToken('r1', bad, 'email')).resolves.toEqual({ success: false, message: WRONG });
    }
    // Length mismatches are rejected before timingSafeEqual (which would throw on them).
    expect(cryptoSpy.fn).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledTimes(3);
  });
});

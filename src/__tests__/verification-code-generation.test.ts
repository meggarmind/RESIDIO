/**
 * Issue #556 item 6 -- contact-verification codes come from a CSPRNG, not Math.random.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { randomInt, inserted } = vi.hoisted(() => ({
  randomInt: vi.fn(),
  inserted: [] as Array<{ token: string }>,
}));

vi.mock('node:crypto', async (orig) => {
  const actual = await orig<typeof import('node:crypto')>();
  return { ...actual, default: actual, randomInt };
});

function chain(table: string): Record<string, unknown> {
  const c: Record<string, unknown> = {};
  for (const m of ['select', 'insert', 'update', 'eq', 'is', 'gte']) {
    c[m] = (...args: unknown[]) => {
      if (m === 'insert') inserted.push(args[0] as { token: string });
      return c;
    };
  }
  const settle = () => {
    if (table === 'residents') {
      return { data: { id: 'r1', email: 'a@b.co', first_name: 'A', last_name: 'B', email_verified_at: null }, error: null };
    }
    return { data: null, error: null, count: 0 };
  };
  c.single = async () => settle();
  c.then = (res: (v: unknown) => unknown) => Promise.resolve(settle()).then(res);
  return c;
}
const client = { auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }) }, from: (t: string) => chain(t) };

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: async () => client,
  createAdminClient: () => client,
}));
// The send now reads the resident's override flag before creating a token (#716); this test is about the
// code, so the stored flag is supplied (null: follow the environment default). A lookup that cannot run
// fails closed, which would stop the flow before any code is generated.
const flagState = vi.hoisted(() => ({ byId: new Map<string, boolean | null>([['r1', null]]), error: null as string | null }));
vi.mock('@/lib/comms-override/resident-flag', async (importOriginal) =>
  (await import('@/__tests__/helpers/resident-flag-lookup-mock')).flagModule(
    await importOriginal<typeof import('@/lib/comms-override/resident-flag')>(),
    flagState
  )
);
vi.mock('@/lib/auth/authorize', () => ({ authorizePermission: async () => ({ authorized: true }) }));
vi.mock('@/lib/audit/logger', () => ({ logAudit: vi.fn() }));
vi.mock('@/lib/sms/send-sms', () => ({ sendVerificationSms: vi.fn() }));
vi.mock('@/lib/email/send-email', () => ({
  sendEmail: async () => ({ success: true }),
  getEstateEmailSettings: async () => ({ estateName: 'E' }),
}));
vi.mock('@/emails/verification-code', () => ({ VerificationCodeEmail: () => null }));

import { sendEmailVerification } from '@/actions/verification/send-verification';

describe('verification code generation (#556)', () => {
  beforeEach(() => {
    inserted.length = 0;
    randomInt.mockReset();
  });

  it('uses crypto.randomInt over [0, 1_000_000), never Math.random', async () => {
    const mr = vi.spyOn(Math, 'random');
    randomInt.mockReturnValue(123456);
    const res = await sendEmailVerification('r1');
    expect(res.success).toBe(true);
    expect(randomInt).toHaveBeenCalledWith(0, 1_000_000);
    expect(inserted[0].token).toBe('123456');
    expect(mr).not.toHaveBeenCalled();
    mr.mockRestore();
  });

  it('zero-pads small values to 6 digits', async () => {
    randomInt.mockReturnValue(42);
    await sendEmailVerification('r1');
    expect(inserted[0].token).toBe('000042');
    expect(inserted[0].token).toMatch(/^[0-9]{6}$/);
  });
});

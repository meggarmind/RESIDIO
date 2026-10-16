import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * #716: the contact-verification sends pass the resident's stored override flag to the email and SMS seams,
 * and send nothing (and create no token) when the flag cannot be read.
 */
const mocks = vi.hoisted(() => ({
  authorizePermission: vi.fn(),
  createAdminClient: vi.fn(),
  createServerSupabaseClient: vi.fn(),
  sendVerificationSms: vi.fn(),
  sendEmail: vi.fn(),
}));
const flagState = vi.hoisted(() => ({ byId: new Map<string, boolean | null>(), error: null as string | null }));

vi.mock('@/lib/comms-override/resident-flag', async (importOriginal) =>
  (await import('@/__tests__/helpers/resident-flag-lookup-mock')).flagModule(
    await importOriginal<typeof import('@/lib/comms-override/resident-flag')>(),
    flagState
  )
);
vi.mock('@/lib/auth/authorize', () => ({ authorizePermission: mocks.authorizePermission }));
vi.mock('@/lib/audit/logger', () => ({ logAudit: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({
  createAdminClient: mocks.createAdminClient,
  createServerSupabaseClient: mocks.createServerSupabaseClient,
}));
vi.mock('@/lib/sms/send-sms', () => ({ sendVerificationSms: mocks.sendVerificationSms }));
vi.mock('@/lib/email/send-email', () => ({
  sendEmail: mocks.sendEmail,
  getEstateEmailSettings: vi.fn().mockResolvedValue({ estateName: 'Test Estate' }),
}));
vi.mock('@/emails/verification-code', () => ({ VerificationCodeEmail: vi.fn(() => null) }));
vi.mock('@/lib/auth/action-roles', () => ({ PERMISSIONS: { RESIDENTS_VERIFY: 'residents.verify' } }));
vi.mock('@/lib/notifications/types', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/notifications/types')>()),
  isChannelImplemented: () => true,
}));

import { sendEmailVerification, sendPhoneVerification } from '../send-verification';

const RESIDENT = {
  id: 'res-1',
  email: 'ada@example.test',
  phone_primary: '08012345678',
  first_name: 'Ada',
  last_name: 'Obi',
  email_verified_at: null,
  phone_verified_at: null,
};

/** Chainable, thenable query double that records inserts. */
function query(inserts: unknown[]) {
  const chain: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'is', 'gte', 'update']) chain[m] = () => chain;
  chain.insert = (payload: unknown) => {
    inserts.push(payload);
    return chain;
  };
  chain.single = async () => ({ data: RESIDENT, error: null });
  chain.then = (resolve: (v: unknown) => unknown) => Promise.resolve({ data: null, error: null, count: 0 }).then(resolve);
  return chain;
}

let tokenInserts: unknown[] = [];

beforeEach(() => {
  vi.clearAllMocks();
  tokenInserts = [];
  flagState.error = null;
  flagState.byId = new Map([['res-1', null]]);
  mocks.authorizePermission.mockResolvedValue({ authorized: true, userId: 'u1', error: null });
  mocks.createServerSupabaseClient.mockResolvedValue({
    auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }) },
    from: () => query([]),
  });
  mocks.createAdminClient.mockReturnValue({ from: () => query(tokenInserts) });
  mocks.sendEmail.mockResolvedValue({ success: true });
  mocks.sendVerificationSms.mockResolvedValue({ success: true });
});

describe.each([
  {
    name: 'sendEmailVerification',
    run: () => sendEmailVerification('res-1'),
    seam: mocks.sendEmail,
    overrideOf: (call: unknown[]) => (call[0] as { residentOverride?: unknown }).residentOverride,
    hasOverride: (call: unknown[]) => 'residentOverride' in (call[0] as object),
  },
  {
    name: 'sendPhoneVerification',
    run: () => sendPhoneVerification('res-1'),
    seam: mocks.sendVerificationSms,
    overrideOf: (call: unknown[]) => (call[3] as { residentOverride?: unknown } | undefined)?.residentOverride,
    hasOverride: (call: unknown[]) => !!call[3] && 'residentOverride' in (call[3] as object),
  },
])('$name passes the stored resident flag (#716)', ({ run, seam, overrideOf, hasOverride }) => {
  it.each([true, false, null])('stored %s reaches the seam unchanged', async (stored) => {
    flagState.byId = new Map([['res-1', stored]]);

    const result = await run();

    expect(result.success).toBe(true);
    expect(seam).toHaveBeenCalledTimes(1);
    expect(hasOverride(seam.mock.calls[0])).toBe(true);
    expect(overrideOf(seam.mock.calls[0])).toBe(stored);
  });

  it('fails closed when the flag cannot be read: nothing is sent, no token is created, a failure is returned', async () => {
    flagState.error = 'db down';

    const result = await run();

    expect(result.success).toBe(false);
    expect(result.message).toContain('could not read resident flag');
    expect(seam).not.toHaveBeenCalled();
    expect(tokenInserts).toHaveLength(0);
  });

  it('fails closed when the resident is missing from the lookup', async () => {
    flagState.byId = new Map();

    const result = await run();

    expect(result.success).toBe(false);
    expect(seam).not.toHaveBeenCalled();
    expect(tokenInserts).toHaveLength(0);
  });
});

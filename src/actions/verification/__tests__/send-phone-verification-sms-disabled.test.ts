import { beforeEach, describe, expect, it, vi } from 'vitest';
import { authorizePermission } from '@/lib/auth/authorize';
import { createAdminClient, createServerSupabaseClient } from '@/lib/supabase/server';
import { sendVerificationSms } from '@/lib/sms/send-sms';
import { isChannelImplemented } from '@/lib/notifications/types';
import { sendPhoneVerification } from '../send-verification';

vi.mock('@/lib/auth/authorize', () => ({ authorizePermission: vi.fn() }));
vi.mock('@/lib/audit/logger', () => ({ logAudit: vi.fn() }));
// The resident-flag lookup (#716) is covered in comms-override/__tests__/resident-flag-wiring.test.ts.
vi.mock('@/lib/comms-override/resident-flag', () => ({
  resolveResidentOverride: vi.fn(async () => ({ ok: true, residentOverride: null })),
}));
vi.mock('@/lib/supabase/server', () => ({
  createAdminClient: vi.fn(),
  createServerSupabaseClient: vi.fn(),
}));
vi.mock('@/lib/sms/send-sms', () => ({ sendVerificationSms: vi.fn() }));
vi.mock('@/lib/email/send-email', () => ({ sendEmail: vi.fn(), getEstateEmailSettings: vi.fn() }));
vi.mock('@/emails/verification-code', () => ({ VerificationCodeEmail: vi.fn() }));
vi.mock('@/lib/auth/action-roles', () => ({ PERMISSIONS: { RESIDENTS_VERIFY: 'residents.verify' } }));
// Real IMPLEMENTED_CHANNELS by default; individual tests override the predicate.
vi.mock('@/lib/notifications/types', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/notifications/types')>();
  return { ...actual, isChannelImplemented: vi.fn(actual.isChannelImplemented) };
});

const resident = {
  id: 'res-1',
  phone_primary: '08012345678',
  first_name: 'A',
  last_name: 'B',
  phone_verified_at: null,
};

/** Chainable, thenable query double. */
function query(result: Record<string, unknown> = { data: null, error: null, count: 0 }) {
  const chain = {} as Record<string, ReturnType<typeof vi.fn>>;
  for (const m of ['select', 'eq', 'is', 'gte', 'update', 'insert']) {
    chain[m] = vi.fn().mockReturnValue(chain);
  }
  chain.single = vi.fn().mockResolvedValue({ data: resident, error: null });
  chain.then = vi.fn((resolve: (v: unknown) => unknown) => Promise.resolve(resolve(result)));
  return chain;
}

function setupClients() {
  const userQuery = query();
  const server = {
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'u1' } } }) },
    from: vi.fn(() => userQuery),
  };
  const adminQueries: ReturnType<typeof query>[] = [];
  const admin = {
    from: vi.fn(() => {
      const q = query();
      adminQueries.push(q);
      return q;
    }),
  };
  vi.mocked(createServerSupabaseClient).mockResolvedValue(server as never);
  vi.mocked(createAdminClient).mockReturnValue(admin as never);
  return { server, admin, adminQueries };
}

const SMS_OFF = 'SMS verification is unavailable until the SMS provider is connected';

describe('sendPhoneVerification SMS gate', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    // clearAllMocks keeps overrides; restore the real predicate so SMS is off by default.
    const actual = await vi.importActual<typeof import('@/lib/notifications/types')>('@/lib/notifications/types');
    vi.mocked(isChannelImplemented).mockImplementation(actual.isChannelImplemented);
    vi.mocked(authorizePermission).mockResolvedValue({ authorized: true, userId: 'u1', error: null } as never);
  });

  it('returns the unavailable message with SMS off and touches nothing', async () => {
    const { server, admin } = setupClients();

    const result = await sendPhoneVerification('res-1');

    expect(result).toEqual({ success: false, message: SMS_OFF });
    expect(createServerSupabaseClient).not.toHaveBeenCalled();
    expect(createAdminClient).not.toHaveBeenCalled();
    expect(server.from).not.toHaveBeenCalled();
    expect(admin.from).not.toHaveBeenCalled();
    expect(sendVerificationSms).not.toHaveBeenCalled();
  });

  it('checks authorization before the SMS gate', async () => {
    setupClients();
    vi.mocked(authorizePermission).mockResolvedValue({ authorized: false, userId: null, error: 'Forbidden' } as never);

    const result = await sendPhoneVerification('res-1');

    expect(result).toEqual({ success: false, message: 'Forbidden' });
    expect(isChannelImplemented).not.toHaveBeenCalled();
  });

  it('still runs the full flow when SMS is implemented', async () => {
    const { admin, adminQueries } = setupClients();
    vi.mocked(isChannelImplemented).mockReturnValue(true);
    vi.mocked(sendVerificationSms).mockResolvedValue({ success: true } as never);

    const result = await sendPhoneVerification('res-1');

    expect(result.success).toBe(true);
    expect(sendVerificationSms).toHaveBeenCalledWith('08012345678', expect.stringMatching(/^\d{6}$/), 'res-1', {
      residentOverride: null,
    });
    expect(admin.from).toHaveBeenCalledWith('verification_tokens');
    expect(adminQueries.filter((q) => q.insert.mock.calls.length === 1)).toHaveLength(1);
  });

  it('rolls the token back when the send fails and SMS is implemented', async () => {
    const { adminQueries } = setupClients();
    vi.mocked(isChannelImplemented).mockReturnValue(true);
    vi.mocked(sendVerificationSms).mockResolvedValue({ success: false, error: 'boom' } as never);

    const result = await sendPhoneVerification('res-1');

    expect(result).toEqual({ success: false, message: 'Failed to send SMS: boom' });
    const inserts = adminQueries.filter((q) => q.insert.mock.calls.length > 0);
    // The rollback is the last admin query: an update marking used_at, filtered by the OTP.
    const last = adminQueries[adminQueries.length - 1];
    expect(inserts).toHaveLength(1);
    expect(last.update).toHaveBeenCalledWith({ used_at: expect.any(String) });
    expect(last.eq).toHaveBeenCalledWith('token', expect.stringMatching(/^\d{6}$/));
  });

  it('a createResident-style fire-and-forget call does not throw on the failure result', async () => {
    setupClients();
    let unhandled: unknown;
    const onUnhandled = (e: unknown) => {
      unhandled = e;
    };
    process.on('unhandledRejection', onUnhandled);

    sendPhoneVerification('res-1').catch((e) => {
      unhandled = e;
    });
    await new Promise((r) => setTimeout(r, 10));
    process.off('unhandledRejection', onUnhandled);

    expect(unhandled).toBeUndefined();
    await expect(sendPhoneVerification('res-1')).resolves.toMatchObject({ success: false });
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * #716: a caller that knows the resident passes the stored flag to sendEmail,
 * and sends nothing when the flag cannot be read. sendWelcomeEmail stands for the
 * single-resident callers; resident-caller-scan.test.ts covers the rest.
 */
const mocks = vi.hoisted(() => ({
  sendEmail: vi.fn(),
  createServerSupabaseClient: vi.fn(),
  createAdminClient: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: mocks.createServerSupabaseClient,
  createAdminClient: mocks.createAdminClient,
}));
vi.mock('@/lib/email', () => ({
  sendEmail: mocks.sendEmail,
  getEstateEmailSettings: vi.fn().mockResolvedValue({ estateName: 'Test Estate' }),
}));
vi.mock('@/actions/settings/get-settings', () => ({ getSettingValue: vi.fn().mockResolvedValue(true) }));
vi.mock('@/emails', () => ({ WelcomeResidentEmail: vi.fn(() => null) }));

import { sendWelcomeEmail } from '@/actions/email/send-welcome-email';

function residentRow() {
  return {
    id: 'res-1',
    first_name: 'Test',
    last_name: 'Person',
    email: 'real@example.test',
    resident_code: 'R-1',
    resident_houses: [],
  };
}

function flagIs(value: boolean | null | 'error' | 'missing') {
  mocks.createAdminClient.mockReturnValue({
    from: () => ({
      select: () => ({
        in: async () => {
          if (value === 'error') return { data: null, error: { message: 'db down' } };
          if (value === 'missing') return { data: [], error: null };
          return { data: [{ id: 'res-1', use_override_comms: value }], error: null };
        },
      }),
    }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.sendEmail.mockResolvedValue({ success: true });
  mocks.createServerSupabaseClient.mockResolvedValue({
    from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: residentRow(), error: null }) }) }) }),
  });
});

describe('sendWelcomeEmail passes the resident flag', () => {
  it.each([true, false, null])('forwards a stored %s to sendEmail', async (stored) => {
    flagIs(stored);
    const result = await sendWelcomeEmail('res-1');

    expect(result.success).toBe(true);
    expect(mocks.sendEmail).toHaveBeenCalledTimes(1);
    expect(mocks.sendEmail.mock.calls[0][0]).toHaveProperty('residentOverride', stored);
  });

  it('sends nothing when the flag cannot be read', async () => {
    flagIs('error');
    const result = await sendWelcomeEmail('res-1');

    expect(result.success).toBe(false);
    expect(result.error).toContain('could not read resident flag');
    expect(mocks.sendEmail).not.toHaveBeenCalled();
  });

  it('sends nothing when the resident row is missing from the lookup', async () => {
    flagIs('missing');
    const result = await sendWelcomeEmail('res-1');

    expect(result.success).toBe(false);
    expect(mocks.sendEmail).not.toHaveBeenCalled();
  });
});

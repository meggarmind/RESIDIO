import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getActiveResidents } from '@/actions/residents/get-residents';
import { testEmail } from '@/actions/email/test-email';
import { sendPaymentReceiptEmail } from '@/actions/email/send-payment-receipt-email';
import { sendPaymentReminders } from '@/actions/email/send-payment-reminders';
import { getResidentPreferences, updateResidentPreference } from '@/actions/notifications/preferences';
import { PERMISSIONS } from '@/lib/auth/action-roles';

// #472: server actions registered in the production build must not run for a
// signed-in session that lacks the permission (or, for notification
// preferences, is not the resident themselves).

const mocks = vi.hoisted(() => ({
  authorizePermission: vi.fn(),
  authorizeAnyPermission: vi.fn(),
  createAdminClient: vi.fn(),
  createServerSupabaseClient: vi.fn(),
  sendEmail: vi.fn(),
  getEstateEmailSettings: vi.fn(),
  getPreferences: vi.fn(),
  updatePreference: vi.fn(),
  logAudit: vi.fn(),
  getSettingValue: vi.fn(),
}));

vi.mock('@/lib/auth/authorize', () => ({
  authorizePermission: mocks.authorizePermission,
  authorizeAnyPermission: mocks.authorizeAnyPermission,
}));
vi.mock('@/lib/supabase/server', () => ({
  createAdminClient: mocks.createAdminClient,
  createServerSupabaseClient: mocks.createServerSupabaseClient,
}));
vi.mock('@/lib/email', () => ({
  sendEmail: mocks.sendEmail,
  getEstateEmailSettings: mocks.getEstateEmailSettings,
}));
vi.mock('@/emails', () => ({ TestEmail: vi.fn(), PaymentReceiptEmail: vi.fn(), PaymentReminderEmail: vi.fn() }));
vi.mock('@/lib/audit/logger', () => ({ logAudit: mocks.logAudit }));
vi.mock('@/actions/settings/get-settings', () => ({ getSettingValue: mocks.getSettingValue }));
vi.mock('@/actions/settings/update-setting', () => ({ updateSetting: vi.fn() }));
vi.mock('@/lib/notifications/preferences', () => ({
  getPreferences: mocks.getPreferences,
  getPreferencesByCategory: vi.fn(),
  getPreference: vi.fn(),
  updatePreference: mocks.updatePreference,
  updatePreferences: vi.fn(),
  createDefaultPreferences: vi.fn(),
  deletePreferences: vi.fn(),
  setAllChannelsForCategory: vi.fn(),
  setAllCategoriesForChannel: vi.fn(),
}));

const denied = { authorized: false, error: 'Unauthorized: Missing permission' };
const allowed = { authorized: true, userId: 'admin-1', error: null };

/** A session client whose signed-in user has the given profile.resident_id. */
function sessionClient(user: { id: string } | null, residentId: string | null) {
  return {
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user } }) },
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: { resident_id: residentId }, error: null }),
        }),
      }),
    }),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.authorizePermission.mockResolvedValue(denied);
  mocks.authorizeAnyPermission.mockResolvedValue(denied);
});

describe('getActiveResidents', () => {
  it('refuses callers without a page permission and never builds the service-role client', async () => {
    const result = await getActiveResidents();

    expect(result).toEqual({ data: [], error: 'Unauthorized: Missing permission' });
    expect(mocks.authorizeAnyPermission).toHaveBeenCalledWith([
      PERMISSIONS.EXPENDITURE_VIEW,
      PERMISSIONS.EMAIL_IMPORTS_VIEW,
    ]);
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
  });

  it.each([PERMISSIONS.EXPENDITURE_VIEW, PERMISSIONS.EMAIL_IMPORTS_VIEW])(
    'is allowed for a role holding only %s',
    async (perm) => {
      mocks.authorizeAnyPermission.mockImplementation(async (list: string[]) =>
        list.includes(perm) ? allowed : denied,
      );
      mocks.createAdminClient.mockReturnValue({
        from: () => ({ select: () => ({ eq: () => ({ order: vi.fn().mockResolvedValue({ data: [], error: null }) }) }) }),
      });

      await expect(getActiveResidents()).resolves.toEqual({ data: [], error: null });
    },
  );

  it('returns residents when authorized', async () => {
    mocks.authorizeAnyPermission.mockResolvedValue(allowed);
    const rows = [{ id: 'r1', first_name: 'A', last_name: 'B', resident_code: 'R-1' }];
    const order = vi.fn().mockResolvedValue({ data: rows, error: null });
    mocks.createAdminClient.mockReturnValue({
      from: () => ({ select: () => ({ eq: () => ({ order }) }) }),
    });

    await expect(getActiveResidents()).resolves.toEqual({ data: rows, error: null });
  });
});

describe('email actions', () => {
  it('testEmail refuses an unauthorized caller and sends nothing', async () => {
    const result = await testEmail({ email: 'victim@example.com' });

    expect(result).toEqual({ success: false, error: 'Unauthorized: Missing permission' });
    expect(mocks.authorizePermission).toHaveBeenCalledWith(PERMISSIONS.SETTINGS_MANAGE_GENERAL);
    expect(mocks.sendEmail).not.toHaveBeenCalled();
  });

  it('testEmail sends for an authorized caller, recording who triggered it', async () => {
    mocks.authorizePermission.mockResolvedValue(allowed);
    mocks.getEstateEmailSettings.mockResolvedValue({ estateName: 'Estate' });
    mocks.sendEmail.mockResolvedValue({ success: true });

    await expect(testEmail({ email: 'ok@example.com' })).resolves.toEqual({ success: true });
    expect(mocks.sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ metadata: { triggeredBy: 'admin-1' } }),
    );
  });

  it('sendPaymentReceiptEmail refuses an unauthorized caller before reading or sending', async () => {
    const result = await sendPaymentReceiptEmail('pay-1', ['a@example.com'], { forceUnverified: true });

    expect(result).toMatchObject({ success: false, error: 'Unauthorized: Missing permission' });
    expect(mocks.authorizePermission).toHaveBeenCalledWith(PERMISSIONS.PAYMENTS_VIEW);
    expect(mocks.createServerSupabaseClient).not.toHaveBeenCalled();
    expect(mocks.sendEmail).not.toHaveBeenCalled();
  });

  it('sendPaymentReminders refuses an unauthorized caller before reading settings or sending', async () => {
    const result = await sendPaymentReminders();

    expect(result).toEqual({
      success: false,
      sent: 0,
      skipped: 0,
      failed: 0,
      errors: ['Unauthorized: Missing permission'],
    });
    expect(mocks.authorizePermission).toHaveBeenCalledWith(PERMISSIONS.SETTINGS_MANAGE_GENERAL);
    expect(mocks.getSettingValue).not.toHaveBeenCalled();
    expect(mocks.sendEmail).not.toHaveBeenCalled();
  });
});

describe('notification preference actions', () => {
  const input = {
    resident_id: 'resident-2',
    category: 'payment',
    channel: 'email',
    enabled: false,
  } as unknown as Parameters<typeof updateResidentPreference>[0];

  it('refuses an unauthenticated caller', async () => {
    mocks.createServerSupabaseClient.mockResolvedValue(sessionClient(null, null));

    await expect(getResidentPreferences('resident-2')).resolves.toMatchObject({ data: null });
    await expect(updateResidentPreference(input)).resolves.toMatchObject({ success: false });
    expect(mocks.getPreferences).not.toHaveBeenCalled();
    expect(mocks.updatePreference).not.toHaveBeenCalled();
  });

  it('refuses a resident reading or changing ANOTHER resident, without notifications permission', async () => {
    mocks.createServerSupabaseClient.mockResolvedValue(sessionClient({ id: 'u1' }, 'resident-1'));

    const read = await getResidentPreferences('resident-2');
    const write = await updateResidentPreference(input);

    expect(read).toEqual({ data: null, error: 'Unauthorized: Missing permission' });
    expect(write).toEqual({ success: false, error: 'Unauthorized: Missing permission' });
    expect(mocks.getPreferences).not.toHaveBeenCalled();
    expect(mocks.updatePreference).not.toHaveBeenCalled();
    expect(mocks.authorizeAnyPermission).toHaveBeenCalledWith([
      PERMISSIONS.NOTIFICATIONS_VIEW,
      PERMISSIONS.RESIDENTS_VIEW,
    ]);
    expect(mocks.authorizeAnyPermission).toHaveBeenCalledWith([
      PERMISSIONS.NOTIFICATIONS_MANAGE,
      PERMISSIONS.RESIDENTS_UPDATE,
    ]);
  });

  it('refuses a role-less account (no resident link, no permission)', async () => {
    mocks.createServerSupabaseClient.mockResolvedValue(sessionClient({ id: 'u1' }, null));

    await expect(updateResidentPreference(input)).resolves.toMatchObject({ success: false });
    expect(mocks.updatePreference).not.toHaveBeenCalled();
  });

  it('lets a resident act on their own preferences without any admin permission', async () => {
    mocks.createServerSupabaseClient.mockResolvedValue(sessionClient({ id: 'u2' }, 'resident-2'));
    mocks.getPreferences.mockResolvedValue([]);
    mocks.updatePreference.mockResolvedValue({ success: true });

    await expect(getResidentPreferences('resident-2')).resolves.toEqual({ data: [], error: null });
    await expect(updateResidentPreference(input)).resolves.toEqual({ success: true, error: null });
    expect(mocks.authorizeAnyPermission).not.toHaveBeenCalled();
    expect(mocks.logAudit).toHaveBeenCalledTimes(1);
  });

  it('lets an admin with the notifications permission act on any resident', async () => {
    mocks.createServerSupabaseClient.mockResolvedValue(sessionClient({ id: 'admin-1' }, null));
    mocks.getPreferences.mockResolvedValue([]);
    mocks.updatePreference.mockResolvedValue({ success: true });

    // Model a role holding exactly ONE permission; each entry of each any-of
    // list must be sufficient on its own.
    const holding = (perm: string) =>
      mocks.authorizeAnyPermission.mockImplementation(async (list: string[]) =>
        list.includes(perm) ? allowed : denied,
      );

    for (const perm of [PERMISSIONS.NOTIFICATIONS_VIEW, PERMISSIONS.RESIDENTS_VIEW]) {
      holding(perm);
      await expect(getResidentPreferences('resident-2')).resolves.toEqual({ data: [], error: null });
      // a read permission must not authorise a write
      await expect(updateResidentPreference(input)).resolves.toMatchObject({ success: false });
    }
    for (const perm of [PERMISSIONS.NOTIFICATIONS_MANAGE, PERMISSIONS.RESIDENTS_UPDATE]) {
      holding(perm);
      await expect(updateResidentPreference(input)).resolves.toEqual({ success: true, error: null });
    }
  });
});

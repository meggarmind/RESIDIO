'use server';

import { authorizePermission } from '@/lib/auth/authorize';
import { PERMISSIONS } from '@/lib/auth/action-roles';
import { createAdminClient } from '@/lib/supabase/server';
import type { SetupStatus } from '@/lib/settings/setup-checklist';

const SETTING_KEYS = [
  'estate_name',
  'estate_address',
  'email_enabled',
  'invoice_reminder_sms_enabled',
  'invoice_reminder_whatsapp_enabled',
  'invoice_reminders_enabled',
  'invoice_reminder_schedule',
];

const isFilled = (value: unknown) => typeof value === 'string' && value.trim() !== '';

/** Active schedule with at least one active step; an unsaved schedule falls back to the default, which has them. */
function hasActiveSchedule(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  try {
    const schedule = typeof value === 'string' ? JSON.parse(value) : value;
    return (
      schedule?.isActive !== false &&
      Array.isArray(schedule?.steps) &&
      schedule.steps.some((step: { isActive?: boolean }) => step?.isActive)
    );
  } catch {
    return false;
  }
}

/**
 * Which first-time setup steps the estate has done, for the checklist on the
 * Settings landing page (#786). Read-only: returns only yes/no per step.
 *
 * Read with the service client after the permission check so an admin whose
 * role cannot read, say, bank accounts still sees an accurate checklist.
 */
export async function getSetupStatus(): Promise<{ data: SetupStatus | null; error: string | null }> {
  const auth = await authorizePermission(PERMISSIONS.SETTINGS_VIEW);
  if (!auth.authorized) return { data: null, error: auth.error || 'Unauthorized' };

  const supabase = createAdminClient();
  const count = (table: 'streets' | 'house_types' | 'estate_bank_accounts' | 'billing_profiles') =>
    supabase.from(table).select('id', { count: 'exact', head: true });

  const [settings, streets, houseTypes, bankAccounts, billingProfiles, customRoles] = await Promise.all([
    supabase
      .from('system_settings')
      .select('key, value, category')
      .or(`category.eq.billing,key.in.(${SETTING_KEYS.join(',')})`),
    count('streets'),
    count('house_types'),
    count('estate_bank_accounts'),
    count('billing_profiles'),
    supabase
      .from('profiles')
      .select('id, role:app_roles!profiles_role_id_fkey!inner(is_system_role)', { count: 'exact', head: true })
      .eq('role.is_system_role', false),
  ]);

  const failed = [settings, streets, houseTypes, bankAccounts, billingProfiles, customRoles].find((r) => r.error);
  if (failed?.error) {
    console.error('[getSetupStatus] Failed to read setup status:', failed.error);
    return { data: null, error: 'Failed to load setup status' };
  }

  const rows = settings.data ?? [];
  const value = (key: string) => rows.find((row) => row.key === key)?.value;

  return {
    data: {
      estate: isFilled(value('estate_name')) && isFilled(value('estate_address')),
      street: (streets.count ?? 0) > 0,
      houseType: (houseTypes.count ?? 0) > 0,
      bankAccount: (bankAccounts.count ?? 0) > 0,
      billingProfile: (billingProfiles.count ?? 0) > 0,
      billingSettings: rows.some((row) => row.category === 'billing'),
      // Same defaults the email and reminder pages read: email is on unless switched off, SMS and WhatsApp only when switched on.
      notificationChannel:
        value('email_enabled') !== false ||
        value('invoice_reminder_sms_enabled') === true ||
        value('invoice_reminder_whatsapp_enabled') === true,
      reminderSchedule:
        value('invoice_reminders_enabled') !== false && hasActiveSchedule(value('invoice_reminder_schedule')),
      customRole: (customRoles.count ?? 0) > 0,
    },
    error: null,
  };
}

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

/** Billing rows as the migrations seed them; billing counts as set up once any of them holds another value. */
const SEEDED_BILLING_DEFAULTS: Record<string, unknown> = {
  bill_vacant_houses: false,
  bill_under_renovation_houses: false,
  bill_under_construction_houses: false,
  auto_generate_levies: true,
  pro_rata_first_month: true,
  invoice_due_window_days: 30,
  late_fee_enabled: false,
  late_fee_type: 'percentage',
  late_fee_amount: 5,
  grace_period_days: 7,
  payment_reminder_days: [7, 3, 1],
  late_fee_auto_apply: false,
  late_fee_application_day: 5,
  invoice_generation_dual_approval_enabled: false,
  invoice_generation_high_value_threshold: 1000000,
  invoice_generation_backfill_max_months: 12,
};

/** Compares stored values the way updateSetting writes them: booleans and numbers become strings. */
const normalize = (value: unknown) => (typeof value === 'object' ? JSON.stringify(value) : String(value));

const isFilled = (value: unknown) => typeof value === 'string' && value.trim() !== '';
/** updateSetting stores booleans as the strings 'true' and 'false'. */
const isOn = (value: unknown) => value === true || value === 'true';
const isOff = (value: unknown) => value === false || value === 'false';

/** Active schedule with at least one active step. */
function hasActiveSchedule(value: unknown): boolean {
  if (value === null || value === undefined) return false;
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
      .select('key, value')
      .in('key', [...SETTING_KEYS, ...Object.keys(SEEDED_BILLING_DEFAULTS)]),
    count('streets'),
    count('house_types'),
    count('estate_bank_accounts'),
    count('billing_profiles'),
    supabase
      .from('profiles')
      .select('id, app_role:app_roles!profiles_role_id_fkey!inner(is_system_role)', { count: 'exact', head: true })
      .eq('app_role.is_system_role', false),
  ]);

  const failed = [settings, streets, houseTypes, bankAccounts, billingProfiles, customRoles].find((r) => r.error);
  if (failed?.error) {
    console.error('[getSetupStatus] Failed to read setup status:', failed.error);
    return { data: null, error: 'Failed to load setup status' };
  }

  const rows = settings.data ?? [];
  const value = (key: string) => rows.find((r) => r.key === key)?.value;

  return {
    data: {
      estate: isFilled(value('estate_name')) && isFilled(value('estate_address')),
      street: (streets.count ?? 0) > 0,
      houseType: (houseTypes.count ?? 0) > 0,
      bankAccount: (bankAccounts.count ?? 0) > 0,
      billingProfile: (billingProfiles.count ?? 0) > 0,
      billingSettings: rows.some(
        (r) => r.key in SEEDED_BILLING_DEFAULTS && normalize(r.value) !== normalize(SEEDED_BILLING_DEFAULTS[r.key])
      ),
      notificationChannel:
        isOn(value('email_enabled')) ||
        isOn(value('invoice_reminder_sms_enabled')) ||
        isOn(value('invoice_reminder_whatsapp_enabled')),
      reminderSchedule:
        !isOff(value('invoice_reminders_enabled')) && hasActiveSchedule(value('invoice_reminder_schedule')),
      customRole: (customRoles.count ?? 0) > 0,
    },
    error: null,
  };
}

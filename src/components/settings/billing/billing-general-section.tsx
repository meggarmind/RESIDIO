'use client';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { AlertTriangle } from 'lucide-react';
import { useBillingSettings, useUpdateSetting } from '@/hooks/use-settings';
import { useAuth } from '@/lib/auth/auth-provider';
import { PERMISSIONS } from '@/lib/auth/action-roles';
import { ClearanceCopyCard } from '@/components/settings/clearance-copy-card';
import { NumericSettingInput } from '@/components/settings/numeric-setting-input';
import { SettingsRow } from '@/components/settings/settings-row';
import { SettingsSection } from '@/components/settings/settings-section';
import { SettingsSkeleton } from '@/components/settings/settings-states';
import { ControlWithEffect } from '@/components/settings/billing/row-effect';

const REMINDER_DAY_OPTIONS = [
  { value: 1, label: '1 day before' },
  { value: 3, label: '3 days before' },
  { value: 7, label: '7 days before' },
  { value: 14, label: '14 days before' },
  { value: 30, label: '30 days before' },
];

const FUTURE_INVOICE_RUNS = 'future invoice runs only. Invoices already issued are not changed.';

/** General rules of Billing rules (from the old Billing Settings page). Every control acts at once, as it did. */
export function BillingGeneralSection() {
  const { hasAnyPermission } = useAuth();
  // updateSetting enforces the billing area permissions for these keys, as the route does.
  const canEdit = hasAnyPermission([PERMISSIONS.SETTINGS_MANAGE_BILLING, PERMISSIONS.BILLING_MANAGE_PROFILES]);
  const { data: settings, isLoading } = useBillingSettings();
  const updateSettingMutation = useUpdateSetting();

  const settingsMap =
    settings?.reduce(
      (acc, s) => {
        let value = s.value;
        if (typeof value === 'string') {
          if (value === 'true') value = true;
          else if (value === 'false') value = false;
        }
        acc[s.key] = value;
        return acc;
      },
      {} as Record<string, unknown>,
    ) || {};

  const handleSettingToggle = (key: string, currentValue: boolean) => {
    updateSettingMutation.mutate({ key, value: !currentValue });
  };
  const busy = !canEdit || updateSettingMutation.isPending;

  // The stored value; 30 only when nothing is stored, matching invoice generation's default.
  const getDueWindowDays = (): number => {
    const value = settingsMap.invoice_due_window_days;
    if (typeof value === 'string') {
      return parseInt(value.replace(/"/g, '')) || 30;
    }
    if (typeof value === 'number') return value;
    return 30;
  };

  const getPaymentReminderDays = (): number[] => {
    const value = settingsMap.payment_reminder_days;
    if (Array.isArray(value)) return value;
    if (typeof value === 'string') {
      try {
        const parsed = JSON.parse(value);
        return Array.isArray(parsed) ? parsed : [7, 3, 1];
      } catch {
        return [7, 3, 1];
      }
    }
    return [7, 3, 1];
  };

  const handleReminderDayToggle = (day: number) => {
    const currentDays = getPaymentReminderDays();
    const newDays = currentDays.includes(day)
      ? currentDays.filter((d) => d !== day)
      : [...currentDays, day].sort((a, b) => b - a);
    updateSettingMutation.mutate({ key: 'payment_reminder_days', value: newDays });
  };

  const reminderDays = getPaymentReminderDays();
  const summary = isLoading
    ? 'Loading billing settings'
    : `Due ${getDueWindowDays()} days after issue, ${reminderDays.length} reminder ${reminderDays.length === 1 ? 'day' : 'days'} before the due date`;

  return (
    <SettingsSection id="general" title="General" summary={summary} instant>
      {isLoading ? (
        <div className="p-4 md:p-5">
          <SettingsSkeleton rows={6} />
        </div>
      ) : (
        <>
          <SettingsRow rowId="bill-vacant-houses">
            {({ controlId }) => (
              <ControlWithEffect effect={FUTURE_INVOICE_RUNS}>
                <Switch
                  id={controlId}
                  checked={settingsMap.bill_vacant_houses === true}
                  onCheckedChange={() => handleSettingToggle('bill_vacant_houses', settingsMap.bill_vacant_houses === true)}
                  disabled={busy}
                />
              </ControlWithEffect>
            )}
          </SettingsRow>
          <SettingsRow rowId="bill-under-renovation">
            {({ controlId }) => (
              <ControlWithEffect effect={FUTURE_INVOICE_RUNS}>
                <Switch
                  id={controlId}
                  checked={settingsMap.bill_under_renovation_houses === true}
                  onCheckedChange={() =>
                    handleSettingToggle('bill_under_renovation_houses', settingsMap.bill_under_renovation_houses === true)
                  }
                  disabled={busy}
                />
              </ControlWithEffect>
            )}
          </SettingsRow>
          <SettingsRow rowId="bill-under-construction">
            {({ controlId }) => (
              <ControlWithEffect effect={FUTURE_INVOICE_RUNS}>
                <Switch
                  id={controlId}
                  checked={settingsMap.bill_under_construction_houses === true}
                  onCheckedChange={() =>
                    handleSettingToggle('bill_under_construction_houses', settingsMap.bill_under_construction_houses === true)
                  }
                  disabled={busy}
                />
              </ControlWithEffect>
            )}
          </SettingsRow>
          <SettingsRow rowId="auto-generate-levies">
            {({ controlId }) => (
              <ControlWithEffect effect="levies charged from now on when a house is created or a resident is assigned, and Generate Retroactive Levies, which creates nothing while this is off. Levy invoices already issued are not changed.">
                <Switch
                  id={controlId}
                  checked={settingsMap.auto_generate_levies !== false}
                  onCheckedChange={() => handleSettingToggle('auto_generate_levies', settingsMap.auto_generate_levies !== false)}
                  disabled={busy}
                />
              </ControlWithEffect>
            )}
          </SettingsRow>
          <SettingsRow rowId="pro-rata-first-month">
            {({ controlId }) => (
              <ControlWithEffect effect="nothing at present: invoice generation does not read this setting.">
                <Switch
                  id={controlId}
                  checked={settingsMap.pro_rata_first_month !== false}
                  onCheckedChange={() => handleSettingToggle('pro_rata_first_month', settingsMap.pro_rata_first_month !== false)}
                  disabled={busy}
                />
              </ControlWithEffect>
            )}
          </SettingsRow>
          <SettingsRow rowId="invoice-due-window">
            {({ controlId }) => (
              <ControlWithEffect effect="invoices and levies created after the change. Due dates already set are not changed.">
                <NumericSettingInput
                  id={controlId}
                  min={1}
                  max={90}
                  integer
                  unit="days"
                  value={getDueWindowDays()}
                  disabled={!canEdit}
                  onCommit={(value) => updateSettingMutation.mutate({ key: 'invoice_due_window_days', value: String(value) })}
                />
              </ControlWithEffect>
            )}
          </SettingsRow>
          <SettingsRow rowId="payment-reminder-days" stacked>
            <div className="w-full space-y-4">
              <div className="grid gap-3" role="group" aria-label="Send reminders before due date">
                {REMINDER_DAY_OPTIONS.map((option) => (
                  <div key={option.value} className="flex min-h-11 items-center space-x-3 md:min-h-0">
                    {/* min-h-0!: the row stretches every button to 44px on a phone, which would warp the 16px box. */}
                    <Checkbox
                      id={`reminder-${option.value}`}
                      className="min-h-0!"
                      checked={reminderDays.includes(option.value)}
                      onCheckedChange={() => handleReminderDayToggle(option.value)}
                      disabled={busy}
                    />
                    <Label htmlFor={`reminder-${option.value}`} className="flex-1 cursor-pointer py-2 font-normal md:py-0">
                      {option.label}
                    </Label>
                  </div>
                ))}
              </div>
              <Alert className="border-warning/20 bg-warning/10">
                <AlertTriangle className="h-4 w-4 text-warning" />
                <AlertDescription className="text-foreground">
                  <p>
                    Send payment reminders now under{' '}
                    <a href="/settings/reminders#send-test" className="underline">Reminders</a> sends on these days. Automatic daily reminders before the due date send only on days that are both ticked here and a step in the{' '}
                    <a href="/settings/reminders#schedule" className="underline">Reminder schedule</a>.
                  </p>
                </AlertDescription>
              </Alert>
            </div>
          </SettingsRow>
          <SettingsRow rowId="clearance-copy-group" stacked>
            <div className="w-full">
              <ClearanceCopyCard
                groupId={typeof settingsMap.clearance_copy_recipient_group_id === 'string' ? settingsMap.clearance_copy_recipient_group_id : ''}
                canEdit={canEdit}
                pending={updateSettingMutation.isPending}
                onChange={(groupId) => updateSettingMutation.mutate({ key: 'clearance_copy_recipient_group_id', value: groupId })}
              />
            </div>
          </SettingsRow>
        </>
      )}
    </SettingsSection>
  );
}

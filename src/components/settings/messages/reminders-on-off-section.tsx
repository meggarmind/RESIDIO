'use client';

import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';
import { toast } from 'sonner';
import { Switch } from '@/components/ui/switch';
import { setRemindersEnabled } from '@/actions/notifications/reminder-config';
import { PERMISSIONS } from '@/lib/auth/action-roles';
import { useAuth } from '@/lib/auth/auth-provider';
import { SettingsRow } from '@/components/settings/settings-row';
import { SettingsSection } from '@/components/settings/settings-section';
import type { ReminderSettingsState } from '@/components/settings/messages/use-reminder-settings';

/** The master switch for the automatic invoice reminders. The switch acts at once, as it did on its own page. */
export function RemindersOnOffSection({
  enabled,
  setEnabled,
  schedule,
  lastRun,
  loading,
}: Pick<ReminderSettingsState, 'enabled' | 'setEnabled' | 'schedule' | 'lastRun' | 'loading'>) {
  const { hasPermission } = useAuth();
  const canManage = hasPermission(PERMISSIONS.NOTIFICATIONS_MANAGE);
  const steps = schedule?.steps ?? [];
  const activeSteps = steps.filter((step) => step.isActive).length;

  const handleToggle = async (checked: boolean) => {
    try {
      const result = await setRemindersEnabled(checked);
      if (result.success) {
        setEnabled(result.enabled!);
        toast.success(`Reminders ${result.enabled ? 'enabled' : 'disabled'}`);
      } else {
        toast.error(result.error || 'Failed to update');
      }
    } catch {
      toast.error('Failed to update reminder settings');
    }
  };

  const summary = loading
    ? 'Loading reminder settings'
    : `${enabled ? 'On' : 'Off'}, ${activeSteps} of ${steps.length} steps active, last run ${
        lastRun ? new Date(lastRun).toLocaleString() : 'never'
      }`;

  return (
    <SettingsSection
      id="on-off"
      title="On or off"
      summary={summary}
      permissions={[PERMISSIONS.NOTIFICATIONS_MANAGE]}
      instant
    >
      <SettingsRow rowId="reminders-enabled">
        {({ controlId }) => (
          <Switch id={controlId} checked={enabled} onCheckedChange={handleToggle} disabled={!canManage || loading} />
        )}
      </SettingsRow>
      <div className="space-y-2 border-t px-4 py-4 text-sm text-muted-foreground md:px-5">
        <p>
          The scheduled reminder job runs once a day and sends each active step on its selected channels. A WhatsApp step
          reaches only residents who have opted in to WhatsApp. After the due date, late fees may be applied by your billing
          rules.
        </p>
        <p>
          Queued and sent messages are live state, so they are in System:{' '}
          <Link href="/system/notification-queue" className="inline-flex items-center gap-0.5 font-medium text-primary underline">
            Notification Queue <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
          </Link>
          {' and '}
          <Link href="/system/notification-history" className="inline-flex items-center gap-0.5 font-medium text-primary underline">
            Notification History <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
          </Link>
          .
        </p>
      </div>
    </SettingsSection>
  );
}

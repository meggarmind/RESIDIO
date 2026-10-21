'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { getReminderSettings } from '@/actions/notifications/reminder-config';
import type { ReminderScheduleConfig } from '@/lib/notifications/types';

export interface ReminderSettingsState {
  schedule: ReminderScheduleConfig | null;
  lastRun: string | null;
  enabled: boolean;
  loading: boolean;
  setEnabled: (enabled: boolean) => void;
  reload: () => Promise<void>;
}

/** Reminder on/off, schedule and last run, loaded once for the sections of /settings/reminders. */
export function useReminderSettings(active: boolean): ReminderSettingsState {
  const [schedule, setSchedule] = useState<ReminderScheduleConfig | null>(null);
  const [lastRun, setLastRun] = useState<string | null>(null);
  const [enabled, setEnabled] = useState(true);
  const [loading, setLoading] = useState(active);

  const reload = useCallback(async () => {
    try {
      const settings = await getReminderSettings();
      setSchedule(settings.schedule);
      setLastRun(settings.lastRun);
      setEnabled(settings.enabled);
    } catch {
      toast.error('Failed to load reminder settings');
    } finally {
      setLoading(false);
    }
  }, []);

  // Only holders of notifications.manage may read these; the others get the send-now section alone.
  useEffect(() => {
    if (active) void reload();
  }, [active, reload]);

  return { schedule, lastRun, enabled, loading, setEnabled, reload };
}

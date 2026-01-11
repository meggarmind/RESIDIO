'use server';

/**
 * Invoice Reminder Configuration Actions
 *
 * Manages reminder schedules and configurations for invoice payment notifications.
 * Uses system_settings to store reminder schedule configurations.
 */

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getSettingValue } from '@/actions/settings/get-settings';
import { updateSetting } from '@/actions/settings/update-setting';
import { logAudit } from '@/lib/audit/logger';
import { authorizePermission } from '@/lib/auth/authorize';
import { PERMISSIONS } from '@/lib/auth/action-roles';

// Use SETTINGS_MANAGE_GENERAL for notification reminder settings
const REMINDER_PERMISSION = PERMISSIONS.SETTINGS_MANAGE_GENERAL;
import type {
  ReminderScheduleConfig,
  ReminderScheduleStep,
  NotificationChannel,
  ReminderEscalationLevel,
  DEFAULT_REMINDER_SCHEDULE,
} from '@/lib/notifications/types';

// Setting keys for reminder configuration
const SETTINGS_KEYS = {
  REMINDER_SCHEDULE: 'invoice_reminder_schedule',
  REMINDERS_ENABLED: 'invoice_reminders_enabled',
  SMS_ENABLED_FOR_REMINDERS: 'invoice_reminder_sms_enabled',
  WHATSAPP_ENABLED_FOR_REMINDERS: 'invoice_reminder_whatsapp_enabled',
  DEFAULT_CHANNELS: 'invoice_reminder_default_channels',
  LAST_RUN: 'invoice_reminder_last_run',
} as const;

/**
 * Get the current reminder schedule configuration
 */
export async function getReminderSchedule(): Promise<{
  data: ReminderScheduleConfig | null;
  error: string | null;
}> {
  try {
    const scheduleJson = await getSettingValue(SETTINGS_KEYS.REMINDER_SCHEDULE);

    if (!scheduleJson) {
      // Return default schedule if none configured
      const defaultSchedule = await getDefaultReminderSchedule();
      return { data: defaultSchedule, error: null };
    }

    // Parse if string
    const schedule = typeof scheduleJson === 'string'
      ? JSON.parse(scheduleJson)
      : scheduleJson;

    return { data: schedule as ReminderScheduleConfig, error: null };
  } catch (error) {
    console.error('[ReminderConfig] Failed to get schedule:', error);
    return { data: null, error: 'Failed to load reminder schedule' };
  }
}

/**
 * Get the default reminder schedule
 */
export async function getDefaultReminderSchedule(): Promise<ReminderScheduleConfig> {
  const now = new Date().toISOString();
  return {
    id: 'default',
    name: 'Standard Payment Reminder Schedule',
    description: 'Default escalating reminder schedule for invoice payments',
    isDefault: true,
    isActive: true,
    createdAt: now,
    updatedAt: now,
    steps: [
      {
        id: 'step-7-before',
        daysFromDue: -7,
        escalationLevel: 'friendly',
        channels: ['email'],
        isActive: true,
        priority: 5,
      },
      {
        id: 'step-3-before',
        daysFromDue: -3,
        escalationLevel: 'warning',
        channels: ['email'],
        isActive: true,
        priority: 4,
      },
      {
        id: 'step-1-before',
        daysFromDue: -1,
        escalationLevel: 'urgent',
        channels: ['email', 'sms'],
        isActive: true,
        priority: 3,
      },
      {
        id: 'step-due-date',
        daysFromDue: 0,
        escalationLevel: 'final',
        channels: ['email', 'sms'],
        isActive: true,
        priority: 2,
      },
      {
        id: 'step-1-after',
        daysFromDue: 1,
        escalationLevel: 'overdue',
        channels: ['email', 'sms'],
        isActive: true,
        priority: 1,
      },
      {
        id: 'step-3-after',
        daysFromDue: 3,
        escalationLevel: 'overdue',
        channels: ['email', 'sms'],
        isActive: true,
        priority: 1,
      },
      {
        id: 'step-7-after',
        daysFromDue: 7,
        escalationLevel: 'overdue',
        channels: ['email', 'sms'],
        isActive: true,
        priority: 1,
      },
    ],
  };
}

/**
 * Save reminder schedule configuration
 */
export async function saveReminderSchedule(
  schedule: Omit<ReminderScheduleConfig, 'id' | 'createdAt' | 'updatedAt'>
): Promise<{ success: boolean; data?: ReminderScheduleConfig; error?: string }> {
  // Check permission
  const auth = await authorizePermission(REMINDER_PERMISSION);
  if (!auth.authorized) {
    return { success: false, error: auth.error || 'Unauthorized' };
  }

  try {
    // Get existing schedule for audit
    const existingResult = await getReminderSchedule();
    const existing = existingResult.data;

    // Create full schedule object
    const now = new Date().toISOString();
    const fullSchedule: ReminderScheduleConfig = {
      id: existing?.id || `schedule-${Date.now()}`,
      createdAt: existing?.createdAt || now,
      updatedAt: now,
      ...schedule,
    };

    // Save to settings
    await updateSetting(SETTINGS_KEYS.REMINDER_SCHEDULE, JSON.stringify(fullSchedule));

    // Audit log
    await logAudit({
      action: existing ? 'UPDATE' : 'CREATE',
      entityType: 'system_settings',
      entityId: SETTINGS_KEYS.REMINDER_SCHEDULE,
      entityDisplay: 'Invoice Reminder Schedule',
      oldValues: existing ? JSON.parse(JSON.stringify(existing)) : undefined,
      newValues: JSON.parse(JSON.stringify(fullSchedule)),
    });

    return { success: true, data: fullSchedule };
  } catch (error) {
    console.error('[ReminderConfig] Failed to save schedule:', error);
    return { success: false, error: 'Failed to save reminder schedule' };
  }
}

/**
 * Add a step to the reminder schedule
 */
export async function addReminderStep(
  step: Omit<ReminderScheduleStep, 'id'>
): Promise<{ success: boolean; error?: string }> {
  const auth = await authorizePermission(REMINDER_PERMISSION);
  if (!auth.authorized) {
    return { success: false, error: auth.error || 'Unauthorized' };
  }

  try {
    const { data: schedule, error } = await getReminderSchedule();
    if (error || !schedule) {
      return { success: false, error: error || 'Failed to load schedule' };
    }

    // Check for duplicate daysFromDue
    const existingStep = schedule.steps.find(s => s.daysFromDue === step.daysFromDue);
    if (existingStep) {
      return { success: false, error: `A step already exists for ${step.daysFromDue} days from due date` };
    }

    // Add new step with generated ID
    const newStep: ReminderScheduleStep = {
      ...step,
      id: `step-${Date.now()}`,
    };

    schedule.steps.push(newStep);
    // Sort by daysFromDue
    schedule.steps.sort((a, b) => a.daysFromDue - b.daysFromDue);

    await saveReminderSchedule(schedule);

    return { success: true };
  } catch (error) {
    console.error('[ReminderConfig] Failed to add step:', error);
    return { success: false, error: 'Failed to add reminder step' };
  }
}

/**
 * Update a step in the reminder schedule
 */
export async function updateReminderStep(
  stepId: string,
  updates: Partial<Omit<ReminderScheduleStep, 'id'>>
): Promise<{ success: boolean; error?: string }> {
  const auth = await authorizePermission(REMINDER_PERMISSION);
  if (!auth.authorized) {
    return { success: false, error: auth.error || 'Unauthorized' };
  }

  try {
    const { data: schedule, error } = await getReminderSchedule();
    if (error || !schedule) {
      return { success: false, error: error || 'Failed to load schedule' };
    }

    const stepIndex = schedule.steps.findIndex(s => s.id === stepId);
    if (stepIndex === -1) {
      return { success: false, error: 'Step not found' };
    }

    // Check for duplicate daysFromDue (if being changed)
    if (updates.daysFromDue !== undefined) {
      const existingStep = schedule.steps.find(
        s => s.id !== stepId && s.daysFromDue === updates.daysFromDue
      );
      if (existingStep) {
        return { success: false, error: `A step already exists for ${updates.daysFromDue} days from due date` };
      }
    }

    // Update the step
    schedule.steps[stepIndex] = {
      ...schedule.steps[stepIndex],
      ...updates,
    };

    // Re-sort by daysFromDue
    schedule.steps.sort((a, b) => a.daysFromDue - b.daysFromDue);

    await saveReminderSchedule(schedule);

    return { success: true };
  } catch (error) {
    console.error('[ReminderConfig] Failed to update step:', error);
    return { success: false, error: 'Failed to update reminder step' };
  }
}

/**
 * Remove a step from the reminder schedule
 */
export async function removeReminderStep(
  stepId: string
): Promise<{ success: boolean; error?: string }> {
  const auth = await authorizePermission(REMINDER_PERMISSION);
  if (!auth.authorized) {
    return { success: false, error: auth.error || 'Unauthorized' };
  }

  try {
    const { data: schedule, error } = await getReminderSchedule();
    if (error || !schedule) {
      return { success: false, error: error || 'Failed to load schedule' };
    }

    const stepIndex = schedule.steps.findIndex(s => s.id === stepId);
    if (stepIndex === -1) {
      return { success: false, error: 'Step not found' };
    }

    schedule.steps.splice(stepIndex, 1);

    await saveReminderSchedule(schedule);

    return { success: true };
  } catch (error) {
    console.error('[ReminderConfig] Failed to remove step:', error);
    return { success: false, error: 'Failed to remove reminder step' };
  }
}

/**
 * Toggle step active status
 */
export async function toggleReminderStep(
  stepId: string
): Promise<{ success: boolean; error?: string }> {
  const auth = await authorizePermission(REMINDER_PERMISSION);
  if (!auth.authorized) {
    return { success: false, error: auth.error || 'Unauthorized' };
  }

  try {
    const { data: schedule, error } = await getReminderSchedule();
    if (error || !schedule) {
      return { success: false, error: error || 'Failed to load schedule' };
    }

    const step = schedule.steps.find(s => s.id === stepId);
    if (!step) {
      return { success: false, error: 'Step not found' };
    }

    step.isActive = !step.isActive;

    await saveReminderSchedule(schedule);

    return { success: true };
  } catch (error) {
    console.error('[ReminderConfig] Failed to toggle step:', error);
    return { success: false, error: 'Failed to toggle reminder step' };
  }
}

/**
 * Reset to default schedule
 */
export async function resetToDefaultSchedule(): Promise<{
  success: boolean;
  data?: ReminderScheduleConfig;
  error?: string;
}> {
  const auth = await authorizePermission(REMINDER_PERMISSION);
  if (!auth.authorized) {
    return { success: false, error: auth.error || 'Unauthorized' };
  }

  try {
    const defaultSchedule = await getDefaultReminderSchedule();
    return await saveReminderSchedule(defaultSchedule);
  } catch (error) {
    console.error('[ReminderConfig] Failed to reset schedule:', error);
    return { success: false, error: 'Failed to reset to default schedule' };
  }
}

/**
 * Check if invoice reminders are enabled
 */
export async function areRemindersEnabled(): Promise<boolean> {
  const enabled = await getSettingValue(SETTINGS_KEYS.REMINDERS_ENABLED);
  return enabled !== false; // Default to true if not set
}

/**
 * Toggle invoice reminders enabled/disabled
 */
export async function toggleRemindersEnabled(): Promise<{
  success: boolean;
  enabled?: boolean;
  error?: string;
}> {
  const auth = await authorizePermission(REMINDER_PERMISSION);
  if (!auth.authorized) {
    return { success: false, error: auth.error || 'Unauthorized' };
  }

  try {
    const currentEnabled = await areRemindersEnabled();
    const newEnabled = !currentEnabled;

    await updateSetting(SETTINGS_KEYS.REMINDERS_ENABLED, newEnabled);

    await logAudit({
      action: newEnabled ? 'ACTIVATE' : 'DEACTIVATE',
      entityType: 'system_settings',
      entityId: SETTINGS_KEYS.REMINDERS_ENABLED,
      entityDisplay: 'Invoice Reminders',
      oldValues: { enabled: currentEnabled },
      newValues: { enabled: newEnabled },
    });

    return { success: true, enabled: newEnabled };
  } catch (error) {
    console.error('[ReminderConfig] Failed to toggle reminders:', error);
    return { success: false, error: 'Failed to toggle reminders' };
  }
}

/**
 * Get reminder settings summary
 */
export async function getReminderSettings(): Promise<{
  enabled: boolean;
  smsEnabled: boolean;
  whatsappEnabled: boolean;
  schedule: ReminderScheduleConfig | null;
  lastRun: string | null;
}> {
  const [enabled, smsEnabled, whatsappEnabled, scheduleResult, lastRun] = await Promise.all([
    areRemindersEnabled(),
    getSettingValue(SETTINGS_KEYS.SMS_ENABLED_FOR_REMINDERS),
    getSettingValue(SETTINGS_KEYS.WHATSAPP_ENABLED_FOR_REMINDERS),
    getReminderSchedule(),
    getSettingValue(SETTINGS_KEYS.LAST_RUN),
  ]);

  return {
    enabled,
    smsEnabled: smsEnabled === true,
    whatsappEnabled: whatsappEnabled === true,
    schedule: scheduleResult.data,
    lastRun,
  };
}

/**
 * Get steps that should trigger for a given daysFromDue value
 */
export async function getActiveStepsForDay(
  daysFromDue: number
): Promise<ReminderScheduleStep[]> {
  const { data: schedule } = await getReminderSchedule();
  if (!schedule) return [];

  return schedule.steps.filter(
    step => step.isActive && step.daysFromDue === daysFromDue
  );
}

/**
 * Get all days that have active reminder steps
 */
export async function getActiveDays(): Promise<number[]> {
  const { data: schedule } = await getReminderSchedule();
  if (!schedule) return [];

  return schedule.steps
    .filter(step => step.isActive)
    .map(step => step.daysFromDue)
    .sort((a, b) => a - b);
}

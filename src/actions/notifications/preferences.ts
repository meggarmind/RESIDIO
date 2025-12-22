'use server';

/**
 * Server Actions for Notification Preferences
 *
 * Manage resident notification preferences.
 */

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { logAudit } from '@/lib/audit/logger';
import {
  getPreferences,
  getPreferencesByCategory,
  getPreference,
  updatePreference,
  updatePreferences,
  createDefaultPreferences,
  deletePreferences,
  setAllChannelsForCategory,
  setAllCategoriesForChannel,
} from '@/lib/notifications/preferences';
import type {
  NotificationPreference,
  PreferencesByCategory,
  UpdatePreferencesInput,
  NotificationCategory,
  NotificationChannel,
} from '@/lib/notifications/types';

/**
 * Get all preferences for a resident
 */
export async function getResidentPreferences(
  residentId: string
): Promise<{ data: NotificationPreference[] | null; error: string | null }> {
  try {
    const preferences = await getPreferences(residentId);
    return { data: preferences, error: null };
  } catch (error) {
    return {
      data: null,
      error: error instanceof Error ? error.message : 'Failed to get preferences',
    };
  }
}

/**
 * Get preferences organized by category
 */
export async function getResidentPreferencesByCategory(
  residentId: string
): Promise<{ data: PreferencesByCategory[] | null; error: string | null }> {
  try {
    const preferences = await getPreferencesByCategory(residentId);
    return { data: preferences, error: null };
  } catch (error) {
    return {
      data: null,
      error: error instanceof Error ? error.message : 'Failed to get preferences',
    };
  }
}

/**
 * Update a single preference
 */
export async function updateResidentPreference(
  input: UpdatePreferencesInput
): Promise<{ success: boolean; error: string | null }> {
  try {
    const result = await updatePreference(input);

    if (result.success) {
      // Audit log
      await logAudit({
        action: 'UPDATE',
        entityType: 'notification_preferences',
        entityId: input.resident_id,
        entityDisplay: `${input.category} via ${input.channel}`,
        newValues: {
          enabled: input.enabled,
          frequency: input.frequency,
          quiet_hours_start: input.quiet_hours_start,
          quiet_hours_end: input.quiet_hours_end,
        },
      });
    }

    return { success: result.success, error: result.error || null };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update preference',
    };
  }
}

/**
 * Update multiple preferences at once
 */
export async function updateResidentPreferences(
  inputs: UpdatePreferencesInput[]
): Promise<{ success: boolean; updated: number; errors: string[] }> {
  try {
    const result = await updatePreferences(inputs);

    if (result.success && result.updated > 0) {
      // Audit log
      await logAudit({
        action: 'UPDATE',
        entityType: 'notification_preferences',
        entityId: inputs[0]?.resident_id || 'batch',
        entityDisplay: `Batch update (${result.updated} preferences)`,
        newValues: { count: result.updated },
      });
    }

    return result;
  } catch (error) {
    return {
      success: false,
      updated: 0,
      errors: [error instanceof Error ? error.message : 'Failed to update preferences'],
    };
  }
}

/**
 * Initialize default preferences for a new resident
 */
export async function initializeResidentPreferences(
  residentId: string
): Promise<{ success: boolean; created: number; error: string | null }> {
  try {
    const result = await createDefaultPreferences(residentId);

    if (result.success && result.created > 0) {
      // Audit log
      await logAudit({
        action: 'CREATE',
        entityType: 'notification_preferences',
        entityId: residentId,
        entityDisplay: `Default preferences for ${residentId}`,
        newValues: { count: result.created },
      });
    }

    return { success: result.success, created: result.created, error: result.error || null };
  } catch (error) {
    return {
      success: false,
      created: 0,
      error: error instanceof Error ? error.message : 'Failed to create preferences',
    };
  }
}

/**
 * Enable/disable all channels for a category
 */
export async function toggleCategoryNotifications(params: {
  residentId: string;
  category: NotificationCategory;
  enabled: boolean;
}): Promise<{ success: boolean; updated: number; error: string | null }> {
  try {
    const result = await setAllChannelsForCategory(params);

    if (result.success) {
      // Audit log
      await logAudit({
        action: params.enabled ? 'ACTIVATE' : 'DEACTIVATE',
        entityType: 'notification_preferences',
        entityId: params.residentId,
        entityDisplay: `${params.category} notifications`,
        newValues: { enabled: params.enabled, category: params.category },
      });
    }

    return { success: result.success, updated: result.updated, error: null };
  } catch (error) {
    return {
      success: false,
      updated: 0,
      error: error instanceof Error ? error.message : 'Failed to update preferences',
    };
  }
}

/**
 * Enable/disable all categories for a channel
 */
export async function toggleChannelNotifications(params: {
  residentId: string;
  channel: NotificationChannel;
  enabled: boolean;
}): Promise<{ success: boolean; updated: number; error: string | null }> {
  try {
    const result = await setAllCategoriesForChannel(params);

    if (result.success) {
      // Audit log
      await logAudit({
        action: params.enabled ? 'ACTIVATE' : 'DEACTIVATE',
        entityType: 'notification_preferences',
        entityId: params.residentId,
        entityDisplay: `${params.channel} notifications`,
        newValues: { enabled: params.enabled, channel: params.channel },
      });
    }

    return { success: result.success, updated: result.updated, error: null };
  } catch (error) {
    return {
      success: false,
      updated: 0,
      error: error instanceof Error ? error.message : 'Failed to update preferences',
    };
  }
}

/**
 * Reset preferences to defaults
 */
export async function resetResidentPreferences(
  residentId: string
): Promise<{ success: boolean; error: string | null }> {
  try {
    // Delete existing
    const deleteResult = await deletePreferences(residentId);
    if (!deleteResult.success) {
      return { success: false, error: deleteResult.error || null };
    }

    // Create defaults
    const createResult = await createDefaultPreferences(residentId);

    if (createResult.success) {
      // Audit log
      await logAudit({
        action: 'UPDATE',
        entityType: 'notification_preferences',
        entityId: residentId,
        entityDisplay: `Reset preferences for ${residentId}`,
        newValues: { reset: true, created: createResult.created },
      });
    }

    return { success: createResult.success, error: createResult.error || null };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to reset preferences',
    };
  }
}

/**
 * Get preference summary (for dashboard/overview)
 */
export async function getPreferenceSummary(
  residentId: string
): Promise<{
  data: {
    emailEnabled: boolean;
    smsEnabled: boolean;
    whatsappEnabled: boolean;
    totalEnabled: number;
    totalDisabled: number;
  } | null;
  error: string | null;
}> {
  try {
    const preferences = await getPreferences(residentId);

    const summary = {
      emailEnabled: preferences.some((p) => p.channel === 'email' && p.enabled),
      smsEnabled: preferences.some((p) => p.channel === 'sms' && p.enabled),
      whatsappEnabled: preferences.some((p) => p.channel === 'whatsapp' && p.enabled),
      totalEnabled: preferences.filter((p) => p.enabled).length,
      totalDisabled: preferences.filter((p) => !p.enabled).length,
    };

    return { data: summary, error: null };
  } catch (error) {
    return {
      data: null,
      error: error instanceof Error ? error.message : 'Failed to get summary',
    };
  }
}

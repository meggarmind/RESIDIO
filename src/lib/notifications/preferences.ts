/**
 * Notification Preferences Management
 *
 * Check and manage resident notification preferences.
 * Determines if a resident wants to receive a specific notification.
 */

import { createAdminClient } from '@/lib/supabase/server';
import type {
  NotificationChannel,
  NotificationCategory,
  NotificationPreference,
  PreferenceFrequency,
  UpdatePreferencesInput,
  PreferencesByCategory,
} from './types';
import { isChannelImplemented, NOTIFICATION_CATEGORY_LABELS } from './types';

/**
 * Default preferences for new residents
 */
export const DEFAULT_PREFERENCES: Array<{
  category: NotificationCategory;
  channel: NotificationChannel;
  enabled: boolean;
  frequency: PreferenceFrequency;
}> = [
  // Email preferences (enabled by default)
  { category: 'payment', channel: 'email', enabled: true, frequency: 'all' },
  { category: 'invoice', channel: 'email', enabled: true, frequency: 'all' },
  { category: 'security', channel: 'email', enabled: true, frequency: 'all' },
  { category: 'general', channel: 'email', enabled: true, frequency: 'all' },
  // SMS preferences (disabled by default - not yet implemented)
  { category: 'payment', channel: 'sms', enabled: false, frequency: 'all' },
  { category: 'invoice', channel: 'sms', enabled: false, frequency: 'all' },
  { category: 'security', channel: 'sms', enabled: false, frequency: 'all' },
  { category: 'general', channel: 'sms', enabled: false, frequency: 'all' },
  // WhatsApp preferences (disabled by default - not yet implemented)
  { category: 'payment', channel: 'whatsapp', enabled: false, frequency: 'all' },
  { category: 'invoice', channel: 'whatsapp', enabled: false, frequency: 'all' },
  { category: 'security', channel: 'whatsapp', enabled: false, frequency: 'all' },
  { category: 'general', channel: 'whatsapp', enabled: false, frequency: 'all' },
];

/**
 * Create default preferences for a new resident
 */
export async function createDefaultPreferences(
  residentId: string
): Promise<{ success: boolean; created: number; error?: string }> {
  const supabase = createAdminClient();

  const preferencesToInsert = DEFAULT_PREFERENCES.map((pref) => ({
    resident_id: residentId,
    category: pref.category,
    channel: pref.channel,
    enabled: pref.enabled,
    frequency: pref.frequency,
  }));

  const { data, error } = await supabase
    .from('notification_preferences')
    .insert(preferencesToInsert)
    .select('id');

  if (error) {
    // If it's a unique violation, preferences already exist
    if (error.code === '23505') {
      return { success: true, created: 0 };
    }
    return { success: false, created: 0, error: error.message };
  }

  return { success: true, created: data?.length || 0 };
}

/**
 * Get all preferences for a resident
 */
export async function getPreferences(
  residentId: string
): Promise<NotificationPreference[]> {
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from('notification_preferences')
    .select('*')
    .eq('resident_id', residentId)
    .order('category')
    .order('channel');

  if (error) {
    console.error('[Preferences] Failed to fetch preferences:', error);
    return [];
  }

  return (data as NotificationPreference[]) || [];
}

/**
 * Get preferences organized by category
 */
export async function getPreferencesByCategory(
  residentId: string
): Promise<PreferencesByCategory[]> {
  const preferences = await getPreferences(residentId);
  const categories: NotificationCategory[] = ['payment', 'invoice', 'security', 'general'];

  return categories.map((category) => ({
    category,
    channels: (['email', 'sms', 'whatsapp'] as NotificationChannel[]).map((channel) => {
      const pref = preferences.find(
        (p) => p.category === category && p.channel === channel
      );
      return {
        channel,
        enabled: pref?.enabled ?? false,
        frequency: pref?.frequency ?? 'none',
        implemented: isChannelImplemented(channel),
      };
    }),
  }));
}

/**
 * Get a specific preference
 */
export async function getPreference(params: {
  residentId: string;
  category: NotificationCategory;
  channel: NotificationChannel;
}): Promise<NotificationPreference | null> {
  const { residentId, category, channel } = params;
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from('notification_preferences')
    .select('*')
    .eq('resident_id', residentId)
    .eq('category', category)
    .eq('channel', channel)
    .single();

  if (error) {
    return null;
  }

  return data as NotificationPreference;
}

/**
 * Update or create a preference
 */
export async function updatePreference(
  input: UpdatePreferencesInput
): Promise<{ success: boolean; error?: string }> {
  const supabase = createAdminClient();

  // Check if preference exists
  const existing = await getPreference({
    residentId: input.resident_id,
    category: input.category,
    channel: input.channel,
  });

  if (existing) {
    // Update existing
    const { error } = await supabase
      .from('notification_preferences')
      .update({
        enabled: input.enabled ?? existing.enabled,
        frequency: input.frequency ?? existing.frequency,
        quiet_hours_start: input.quiet_hours_start,
        quiet_hours_end: input.quiet_hours_end,
      })
      .eq('id', existing.id);

    if (error) {
      return { success: false, error: error.message };
    }
  } else {
    // Create new
    const { error } = await supabase.from('notification_preferences').insert({
      resident_id: input.resident_id,
      category: input.category,
      channel: input.channel,
      enabled: input.enabled ?? true,
      frequency: input.frequency ?? 'all',
      quiet_hours_start: input.quiet_hours_start,
      quiet_hours_end: input.quiet_hours_end,
    });

    if (error) {
      return { success: false, error: error.message };
    }
  }

  return { success: true };
}

/**
 * Batch update preferences
 */
export async function updatePreferences(
  inputs: UpdatePreferencesInput[]
): Promise<{ success: boolean; updated: number; errors: string[] }> {
  const results = await Promise.all(inputs.map(updatePreference));

  const errors = results
    .filter((r) => !r.success && r.error)
    .map((r) => r.error!);

  return {
    success: errors.length === 0,
    updated: results.filter((r) => r.success).length,
    errors,
  };
}

/**
 * Check if a resident wants to receive a specific notification
 *
 * Returns true if:
 * - No preference exists (default to allowing)
 * - Preference exists and is enabled
 * - Frequency allows it
 * - Not in quiet hours
 */
export async function shouldSendToResident(params: {
  residentId: string;
  category: NotificationCategory;
  channel: NotificationChannel;
}): Promise<{
  shouldSend: boolean;
  reason?: string;
  preference?: NotificationPreference;
}> {
  const { residentId, category, channel } = params;

  // Check if channel is implemented
  if (!isChannelImplemented(channel)) {
    return {
      shouldSend: false,
      reason: `Channel '${channel}' is not yet implemented`,
    };
  }

  // Get the preference
  const preference = await getPreference({ residentId, category, channel });

  // No preference = default to allowing
  if (!preference) {
    return { shouldSend: true, reason: 'No preference set (default: allow)' };
  }

  // Check if enabled
  if (!preference.enabled) {
    return {
      shouldSend: false,
      reason: `${NOTIFICATION_CATEGORY_LABELS[category]} via ${channel} is disabled`,
      preference,
    };
  }

  // Check frequency
  if (preference.frequency === 'none') {
    return {
      shouldSend: false,
      reason: 'Frequency set to none',
      preference,
    };
  }

  // Check quiet hours (if both are set)
  if (preference.quiet_hours_start && preference.quiet_hours_end) {
    const now = new Date();
    const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

    if (isInQuietHours(currentTime, preference.quiet_hours_start, preference.quiet_hours_end)) {
      return {
        shouldSend: false,
        reason: `In quiet hours (${preference.quiet_hours_start} - ${preference.quiet_hours_end})`,
        preference,
      };
    }
  }

  // All checks passed
  return {
    shouldSend: true,
    preference,
  };
}

/**
 * Check if current time is within quiet hours
 */
function isInQuietHours(
  currentTime: string, // HH:MM
  start: string, // HH:MM:SS
  end: string // HH:MM:SS
): boolean {
  // Normalize to HH:MM
  const normalize = (t: string) => t.slice(0, 5);
  const current = normalize(currentTime);
  const quietStart = normalize(start);
  const quietEnd = normalize(end);

  // Handle overnight quiet hours (e.g., 22:00 to 06:00)
  if (quietStart > quietEnd) {
    // Quiet hours span midnight
    return current >= quietStart || current <= quietEnd;
  }

  // Normal quiet hours (e.g., 13:00 to 14:00)
  return current >= quietStart && current <= quietEnd;
}

/**
 * Delete all preferences for a resident
 * (Useful when deleting a resident)
 */
export async function deletePreferences(
  residentId: string
): Promise<{ success: boolean; deleted: number; error?: string }> {
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from('notification_preferences')
    .delete()
    .eq('resident_id', residentId)
    .select('id');

  if (error) {
    return { success: false, deleted: 0, error: error.message };
  }

  return { success: true, deleted: data?.length || 0 };
}

/**
 * Enable/disable all notifications for a category
 */
export async function setAllChannelsForCategory(params: {
  residentId: string;
  category: NotificationCategory;
  enabled: boolean;
}): Promise<{ success: boolean; updated: number }> {
  const { residentId, category, enabled } = params;
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from('notification_preferences')
    .update({ enabled })
    .eq('resident_id', residentId)
    .eq('category', category)
    .select('id');

  if (error) {
    console.error('[Preferences] Failed to update category:', error);
    return { success: false, updated: 0 };
  }

  return { success: true, updated: data?.length || 0 };
}

/**
 * Enable/disable all notifications for a channel
 */
export async function setAllCategoriesForChannel(params: {
  residentId: string;
  channel: NotificationChannel;
  enabled: boolean;
}): Promise<{ success: boolean; updated: number }> {
  const { residentId, channel, enabled } = params;
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from('notification_preferences')
    .update({ enabled })
    .eq('resident_id', residentId)
    .eq('channel', channel)
    .select('id');

  if (error) {
    console.error('[Preferences] Failed to update channel:', error);
    return { success: false, updated: 0 };
  }

  return { success: true, updated: data?.length || 0 };
}

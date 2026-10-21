'use server';

/**
 * Server Actions for Notification Templates
 *
 * Reads, plus the single write: editing the wording of one of the resident emails (#907).
 */

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { authorizePermission } from '@/lib/auth/authorize';
import { PERMISSIONS } from '@/lib/auth/action-roles';
import { logAudit } from '@/lib/audit/logger';
import { z } from 'zod';
import { EVENT_KEYS, getToggleableChannels, isEventKey, validateOverrides } from '@/lib/notifications/event-content-registry';
import type { NotificationTemplate } from '@/lib/notifications/types';

/**
 * Get all notification templates
 */
export async function getTemplates(options?: {
  category?: string;
  channel?: string;
  activeOnly?: boolean;
}): Promise<{ data: NotificationTemplate[] | null; error: string | null }> {
  const supabase = await createServerSupabaseClient();

  let query = supabase
    .from('notification_templates')
    .select('*')
    .order('category')
    .order('display_name');

  if (options?.category) {
    query = query.eq('category', options.category);
  }

  if (options?.channel) {
    query = query.eq('channel', options.channel);
  }

  if (options?.activeOnly) {
    query = query.eq('is_active', true);
  }

  const { data, error } = await query;

  if (error) {
    return { data: null, error: error.message };
  }

  return { data: data as NotificationTemplate[], error: null };
}

/**
 * Get a single template by ID
 */
export async function getTemplate(
  id: string
): Promise<{ data: NotificationTemplate | null; error: string | null }> {
  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase
    .from('notification_templates')
    .select('*')
    .eq('id', id)
    .single();

  if (error) {
    return { data: null, error: error.message };
  }

  return { data: data as NotificationTemplate, error: null };
}

/**
 * Get a template by name
 */
export async function getTemplateByName(
  name: string
): Promise<{ data: NotificationTemplate | null; error: string | null }> {
  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase
    .from('notification_templates')
    .select('*')
    .eq('name', name)
    .single();

  if (error) {
    return { data: null, error: error.message };
  }

  return { data: data as NotificationTemplate, error: null };
}

const updateEventContentSchema = z.object({
  event: z.enum(EVENT_KEYS),
  channel: z.enum(['email', 'whatsapp']),
  overrides: z.record(z.string(), z.string().max(5000)),
});

/**
 * Save the admin's wording for one event on one channel (email, or Chatmaid WhatsApp text). `overrides` replaces the stored map; a blank value
 * (or a key left out) means "use the code default", which is how Reset to default works.
 */
export async function updateEventContent(
  event: string,
  channel: string,
  overrides: Record<string, string>
): Promise<{ data: NotificationTemplate | null; error: string | null }> {
  const auth = await authorizePermission(PERMISSIONS.NOTIFICATIONS_MANAGE);
  if (!auth.authorized) return { data: null, error: auth.error || 'Unauthorized' };

  const parsed = updateEventContentSchema.safeParse({ event, channel, overrides });
  if (!parsed.success) {
    return { data: null, error: parsed.error.issues[0]?.message || 'Invalid input' };
  }

  const checked = validateOverrides(parsed.data.event, parsed.data.overrides, parsed.data.channel);
  if (!checked.ok) return { data: null, error: checked.errors.join('; ') };

  const cleaned = Object.fromEntries(
    Object.entries(parsed.data.overrides).filter(([, value]) => value.trim() !== '')
  );

  const supabase = await createServerSupabaseClient();

  const { data: oldRow, error: readError } = await supabase
    .from('notification_templates')
    .select('*')
    .eq('event', parsed.data.event)
    .eq('channel', parsed.data.channel)
    .maybeSingle();

  if (readError) return { data: null, error: readError.message };
  if (!oldRow) return { data: null, error: 'Template not found' };

  const { data, error } = await supabase
    .from('notification_templates')
    .update({ overrides: cleaned })
    .eq('id', oldRow.id)
    .select('*')
    .single();

  if (error) return { data: null, error: error.message };

  await logAudit({
    action: 'UPDATE',
    entityType: 'notification_templates',
    entityId: oldRow.id,
    entityDisplay: data.display_name,
    oldValues: { overrides: (oldRow as { overrides?: unknown }).overrides ?? {} },
    newValues: { overrides: cleaned },
  });

  return { data: data as unknown as NotificationTemplate, error: null };
}


/**
 * Switch one channel of a payment receipt, welcome or invoice message on or off (#909). Stored as
 * `is_active` on that event's `notification_templates` row; senders read it through `isEventChannelEnabled`.
 */
export async function setEventChannelEnabled(
  event: string,
  channel: string,
  enabled: boolean
): Promise<{ data: NotificationTemplate | null; error: string | null }> {
  const auth = await authorizePermission(PERMISSIONS.NOTIFICATIONS_MANAGE);
  if (!auth.authorized) return { data: null, error: auth.error || 'Unauthorized' };

  if (!isEventKey(event) || !(getToggleableChannels(event) as string[]).includes(channel)) {
    return { data: null, error: 'This channel cannot be switched for this message' };
  }

  const supabase = await createServerSupabaseClient();

  const { data: oldRow, error: readError } = await supabase
    .from('notification_templates')
    .select('*')
    .eq('event', event)
    .eq('channel', channel)
    .maybeSingle();

  if (readError) return { data: null, error: readError.message };
  if (!oldRow) return { data: null, error: 'Template not found' };

  const { data, error } = await supabase
    .from('notification_templates')
    .update({ is_active: enabled })
    .eq('id', oldRow.id)
    .select('*')
    .single();

  if (error) return { data: null, error: error.message };

  await logAudit({
    action: enabled ? 'ACTIVATE' : 'DEACTIVATE',
    entityType: 'notification_templates',
    entityId: oldRow.id,
    entityDisplay: data.display_name,
    oldValues: { is_active: oldRow.is_active },
    newValues: { is_active: enabled },
  });

  return { data: data as unknown as NotificationTemplate, error: null };
}

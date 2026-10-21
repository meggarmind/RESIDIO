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
import { EVENT_KEYS, validateOverrides } from '@/lib/notifications/event-content-registry';
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
  channel: z.literal('email'),
  overrides: z.record(z.string(), z.string().max(5000)),
});

/**
 * Save the admin's wording for one email event. `overrides` replaces the stored map; a blank value
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

  const checked = validateOverrides(parsed.data.event, parsed.data.overrides);
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


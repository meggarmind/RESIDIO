import { createAdminClient } from '@/lib/supabase/server';
import {
  getEventDefaults,
  mergeEventContent,
  type ContentChannel,
  type EventKey,
} from './event-content-registry';

export * from './event-content-registry';

/**
 * Merged (override over default) wording for one event, as raw `{{variable}}` templates.
 * Service-role read: callers include the reminder and invoice crons, which have no user.
 * Never throws and never blocks a send: any read problem logs and falls back to the code defaults.
 */
export async function getEventContent(
  event: EventKey,
  channel: ContentChannel = 'email'
): Promise<Record<string, string>> {
  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from('notification_templates')
      .select('overrides')
      .eq('event', event)
      .eq('channel', channel)
      .maybeSingle();

    if (error) {
      console.error('[EventContent] read failed, using defaults', { event, channel, error });
      return getEventDefaults(event, channel);
    }
    return mergeEventContent(event, data?.overrides, channel);
  } catch (error) {
    console.error('[EventContent] read threw, using defaults', { event, channel, error });
    return getEventDefaults(event, channel);
  }
}

/**
 * Whether an admin has this event's channel switched on (`notification_templates.is_active`, #909).
 * A missing row, a read error or a throw all mean "on": an unreadable setting must not silence a
 * resident message, and "on" is what the code did before the toggle existed.
 */
export async function isEventChannelEnabled(event: EventKey, channel: ContentChannel): Promise<boolean> {
  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from('notification_templates')
      .select('is_active')
      .eq('event', event)
      .eq('channel', channel)
      .maybeSingle();

    if (error) {
      console.error('[EventContent] channel toggle read failed, treating as on', { event, channel, error });
      return true;
    }
    return data?.is_active !== false;
  } catch (error) {
    console.error('[EventContent] channel toggle read threw, treating as on', { event, channel, error });
    return true;
  }
}

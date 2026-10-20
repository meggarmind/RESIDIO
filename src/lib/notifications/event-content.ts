import { createAdminClient } from '@/lib/supabase/server';
import {
  getEventDefaults,
  mergeEventContent,
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
  channel: string = 'email'
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
      return getEventDefaults(event);
    }
    return mergeEventContent(event, data?.overrides);
  } catch (error) {
    console.error('[EventContent] read threw, using defaults', { event, channel, error });
    return getEventDefaults(event);
  }
}

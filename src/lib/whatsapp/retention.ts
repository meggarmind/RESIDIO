import { createAdminClient } from '@/lib/supabase/server';

/** A blocked number gets the same fixed reply at most once in this many hours (#1070). */
export const BLOCKED_REPLY_HOURS = 24;

/** A retention setting as the purge cron applies it: clamped to 1..max days, or the fallback when unset or invalid. */
export function retentionDays(value: unknown, fallback: number, max: number): number {
  const n = typeof value === 'number' ? value : typeof value === 'string' && value.trim() !== '' ? Number(value) : NaN;
  return Number.isFinite(n) ? Math.min(Math.max(n, 1), max) : fallback;
}

export async function purgeWhatsAppOperationalState(options?: {
  sessionDays?: number;
  processedMessageDays?: number;
  surveyResponseDays?: number;
  outboundSendDays?: number;
}): Promise<{ sessions: number; processedMessages: number; surveyResponses: number; outboundSends: number }> {
  const sessionCutoff = new Date(Date.now() - (options?.sessionDays ?? 1) * 24 * 60 * 60 * 1000).toISOString();
  const messageCutoff = new Date(Date.now() - (options?.processedMessageDays ?? 2) * 24 * 60 * 60 * 1000).toISOString();
  const surveyCutoff = new Date(Date.now() - (options?.surveyResponseDays ?? 90) * 24 * 60 * 60 * 1000).toISOString();
  const outboundSendCutoff = new Date(Date.now() - (options?.outboundSendDays ?? 90) * 24 * 60 * 60 * 1000).toISOString();
  const blockedReplyCutoff = new Date(Date.now() - BLOCKED_REPLY_HOURS * 60 * 60 * 1000).toISOString();
  const adminClient = createAdminClient();
  const [sessions, messages, surveys, sends] = await Promise.all([
    // A row still holding a blocked-reply stamp inside its window is kept, or the next message would reply again (#1070).
    adminClient
      .from('whatsapp_sessions')
      .delete({ count: 'exact' })
      .or(`blocked_reply_at.is.null,blocked_reply_at.lt.${blockedReplyCutoff}`)
      .lt('expires_at', sessionCutoff),
    adminClient.from('whatsapp_processed_messages').delete({ count: 'exact' }).lt('expires_at', messageCutoff),
    // whatsapp_survey_opt_outs is deliberately not purged: it holds a choice, not a comment (#920).
    adminClient.from('whatsapp_survey_responses').delete({ count: 'exact' }).lt('asked_at', surveyCutoff),
    adminClient.from('whatsapp_outbound_sends').delete({ count: 'exact' }).lt('created_at', outboundSendCutoff),
  ]);
  if (sessions.error) throw sessions.error;
  if (messages.error) throw messages.error;
  if (surveys.error) throw surveys.error;
  if (sends.error) throw sends.error;
  return { sessions: sessions.count || 0, processedMessages: messages.count || 0, surveyResponses: surveys.count || 0, outboundSends: sends.count || 0 };
}

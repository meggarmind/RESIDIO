import { createAdminClient } from '@/lib/supabase/server';

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
  const adminClient = createAdminClient();
  const [sessions, messages, surveys, sends] = await Promise.all([
    adminClient.from('whatsapp_sessions').delete({ count: 'exact' }).lt('expires_at', sessionCutoff),
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

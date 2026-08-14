import { createAdminClient } from '@/lib/supabase/server';

export async function purgeWhatsAppOperationalState(options?: {
  sessionDays?: number;
  processedMessageDays?: number;
}): Promise<{ sessions: number; processedMessages: number }> {
  const sessionCutoff = new Date(Date.now() - (options?.sessionDays ?? 1) * 24 * 60 * 60 * 1000).toISOString();
  const messageCutoff = new Date(Date.now() - (options?.processedMessageDays ?? 2) * 24 * 60 * 60 * 1000).toISOString();
  const adminClient = createAdminClient();
  const [sessions, messages] = await Promise.all([
    adminClient.from('whatsapp_sessions').delete({ count: 'exact' }).lt('expires_at', sessionCutoff),
    adminClient.from('whatsapp_processed_messages').delete({ count: 'exact' }).lt('expires_at', messageCutoff),
  ]);
  if (sessions.error) throw sessions.error;
  if (messages.error) throw messages.error;
  return { sessions: sessions.count || 0, processedMessages: messages.count || 0 };
}

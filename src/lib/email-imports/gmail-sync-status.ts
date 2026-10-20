/**
 * Gmail sync status writer (library, NOT a server action)
 *
 * Deliberately has no server-action directive and no auth: it writes
 * gmail_oauth_credentials and is only called by the fetch pipeline
 * (src/lib/email-imports/fetch-emails.ts). Exporting it from a server-action file
 * would make it a public endpoint (#561).
 */

import { createAdminClient } from '@/lib/supabase/server';

export async function updateGmailSyncStatus(params: {
  status: 'success' | 'error' | 'partial';
  message?: string;
  emailsCount?: number;
}): Promise<{ error: string | null }> {
  const supabase = await createAdminClient();

  const { error } = await supabase
    .from('gmail_oauth_credentials')
    .update({
      last_sync_at: new Date().toISOString(),
      last_sync_status: params.status,
      last_sync_message: params.message || null,
      last_sync_emails_count: params.emailsCount ?? 0,
    })
    .eq('is_active', true);

  if (error) {
    return { error: error.message };
  }

  return { error: null };
}

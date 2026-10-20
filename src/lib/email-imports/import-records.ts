/**
 * Email import session rows (library, NOT a server action)
 *
 * Deliberately has no server-action directive and no auth: the caller passes the client.
 * The session-bound actions in src/actions/email-imports/create-email-import.ts pass the
 * session client; the fetch pipeline (fetch, parse, match) passes the service-role client so
 * the CRON_SECRET cron route can run it without a user session (#879).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { EmailImport, EmailImportStatus } from '@/types/database';

export interface EmailImportStatusUpdate {
  importId: string;
  status: EmailImportStatus;
  emailsFetched?: number;
  emailsParsed?: number;
  emailsSkipped?: number;
  emailsErrored?: number;
  transactionsExtracted?: number;
  transactionsMatched?: number;
  transactionsAutoProcessed?: number;
  transactionsQueued?: number;
  transactionsSkipped?: number;
  transactionsErrored?: number;
  errorMessage?: string;
  importSummary?: Record<string, unknown>;
}

export async function insertEmailImport(
  supabase: SupabaseClient,
  params: {
    sourceEmail: string;
    triggerType: 'manual' | 'cron';
    createdBy?: string;
  }
): Promise<{ data: EmailImport | null; error: string | null }> {
  const { data, error } = await supabase
    .from('email_imports')
    .insert({
      source_email: params.sourceEmail,
      bank_name: 'First Bank',
      trigger_type: params.triggerType,
      status: 'pending',
      created_by: params.createdBy,
    })
    .select()
    .single();

  if (error) {
    console.error('Failed to create email import:', error);
    return { data: null, error: error.message };
  }

  return { data: data as EmailImport, error: null };
}

export async function writeEmailImportStatus(
  supabase: SupabaseClient,
  params: EmailImportStatusUpdate
): Promise<{ error: string | null }> {
  const updateData: Record<string, unknown> = {
    status: params.status,
  };

  // Add optional fields
  if (params.emailsFetched !== undefined) {
    updateData.emails_fetched = params.emailsFetched;
  }
  if (params.emailsParsed !== undefined) {
    updateData.emails_parsed = params.emailsParsed;
  }
  if (params.emailsSkipped !== undefined) {
    updateData.emails_skipped = params.emailsSkipped;
  }
  if (params.emailsErrored !== undefined) {
    updateData.emails_errored = params.emailsErrored;
  }
  if (params.transactionsExtracted !== undefined) {
    updateData.transactions_extracted = params.transactionsExtracted;
  }
  if (params.transactionsMatched !== undefined) {
    updateData.transactions_matched = params.transactionsMatched;
  }
  if (params.transactionsAutoProcessed !== undefined) {
    updateData.transactions_auto_processed = params.transactionsAutoProcessed;
  }
  if (params.transactionsQueued !== undefined) {
    updateData.transactions_queued = params.transactionsQueued;
  }
  if (params.transactionsSkipped !== undefined) {
    updateData.transactions_skipped = params.transactionsSkipped;
  }
  if (params.transactionsErrored !== undefined) {
    updateData.transactions_errored = params.transactionsErrored;
  }
  if (params.errorMessage !== undefined) {
    updateData.error_message = params.errorMessage;
  }
  if (params.importSummary !== undefined) {
    updateData.import_summary = params.importSummary;
  }

  // Set timestamps based on status
  if (params.status === 'fetching' || params.status === 'parsing') {
    updateData.started_at = new Date().toISOString();
  }
  if (params.status === 'completed' || params.status === 'failed') {
    updateData.completed_at = new Date().toISOString();
  }

  const { error } = await supabase
    .from('email_imports')
    .update(updateData)
    .eq('id', params.importId);

  if (error) {
    console.error('Failed to update email import status:', error);
    return { error: error.message };
  }

  return { error: null };
}

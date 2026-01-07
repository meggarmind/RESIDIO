'use server';

/**
 * Email Import Session Management
 *
 * Creates and manages email import sessions for tracking fetch operations.
 */

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { logAudit } from '@/lib/audit/logger';
import type { EmailImport, EmailImportStatus } from '@/types/database';

// ============================================================
// Create Email Import Session
// ============================================================

export async function createEmailImport(params: {
  sourceEmail: string;
  triggerType: 'manual' | 'cron';
  createdBy?: string;
}): Promise<{ data: EmailImport | null; error: string | null }> {
  const supabase = await createServerSupabaseClient();

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

  // Audit log
  await logAudit({
    action: 'CREATE',
    entityType: 'email_imports',
    entityId: data.id,
    entityDisplay: `Email Import: ${params.triggerType}`,
    newValues: {
      source_email: params.sourceEmail,
      trigger_type: params.triggerType,
    },
  });

  return { data: data as EmailImport, error: null };
}

// ============================================================
// Update Email Import Status
// ============================================================

export async function updateEmailImportStatus(params: {
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
}): Promise<{ error: string | null }> {
  const supabase = await createServerSupabaseClient();

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

// ============================================================
// Get Email Import
// ============================================================

export async function getEmailImport(
  importId: string
): Promise<{ data: EmailImport | null; error: string | null }> {
  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase
    .from('email_imports')
    .select('*')
    .eq('id', importId)
    .single();

  if (error) {
    return { data: null, error: error.message };
  }

  return { data: data as EmailImport, error: null };
}

// ============================================================
// List Email Imports
// ============================================================

export async function listEmailImports(params?: {
  status?: EmailImportStatus;
  limit?: number;
  offset?: number;
}): Promise<{
  data: EmailImport[] | null;
  count: number | null;
  error: string | null;
}> {
  const supabase = await createServerSupabaseClient();

  let query = supabase
    .from('email_imports')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false });

  if (params?.status) {
    query = query.eq('status', params.status);
  }

  if (params?.limit) {
    query = query.limit(params.limit);
  }

  if (params?.offset) {
    query = query.range(params.offset, params.offset + (params.limit || 10) - 1);
  }

  const { data, count, error } = await query;

  if (error) {
    return { data: null, count: null, error: error.message };
  }

  return { data: data as EmailImport[], count, error: null };
}

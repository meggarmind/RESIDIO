'use server';

/**
 * Email Import Session Management
 *
 * Reads email import sessions. The session rows are written by the server-only
 * library in src/lib/email-imports/import-records.ts, never by a client-callable action (#883).
 */

import { createServerSupabaseClient } from '@/lib/supabase/server';
import type { EmailImport, EmailImportStatus } from '@/types/database';

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
  /** Only imports that queued (or auto-processed) at least one transaction. */
  has?: 'queued' | 'auto_processed';
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

  if (params?.has === 'queued') {
    // Live rows, not the count written at import time: approving or skipping a
    // transaction later never updates email_imports.transactions_queued (#1432).
    const { data: queuedRows, error: queuedError } = await supabase
      .from('email_transactions')
      .select('email_import_id')
      .eq('status', 'queued_for_review');
    if (queuedError) return { data: null, count: null, error: queuedError.message };
    const ids = [...new Set((queuedRows ?? []).map((r) => r.email_import_id as string))];
    if (ids.length === 0) return { data: [], count: 0, error: null };
    query = query.in('id', ids);
  } else if (params?.has === 'auto_processed') {
    query = query.gt('transactions_auto_processed', 0);
  }

  if (params?.limit) {
    const offset = params.offset ?? 0;
    query = query.range(offset, offset + params.limit - 1);
  }

  const { data, count, error } = await query;

  if (error) {
    return { data: null, count: null, error: error.message };
  }

  return { data: data as EmailImport[], count, error: null };
}

// ============================================================
// Email Import Summary (all rows, not one page)
// ============================================================

export type EmailImportSummary = {
  total: number;
  completed: number;
  queued: number;
  autoProcessed: number;
};

const SUMMARY_CHUNK = 1000;

export async function getEmailImportSummary(): Promise<{
  data: EmailImportSummary | null;
  error: string | null;
}> {
  const supabase = await createServerSupabaseClient();

  const [totalRes, completedRes, queuedRes] = await Promise.all([
    supabase.from('email_imports').select('*', { count: 'exact', head: true }),
    supabase
      .from('email_imports')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'completed'),
    // Live count: the import's transactions_queued is never lowered when a queued
    // transaction is approved or skipped (#1432).
    supabase
      .from('email_transactions')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'queued_for_review'),
  ]);

  if (totalRes.error) return { data: null, error: totalRes.error.message };
  if (completedRes.error) return { data: null, error: completedRes.error.message };
  if (queuedRes.error) return { data: null, error: queuedRes.error.message };

  // PostgREST caps a response at 1000 rows, so page through the numeric column.
  let autoProcessed = 0;
  for (let from = 0; ; from += SUMMARY_CHUNK) {
    const { data, error } = await supabase
      .from('email_imports')
      .select('transactions_auto_processed')
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .range(from, from + SUMMARY_CHUNK - 1);

    if (error) return { data: null, error: error.message };

    for (const row of data ?? []) {
      autoProcessed += row.transactions_auto_processed || 0;
    }
    if (!data || data.length < SUMMARY_CHUNK) break;
  }

  return {
    data: {
      total: totalRes.count ?? 0,
      completed: completedRes.count ?? 0,
      queued: queuedRes.count ?? 0,
      autoProcessed,
    },
    error: null,
  };
}

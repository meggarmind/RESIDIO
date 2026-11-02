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
    query = query.gt('transactions_queued', 0);
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

  const [totalRes, completedRes] = await Promise.all([
    supabase.from('email_imports').select('*', { count: 'exact', head: true }),
    supabase
      .from('email_imports')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'completed'),
  ]);

  if (totalRes.error) return { data: null, error: totalRes.error.message };
  if (completedRes.error) return { data: null, error: completedRes.error.message };

  // PostgREST caps a response at 1000 rows, so page through the two numeric columns.
  let queued = 0;
  let autoProcessed = 0;
  for (let from = 0; ; from += SUMMARY_CHUNK) {
    const { data, error } = await supabase
      .from('email_imports')
      .select('transactions_queued, transactions_auto_processed')
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .range(from, from + SUMMARY_CHUNK - 1);

    if (error) return { data: null, error: error.message };

    for (const row of data ?? []) {
      queued += row.transactions_queued || 0;
      autoProcessed += row.transactions_auto_processed || 0;
    }
    if (!data || data.length < SUMMARY_CHUNK) break;
  }

  return {
    data: {
      total: totalRes.count ?? 0,
      completed: completedRes.count ?? 0,
      queued,
      autoProcessed,
    },
    error: null,
  };
}

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

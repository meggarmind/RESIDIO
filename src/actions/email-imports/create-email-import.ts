'use server';

/**
 * Email Import Session Management
 *
 * Creates and manages email import sessions for tracking fetch operations.
 */

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { logAudit } from '@/lib/audit/logger';
import {
  insertEmailImport,
  writeEmailImportStatus,
  type EmailImportStatusUpdate,
} from '@/lib/email-imports/import-records';
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

  const { data, error } = await insertEmailImport(supabase, params);
  if (error || !data) {
    return { data: null, error };
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

  return { data, error: null };
}

// ============================================================
// Update Email Import Status
// ============================================================

export async function updateEmailImportStatus(
  params: EmailImportStatusUpdate
): Promise<{ error: string | null }> {
  const supabase = await createServerSupabaseClient();
  return writeEmailImportStatus(supabase, params);
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

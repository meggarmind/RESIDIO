'use server';

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { logAudit } from '@/lib/audit/logger';
import type { TransactionTag, TransactionTagInsert, TransactionTagUpdate, TransactionTagType } from '@/types/database';

// ============================================================
// Response Types
// ============================================================

export interface GetTransactionTagsResponse {
  data: TransactionTag[];
  error: string | null;
}

export interface TransactionTagResponse {
  data: TransactionTag | null;
  error: string | null;
}

export interface DeleteTransactionTagResponse {
  error: string | null;
}

// ============================================================
// GET: Fetch Transaction Tags
// ============================================================

interface GetTransactionTagsParams {
  transaction_type?: TransactionTagType;
  is_active?: boolean;
  include_inactive?: boolean;
}

export async function getTransactionTags(
  params: GetTransactionTagsParams = {}
): Promise<GetTransactionTagsResponse> {
  const supabase = await createServerSupabaseClient();

  let query = supabase
    .from('transaction_tags')
    .select('*')
    .order('transaction_type')
    .order('sort_order')
    .order('name');

  // Filter by transaction type if specified
  if (params.transaction_type) {
    query = query.eq('transaction_type', params.transaction_type);
  }

  // Filter by active status (by default only show active)
  if (!params.include_inactive) {
    if (params.is_active !== undefined) {
      query = query.eq('is_active', params.is_active);
    } else {
      query = query.eq('is_active', true);
    }
  }

  const { data, error } = await query;

  return {
    data: (data ?? []) as TransactionTag[],
    error: error?.message ?? null,
  };
}

// ============================================================
// GET: Fetch Single Transaction Tag
// ============================================================

export async function getTransactionTag(id: string): Promise<TransactionTagResponse> {
  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase
    .from('transaction_tags')
    .select('*')
    .eq('id', id)
    .single();

  return {
    data: data as TransactionTag | null,
    error: error?.message ?? null,
  };
}

// ============================================================
// CREATE: Create Transaction Tag
// ============================================================

export async function createTransactionTag(
  formData: TransactionTagInsert
): Promise<TransactionTagResponse> {
  const supabase = await createServerSupabaseClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { data: null, error: 'Unauthorized' };
  }

  const { data, error } = await supabase
    .from('transaction_tags')
    .insert({
      name: formData.name,
      transaction_type: formData.transaction_type,
      description: formData.description || null,
      color: formData.color || 'gray',
      is_active: formData.is_active ?? true,
      sort_order: formData.sort_order ?? 0,
      keywords: formData.keywords || [],
    })
    .select()
    .single();

  if (error) {
    // Check for unique constraint violation
    if (error.code === '23505') {
      return { data: null, error: 'A tag with this name already exists' };
    }
    return { data: null, error: error.message };
  }

  // Log audit event
  await logAudit({
    action: 'CREATE',
    entityType: 'transaction_tags',
    entityId: data.id,
    entityDisplay: data.name,
    newValues: data,
  });

  return { data: data as TransactionTag, error: null };
}

// ============================================================
// UPDATE: Update Transaction Tag
// ============================================================

export async function updateTransactionTag(
  id: string,
  formData: TransactionTagUpdate
): Promise<TransactionTagResponse> {
  const supabase = await createServerSupabaseClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { data: null, error: 'Unauthorized' };
  }

  // Fetch existing tag for audit logging
  const { data: existingTag } = await supabase
    .from('transaction_tags')
    .select('*')
    .eq('id', id)
    .single();

  if (!existingTag) {
    return { data: null, error: 'Transaction tag not found' };
  }

  const updateData: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (formData.name !== undefined) updateData.name = formData.name;
  if (formData.transaction_type !== undefined) updateData.transaction_type = formData.transaction_type;
  if (formData.description !== undefined) updateData.description = formData.description || null;
  if (formData.color !== undefined) updateData.color = formData.color;
  if (formData.is_active !== undefined) updateData.is_active = formData.is_active;
  if (formData.sort_order !== undefined) updateData.sort_order = formData.sort_order;
  if (formData.keywords !== undefined) updateData.keywords = formData.keywords;

  const { data, error } = await supabase
    .from('transaction_tags')
    .update(updateData)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    // Check for unique constraint violation
    if (error.code === '23505') {
      return { data: null, error: 'A tag with this name already exists' };
    }
    return { data: null, error: error.message };
  }

  // Log audit event
  await logAudit({
    action: 'UPDATE',
    entityType: 'transaction_tags',
    entityId: id,
    entityDisplay: data.name,
    oldValues: existingTag,
    newValues: data,
  });

  return { data: data as TransactionTag, error: null };
}

// ============================================================
// DELETE: Delete Transaction Tag
// ============================================================

export async function deleteTransactionTag(id: string): Promise<DeleteTransactionTagResponse> {
  const supabase = await createServerSupabaseClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { error: 'Unauthorized' };
  }

  // Fetch existing tag for audit logging
  const { data: existingTag } = await supabase
    .from('transaction_tags')
    .select('*')
    .eq('id', id)
    .single();

  if (!existingTag) {
    return { error: 'Transaction tag not found' };
  }

  // Check if tag is in use
  const { count } = await supabase
    .from('bank_statement_rows')
    .select('id', { count: 'exact', head: true })
    .eq('tag_id', id);

  if (count && count > 0) {
    return { error: `This tag is in use by ${count} transaction(s). Please reassign or remove the tag from these transactions first.` };
  }

  const { error } = await supabase
    .from('transaction_tags')
    .delete()
    .eq('id', id);

  if (error) {
    return { error: error.message };
  }

  // Log audit event
  await logAudit({
    action: 'DELETE',
    entityType: 'transaction_tags',
    entityId: id,
    entityDisplay: existingTag.name,
    oldValues: existingTag,
  });

  return { error: null };
}

// ============================================================
// Tag Import Row (for tagging during import review)
// ============================================================

export interface TagImportRowResponse {
  error: string | null;
}

export async function tagImportRow(
  rowId: string,
  tagId: string | null
): Promise<TagImportRowResponse> {
  const supabase = await createServerSupabaseClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { error: 'Unauthorized' };
  }

  const updateData: Record<string, unknown> = {
    tag_id: tagId,
    tagged_by: tagId ? user.id : null,
    tagged_at: tagId ? new Date().toISOString() : null,
    auto_tagged: false, // Manual tagging clears auto_tagged flag
  };

  const { error } = await supabase
    .from('bank_statement_rows')
    .update(updateData)
    .eq('id', rowId);

  if (error) {
    return { error: error.message };
  }

  return { error: null };
}

// ============================================================
// Batch Tag Import Rows
// ============================================================

export interface BatchTagImportRowsResponse {
  updated: number;
  error: string | null;
}

export async function batchTagImportRows(
  rowIds: string[],
  tagId: string | null
): Promise<BatchTagImportRowsResponse> {
  const supabase = await createServerSupabaseClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { updated: 0, error: 'Unauthorized' };
  }

  const updateData: Record<string, unknown> = {
    tag_id: tagId,
    tagged_by: tagId ? user.id : null,
    tagged_at: tagId ? new Date().toISOString() : null,
    auto_tagged: false, // Manual tagging clears auto_tagged flag
  };

  const { error, count } = await supabase
    .from('bank_statement_rows')
    .update(updateData)
    .in('id', rowIds);

  if (error) {
    return { updated: 0, error: error.message };
  }

  return { updated: count ?? rowIds.length, error: null };
}

// ============================================================
// Auto-Tag Transaction (for keyword-based auto-tagging)
// ============================================================

export interface AutoTagResult {
  tag: TransactionTag | null;
  matchedKeyword: string | null;
}

/**
 * Automatically find a matching tag based on transaction description keywords.
 * Performs case-insensitive matching against all active tags' keywords.
 *
 * @param description - The transaction description to match against
 * @param transactionType - 'credit' or 'debit' to filter tags by type
 * @returns The first matching tag and the keyword that matched, or null if no match
 */
export async function autoTagTransaction(
  description: string,
  transactionType: TransactionTagType
): Promise<AutoTagResult> {
  const supabase = await createServerSupabaseClient();

  // Fetch active tags of the matching type that have keywords
  const { data: tags, error } = await supabase
    .from('transaction_tags')
    .select('*')
    .eq('transaction_type', transactionType)
    .eq('is_active', true)
    .order('sort_order')
    .order('name');

  if (error || !tags) {
    return { tag: null, matchedKeyword: null };
  }

  // Normalize description for case-insensitive matching
  const normalizedDescription = description.toLowerCase();

  // Check each tag's keywords against the description
  for (const tag of tags as TransactionTag[]) {
    if (!tag.keywords || tag.keywords.length === 0) continue;

    for (const keyword of tag.keywords) {
      if (normalizedDescription.includes(keyword.toLowerCase())) {
        return { tag, matchedKeyword: keyword };
      }
    }
  }

  return { tag: null, matchedKeyword: null };
}

// ============================================================
// Suggest Keywords from Description (for learning)
// ============================================================

// Common words to exclude from keyword suggestions
const STOP_WORDS = new Set([
  'the', 'and', 'for', 'from', 'with', 'this', 'that', 'have', 'has',
  'was', 'were', 'been', 'being', 'are', 'will', 'would', 'could',
  'should', 'may', 'might', 'must', 'can', 'than', 'then', 'them',
  'these', 'those', 'their', 'what', 'when', 'where', 'which', 'who',
  'how', 'all', 'each', 'every', 'both', 'few', 'more', 'most', 'other',
  'some', 'such', 'only', 'own', 'same', 'into', 'over', 'after', 'before',
  'between', 'under', 'above', 'below', 'upon', 'about', 'through',
  // Banking/transaction common words
  'transfer', 'payment', 'transaction', 'account', 'bank', 'ref', 'reference',
  'credit', 'debit', 'amount', 'balance', 'date', 'time', 'number', 'ngn',
]);

/**
 * Extract potential keywords from a transaction description for learning.
 * Filters out common words and returns significant terms.
 *
 * @param description - The transaction description to extract keywords from
 * @returns Array of suggested keywords (unique, lowercase, 3+ chars)
 */
export async function suggestKeywordsFromDescription(description: string): Promise<string[]> {
  // Split by non-alphanumeric characters and filter
  const words = description
    .toLowerCase()
    .split(/[^a-zA-Z0-9]+/)
    .filter(word =>
      word.length >= 3 &&
      !STOP_WORDS.has(word) &&
      !/^\d+$/.test(word) // Exclude pure numbers
    );

  // Return unique words
  return [...new Set(words)];
}

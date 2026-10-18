'use server';

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { z } from 'zod';
import type { DocumentTag } from '@/types/database';
import { logAudit, getChangedValues } from '@/lib/audit/logger';
import { authorizePermission } from '@/lib/auth/authorize';
import { PERMISSIONS } from '@/lib/auth/action-roles';
import { tagParentError } from '@/lib/documents/taxonomy';

type GetTagsResponse = {
  data: DocumentTag[];
  error: string | null;
};

type TagResponse = {
  data: DocumentTag | null;
  error: string | null;
};

const colorSchema = z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Color must be a hex value such as #2563eb');

const createDocumentTagSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(100),
  color: colorSchema.optional(),
  parent_tag_id: z.string().uuid().nullable().optional(),
}).strict();

// Strict: only these columns may be edited; anything else is rejected.
const updateDocumentTagSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  color: colorSchema.optional(),
  parent_tag_id: z.string().uuid().nullable().optional(),
  is_active: z.boolean().optional(),
}).strict();

/**
 * Get document tags, flat; nesting is carried by parent_tag_id
 * @param includeInactive - Include inactive tags (for admin management)
 */
export async function getDocumentTags(includeInactive = false): Promise<GetTagsResponse> {
  const supabase = await createServerSupabaseClient();

  let query = supabase.from('document_tags').select('*').order('name', { ascending: true });

  if (!includeInactive) {
    query = query.eq('is_active', true);
  }

  const { data, error } = await query;

  if (error) {
    console.error('Error fetching document tags:', error);
    return { data: [], error: error.message };
  }

  return { data: data as DocumentTag[], error: null };
}

/** Rejects a parent that would nest the tag deeper than the cap or under itself. */
async function checkParent(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  tagId: string | null,
  parentId: string | null | undefined
): Promise<string | null> {
  if (!parentId) return null;
  const { data: tags, error } = await supabase.from('document_tags').select('id, parent_tag_id');
  if (error) {
    console.error('Error reading document tag tree:', error);
    return error.message;
  }
  return tagParentError(tags ?? [], tagId, parentId);
}

/**
 * Create a document tag, optionally nested under a parent (at most 5 levels)
 */
export async function createDocumentTag(input: {
  name: string;
  color?: string;
  parent_tag_id?: string | null;
}): Promise<TagResponse> {
  const auth = await authorizePermission(PERMISSIONS.DOCUMENTS_MANAGE_TAGS);
  if (!auth.authorized) return { data: null, error: auth.error || 'Unauthorized' };

  const parsed = createDocumentTagSchema.safeParse(input);
  if (!parsed.success) {
    return { data: null, error: parsed.error.issues[0]?.message || 'Invalid tag data' };
  }
  const fields = parsed.data;

  const supabase = await createServerSupabaseClient();

  const parentError = await checkParent(supabase, null, fields.parent_tag_id);
  if (parentError) return { data: null, error: parentError };

  const { data, error } = await supabase
    .from('document_tags')
    .insert({
      name: fields.name,
      ...(fields.color ? { color: fields.color } : {}),
      parent_tag_id: fields.parent_tag_id ?? null,
    })
    .select()
    .single();

  if (error) {
    console.error('Error creating document tag:', error);
    return { data: null, error: error.message };
  }

  await logAudit({
    action: 'CREATE',
    entityType: 'document_tags',
    entityId: data.id,
    entityDisplay: data.name,
    newValues: data,
  });

  return { data: data as DocumentTag, error: null };
}

/**
 * Update a document tag: rename, recolor, re-parent or (re)activate
 */
export async function updateDocumentTag(
  id: string,
  input: {
    name?: string;
    color?: string;
    parent_tag_id?: string | null;
    is_active?: boolean;
  }
): Promise<TagResponse> {
  const auth = await authorizePermission(PERMISSIONS.DOCUMENTS_MANAGE_TAGS);
  if (!auth.authorized) return { data: null, error: auth.error || 'Unauthorized' };

  const parsed = updateDocumentTagSchema.safeParse(input);
  if (!parsed.success) {
    return { data: null, error: parsed.error.issues[0]?.message || 'Invalid tag data' };
  }
  const fields = parsed.data;

  const supabase = await createServerSupabaseClient();

  const parentError = await checkParent(supabase, id, fields.parent_tag_id);
  if (parentError) return { data: null, error: parentError };

  const { data: existing } = await supabase
    .from('document_tags')
    .select('*')
    .eq('id', id)
    .single();

  const { data, error } = await supabase
    .from('document_tags')
    .update(fields)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    console.error('Error updating document tag:', error);
    return { data: null, error: error.message };
  }

  const changes = getChangedValues(existing ?? {}, data);
  await logAudit({
    action: 'UPDATE',
    entityType: 'document_tags',
    entityId: id,
    entityDisplay: data.name,
    oldValues: changes.old,
    newValues: changes.new,
  });

  return { data: data as DocumentTag, error: null };
}

/**
 * Delete a document tag (soft delete by setting is_active to false). Assignments are kept, so
 * reactivating the tag restores it on every document.
 */
export async function deleteDocumentTag(id: string): Promise<{ success: boolean; error: string | null }> {
  const auth = await authorizePermission(PERMISSIONS.DOCUMENTS_MANAGE_TAGS);
  if (!auth.authorized) return { success: false, error: auth.error || 'Unauthorized' };

  const supabase = await createServerSupabaseClient();

  const { data: deactivated, error } = await supabase
    .from('document_tags')
    .update({ is_active: false })
    .eq('id', id)
    .select()
    .single();

  if (error) {
    console.error('Error deleting document tag:', error);
    return { success: false, error: error.message };
  }

  await logAudit({
    action: 'DEACTIVATE',
    entityType: 'document_tags',
    entityId: id,
    entityDisplay: deactivated?.name ?? id,
    oldValues: { is_active: true },
    newValues: { is_active: false },
  });

  return { success: true, error: null };
}

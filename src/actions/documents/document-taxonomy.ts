'use server';

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { z } from 'zod';
import type { DocumentCustomField, DocumentCustomFieldValue } from '@/types/database';
import { logAudit } from '@/lib/audit/logger';
import { authorizePermission } from '@/lib/auth/authorize';
import { PERMISSIONS } from '@/lib/auth/action-roles';
import { toTypedValueColumns, readTypedValue } from '@/lib/documents/taxonomy';

type Supabase = Awaited<ReturnType<typeof createServerSupabaseClient>>;

type DocumentTaxonomyResponse = {
  data: { root_document_id: string; tag_ids: string[]; values: DocumentCustomFieldValue[] } | null;
  error: string | null;
};

// A version chain is short; the cap only stops a malformed loop.
const MAX_VERSION_HOPS = 50;

/**
 * Tags and custom-field values belong to the root document, so they survive a version upload
 * (a version is a new documents row whose parent_document_id points back at the root).
 */
async function resolveRootDocument(
  supabase: Supabase,
  documentId: string
): Promise<{ id: string; title: string } | null> {
  let id = documentId;
  for (let hop = 0; hop < MAX_VERSION_HOPS; hop++) {
    const { data, error } = await supabase
      .from('documents')
      .select('id, title, parent_document_id')
      .eq('id', id)
      .single();
    if (error || !data) return null;
    if (!data.parent_document_id) return { id: data.id, title: data.title };
    id = data.parent_document_id;
  }
  return null;
}

/**
 * Get the tag ids and custom-field values of a document (or of any of its versions)
 */
export async function getDocumentTaxonomy(documentId: string): Promise<DocumentTaxonomyResponse> {
  const supabase = await createServerSupabaseClient();

  const root = await resolveRootDocument(supabase, documentId);
  if (!root) return { data: null, error: 'Document not found' };
  const rootId = root.id;

  const [tagsResult, valuesResult] = await Promise.all([
    supabase.from('document_tag_assignments').select('tag_id').eq('document_id', rootId),
    supabase.from('document_custom_field_values').select('*').eq('document_id', rootId),
  ]);

  const error = tagsResult.error ?? valuesResult.error;
  if (error) {
    console.error('Error fetching document taxonomy:', error);
    return { data: null, error: error.message };
  }

  return {
    data: {
      root_document_id: rootId,
      tag_ids: (tagsResult.data ?? []).map((a) => a.tag_id as string),
      values: (valuesResult.data ?? []) as DocumentCustomFieldValue[],
    },
    error: null,
  };
}

const tagIdsSchema = z.array(z.string().uuid()).max(100);

/**
 * Replace the set of tags on a document
 */
export async function setDocumentTags(
  documentId: string,
  tagIds: string[]
): Promise<{ success: boolean; error: string | null }> {
  const auth = await authorizePermission(PERMISSIONS.DOCUMENTS_UPDATE);
  if (!auth.authorized) return { success: false, error: auth.error || 'Unauthorized' };

  const parsed = tagIdsSchema.safeParse(tagIds);
  if (!parsed.success) return { success: false, error: 'Invalid tag selection' };
  const wanted = [...new Set(parsed.data)];

  const supabase = await createServerSupabaseClient();

  const root = await resolveRootDocument(supabase, documentId);
  if (!root) return { success: false, error: 'Document not found' };
  const rootId = root.id;

  const { data: current, error: readError } = await supabase
    .from('document_tag_assignments')
    .select('tag_id')
    .eq('document_id', rootId);

  if (readError) {
    console.error('Error reading document tags:', readError);
    return { success: false, error: readError.message };
  }

  const before = (current ?? []).map((a) => a.tag_id as string);
  const toAdd = wanted.filter((id) => !before.includes(id));
  const toRemove = before.filter((id) => !wanted.includes(id));

  if (toAdd.length === 0 && toRemove.length === 0) return { success: true, error: null };

  if (toAdd.length > 0) {
    const { error } = await supabase
      .from('document_tag_assignments')
      .insert(toAdd.map((tag_id) => ({ document_id: rootId, tag_id })));
    if (error) {
      console.error('Error assigning document tags:', error);
      return { success: false, error: error.message };
    }
  }

  if (toRemove.length > 0) {
    const { error } = await supabase
      .from('document_tag_assignments')
      .delete()
      .eq('document_id', rootId)
      .in('tag_id', toRemove);
    if (error) {
      console.error('Error removing document tags:', error);
      return { success: false, error: error.message };
    }
  }

  await logAudit({
    action: 'UPDATE',
    entityType: 'document_tag_assignments',
    entityId: rootId,
    entityDisplay: root.title,
    oldValues: { tag_ids: before },
    newValues: { tag_ids: wanted },
  });

  return { success: true, error: null };
}

/**
 * Set one custom-field value on a document. A null or empty value clears it.
 */
export async function setDocumentCustomFieldValue(
  documentId: string,
  fieldId: string,
  value: string | number | boolean | null
): Promise<{ data: DocumentCustomFieldValue | null; error: string | null }> {
  const auth = await authorizePermission(PERMISSIONS.DOCUMENTS_UPDATE);
  if (!auth.authorized) return { data: null, error: auth.error || 'Unauthorized' };

  const supabase = await createServerSupabaseClient();

  const root = await resolveRootDocument(supabase, documentId);
  if (!root) return { data: null, error: 'Document not found' };
  const rootId = root.id;

  const { data: field } = await supabase
    .from('document_custom_fields')
    .select('id, name, data_type, is_active')
    .eq('id', fieldId)
    .single();

  if (!field || !field.is_active) return { data: null, error: 'Custom field not found' };
  const dataType = (field as Pick<DocumentCustomField, 'data_type'>).data_type;

  const { data: existing } = await supabase
    .from('document_custom_field_values')
    .select('*')
    .eq('document_id', rootId)
    .eq('field_id', fieldId)
    .maybeSingle();

  const oldValue = existing ? readTypedValue(dataType, existing) : null;

  if (value === null || value === '') {
    if (!existing) return { data: null, error: null };
    const { error } = await supabase.from('document_custom_field_values').delete().eq('id', existing.id);
    if (error) {
      console.error('Error clearing document custom field value:', error);
      return { data: null, error: error.message };
    }
    await logAudit({
      action: 'DELETE',
      entityType: 'document_custom_field_values',
      entityId: existing.id,
      entityDisplay: `${root.title}: ${field.name}`,
      oldValues: { document_id: rootId, field_id: fieldId, value: oldValue },
    });
    return { data: null, error: null };
  }

  const typed = toTypedValueColumns(dataType, value);
  if (typed.error !== null) return { data: null, error: typed.error };

  // The FK alone would accept any document id; only link to one the caller can see.
  if (typed.columns.value_document_id) {
    const { data: linked } = await supabase
      .from('documents')
      .select('id')
      .eq('id', typed.columns.value_document_id)
      .maybeSingle();
    if (!linked) return { data: null, error: 'Linked document not found' };
  }

  const { data, error } = await supabase
    .from('document_custom_field_values')
    .upsert({ document_id: rootId, field_id: fieldId, ...typed.columns }, { onConflict: 'document_id,field_id' })
    .select()
    .single();

  if (error) {
    console.error('Error saving document custom field value:', error);
    return { data: null, error: error.message };
  }

  await logAudit({
    action: existing ? 'UPDATE' : 'CREATE',
    entityType: 'document_custom_field_values',
    entityId: data.id,
    entityDisplay: `${root.title}: ${field.name}`,
    oldValues: existing ? { value: oldValue } : undefined,
    newValues: { document_id: rootId, field_id: fieldId, value: readTypedValue(dataType, data) },
  });

  return { data: data as DocumentCustomFieldValue, error: null };
}

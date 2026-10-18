'use server';

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { z } from 'zod';
import { DOCUMENT_CUSTOM_FIELD_DATA_TYPES, type DocumentCustomField } from '@/types/database';
import { logAudit, getChangedValues } from '@/lib/audit/logger';
import { authorizePermission } from '@/lib/auth/authorize';
import { PERMISSIONS } from '@/lib/auth/action-roles';

type GetCustomFieldsResponse = {
  data: DocumentCustomField[];
  error: string | null;
};

type CustomFieldResponse = {
  data: DocumentCustomField | null;
  error: string | null;
};

const createDocumentCustomFieldSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(100),
  data_type: z.enum(DOCUMENT_CUSTOM_FIELD_DATA_TYPES),
  options: z.record(z.string(), z.unknown()).optional(),
}).strict();

// Strict: data_type is fixed once values may exist (the database refuses the change too).
const updateDocumentCustomFieldSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  options: z.record(z.string(), z.unknown()).optional(),
  is_active: z.boolean().optional(),
}).strict();

/**
 * Get document custom field definitions
 * @param includeInactive - Include inactive fields (for admin management)
 */
export async function getDocumentCustomFields(includeInactive = false): Promise<GetCustomFieldsResponse> {
  const supabase = await createServerSupabaseClient();

  let query = supabase.from('document_custom_fields').select('*').order('name', { ascending: true });

  if (!includeInactive) {
    query = query.eq('is_active', true);
  }

  const { data, error } = await query;

  if (error) {
    console.error('Error fetching document custom fields:', error);
    return { data: [], error: error.message };
  }

  return { data: data as DocumentCustomField[], error: null };
}

/**
 * Create a document custom field
 */
export async function createDocumentCustomField(input: {
  name: string;
  data_type: DocumentCustomField['data_type'];
  options?: Record<string, unknown>;
}): Promise<CustomFieldResponse> {
  const auth = await authorizePermission(PERMISSIONS.DOCUMENTS_MANAGE_CUSTOM_FIELDS);
  if (!auth.authorized) return { data: null, error: auth.error || 'Unauthorized' };

  const parsed = createDocumentCustomFieldSchema.safeParse(input);
  if (!parsed.success) {
    return { data: null, error: parsed.error.issues[0]?.message || 'Invalid custom field data' };
  }
  const fields = parsed.data;

  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase
    .from('document_custom_fields')
    .insert({ name: fields.name, data_type: fields.data_type, options: fields.options ?? {} })
    .select()
    .single();

  if (error) {
    console.error('Error creating document custom field:', error);
    return { data: null, error: error.message };
  }

  await logAudit({
    action: 'CREATE',
    entityType: 'document_custom_fields',
    entityId: data.id,
    entityDisplay: data.name,
    newValues: data,
  });

  return { data: data as DocumentCustomField, error: null };
}

/**
 * Update a document custom field: rename, change options or (re)activate
 */
export async function updateDocumentCustomField(
  id: string,
  input: {
    name?: string;
    options?: Record<string, unknown>;
    is_active?: boolean;
  }
): Promise<CustomFieldResponse> {
  const auth = await authorizePermission(PERMISSIONS.DOCUMENTS_MANAGE_CUSTOM_FIELDS);
  if (!auth.authorized) return { data: null, error: auth.error || 'Unauthorized' };

  const parsed = updateDocumentCustomFieldSchema.safeParse(input);
  if (!parsed.success) {
    return { data: null, error: parsed.error.issues[0]?.message || 'Invalid custom field data' };
  }
  const fields = parsed.data;

  const supabase = await createServerSupabaseClient();

  const { data: existing } = await supabase
    .from('document_custom_fields')
    .select('*')
    .eq('id', id)
    .single();

  const { data, error } = await supabase
    .from('document_custom_fields')
    .update(fields)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    console.error('Error updating document custom field:', error);
    return { data: null, error: error.message };
  }

  const changes = getChangedValues(existing ?? {}, data);
  await logAudit({
    action: 'UPDATE',
    entityType: 'document_custom_fields',
    entityId: id,
    entityDisplay: data.name,
    oldValues: changes.old,
    newValues: changes.new,
  });

  return { data: data as DocumentCustomField, error: null };
}

/**
 * Delete a document custom field (soft delete by setting is_active to false). Stored values are
 * kept, so reactivating the field restores them.
 */
export async function deleteDocumentCustomField(id: string): Promise<{ success: boolean; error: string | null }> {
  const auth = await authorizePermission(PERMISSIONS.DOCUMENTS_MANAGE_CUSTOM_FIELDS);
  if (!auth.authorized) return { success: false, error: auth.error || 'Unauthorized' };

  const supabase = await createServerSupabaseClient();

  const { data: deactivated, error } = await supabase
    .from('document_custom_fields')
    .update({ is_active: false })
    .eq('id', id)
    .select()
    .single();

  if (error) {
    console.error('Error deleting document custom field:', error);
    return { success: false, error: error.message };
  }

  await logAudit({
    action: 'DEACTIVATE',
    entityType: 'document_custom_fields',
    entityId: id,
    entityDisplay: deactivated?.name ?? id,
    oldValues: { is_active: true },
    newValues: { is_active: false },
  });

  return { success: true, error: null };
}

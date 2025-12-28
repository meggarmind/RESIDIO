'use server';

import { createServerSupabaseClient } from '@/lib/supabase/server';
import type { DocumentWithRelations, DocumentUpdateInput } from '@/types/database';

type UpdateDocumentResponse = {
  data: DocumentWithRelations | null;
  error: string | null;
};

/**
 * Update document metadata
 * Does not update the file itself - use uploadDocumentVersion for that
 */
export async function updateDocument(
  id: string,
  input: DocumentUpdateInput
): Promise<UpdateDocumentResponse> {
  const supabase = await createServerSupabaseClient();

  // Get current user
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return { data: null, error: 'Not authenticated' };
  }

  // Build update object with only defined values
  const updateData: Record<string, unknown> = {};
  if (input.title !== undefined) updateData.title = input.title;
  if (input.description !== undefined) updateData.description = input.description;
  if (input.category_id !== undefined) updateData.category_id = input.category_id;
  if (input.is_archived !== undefined) updateData.is_archived = input.is_archived;

  if (Object.keys(updateData).length === 0) {
    return { data: null, error: 'No fields to update' };
  }

  const { data, error } = await supabase
    .from('documents')
    .update(updateData)
    .eq('id', id)
    .select(
      `
      *,
      category:document_categories(id, name, description, is_resident_accessible),
      uploader:profiles!uploaded_by(id, full_name),
      resident:residents(id, first_name, last_name),
      house:houses(id, unit_number, street:streets(name))
    `
    )
    .single();

  if (error) {
    console.error('Error updating document:', error);
    return { data: null, error: error.message };
  }

  // Log the update action
  await supabase.from('document_access_logs').insert({
    document_id: id,
    accessed_by: user.id,
    action: 'update',
  });

  // Transform resident data
  const transformedData = {
    ...data,
    resident: data.resident
      ? {
          id: data.resident.id,
          full_name: `${data.resident.first_name} ${data.resident.last_name}`,
        }
      : null,
  } as DocumentWithRelations;

  return { data: transformedData, error: null };
}

/**
 * Archive a document (soft delete)
 */
export async function archiveDocument(id: string): Promise<{ success: boolean; error: string | null }> {
  const result = await updateDocument(id, { is_archived: true });
  return {
    success: result.data !== null,
    error: result.error,
  };
}

/**
 * Restore an archived document
 */
export async function restoreDocument(id: string): Promise<{ success: boolean; error: string | null }> {
  const result = await updateDocument(id, { is_archived: false });
  return {
    success: result.data !== null,
    error: result.error,
  };
}

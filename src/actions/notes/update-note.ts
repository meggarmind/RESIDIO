'use server';

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { authorizePermission } from '@/lib/auth/authorize';
import { PERMISSIONS } from '@/lib/auth/action-roles';
import { logAudit } from '@/lib/audit/logger';
import type { EntityNoteWithRelations, UpdateNoteInput } from '@/types/database';

type UpdateNoteResponse = {
  data: EntityNoteWithRelations | null;
  error: string | null;
};

/**
 * Update a note by creating a new version.
 * This implements soft-edit: the original note is preserved (is_current=false)
 * and a new version is created (is_current=true, parent_note_id points to original).
 */
export async function updateNote(
  id: string,
  input: UpdateNoteInput
): Promise<UpdateNoteResponse> {
  const supabase = await createServerSupabaseClient();

  // Get current user
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return { data: null, error: 'Not authenticated' };
  }

  // Permission check
  const auth = await authorizePermission(PERMISSIONS.NOTES_UPDATE);
  if (!auth.authorized) {
    return { data: null, error: auth.error || 'Unauthorized' };
  }

  // Get the original note
  const { data: originalNote, error: fetchError } = await supabase
    .from('entity_notes')
    .select('*')
    .eq('id', id)
    .single();

  if (fetchError || !originalNote) {
    return { data: null, error: 'Note not found' };
  }

  // Determine the root note ID (for version chain)
  // If this note already has a parent, use that parent's ID
  // Otherwise, this is the root note
  const rootNoteId = originalNote.parent_note_id || originalNote.id;

  // Get the highest version number in this chain
  const { data: versions } = await supabase
    .from('entity_notes')
    .select('version')
    .or(`id.eq.${rootNoteId},parent_note_id.eq.${rootNoteId}`)
    .order('version', { ascending: false })
    .limit(1);

  const nextVersion = (versions?.[0]?.version || 1) + 1;

  // If document_id is being updated, verify it exists
  if (input.document_id) {
    const { data: doc, error: docError } = await supabase
      .from('documents')
      .select('id')
      .eq('id', input.document_id)
      .single();

    if (docError || !doc) {
      return { data: null, error: 'Document not found' };
    }
  }

  // Mark the old note as not current
  const { error: updateOldError } = await supabase
    .from('entity_notes')
    .update({ is_current: false })
    .eq('id', id);

  if (updateOldError) {
    console.error('Error marking old note as not current:', updateOldError);
    return { data: null, error: 'Failed to update note version' };
  }

  // Create the new version
  const { data: newNote, error: insertError } = await supabase
    .from('entity_notes')
    .insert({
      entity_type: originalNote.entity_type,
      entity_id: originalNote.entity_id,
      title: input.title !== undefined ? input.title?.trim() || null : originalNote.title,
      content: input.content !== undefined ? input.content.trim() : originalNote.content,
      category: input.category !== undefined ? input.category : originalNote.category,
      is_confidential:
        input.is_confidential !== undefined
          ? input.is_confidential
          : originalNote.is_confidential,
      confidential_roles:
        input.confidential_roles !== undefined
          ? input.confidential_roles
          : originalNote.confidential_roles,
      document_id:
        input.document_id !== undefined ? input.document_id : originalNote.document_id,
      created_by: user.id,
      version: nextVersion,
      parent_note_id: rootNoteId,
      is_current: true,
    })
    .select(
      `
      *,
      creator:profiles!created_by(id, full_name),
      document:documents(id, title, file_name, file_type)
    `
    )
    .single();

  if (insertError) {
    // Rollback: restore the old note as current
    await supabase.from('entity_notes').update({ is_current: true }).eq('id', id);
    console.error('Error creating new note version:', insertError);
    return { data: null, error: `Failed to create note version: ${insertError.message}` };
  }

  // Audit log
  await logAudit({
    action: 'UPDATE',
    entityType: 'entity_notes',
    entityId: newNote.id,
    entityDisplay: newNote.title || `Note on ${newNote.entity_type}`,
    oldValues: {
      title: originalNote.title,
      content: originalNote.content,
      category: originalNote.category,
      is_confidential: originalNote.is_confidential,
      document_id: originalNote.document_id,
      version: originalNote.version,
    },
    newValues: {
      title: newNote.title,
      content: newNote.content,
      category: newNote.category,
      is_confidential: newNote.is_confidential,
      document_id: newNote.document_id,
      version: newNote.version,
    },
    description: `Updated note (v${originalNote.version} → v${nextVersion})`,
  });

  return { data: newNote as EntityNoteWithRelations, error: null };
}

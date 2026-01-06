'use server';

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { authorizePermission } from '@/lib/auth/authorize';
import { PERMISSIONS } from '@/lib/auth/action-roles';
import { logAudit } from '@/lib/audit/logger';

type DeleteNoteResponse = {
  success: boolean;
  error: string | null;
};

/**
 * Delete a note and all its version history.
 * This is a hard delete - for soft-edit history, use updateNote instead.
 */
export async function deleteNote(id: string): Promise<DeleteNoteResponse> {
  const supabase = await createServerSupabaseClient();

  // Get current user
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return { success: false, error: 'Not authenticated' };
  }

  // Permission check
  const auth = await authorizePermission(PERMISSIONS.NOTES_DELETE);
  if (!auth.authorized) {
    return { success: false, error: auth.error || 'Unauthorized' };
  }

  // Get the note details for audit log
  const { data: note, error: fetchError } = await supabase
    .from('entity_notes')
    .select('*')
    .eq('id', id)
    .single();

  if (fetchError || !note) {
    return { success: false, error: 'Note not found' };
  }

  // Find the root note ID to delete the entire version chain
  const rootNoteId = note.parent_note_id || note.id;

  // Delete all versions in this chain
  // First delete children (versions), then the root
  const { error: deleteChildrenError } = await supabase
    .from('entity_notes')
    .delete()
    .eq('parent_note_id', rootNoteId);

  if (deleteChildrenError) {
    console.error('Error deleting note versions:', deleteChildrenError);
    return { success: false, error: 'Failed to delete note versions' };
  }

  // Delete the root note
  const { error: deleteRootError } = await supabase
    .from('entity_notes')
    .delete()
    .eq('id', rootNoteId);

  if (deleteRootError) {
    console.error('Error deleting root note:', deleteRootError);
    return { success: false, error: 'Failed to delete note' };
  }

  // Audit log
  await logAudit({
    action: 'DELETE',
    entityType: 'entity_notes',
    entityId: id,
    entityDisplay: note.title || `Note on ${note.entity_type}`,
    oldValues: {
      entity_type: note.entity_type,
      entity_id: note.entity_id,
      title: note.title,
      content: note.content,
      category: note.category,
      is_confidential: note.is_confidential,
    },
    description: `Deleted note${note.title ? `: ${note.title}` : ''} from ${note.entity_type}`,
  });

  return { success: true, error: null };
}

/**
 * Delete a single version of a note (keeping other versions intact).
 * If this is the only/current version, promotes the previous version to current.
 */
export async function deleteNoteVersion(id: string): Promise<DeleteNoteResponse> {
  const supabase = await createServerSupabaseClient();

  // Get current user
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return { success: false, error: 'Not authenticated' };
  }

  // Permission check
  const auth = await authorizePermission(PERMISSIONS.NOTES_DELETE);
  if (!auth.authorized) {
    return { success: false, error: auth.error || 'Unauthorized' };
  }

  // Get the note
  const { data: note, error: fetchError } = await supabase
    .from('entity_notes')
    .select('*')
    .eq('id', id)
    .single();

  if (fetchError || !note) {
    return { success: false, error: 'Note not found' };
  }

  // Find the root note ID
  const rootNoteId = note.parent_note_id || note.id;

  // If this is the current version, we need to promote the previous version
  if (note.is_current && note.version > 1) {
    // Find the previous version
    const { data: previousVersion } = await supabase
      .from('entity_notes')
      .select('id')
      .or(`id.eq.${rootNoteId},parent_note_id.eq.${rootNoteId}`)
      .eq('version', note.version - 1)
      .single();

    if (previousVersion) {
      // Promote previous version to current
      await supabase
        .from('entity_notes')
        .update({ is_current: true })
        .eq('id', previousVersion.id);
    }
  }

  // Delete this specific version
  const { error: deleteError } = await supabase
    .from('entity_notes')
    .delete()
    .eq('id', id);

  if (deleteError) {
    console.error('Error deleting note version:', deleteError);
    return { success: false, error: 'Failed to delete note version' };
  }

  // Audit log
  await logAudit({
    action: 'DELETE',
    entityType: 'entity_notes',
    entityId: id,
    entityDisplay: `${note.title || 'Note'} (v${note.version})`,
    oldValues: {
      version: note.version,
      content: note.content,
    },
    description: `Deleted note version ${note.version}`,
  });

  return { success: true, error: null };
}

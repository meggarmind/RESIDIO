'use server';

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { authorizePermission } from '@/lib/auth/authorize';
import { PERMISSIONS } from '@/lib/auth/action-roles';
import type { NoteVersion, EntityNoteWithRelations } from '@/types/database';

type GetNoteHistoryResponse = {
  data: NoteVersion[];
  error: string | null;
};

/**
 * Get the version history of a note.
 * Returns all versions in the chain (current and historical).
 * Ordered by version descending (newest first).
 */
export async function getNoteHistory(noteId: string): Promise<GetNoteHistoryResponse> {
  const supabase = await createServerSupabaseClient();

  // Permission check
  const auth = await authorizePermission(PERMISSIONS.NOTES_VIEW);
  if (!auth.authorized) {
    return { data: [], error: auth.error || 'Unauthorized' };
  }

  // First, get the note to find its root
  const { data: note, error: noteError } = await supabase
    .from('entity_notes')
    .select('id, parent_note_id')
    .eq('id', noteId)
    .single();

  if (noteError || !note) {
    return { data: [], error: 'Note not found' };
  }

  // Determine root note ID
  const rootNoteId = note.parent_note_id || note.id;

  // Get all versions in the chain
  const { data: versions, error } = await supabase
    .from('entity_notes')
    .select(
      `
      id,
      version,
      title,
      content,
      category,
      is_confidential,
      confidential_roles,
      document_id,
      is_current,
      created_at,
      created_by,
      creator:profiles!created_by(id, full_name),
      document:documents(id, title, file_name, file_type)
    `
    )
    .or(`id.eq.${rootNoteId},parent_note_id.eq.${rootNoteId}`)
    .order('version', { ascending: false });

  if (error) {
    console.error('Error fetching note history:', error);
    return { data: [], error: error.message };
  }

  // Transform to NoteVersion format
  const history: NoteVersion[] = (versions || []).map((v) => ({
    id: v.id,
    version: v.version,
    title: v.title,
    content: v.content,
    category: v.category,
    is_confidential: v.is_confidential,
    confidential_roles: v.confidential_roles,
    document_id: v.document_id,
    is_current: v.is_current,
    created_at: v.created_at,
    created_by: v.created_by,
    creator: v.creator as { id: string; full_name: string } | null,
    document: v.document as { id: string; title: string; file_name: string; file_type: string | null } | null,
  }));

  return { data: history, error: null };
}

/**
 * Compare two versions of a note.
 * Returns both versions for side-by-side comparison.
 */
export async function compareNoteVersions(
  noteId: string,
  versionA: number,
  versionB: number
): Promise<{
  data: { versionA: NoteVersion | null; versionB: NoteVersion | null } | null;
  error: string | null;
}> {
  const supabase = await createServerSupabaseClient();

  // Permission check
  const auth = await authorizePermission(PERMISSIONS.NOTES_VIEW);
  if (!auth.authorized) {
    return { data: null, error: auth.error || 'Unauthorized' };
  }

  // Get the note to find its root
  const { data: note, error: noteError } = await supabase
    .from('entity_notes')
    .select('id, parent_note_id')
    .eq('id', noteId)
    .single();

  if (noteError || !note) {
    return { data: null, error: 'Note not found' };
  }

  const rootNoteId = note.parent_note_id || note.id;

  // Fetch both versions
  const { data: versions, error } = await supabase
    .from('entity_notes')
    .select(
      `
      id,
      version,
      title,
      content,
      category,
      is_confidential,
      confidential_roles,
      document_id,
      is_current,
      created_at,
      created_by,
      creator:profiles!created_by(id, full_name),
      document:documents(id, title, file_name, file_type)
    `
    )
    .or(`id.eq.${rootNoteId},parent_note_id.eq.${rootNoteId}`)
    .in('version', [versionA, versionB]);

  if (error) {
    console.error('Error comparing note versions:', error);
    return { data: null, error: error.message };
  }

  const vA = versions?.find((v) => v.version === versionA);
  const vB = versions?.find((v) => v.version === versionB);

  const toNoteVersion = (v: typeof versions[number] | undefined): NoteVersion | null => {
    if (!v) return null;
    return {
      id: v.id,
      version: v.version,
      title: v.title,
      content: v.content,
      category: v.category,
      is_confidential: v.is_confidential,
      confidential_roles: v.confidential_roles,
      document_id: v.document_id,
      is_current: v.is_current,
      created_at: v.created_at,
      created_by: v.created_by,
      creator: v.creator as { id: string; full_name: string } | null,
      document: v.document as { id: string; title: string; file_name: string; file_type: string | null } | null,
    };
  };

  return {
    data: {
      versionA: toNoteVersion(vA),
      versionB: toNoteVersion(vB),
    },
    error: null,
  };
}

/**
 * Restore a previous version of a note.
 * Creates a new current version with the content of the specified historical version.
 */
export async function restoreNoteVersion(
  noteId: string,
  versionToRestore: number
): Promise<{ data: EntityNoteWithRelations | null; error: string | null }> {
  const supabase = await createServerSupabaseClient();

  // Get current user
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return { data: null, error: 'Not authenticated' };
  }

  // Permission check - need update permission to restore
  const auth = await authorizePermission(PERMISSIONS.NOTES_UPDATE);
  if (!auth.authorized) {
    return { data: null, error: auth.error || 'Unauthorized' };
  }

  // Get the note to find its root
  const { data: note, error: noteError } = await supabase
    .from('entity_notes')
    .select('id, parent_note_id')
    .eq('id', noteId)
    .single();

  if (noteError || !note) {
    return { data: null, error: 'Note not found' };
  }

  const rootNoteId = note.parent_note_id || note.id;

  // Get the version to restore
  const { data: versionData, error: versionError } = await supabase
    .from('entity_notes')
    .select('*')
    .or(`id.eq.${rootNoteId},parent_note_id.eq.${rootNoteId}`)
    .eq('version', versionToRestore)
    .single();

  if (versionError || !versionData) {
    return { data: null, error: `Version ${versionToRestore} not found` };
  }

  // Get the current highest version
  const { data: currentVersions } = await supabase
    .from('entity_notes')
    .select('id, version')
    .or(`id.eq.${rootNoteId},parent_note_id.eq.${rootNoteId}`)
    .eq('is_current', true)
    .order('version', { ascending: false })
    .limit(1);

  const currentNote = currentVersions?.[0];
  const nextVersion = (currentNote?.version || 1) + 1;

  // Mark current version as not current
  if (currentNote) {
    await supabase
      .from('entity_notes')
      .update({ is_current: false })
      .eq('id', currentNote.id);
  }

  // Create new version with restored content
  const { data: restoredNote, error: insertError } = await supabase
    .from('entity_notes')
    .insert({
      entity_type: versionData.entity_type,
      entity_id: versionData.entity_id,
      title: versionData.title,
      content: versionData.content,
      category: versionData.category,
      is_confidential: versionData.is_confidential,
      confidential_roles: versionData.confidential_roles,
      document_id: versionData.document_id,
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
    // Rollback
    if (currentNote) {
      await supabase
        .from('entity_notes')
        .update({ is_current: true })
        .eq('id', currentNote.id);
    }
    console.error('Error restoring note version:', insertError);
    return { data: null, error: 'Failed to restore note version' };
  }

  return { data: restoredNote as EntityNoteWithRelations, error: null };
}

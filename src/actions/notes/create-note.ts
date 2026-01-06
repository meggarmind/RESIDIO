'use server';

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { authorizePermission } from '@/lib/auth/authorize';
import { PERMISSIONS } from '@/lib/auth/action-roles';
import { logAudit } from '@/lib/audit/logger';
import type {
  EntityNoteWithRelations,
  CreateNoteInput,
  NoteEntityType,
} from '@/types/database';

type CreateNoteResponse = {
  data: EntityNoteWithRelations | null;
  error: string | null;
};

/**
 * Create a new note for a resident or house entity.
 * Supports optional document attachment and role-based confidentiality.
 */
export async function createNote(
  input: CreateNoteInput
): Promise<CreateNoteResponse> {
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
  const auth = await authorizePermission(PERMISSIONS.NOTES_CREATE);
  if (!auth.authorized) {
    return { data: null, error: auth.error || 'Unauthorized' };
  }

  // Validate input
  if (!input.entity_type || !input.entity_id) {
    return { data: null, error: 'Entity type and ID are required' };
  }

  if (!input.content?.trim()) {
    return { data: null, error: 'Note content is required' };
  }

  // Verify the entity exists
  const entityTable = input.entity_type === 'resident' ? 'residents' : 'houses';
  const { data: entity, error: entityError } = await supabase
    .from(entityTable)
    .select('id')
    .eq('id', input.entity_id)
    .single();

  if (entityError || !entity) {
    return {
      data: null,
      error: `${input.entity_type === 'resident' ? 'Resident' : 'House'} not found`,
    };
  }

  // If document_id provided, verify it exists
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

  // Create the note
  const { data: note, error: insertError } = await supabase
    .from('entity_notes')
    .insert({
      entity_type: input.entity_type as NoteEntityType,
      entity_id: input.entity_id,
      title: input.title?.trim() || null,
      content: input.content.trim(),
      category: input.category || 'general',
      is_confidential: input.is_confidential || false,
      confidential_roles: input.confidential_roles || null,
      document_id: input.document_id || null,
      created_by: user.id,
      version: 1,
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
    console.error('Error creating note:', insertError);
    return { data: null, error: `Failed to create note: ${insertError.message}` };
  }

  // Audit log
  await logAudit({
    action: 'CREATE',
    entityType: 'entity_notes',
    entityId: note.id,
    entityDisplay: note.title || `Note on ${input.entity_type}`,
    newValues: {
      entity_type: note.entity_type,
      entity_id: note.entity_id,
      title: note.title,
      category: note.category,
      is_confidential: note.is_confidential,
      document_id: note.document_id,
    },
    description: `Created ${note.is_confidential ? 'confidential ' : ''}note on ${input.entity_type}`,
  });

  return { data: note as EntityNoteWithRelations, error: null };
}

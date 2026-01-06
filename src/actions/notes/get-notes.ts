'use server';

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { authorizePermission } from '@/lib/auth/authorize';
import { PERMISSIONS } from '@/lib/auth/action-roles';
import type {
  EntityNoteWithRelations,
  NoteListParams,
  NoteEntityType,
  NoteCategory,
} from '@/types/database';

type GetNotesResponse = {
  data: EntityNoteWithRelations[];
  count: number;
  error: string | null;
};

type GetNoteResponse = {
  data: EntityNoteWithRelations | null;
  error: string | null;
};

/**
 * Get all current notes for a specific entity (resident or house).
 * Returns only is_current=true notes by default.
 * RLS policies handle confidential note visibility.
 */
export async function getNotes(params: NoteListParams): Promise<GetNotesResponse> {
  const supabase = await createServerSupabaseClient();

  // Permission check
  const auth = await authorizePermission(PERMISSIONS.NOTES_VIEW);
  if (!auth.authorized) {
    return { data: [], count: 0, error: auth.error || 'Unauthorized' };
  }

  // Build query
  let query = supabase
    .from('entity_notes')
    .select(
      `
      *,
      creator:profiles!created_by(id, full_name),
      document:documents(id, title, file_name, file_type)
    `,
      { count: 'exact' }
    )
    .eq('entity_type', params.entity_type)
    .eq('entity_id', params.entity_id)
    .eq('is_current', true);

  // Filter by category if provided
  if (params.category) {
    query = query.eq('category', params.category);
  }

  // Filter by confidentiality if specified
  if (params.is_confidential !== undefined) {
    query = query.eq('is_confidential', params.is_confidential);
  }

  // Pagination
  const page = params.page || 1;
  const limit = params.limit || 20;
  const offset = (page - 1) * limit;

  query = query
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  const { data, count, error } = await query;

  if (error) {
    console.error('Error fetching notes:', error);
    return { data: [], count: 0, error: error.message };
  }

  return {
    data: (data as EntityNoteWithRelations[]) || [],
    count: count || 0,
    error: null,
  };
}

/**
 * Get a single note by ID.
 */
export async function getNote(id: string): Promise<GetNoteResponse> {
  const supabase = await createServerSupabaseClient();

  // Permission check
  const auth = await authorizePermission(PERMISSIONS.NOTES_VIEW);
  if (!auth.authorized) {
    return { data: null, error: auth.error || 'Unauthorized' };
  }

  const { data, error } = await supabase
    .from('entity_notes')
    .select(
      `
      *,
      creator:profiles!created_by(id, full_name),
      document:documents(id, title, file_name, file_type)
    `
    )
    .eq('id', id)
    .single();

  if (error) {
    console.error('Error fetching note:', error);
    return { data: null, error: error.message };
  }

  return { data: data as EntityNoteWithRelations, error: null };
}

/**
 * Get note statistics for an entity.
 * Returns counts by category and confidentiality.
 */
export async function getNoteStats(
  entityType: NoteEntityType,
  entityId: string
): Promise<{
  data: {
    total: number;
    by_category: Record<NoteCategory, number>;
    confidential_count: number;
  } | null;
  error: string | null;
}> {
  const supabase = await createServerSupabaseClient();

  // Permission check
  const auth = await authorizePermission(PERMISSIONS.NOTES_VIEW);
  if (!auth.authorized) {
    return { data: null, error: auth.error || 'Unauthorized' };
  }

  // Get all current notes for this entity (RLS filters confidential ones)
  const { data: notes, error } = await supabase
    .from('entity_notes')
    .select('id, category, is_confidential')
    .eq('entity_type', entityType)
    .eq('entity_id', entityId)
    .eq('is_current', true);

  if (error) {
    console.error('Error fetching note stats:', error);
    return { data: null, error: error.message };
  }

  // Calculate statistics
  const byCategory: Record<NoteCategory, number> = {
    general: 0,
    agreement: 0,
    complaint: 0,
    reminder: 0,
    financial: 0,
    security: 0,
    maintenance: 0,
    legal: 0,
  };

  let confidentialCount = 0;

  for (const note of notes || []) {
    byCategory[note.category as NoteCategory]++;
    if (note.is_confidential) {
      confidentialCount++;
    }
  }

  return {
    data: {
      total: notes?.length || 0,
      by_category: byCategory,
      confidential_count: confidentialCount,
    },
    error: null,
  };
}

/**
 * Search notes across all entities.
 * Useful for admin search functionality.
 */
export async function searchNotes(params: {
  query: string;
  entity_type?: NoteEntityType;
  category?: NoteCategory;
  limit?: number;
}): Promise<GetNotesResponse> {
  const supabase = await createServerSupabaseClient();

  // Permission check
  const auth = await authorizePermission(PERMISSIONS.NOTES_VIEW);
  if (!auth.authorized) {
    return { data: [], count: 0, error: auth.error || 'Unauthorized' };
  }

  const searchTerm = params.query.trim();
  if (!searchTerm) {
    return { data: [], count: 0, error: 'Search query is required' };
  }

  // Build query with text search
  let query = supabase
    .from('entity_notes')
    .select(
      `
      *,
      creator:profiles!created_by(id, full_name),
      document:documents(id, title, file_name, file_type)
    `,
      { count: 'exact' }
    )
    .eq('is_current', true)
    .or(`title.ilike.%${searchTerm}%,content.ilike.%${searchTerm}%`);

  // Apply filters
  if (params.entity_type) {
    query = query.eq('entity_type', params.entity_type);
  }
  if (params.category) {
    query = query.eq('category', params.category);
  }

  // Limit results
  const limit = params.limit || 50;
  query = query.order('created_at', { ascending: false }).limit(limit);

  const { data, count, error } = await query;

  if (error) {
    console.error('Error searching notes:', error);
    return { data: [], count: 0, error: error.message };
  }

  return {
    data: (data as EntityNoteWithRelations[]) || [],
    count: count || 0,
    error: null,
  };
}

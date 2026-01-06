'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getNotes,
  getNote,
  getNoteStats,
  searchNotes,
  createNote,
  updateNote,
  deleteNote,
  deleteNoteVersion,
  getNoteHistory,
  compareNoteVersions,
  restoreNoteVersion,
} from '@/actions/notes';
import type {
  NoteListParams,
  CreateNoteInput,
  UpdateNoteInput,
  NoteEntityType,
  NoteCategory,
} from '@/types/database';

// =====================================================
// Note Queries
// =====================================================

/**
 * Fetch notes for a specific entity (resident or house).
 * Returns current versions only, with pagination support.
 */
export function useNotes(params: NoteListParams) {
  return useQuery({
    queryKey: ['notes', params],
    queryFn: async () => {
      const result = await getNotes(params);
      if (result.error) throw new Error(result.error);
      return { data: result.data, count: result.count };
    },
    enabled: !!params.entity_type && !!params.entity_id,
  });
}

/**
 * Fetch a single note by ID.
 */
export function useNote(id: string | undefined) {
  return useQuery({
    queryKey: ['note', id],
    queryFn: async () => {
      if (!id) throw new Error('Note ID is required');
      const result = await getNote(id);
      if (result.error) throw new Error(result.error);
      return result.data;
    },
    enabled: !!id,
  });
}

/**
 * Fetch note statistics for an entity.
 * Returns counts by category and confidentiality.
 */
export function useNoteStats(entityType: NoteEntityType | undefined, entityId: string | undefined) {
  return useQuery({
    queryKey: ['noteStats', entityType, entityId],
    queryFn: async () => {
      if (!entityType || !entityId) throw new Error('Entity type and ID are required');
      const result = await getNoteStats(entityType, entityId);
      if (result.error) throw new Error(result.error);
      return result.data;
    },
    enabled: !!entityType && !!entityId,
  });
}

/**
 * Search notes across entities.
 */
export function useSearchNotes(params: {
  query: string;
  entity_type?: NoteEntityType;
  category?: NoteCategory;
  limit?: number;
}) {
  return useQuery({
    queryKey: ['notesSearch', params],
    queryFn: async () => {
      const result = await searchNotes(params);
      if (result.error) throw new Error(result.error);
      return { data: result.data, count: result.count };
    },
    enabled: params.query.length >= 2,
  });
}

/**
 * Fetch version history for a note.
 */
export function useNoteHistory(noteId: string | undefined) {
  return useQuery({
    queryKey: ['noteHistory', noteId],
    queryFn: async () => {
      if (!noteId) throw new Error('Note ID is required');
      const result = await getNoteHistory(noteId);
      if (result.error) throw new Error(result.error);
      return result.data;
    },
    enabled: !!noteId,
  });
}

/**
 * Compare two versions of a note.
 */
export function useCompareNoteVersions(
  noteId: string | undefined,
  versionA: number,
  versionB: number
) {
  return useQuery({
    queryKey: ['noteVersionComparison', noteId, versionA, versionB],
    queryFn: async () => {
      if (!noteId) throw new Error('Note ID is required');
      const result = await compareNoteVersions(noteId, versionA, versionB);
      if (result.error) throw new Error(result.error);
      return result.data;
    },
    enabled: !!noteId && versionA > 0 && versionB > 0,
  });
}

// =====================================================
// Note Mutations
// =====================================================

/**
 * Create a new note.
 */
export function useCreateNote() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateNoteInput) => {
      const result = await createNote(input);
      if (result.error) throw new Error(result.error);
      return result.data;
    },
    onSuccess: (data) => {
      if (data) {
        // Invalidate notes list for this entity
        queryClient.invalidateQueries({
          queryKey: ['notes', { entity_type: data.entity_type, entity_id: data.entity_id }],
        });
        // Invalidate stats
        queryClient.invalidateQueries({
          queryKey: ['noteStats', data.entity_type, data.entity_id],
        });
        // Invalidate search results
        queryClient.invalidateQueries({ queryKey: ['notesSearch'] });
      }
    },
  });
}

/**
 * Update a note (creates a new version).
 */
export function useUpdateNote() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: UpdateNoteInput }) => {
      const result = await updateNote(id, data);
      if (result.error) throw new Error(result.error);
      return result.data;
    },
    onSuccess: (data, variables) => {
      if (data) {
        // Invalidate specific note
        queryClient.invalidateQueries({ queryKey: ['note', variables.id] });
        // Invalidate notes list for this entity
        queryClient.invalidateQueries({
          queryKey: ['notes', { entity_type: data.entity_type, entity_id: data.entity_id }],
        });
        // Invalidate history
        queryClient.invalidateQueries({ queryKey: ['noteHistory', variables.id] });
        // Invalidate stats
        queryClient.invalidateQueries({
          queryKey: ['noteStats', data.entity_type, data.entity_id],
        });
        // Invalidate search results
        queryClient.invalidateQueries({ queryKey: ['notesSearch'] });
      }
    },
  });
}

/**
 * Delete a note and all its versions.
 */
export function useDeleteNote() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      entityType,
      entityId,
    }: {
      id: string;
      entityType: NoteEntityType;
      entityId: string;
    }) => {
      const result = await deleteNote(id);
      if (result.error) throw new Error(result.error);
      return { success: result.success, entityType, entityId };
    },
    onSuccess: (data) => {
      // Invalidate notes list for this entity
      queryClient.invalidateQueries({
        queryKey: ['notes', { entity_type: data.entityType, entity_id: data.entityId }],
      });
      // Invalidate stats
      queryClient.invalidateQueries({
        queryKey: ['noteStats', data.entityType, data.entityId],
      });
      // Invalidate search results
      queryClient.invalidateQueries({ queryKey: ['notesSearch'] });
    },
  });
}

/**
 * Delete a specific version of a note.
 */
export function useDeleteNoteVersion() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      noteId,
      entityType,
      entityId,
    }: {
      id: string;
      noteId: string;
      entityType: NoteEntityType;
      entityId: string;
    }) => {
      const result = await deleteNoteVersion(id);
      if (result.error) throw new Error(result.error);
      return { success: result.success, noteId, entityType, entityId };
    },
    onSuccess: (data) => {
      // Invalidate specific note
      queryClient.invalidateQueries({ queryKey: ['note', data.noteId] });
      // Invalidate history
      queryClient.invalidateQueries({ queryKey: ['noteHistory', data.noteId] });
      // Invalidate notes list
      queryClient.invalidateQueries({
        queryKey: ['notes', { entity_type: data.entityType, entity_id: data.entityId }],
      });
    },
  });
}

/**
 * Restore a previous version of a note.
 */
export function useRestoreNoteVersion() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      noteId,
      version,
    }: {
      noteId: string;
      version: number;
    }) => {
      const result = await restoreNoteVersion(noteId, version);
      if (result.error) throw new Error(result.error);
      return result.data;
    },
    onSuccess: (data, variables) => {
      if (data) {
        // Invalidate specific note
        queryClient.invalidateQueries({ queryKey: ['note', variables.noteId] });
        // Invalidate history
        queryClient.invalidateQueries({ queryKey: ['noteHistory', variables.noteId] });
        // Invalidate notes list
        queryClient.invalidateQueries({
          queryKey: ['notes', { entity_type: data.entity_type, entity_id: data.entity_id }],
        });
        // Invalidate search results
        queryClient.invalidateQueries({ queryKey: ['notesSearch'] });
      }
    },
  });
}

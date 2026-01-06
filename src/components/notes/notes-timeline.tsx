'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { SimplePagination } from '@/components/ui/simple-pagination';
import { NoteGrid } from './note-card';
import { NoteFormDialog } from './note-form';
import { NoteHistoryDialog } from './note-history-dialog';
import { NoteDetailDialog } from './note-detail-dialog';
import { Plus, StickyNote, Filter, Loader2 } from 'lucide-react';
import { useNotes, useDeleteNote, useNoteStats } from '@/hooks/use-notes';
import type {
  NoteEntityType,
  NoteCategory,
  EntityNoteWithRelations,
} from '@/types/database';
import { NOTE_CATEGORY_LABELS } from '@/types/database';
import { toast } from 'sonner';

interface NotesTimelineProps {
  entityType: NoteEntityType;
  entityId: string;
  canCreate?: boolean;
  canEdit?: boolean;
  canDelete?: boolean;
}

export function NotesTimeline({
  entityType,
  entityId,
  canCreate = false,
  canEdit = false,
  canDelete = false,
}: NotesTimelineProps) {
  // Pagination state
  const [page, setPage] = useState(1);
  const [category, setCategory] = useState<NoteCategory | 'all'>('all');
  const limit = 9;

  // Dialog states
  const [formOpen, setFormOpen] = useState(false);
  const [editingNote, setEditingNote] = useState<EntityNoteWithRelations | null>(null);
  const [viewingNote, setViewingNote] = useState<EntityNoteWithRelations | null>(null);
  const [historyNoteId, setHistoryNoteId] = useState<string | null>(null);
  const [deleteNoteData, setDeleteNoteData] = useState<EntityNoteWithRelations | null>(null);

  // Fetch notes
  const { data, isLoading, error, refetch } = useNotes({
    entity_type: entityType,
    entity_id: entityId,
    category: category === 'all' ? undefined : category,
    page,
    limit,
  });

  // Fetch stats
  const { data: stats } = useNoteStats(entityType, entityId);

  // Delete mutation
  const deleteNote = useDeleteNote();

  const handleEdit = (note: EntityNoteWithRelations) => {
    setEditingNote(note);
    setFormOpen(true);
  };

  const handleView = (note: EntityNoteWithRelations) => {
    setViewingNote(note);
  };

  const handleHistory = (note: EntityNoteWithRelations) => {
    setHistoryNoteId(note.id);
  };

  const handleDelete = async () => {
    if (!deleteNoteData) return;

    try {
      await deleteNote.mutateAsync({
        id: deleteNoteData.id,
        entityType,
        entityId,
      });
      toast.success('Note deleted successfully');
      setDeleteNoteData(null);
    } catch {
      toast.error('Failed to delete note');
    }
  };

  const handleFormClose = () => {
    setFormOpen(false);
    setEditingNote(null);
  };

  const categories = Object.entries(NOTE_CATEGORY_LABELS) as [NoteCategory, string][];
  const totalPages = Math.ceil((data?.count || 0) / limit);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <StickyNote className="h-5 w-5 text-muted-foreground" />
          <h3 className="text-lg font-semibold">Notes</h3>
          {stats && (
            <span className="text-sm text-muted-foreground">
              ({stats.total} total)
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Category filter */}
          <Select
            value={category}
            onValueChange={(value) => {
              setCategory(value as NoteCategory | 'all');
              setPage(1);
            }}
          >
            <SelectTrigger className="w-[150px]">
              <Filter className="h-4 w-4 mr-2" />
              <SelectValue placeholder="All categories" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All categories</SelectItem>
              {categories.map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Add note button */}
          {canCreate && (
            <Button onClick={() => setFormOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Add Note
            </Button>
          )}
        </div>
      </div>

      {/* Loading state */}
      {isLoading && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="border rounded-lg p-4 space-y-3">
              <div className="flex items-start gap-3">
                <Skeleton className="h-10 w-10 rounded-lg" />
                <div className="space-y-2 flex-1">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-4 w-1/2" />
                </div>
              </div>
              <Skeleton className="h-16 w-full" />
              <div className="flex justify-between">
                <Skeleton className="h-3 w-1/4" />
                <Skeleton className="h-3 w-1/4" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Error state */}
      {error && (
        <div className="text-center py-8 text-destructive">
          <p>Failed to load notes</p>
          <Button variant="outline" className="mt-2" onClick={() => refetch()}>
            Retry
          </Button>
        </div>
      )}

      {/* Notes grid */}
      {data && (
        <>
          <NoteGrid
            notes={data.data}
            onView={handleView}
            onEdit={canEdit ? handleEdit : undefined}
            onDelete={canDelete ? setDeleteNoteData : undefined}
            onHistory={handleHistory}
            canEdit={canEdit}
            canDelete={canDelete}
            emptyMessage={
              category === 'all'
                ? `No notes for this ${entityType} yet`
                : `No ${NOTE_CATEGORY_LABELS[category as NoteCategory]} notes found`
            }
          />

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex justify-center">
              <SimplePagination
                currentPage={page}
                totalPages={totalPages}
                onPageChange={setPage}
              />
            </div>
          )}
        </>
      )}

      {/* Create/Edit Form Dialog */}
      <NoteFormDialog
        open={formOpen}
        onOpenChange={handleFormClose}
        entityType={entityType}
        entityId={entityId}
        note={editingNote || undefined}
      />

      {/* View Detail Dialog */}
      {viewingNote && (
        <NoteDetailDialog
          open={!!viewingNote}
          onOpenChange={(open) => !open && setViewingNote(null)}
          note={viewingNote}
          onEdit={canEdit ? handleEdit : undefined}
          onDelete={canDelete ? setDeleteNoteData : undefined}
          onHistory={() => setHistoryNoteId(viewingNote.id)}
        />
      )}

      {/* History Dialog */}
      {historyNoteId && (
        <NoteHistoryDialog
          open={!!historyNoteId}
          onOpenChange={(open) => !open && setHistoryNoteId(null)}
          noteId={historyNoteId}
          entityType={entityType}
          entityId={entityId}
          canEdit={canEdit}
          canDelete={canDelete}
        />
      )}

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteNoteData} onOpenChange={(open) => !open && setDeleteNoteData(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Note</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this note? This will also delete all
              version history. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleteNote.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteNote.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

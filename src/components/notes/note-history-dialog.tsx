'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
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
import { NoteCategoryBadge } from './note-category-badge';
import { History, RotateCcw, Trash2, CheckCircle, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { useNoteHistory, useRestoreNoteVersion, useDeleteNoteVersion } from '@/hooks/use-notes';
import type { NoteVersion, NoteEntityType } from '@/types/database';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface NoteHistoryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  noteId: string;
  entityType: NoteEntityType;
  entityId: string;
  canEdit?: boolean;
  canDelete?: boolean;
}

export function NoteHistoryDialog({
  open,
  onOpenChange,
  noteId,
  entityType,
  entityId,
  canEdit = false,
  canDelete = false,
}: NoteHistoryDialogProps) {
  const [selectedVersion, setSelectedVersion] = useState<NoteVersion | null>(null);
  const [restoreConfirmOpen, setRestoreConfirmOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  const { data: history, isLoading, error } = useNoteHistory(noteId);
  const restoreVersion = useRestoreNoteVersion();
  const deleteVersion = useDeleteNoteVersion();

  const handleRestore = async () => {
    if (!selectedVersion) return;

    try {
      await restoreVersion.mutateAsync({
        noteId,
        version: selectedVersion.version,
      });
      toast.success(`Restored version ${selectedVersion.version}`);
      setRestoreConfirmOpen(false);
      setSelectedVersion(null);
    } catch {
      toast.error('Failed to restore version');
    }
  };

  const handleDelete = async () => {
    if (!selectedVersion) return;

    try {
      await deleteVersion.mutateAsync({
        id: selectedVersion.id,
        noteId,
        entityType,
        entityId,
      });
      toast.success(`Deleted version ${selectedVersion.version}`);
      setDeleteConfirmOpen(false);
      setSelectedVersion(null);
    } catch {
      toast.error('Failed to delete version');
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[700px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <History className="h-5 w-5" />
              Version History
            </DialogTitle>
            <DialogDescription>
              View and manage previous versions of this note
            </DialogDescription>
          </DialogHeader>

          {isLoading && (
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="p-4 border rounded-lg space-y-2">
                  <Skeleton className="h-4 w-1/4" />
                  <Skeleton className="h-16 w-full" />
                  <Skeleton className="h-4 w-1/3" />
                </div>
              ))}
            </div>
          )}

          {error && (
            <div className="text-center py-8 text-destructive">
              <p>Failed to load version history</p>
            </div>
          )}

          {history && history.length > 0 && (
            <ScrollArea className="max-h-[500px]">
              <div className="space-y-4 pr-4">
                {history.map((version) => (
                  <div
                    key={version.id}
                    className={cn(
                      'p-4 border rounded-lg transition-colors',
                      version.is_current
                        ? 'border-primary bg-primary/5'
                        : 'hover:bg-muted/50',
                      selectedVersion?.id === version.id && 'ring-2 ring-primary'
                    )}
                    onClick={() => setSelectedVersion(version)}
                    role="button"
                    tabIndex={0}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <Badge variant={version.is_current ? 'default' : 'secondary'}>
                          Version {version.version}
                        </Badge>
                        {version.is_current && (
                          <Badge variant="outline" className="text-green-600 border-green-600">
                            <CheckCircle className="h-3 w-3 mr-1" />
                            Current
                          </Badge>
                        )}
                        <NoteCategoryBadge category={version.category} size="sm" showIcon={false} />
                      </div>
                      {!version.is_current && canEdit && (
                        <div className="flex gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedVersion(version);
                              setRestoreConfirmOpen(true);
                            }}
                            disabled={restoreVersion.isPending}
                          >
                            <RotateCcw className="h-4 w-4" />
                          </Button>
                          {canDelete && (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedVersion(version);
                                setDeleteConfirmOpen(true);
                              }}
                              disabled={deleteVersion.isPending}
                              className="text-destructive hover:text-destructive"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      )}
                    </div>

                    {version.title && (
                      <h4 className="font-medium mb-1">{version.title}</h4>
                    )}

                    <p className="text-sm text-muted-foreground whitespace-pre-wrap line-clamp-3">
                      {version.content}
                    </p>

                    <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground">
                      <span>
                        by <span className="font-medium">{version.creator?.full_name || 'Unknown'}</span>
                      </span>
                      <span>{format(new Date(version.created_at), 'PPp')}</span>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}

          {history && history.length === 0 && (
            <div className="text-center py-8 text-muted-foreground">
              <p>No version history available</p>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Restore Confirmation */}
      <AlertDialog open={restoreConfirmOpen} onOpenChange={setRestoreConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Restore this version?</AlertDialogTitle>
            <AlertDialogDescription>
              This will create a new current version with the content from version{' '}
              {selectedVersion?.version}. The existing current version will be preserved
              in the history.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRestore}
              disabled={restoreVersion.isPending}
            >
              {restoreVersion.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Restore
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Confirmation */}
      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this version?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete version {selectedVersion?.version}. This
              action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleteVersion.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteVersion.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

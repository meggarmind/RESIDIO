'use client';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { NoteCategoryBadge, ConfidentialBadge } from './note-category-badge';
import {
  StickyNote,
  Pencil,
  Trash2,
  History,
  FileText,
  User,
  Calendar,
  ExternalLink,
} from 'lucide-react';
import { format } from 'date-fns';
import type { EntityNoteWithRelations } from '@/types/database';
import { cn } from '@/lib/utils';

interface NoteDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  note: EntityNoteWithRelations;
  onEdit?: (note: EntityNoteWithRelations) => void;
  onDelete?: (note: EntityNoteWithRelations) => void;
  onHistory?: () => void;
}

export function NoteDetailDialog({
  open,
  onOpenChange,
  note,
  onEdit,
  onDelete,
  onHistory,
}: NoteDetailDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <div
              className={cn(
                'p-2 rounded-lg bg-muted',
                note.is_confidential && 'bg-destructive/10'
              )}
            >
              <StickyNote
                className={cn(
                  'h-5 w-5 text-muted-foreground',
                  note.is_confidential && 'text-destructive'
                )}
              />
            </div>
            <div className="min-w-0">
              <span className="block truncate">
                {note.title || 'Untitled Note'}
              </span>
              <div className="flex items-center gap-2 mt-1">
                <NoteCategoryBadge category={note.category} size="sm" />
                {note.version > 1 && (
                  <Badge variant="outline" className="text-xs">
                    v{note.version}
                  </Badge>
                )}
                {note.is_confidential && <ConfidentialBadge />}
              </div>
            </div>
          </DialogTitle>
          <DialogDescription className="sr-only">
            Note details
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Content */}
          <div className="rounded-lg border bg-muted/30 p-4">
            <p className="text-sm whitespace-pre-wrap">{note.content}</p>
          </div>

          {/* Linked Document */}
          {note.document && (
            <div className="flex items-center gap-3 p-3 rounded-lg border">
              <FileText className="h-5 w-5 text-muted-foreground" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{note.document.title}</p>
                <p className="text-xs text-muted-foreground">
                  {note.document.file_type?.toUpperCase() || 'Document'}
                </p>
              </div>
              <Button variant="ghost" size="sm">
                <ExternalLink className="h-4 w-4" />
              </Button>
            </div>
          )}

          {/* Confidential Roles */}
          {note.is_confidential && note.confidential_roles && note.confidential_roles.length > 0 && (
            <div className="text-sm">
              <p className="text-muted-foreground mb-2">Visible to:</p>
              <div className="flex flex-wrap gap-2">
                {note.confidential_roles.map((role) => (
                  <Badge key={role} variant="secondary">
                    {role.replace('_', ' ')}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          <Separator />

          {/* Metadata */}
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <div className="flex items-center gap-2">
              <User className="h-4 w-4" />
              <span>{note.creator?.full_name || 'Unknown'}</span>
            </div>
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              <span>{format(new Date(note.created_at), 'PPp')}</span>
            </div>
          </div>

          {/* Actions */}
          <div className="flex flex-wrap gap-2 pt-2">
            {note.version > 1 && (
              <Button variant="outline" onClick={onHistory}>
                <History className="h-4 w-4 mr-2" />
                View History
              </Button>
            )}
            {onEdit && (
              <Button
                variant="outline"
                onClick={() => {
                  onOpenChange(false);
                  onEdit(note);
                }}
              >
                <Pencil className="h-4 w-4 mr-2" />
                Edit
              </Button>
            )}
            {onDelete && (
              <Button
                variant="outline"
                className="text-destructive hover:text-destructive"
                onClick={() => {
                  onOpenChange(false);
                  onDelete(note);
                }}
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Delete
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

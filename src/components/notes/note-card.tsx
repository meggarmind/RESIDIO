'use client';

import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { NoteCategoryBadge, ConfidentialBadge } from './note-category-badge';
import {
  StickyNote,
  MoreVertical,
  Pencil,
  Trash2,
  History,
  FileText,
  Eye,
} from 'lucide-react';
import { formatDistanceToNow, format } from 'date-fns';
import type { EntityNoteWithRelations } from '@/types/database';
import { cn } from '@/lib/utils';

interface NoteCardProps {
  note: EntityNoteWithRelations;
  onView?: (note: EntityNoteWithRelations) => void;
  onEdit?: (note: EntityNoteWithRelations) => void;
  onDelete?: (note: EntityNoteWithRelations) => void;
  onHistory?: (note: EntityNoteWithRelations) => void;
  canEdit?: boolean;
  canDelete?: boolean;
  compact?: boolean;
}

export function NoteCard({
  note,
  onView,
  onEdit,
  onDelete,
  onHistory,
  canEdit = false,
  canDelete = false,
  compact = false,
}: NoteCardProps) {
  return (
    <Card
      className={cn(
        'hover:shadow-md transition-shadow',
        note.is_confidential && 'border-destructive/30 bg-destructive/5'
      )}
    >
      <CardHeader className={cn('pb-3', compact && 'pb-2')}>
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-start gap-3 min-w-0">
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
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                {note.title ? (
                  <h3 className="font-medium truncate" title={note.title}>
                    {note.title}
                  </h3>
                ) : (
                  <h3 className="font-medium text-muted-foreground italic">
                    Untitled Note
                  </h3>
                )}
                {note.version > 1 && (
                  <span className="text-xs text-muted-foreground">
                    v{note.version}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                <NoteCategoryBadge category={note.category} size="sm" />
                {note.is_confidential && <ConfidentialBadge />}
              </div>
            </div>
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => onView?.(note)}>
                <Eye className="h-4 w-4 mr-2" />
                View Details
              </DropdownMenuItem>
              {note.version > 1 && (
                <DropdownMenuItem onClick={() => onHistory?.(note)}>
                  <History className="h-4 w-4 mr-2" />
                  Version History
                </DropdownMenuItem>
              )}
              {canEdit && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => onEdit?.(note)}>
                    <Pencil className="h-4 w-4 mr-2" />
                    Edit
                  </DropdownMenuItem>
                </>
              )}
              {canDelete && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => onDelete?.(note)}
                    className="text-destructive focus:text-destructive"
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Delete
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </CardHeader>

      <CardContent className={cn('pb-3', compact && 'pb-2')}>
        <p
          className={cn(
            'text-sm text-muted-foreground whitespace-pre-wrap',
            compact ? 'line-clamp-2' : 'line-clamp-4'
          )}
        >
          {note.content}
        </p>

        {note.document && (
          <div className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
            <FileText className="h-4 w-4" />
            <span className="truncate" title={note.document.title}>
              {note.document.title}
            </span>
          </div>
        )}
      </CardContent>

      <CardFooter className="pt-3 border-t text-xs text-muted-foreground">
        <div className="flex justify-between w-full items-center">
          <span>
            by{' '}
            <span className="font-medium">
              {note.creator?.full_name || 'Unknown'}
            </span>
          </span>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <span>
                  {formatDistanceToNow(new Date(note.created_at), {
                    addSuffix: true,
                  })}
                </span>
              </TooltipTrigger>
              <TooltipContent>
                {format(new Date(note.created_at), 'PPpp')}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </CardFooter>
    </Card>
  );
}

interface NoteGridProps {
  notes: EntityNoteWithRelations[];
  onView?: (note: EntityNoteWithRelations) => void;
  onEdit?: (note: EntityNoteWithRelations) => void;
  onDelete?: (note: EntityNoteWithRelations) => void;
  onHistory?: (note: EntityNoteWithRelations) => void;
  canEdit?: boolean;
  canDelete?: boolean;
  compact?: boolean;
  emptyMessage?: string;
}

export function NoteGrid({
  notes,
  emptyMessage = 'No notes found',
  ...props
}: NoteGridProps) {
  if (notes.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <StickyNote className="h-12 w-12 mx-auto mb-4 opacity-50" />
        <p>{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {notes.map((note) => (
        <NoteCard key={note.id} note={note} {...props} />
      ))}
    </div>
  );
}

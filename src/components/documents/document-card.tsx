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
import { CategoryBadge, FileTypeBadge } from './category-badge';
import { FileText, Download, Eye, MoreVertical, Pencil, Trash2, Archive, History } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import type { DocumentWithRelations } from '@/types/database';

interface DocumentCardProps {
  document: DocumentWithRelations;
  onView?: (doc: DocumentWithRelations) => void;
  onDownload?: (doc: DocumentWithRelations) => void;
  onEdit?: (doc: DocumentWithRelations) => void;
  onDelete?: (doc: DocumentWithRelations) => void;
  onArchive?: (doc: DocumentWithRelations) => void;
  onVersionHistory?: (doc: DocumentWithRelations) => void;
  canEdit?: boolean;
  canDelete?: boolean;
}

export function DocumentCard({
  document,
  onView,
  onDownload,
  onEdit,
  onDelete,
  onArchive,
  onVersionHistory,
  canEdit = false,
  canDelete = false,
}: DocumentCardProps) {
  const formatFileSize = (bytes: number | null): string => {
    if (!bytes) return 'Unknown size';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <Card variant="compact" interactive>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-start gap-3 min-w-0">
            <div className="p-2 rounded-lg bg-muted">
              <FileText className="h-5 w-5 text-muted-foreground" />
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="font-medium truncate" title={document.title}>
                {document.title}
              </h3>
              <div className="flex items-center gap-2 mt-1">
                <FileTypeBadge mimeType={document.mime_type} />
                {document.version > 1 && (
                  <span className="text-xs text-muted-foreground">
                    v{document.version}
                  </span>
                )}
              </div>
            </div>
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Document options">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => onView?.(document)}>
                <Eye className="h-4 w-4 mr-2" />
                View
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onDownload?.(document)}>
                <Download className="h-4 w-4 mr-2" />
                Download
              </DropdownMenuItem>
              {document.version >= 1 && (
                <DropdownMenuItem onClick={() => onVersionHistory?.(document)}>
                  <History className="h-4 w-4 mr-2" />
                  Version History
                </DropdownMenuItem>
              )}
              {canEdit && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => onEdit?.(document)}>
                    <Pencil className="h-4 w-4 mr-2" />
                    Edit
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => onArchive?.(document)}>
                    <Archive className="h-4 w-4 mr-2" />
                    Archive
                  </DropdownMenuItem>
                </>
              )}
              {canDelete && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => onDelete?.(document)}
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

      <CardContent className="pb-3">
        {document.description && (
          <p className="text-sm text-muted-foreground line-clamp-2 mb-3">
            {document.description}
          </p>
        )}
        <CategoryBadge category={document.category} />
      </CardContent>

      <CardFooter className="pt-3 border-t text-xs text-muted-foreground">
        <div className="flex justify-between w-full">
          <span>{formatFileSize(document.file_size_bytes)}</span>
          <span title={new Date(document.created_at).toLocaleString()}>
            {formatDistanceToNow(new Date(document.created_at), { addSuffix: true })}
          </span>
        </div>
      </CardFooter>
    </Card>
  );
}

// Grid layout for document cards
interface DocumentGridProps {
  documents: DocumentWithRelations[];
  onView?: (doc: DocumentWithRelations) => void;
  onDownload?: (doc: DocumentWithRelations) => void;
  onEdit?: (doc: DocumentWithRelations) => void;
  onDelete?: (doc: DocumentWithRelations) => void;
  onArchive?: (doc: DocumentWithRelations) => void;
  onVersionHistory?: (doc: DocumentWithRelations) => void;
  canEdit?: boolean;
  canDelete?: boolean;
}

export function DocumentGrid({
  documents,
  ...props
}: DocumentGridProps) {
  if (documents.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
        <p>No documents found</p>
      </div>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {documents.map((doc) => (
        <DocumentCard key={doc.id} document={doc} {...props} />
      ))}
    </div>
  );
}

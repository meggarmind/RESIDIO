'use client';

import { useState, useCallback, memo } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Skeleton } from '@/components/ui/skeleton';
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
import { CategoryBadge, FileTypeBadge } from './category-badge';
import { DocumentPreview } from './document-preview';
import { DocumentUploadForm } from './document-upload-form';
import { useDocuments, useDocumentCategories, useDeleteDocument, useArchiveDocument } from '@/hooks/use-documents';
import { getDocumentDownloadUrl } from '@/actions/documents/download-document';
import {
  FileText,
  Plus,
  Search,
  Download,
  Eye,
  MoreVertical,
  Pencil,
  Trash2,
  Archive,
  LayoutGrid,
  List,
  X,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { toast } from 'sonner';
import type { DocumentWithRelations, DocumentListParams } from '@/types/database';
import { DocumentGrid } from './document-card';
import Link from 'next/link';

const ALL_VALUE = '_all';

// Memoized row component for performance
const DocumentRow = memo(function DocumentRow({
  document,
  onView,
  onDownload,
  onEdit,
  onDelete,
  onArchive,
  canEdit,
  canDelete,
}: {
  document: DocumentWithRelations;
  onView: (doc: DocumentWithRelations) => void;
  onDownload: (doc: DocumentWithRelations) => void;
  onEdit?: (doc: DocumentWithRelations) => void;
  onDelete?: (doc: DocumentWithRelations) => void;
  onArchive?: (doc: DocumentWithRelations) => void;
  canEdit: boolean;
  canDelete: boolean;
}) {
  const formatFileSize = (bytes: number | null): string => {
    if (!bytes) return '-';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <TableRow>
      <TableCell>
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-muted">
            <FileText className="h-4 w-4 text-muted-foreground" />
          </div>
          <div className="min-w-0">
            <p className="font-medium truncate max-w-[200px]" title={document.title}>
              {document.title}
            </p>
            <div className="flex items-center gap-2 mt-0.5">
              <FileTypeBadge mimeType={document.mime_type} />
              {document.version > 1 && (
                <span className="text-xs text-muted-foreground">v{document.version}</span>
              )}
            </div>
          </div>
        </div>
      </TableCell>
      <TableCell>
        <CategoryBadge category={document.category} />
      </TableCell>
      <TableCell className="text-muted-foreground">
        {formatFileSize(document.file_size_bytes)}
      </TableCell>
      <TableCell className="text-muted-foreground">
        {document.uploader?.full_name || '-'}
      </TableCell>
      <TableCell className="text-muted-foreground">
        {formatDistanceToNow(new Date(document.created_at), { addSuffix: true })}
      </TableCell>
      <TableCell className="text-right">
        <div className="flex justify-end gap-1">
          <Button variant="ghost" size="icon" onClick={() => onView(document)}>
            <Eye className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" onClick={() => onDownload(document)}>
            <Download className="h-4 w-4" />
          </Button>
          {(canEdit || canDelete) && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {canEdit && (
                  <>
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
          )}
        </div>
      </TableCell>
    </TableRow>
  );
});

interface DocumentsTableProps {
  canUpload?: boolean;
  canEdit?: boolean;
  canDelete?: boolean;
}

export function DocumentsTable({
  canUpload = false,
  canEdit = false,
  canDelete = false,
}: DocumentsTableProps) {
  const [params, setParams] = useState<DocumentListParams>({
    page: 1,
    limit: 20,
    is_archived: false,
  });
  const [search, setSearch] = useState('');
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');
  const [uploadOpen, setUploadOpen] = useState(false);
  const [previewDoc, setPreviewDoc] = useState<DocumentWithRelations | null>(null);
  const [deleteDoc, setDeleteDoc] = useState<DocumentWithRelations | null>(null);

  const { data, isLoading, refetch } = useDocuments(params);
  const { data: categories = [] } = useDocumentCategories();
  const deleteMutation = useDeleteDocument();
  const archiveMutation = useArchiveDocument();

  const handleSearch = useCallback((value: string) => {
    setSearch(value);
    setParams((prev) => ({ ...prev, search: value || undefined, page: 1 }));
  }, []);

  const handleCategoryChange = useCallback((value: string) => {
    setParams((prev) => ({
      ...prev,
      category_id: value === ALL_VALUE ? undefined : value,
      page: 1,
    }));
  }, []);

  const handleView = useCallback((doc: DocumentWithRelations) => {
    setPreviewDoc(doc);
  }, []);

  const handleDownload = useCallback(async (doc: DocumentWithRelations) => {
    try {
      const result = await getDocumentDownloadUrl(doc.id);
      if (result.url) {
        window.open(result.url, '_blank');
      } else {
        toast.error(result.error || 'Failed to generate download URL');
      }
    } catch {
      toast.error('Failed to download document');
    }
  }, []);

  const handleEdit = useCallback((doc: DocumentWithRelations) => {
    // Navigate to edit page
    window.location.href = `/documents/${doc.id}?edit=true`;
  }, []);

  const handleArchive = useCallback(async (doc: DocumentWithRelations) => {
    try {
      await archiveMutation.mutateAsync(doc.id);
      toast.success('Document archived');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to archive document');
    }
  }, [archiveMutation]);

  const handleDeleteConfirm = useCallback(async () => {
    if (!deleteDoc) return;

    try {
      await deleteMutation.mutateAsync(deleteDoc.id);
      toast.success('Document deleted');
      setDeleteDoc(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to delete document');
    }
  }, [deleteDoc, deleteMutation]);

  const documents = data?.data ?? [];
  const totalCount = data?.count ?? 0;
  const totalPages = Math.ceil(totalCount / (params.limit ?? 20));

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-4 justify-between">
        <div className="flex flex-1 gap-2">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search documents..."
              value={search}
              onChange={(e) => handleSearch(e.target.value)}
              className="pl-9"
            />
            {search && (
              <Button
                variant="ghost"
                size="icon"
                className="absolute right-1 top-1/2 -translate-y-1/2 h-6 w-6"
                onClick={() => handleSearch('')}
              >
                <X className="h-3 w-3" />
              </Button>
            )}
          </div>

          <Select
            value={params.category_id ?? ALL_VALUE}
            onValueChange={handleCategoryChange}
          >
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="All Categories" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_VALUE}>All Categories</SelectItem>
              {categories.map((cat) => (
                <SelectItem key={cat.id} value={cat.id}>
                  {cat.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex gap-2">
          <div className="border rounded-lg p-1 flex">
            <Button
              variant={viewMode === 'list' ? 'secondary' : 'ghost'}
              size="icon"
              className="h-8 w-8"
              onClick={() => setViewMode('list')}
            >
              <List className="h-4 w-4" />
            </Button>
            <Button
              variant={viewMode === 'grid' ? 'secondary' : 'ghost'}
              size="icon"
              className="h-8 w-8"
              onClick={() => setViewMode('grid')}
            >
              <LayoutGrid className="h-4 w-4" />
            </Button>
          </div>

          {canUpload && (
            <Button onClick={() => setUploadOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Upload
            </Button>
          )}
        </div>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      ) : viewMode === 'grid' ? (
        <DocumentGrid
          documents={documents}
          onView={handleView}
          onDownload={handleDownload}
          onEdit={canEdit ? handleEdit : undefined}
          onDelete={canDelete ? (doc) => setDeleteDoc(doc) : undefined}
          onArchive={canEdit ? handleArchive : undefined}
          canEdit={canEdit}
          canDelete={canDelete}
        />
      ) : documents.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <p>No documents found</p>
          {canUpload && (
            <Button className="mt-4" onClick={() => setUploadOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Upload First Document
            </Button>
          )}
        </div>
      ) : (
        <div className="border rounded-lg">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Document</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Size</TableHead>
                <TableHead>Uploaded By</TableHead>
                <TableHead>Date</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {documents.map((doc) => (
                <DocumentRow
                  key={doc.id}
                  document={doc}
                  onView={handleView}
                  onDownload={handleDownload}
                  onEdit={handleEdit}
                  onDelete={(d) => setDeleteDoc(d)}
                  onArchive={handleArchive}
                  canEdit={canEdit}
                  canDelete={canDelete}
                />
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex justify-between items-center">
          <p className="text-sm text-muted-foreground">
            Showing {((params.page ?? 1) - 1) * (params.limit ?? 20) + 1} to{' '}
            {Math.min((params.page ?? 1) * (params.limit ?? 20), totalCount)} of {totalCount}
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={(params.page ?? 1) <= 1}
              onClick={() => setParams((p) => ({ ...p, page: (p.page ?? 1) - 1 }))}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={(params.page ?? 1) >= totalPages}
              onClick={() => setParams((p) => ({ ...p, page: (p.page ?? 1) + 1 }))}
            >
              Next
            </Button>
          </div>
        </div>
      )}

      {/* Modals */}
      <DocumentUploadForm
        open={uploadOpen}
        onOpenChange={setUploadOpen}
        onSuccess={() => refetch()}
      />

      <DocumentPreview
        document={previewDoc}
        open={!!previewDoc}
        onOpenChange={(open) => !open && setPreviewDoc(null)}
      />

      <AlertDialog open={!!deleteDoc} onOpenChange={(open) => !open && setDeleteDoc(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Document</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to permanently delete &quot;{deleteDoc?.title}&quot;? This action cannot be
              undone and will also delete all versions of this document.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

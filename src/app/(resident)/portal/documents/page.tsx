'use client';

import { useState, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { CategoryBadge, FileTypeBadge } from '@/components/documents/category-badge';
import { DocumentPreview } from '@/components/documents/document-preview';
import { useResidentDocuments, useDocumentCategories } from '@/hooks/use-documents';
import { getDocumentDownloadUrl } from '@/actions/documents/download-document';
import { FileText, Search, Download, Eye, X, LayoutGrid, List } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { toast } from 'sonner';
import type { DocumentWithRelations, DocumentListParams } from '@/types/database';

const ALL_VALUE = '_all';

export default function ResidentDocumentsPage() {
  const [params, setParams] = useState<Omit<DocumentListParams, 'is_archived' | 'uploaded_by'>>({
    page: 1,
    limit: 20,
  });
  const [search, setSearch] = useState('');
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('grid');
  const [previewDoc, setPreviewDoc] = useState<DocumentWithRelations | null>(null);

  const { data, isLoading } = useResidentDocuments(params);
  const { data: categories = [] } = useDocumentCategories();

  // Filter to only show resident-accessible categories
  const accessibleCategories = categories.filter((c) => c.is_resident_accessible);

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

  const documents = data?.data ?? [];
  const totalCount = data?.count ?? 0;
  const totalPages = Math.ceil(totalCount / (params.limit ?? 20));

  const formatFileSize = (bytes: number | null): string => {
    if (!bytes) return '-';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Documents</h1>
        <p className="text-muted-foreground">
          Access estate policies, forms, and important documents.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Document Library</CardTitle>
          <CardDescription>
            Browse and download documents shared by the estate management.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
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
                  {accessibleCategories.map((cat) => (
                    <SelectItem key={cat.id} value={cat.id}>
                      {cat.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="border rounded-lg p-1 flex">
              <Button
                variant={viewMode === 'grid' ? 'secondary' : 'ghost'}
                size="icon"
                className="h-8 w-8"
                onClick={() => setViewMode('grid')}
              >
                <LayoutGrid className="h-4 w-4" />
              </Button>
              <Button
                variant={viewMode === 'list' ? 'secondary' : 'ghost'}
                size="icon"
                className="h-8 w-8"
                onClick={() => setViewMode('list')}
              >
                <List className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Content */}
          {isLoading ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <Skeleton key={i} className="h-40 w-full" />
              ))}
            </div>
          ) : documents.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p className="text-lg font-medium mb-2">No documents available</p>
              <p className="text-sm">
                There are no documents shared with residents at this time.
              </p>
            </div>
          ) : viewMode === 'grid' ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {documents.map((doc) => (
                <DocumentCard
                  key={doc.id}
                  document={doc}
                  onView={handleView}
                  onDownload={handleDownload}
                />
              ))}
            </div>
          ) : (
            <div className="space-y-2">
              {documents.map((doc) => (
                <DocumentListItem
                  key={doc.id}
                  document={doc}
                  onView={handleView}
                  onDownload={handleDownload}
                />
              ))}
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex justify-between items-center pt-4">
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
        </CardContent>
      </Card>

      {/* Preview Modal */}
      <DocumentPreview
        document={previewDoc}
        open={!!previewDoc}
        onOpenChange={(open) => !open && setPreviewDoc(null)}
      />
    </div>
  );
}

// Simplified document card for resident portal
function DocumentCard({
  document,
  onView,
  onDownload,
}: {
  document: DocumentWithRelations;
  onView: (doc: DocumentWithRelations) => void;
  onDownload: (doc: DocumentWithRelations) => void;
}) {
  const formatFileSize = (bytes: number | null): string => {
    if (!bytes) return 'Unknown size';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <Card className="hover:shadow-md transition-shadow group">
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <div className="p-3 rounded-lg bg-muted group-hover:bg-primary/10 transition-colors">
            <FileText className="h-6 w-6 text-muted-foreground group-hover:text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-medium truncate" title={document.title}>
              {document.title}
            </h3>
            <div className="flex items-center gap-2 mt-1">
              <FileTypeBadge mimeType={document.mime_type} />
              <span className="text-xs text-muted-foreground">
                {formatFileSize(document.file_size_bytes)}
              </span>
            </div>
          </div>
        </div>

        {document.description && (
          <p className="text-sm text-muted-foreground mt-3 line-clamp-2">
            {document.description}
          </p>
        )}

        <div className="mt-3 pt-3 border-t">
          <CategoryBadge category={document.category} />
        </div>

        <div className="flex gap-2 mt-4">
          <Button variant="outline" size="sm" className="flex-1" onClick={() => onView(document)}>
            <Eye className="h-4 w-4 mr-2" />
            View
          </Button>
          <Button size="sm" className="flex-1" onClick={() => onDownload(document)}>
            <Download className="h-4 w-4 mr-2" />
            Download
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// List view item for resident portal
function DocumentListItem({
  document,
  onView,
  onDownload,
}: {
  document: DocumentWithRelations;
  onView: (doc: DocumentWithRelations) => void;
  onDownload: (doc: DocumentWithRelations) => void;
}) {
  const formatFileSize = (bytes: number | null): string => {
    if (!bytes) return '-';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="flex items-center gap-4 p-4 border rounded-lg hover:bg-muted/50 transition-colors">
      <div className="p-2 rounded-lg bg-muted">
        <FileText className="h-5 w-5 text-muted-foreground" />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <h3 className="font-medium truncate">{document.title}</h3>
          <FileTypeBadge mimeType={document.mime_type} />
        </div>
        <div className="flex items-center gap-3 mt-1 text-sm text-muted-foreground">
          <CategoryBadge category={document.category} />
          <span>{formatFileSize(document.file_size_bytes)}</span>
          <span>{formatDistanceToNow(new Date(document.created_at), { addSuffix: true })}</span>
        </div>
      </div>

      <div className="flex gap-2">
        <Button variant="ghost" size="icon" onClick={() => onView(document)}>
          <Eye className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" onClick={() => onDownload(document)}>
          <Download className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

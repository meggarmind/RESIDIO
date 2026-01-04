'use client';

import { useState, useCallback } from 'react';
import { motion } from 'framer-motion';
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
import { ShimmerSkeleton } from '@/components/ui/shimmer-skeleton';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { CategoryBadge, FileTypeBadge } from '@/components/documents/category-badge';
import { DocumentPreview } from '@/components/documents/document-preview';
import { useResidentDocuments, useDocumentCategories } from '@/hooks/use-documents';
import { useIsDesktop } from '@/hooks/use-media-query';
import { getDocumentDownloadUrl } from '@/actions/documents/download-document';
import { FileText, Search, Download, Eye, X, LayoutGrid, List, FileIcon, FileSpreadsheet, FileImage, File } from 'lucide-react';
import { formatDistanceToNow, format } from 'date-fns';
import { toast } from 'sonner';
import { useLayoutTheme } from '@/contexts/layout-theme-context';
import { cn } from '@/lib/utils';
import type { DocumentWithRelations, DocumentListParams } from '@/types/database';

const ALL_VALUE = '_all';

// Spring physics for smooth, professional animations
const spring = {
  type: 'spring' as const,
  stiffness: 300,
  damping: 30,
  mass: 1,
};

// Card animation variants
const cardVariants = {
  hidden: { opacity: 0, y: 10 },
  visible: (custom: number) => ({
    opacity: 1,
    y: 0,
    transition: {
      ...spring,
      delay: custom * 0.05, // 50ms stagger
    },
  }),
};

// Row animation variants for table
const rowVariants = {
  hidden: { opacity: 0, y: 10 },
  visible: (custom: number) => ({
    opacity: 1,
    y: 0,
    transition: {
      ...spring,
      delay: custom * 0.05,
    },
  }),
};

// File type color mapping (using design guide colors)
const fileTypeColors: Record<string, string> = {
  'application/pdf': 'border-l-bill-coral',
  'spreadsheet': 'border-l-bill-mint',
  'excel': 'border-l-bill-mint',
  'csv': 'border-l-bill-mint',
  'word': 'border-l-bill-lavender',
  'document': 'border-l-bill-lavender',
  'image': 'border-l-bill-teal',
  'default': 'border-l-bill-orange',
};

export default function ResidentDocumentsPage() {
  const [params, setParams] = useState<Omit<DocumentListParams, 'is_archived' | 'uploaded_by'>>({
    page: 1,
    limit: 20,
  });
  const [search, setSearch] = useState('');
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('grid');
  const [previewDoc, setPreviewDoc] = useState<DocumentWithRelations | null>(null);
  const isDesktop = useIsDesktop();
  const { isExpanded } = useLayoutTheme();

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
    <div className={cn('space-y-6', isExpanded && 'space-y-8')}>
      <div>
        <h1 className={cn(
          'text-3xl font-bold',
          isExpanded && 'text-4xl'
        )}>Documents</h1>
        <p className={cn(
          'text-muted-foreground',
          isExpanded && 'text-base'
        )}>
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
              <div className={cn(
                'relative flex-1 max-w-sm',
                isExpanded && 'lg:max-w-md xl:max-w-lg'
              )}>
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

            {/* View mode toggle - only on mobile */}
            {!isDesktop && (
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
            )}
          </div>

          {/* Content */}
          {isLoading ? (
            isDesktop ? (
              <div className="space-y-2">
                {[1, 2, 3, 4, 5].map((i) => (
                  <ShimmerSkeleton key={i} className="h-14 w-full rounded-lg" />
                ))}
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                {[1, 2, 3, 4].map((i) => (
                  <ShimmerSkeleton key={i} className="h-40 w-full rounded-2xl" />
                ))}
              </div>
            )
          ) : documents.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p className="text-lg font-medium mb-2">No documents available</p>
              <p className="text-sm">
                There are no documents shared with residents at this time.
              </p>
            </div>
          ) : isDesktop ? (
            <DocumentTable
              documents={documents}
              onView={handleView}
              onDownload={handleDownload}
              isExpanded={isExpanded}
            />
          ) : viewMode === 'grid' ? (
            <div className={cn(
              'grid gap-4 sm:grid-cols-2',
              isExpanded && 'lg:grid-cols-3'
            )}>
              {documents.map((doc, index) => (
                <DocumentCard
                  key={doc.id}
                  document={doc}
                  onView={handleView}
                  onDownload={handleDownload}
                  index={index}
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
  index,
}: {
  document: DocumentWithRelations;
  onView: (doc: DocumentWithRelations) => void;
  onDownload: (doc: DocumentWithRelations) => void;
  index: number;
}) {
  const formatFileSize = (bytes: number | null): string => {
    if (!bytes) return 'Unknown size';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  // Get file type color class
  const getFileTypeColor = (mimeType: string | null): string => {
    if (!mimeType) return fileTypeColors.default;
    if (mimeType === 'application/pdf') return fileTypeColors['application/pdf'];
    if (mimeType.includes('spreadsheet') || mimeType.includes('excel') || mimeType === 'text/csv') {
      return fileTypeColors.spreadsheet;
    }
    if (mimeType.includes('word') || mimeType.includes('document')) {
      return fileTypeColors.word;
    }
    if (mimeType.startsWith('image/')) {
      return fileTypeColors.image;
    }
    return fileTypeColors.default;
  };

  return (
    <motion.div
      variants={cardVariants}
      initial="hidden"
      animate="visible"
      custom={index}
    >
      <Card className={cn(
        "relative hover:shadow-md transition-shadow group border-l-4",
        getFileTypeColor(document.mime_type)
      )}>
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
    </motion.div>
  );
}

// List view item for resident portal (mobile)
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

// Desktop table view
function DocumentTable({
  documents,
  onView,
  onDownload,
  isExpanded,
}: {
  documents: DocumentWithRelations[];
  onView: (doc: DocumentWithRelations) => void;
  onDownload: (doc: DocumentWithRelations) => void;
  isExpanded: boolean;
}) {
  const formatFileSize = (bytes: number | null): string => {
    if (!bytes) return '-';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const getFileIcon = (mimeType: string | null) => {
    if (!mimeType) return <File className="h-5 w-5 text-muted-foreground" />;

    if (mimeType === 'application/pdf') {
      return <FileText className="h-5 w-5 text-red-500" />;
    }
    if (mimeType.includes('spreadsheet') || mimeType.includes('excel') || mimeType === 'text/csv') {
      return <FileSpreadsheet className="h-5 w-5 text-green-600" />;
    }
    if (mimeType.startsWith('image/')) {
      return <FileImage className="h-5 w-5 text-blue-500" />;
    }
    if (mimeType.includes('word') || mimeType.includes('document')) {
      return <FileIcon className="h-5 w-5 text-blue-600" />;
    }
    return <File className="h-5 w-5 text-muted-foreground" />;
  };

  return (
    <div className="border rounded-lg">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-12"></TableHead>
            <TableHead>Name</TableHead>
            <TableHead>Category</TableHead>
            <TableHead className="text-right">Size</TableHead>
            <TableHead>Date</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {documents.map((doc, index) => (
            <motion.tr
              key={doc.id}
              className="group hover:bg-muted/50 transition-colors"
              variants={rowVariants}
              initial="hidden"
              animate="visible"
              custom={index}
            >
              <TableCell>
                <div className="p-1.5 rounded bg-muted/50 w-fit">
                  {getFileIcon(doc.mime_type)}
                </div>
              </TableCell>
              <TableCell>
                <div className="min-w-0">
                  <p className={cn(
                    'font-medium truncate max-w-[250px]',
                    isExpanded && 'xl:max-w-[400px]'
                  )} title={doc.title}>
                    {doc.title}
                  </p>
                  {doc.description && (
                    <p className={cn(
                      'text-xs text-muted-foreground truncate max-w-[250px]',
                      isExpanded && 'xl:max-w-[400px]'
                    )}>
                      {doc.description}
                    </p>
                  )}
                </div>
              </TableCell>
              <TableCell>
                <CategoryBadge category={doc.category} />
              </TableCell>
              <TableCell className="text-right text-sm text-muted-foreground">
                {formatFileSize(doc.file_size_bytes)}
              </TableCell>
              <TableCell className="text-sm text-muted-foreground">
                {format(new Date(doc.created_at), 'MMM d, yyyy')}
              </TableCell>
              <TableCell className="text-right">
                <div className={cn(
                  'flex justify-end gap-1 transition-opacity',
                  isExpanded ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                )}>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => onView(doc)}
                    title="View"
                  >
                    <Eye className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => onDownload(doc)}
                    title="Download"
                  >
                    <Download className="h-4 w-4" />
                  </Button>
                </div>
              </TableCell>
            </motion.tr>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

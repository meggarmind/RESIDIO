'use client';

import * as React from 'react';
import Link from 'next/link';
import { format } from 'date-fns';
import { FileText, Download, ArrowRight, File, FolderOpen } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { getDocumentDownloadUrl } from '@/actions/documents/download-document';
import { toast } from 'sonner';
import type { DocumentWithRelations } from '@/types/database';

/**
 * Property Documents Card Component
 *
 * Displays last 5 property-specific documents accessible to residents.
 * Shows file icon, name, category, date, and download button.
 *
 * Features:
 * - Filter: Only `is_resident_accessible = true` AND `house_id = houseId`
 * - Category badge with color coding
 * - Download button per document
 * - "View All" link with property filter
 * - Empty state for no documents
 * - File type icons
 */

interface PropertyDocumentsCardProps {
  /** Last 5 property-specific documents */
  documents: DocumentWithRelations[];
  /** Loading state */
  isLoading?: boolean;
  /** Property ID for "View All" link */
  houseId: string;
  className?: string;
}

export function PropertyDocumentsCard({
  documents,
  isLoading = false,
  houseId,
  className,
}: PropertyDocumentsCardProps) {
  const [downloadingId, setDownloadingId] = React.useState<string | null>(null);

  // Get file icon based on file type/name
  const getFileIcon = (fileName: string | null) => {
    if (!fileName) return <File className="w-4 h-4" />;

    const ext = fileName.split('.').pop()?.toLowerCase();
    switch (ext) {
      case 'pdf':
        return <FileText className="w-4 h-4 text-red-600" />;
      case 'doc':
      case 'docx':
        return <FileText className="w-4 h-4 text-blue-600" />;
      case 'xls':
      case 'xlsx':
        return <FileText className="w-4 h-4 text-green-600" />;
      case 'jpg':
      case 'jpeg':
      case 'png':
        return <FileText className="w-4 h-4 text-purple-600" />;
      default:
        return <File className="w-4 h-4" />;
    }
  };

  // Get category badge variant
  const getCategoryVariant = (category: string | null) => {
    if (!category) return 'secondary';

    const lower = category.toLowerCase();
    if (lower.includes('agreement') || lower.includes('contract')) return 'info';
    if (lower.includes('notice') || lower.includes('announcement')) return 'warning';
    if (lower.includes('receipt') || lower.includes('payment')) return 'success';
    if (lower.includes('rule') || lower.includes('regulation')) return 'secondary';

    return 'secondary';
  };

  // Handle document download
  const handleDownload = async (document: DocumentWithRelations) => {
    if (!document.file_path) {
      toast.error('Document file not found');
      return;
    }

    setDownloadingId(document.id);

    try {
      const result = await getDocumentDownloadUrl(document.id);

      if (result.error || !result.url) {
        toast.error(result.error || 'Failed to get download URL');
        return;
      }

      // Create a temporary link and trigger download
      const link = window.document.createElement('a');
      link.href = result.url;
      link.download = document.file_name || 'document';
      window.document.body.appendChild(link);
      link.click();
      window.document.body.removeChild(link);

      toast.success('Download started');
    } catch (error) {
      console.error('Download error:', error);
      toast.error('Failed to download document');
    } finally {
      setDownloadingId(null);
    }
  };

  if (isLoading) {
    return (
      <div
        className={cn(
          'rounded-lg p-6 border',
          'bg-card',
          className
        )}
        style={{
          borderColor: 'var(--color-border)',
        }}
      >
        <div className="flex items-center justify-between mb-4">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-5 w-20" />
        </div>
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      </div>
    );
  }

  // Empty state
  if (documents.length === 0) {
    return (
      <div
        className={cn(
          'rounded-lg p-6 border',
          'bg-card',
          className
        )}
        style={{
          borderColor: 'var(--color-border)',
        }}
      >
        <div className="flex items-center gap-2 mb-4">
          <FolderOpen
            style={{
              width: 'var(--icon-sm)',
              height: 'var(--icon-sm)',
              color: 'var(--color-text-primary)',
            }}
          />
          <h3
            className="font-semibold"
            style={{
              fontSize: 'var(--text-lg)',
              color: 'var(--color-text-primary)',
            }}
          >
            Property Documents
          </h3>
        </div>
        <div className="text-center py-8">
          <div
            className="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-3"
            style={{
              background: 'var(--color-bg-muted)',
            }}
          >
            <FolderOpen
              style={{
                width: '24px',
                height: '24px',
                color: 'var(--color-text-muted)',
              }}
            />
          </div>
          <p
            style={{
              fontSize: 'var(--text-sm)',
              color: 'var(--color-text-secondary)',
            }}
          >
            No documents available for this property
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        'rounded-lg p-6 border',
        'bg-card',
        className
      )}
      style={{
        borderColor: 'var(--color-border)',
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <FolderOpen
            style={{
              width: 'var(--icon-sm)',
              height: 'var(--icon-sm)',
              color: 'var(--color-text-primary)',
            }}
          />
          <h3
            className="font-semibold"
            style={{
              fontSize: 'var(--text-lg)',
              color: 'var(--color-text-primary)',
            }}
          >
            Property Documents
          </h3>
        </div>
        <Badge
          variant="secondary"
          style={{
            fontSize: 'var(--text-xs)',
          }}
        >
          {documents.length}
        </Badge>
      </div>

      {/* Document List */}
      <div className="space-y-3">
        {documents.map((document) => (
          <div
            key={document.id}
            className={cn(
              'flex items-center justify-between gap-4 p-3 rounded-lg',
              'transition-colors'
            )}
            style={{
              border: '1px solid var(--color-border)',
              background: 'var(--color-bg-card)',
            }}
          >
            {/* File Icon + Info */}
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <div
                className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
                style={{
                  background: 'var(--color-bg-muted)',
                }}
              >
                {getFileIcon(document.file_name)}
              </div>
              <div className="flex-1 min-w-0">
                <p
                  className="font-medium truncate"
                  style={{
                    fontSize: 'var(--text-sm)',
                    color: 'var(--color-text-primary)',
                  }}
                >
                  {document.title || document.file_name}
                </p>
                <div className="flex items-center gap-2 flex-wrap">
                  {document.category?.name && (
                    <Badge
                      variant={getCategoryVariant(document.category.name)}
                      className="text-xs"
                    >
                      {document.category.name}
                    </Badge>
                  )}
                  <p
                    className="text-xs"
                    style={{
                      color: 'var(--color-text-muted)',
                    }}
                  >
                    {document.created_at && format(new Date(document.created_at), 'MMM d, yyyy')}
                  </p>
                </div>
              </div>
            </div>

            {/* Download Button */}
            <Button
              size="sm"
              variant="ghost"
              onClick={() => handleDownload(document)}
              disabled={downloadingId === document.id}
              className="shrink-0"
            >
              <Download className="w-4 h-4" />
            </Button>
          </div>
        ))}
      </div>

      {/* View All Link */}
      <div className="mt-4 pt-4 border-t" style={{ borderColor: 'var(--color-border)' }}>
        <Link
          href={`/portal/documents?house=${houseId}`}
          className="flex items-center justify-between text-sm hover:underline"
          style={{ color: 'var(--color-primary)' }}
        >
          <span>View All Documents</span>
          <ArrowRight className="w-4 h-4" />
        </Link>
      </div>
    </div>
  );
}

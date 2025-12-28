'use client';

import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { CategoryBadge, FileTypeBadge } from './category-badge';
import { useDocumentViewUrl, useDocumentVersions } from '@/hooks/use-documents';
import { getDocumentDownloadUrl } from '@/actions/documents/download-document';
import {
  FileText,
  Download,
  ExternalLink,
  Calendar,
  User,
  HardDrive,
  History,
  AlertCircle,
} from 'lucide-react';
import { formatDistanceToNow, format } from 'date-fns';
import type { DocumentWithRelations, Document } from '@/types/database';
import { toast } from 'sonner';

interface DocumentPreviewProps {
  document: DocumentWithRelations | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function DocumentPreview({ document, open, onOpenChange }: DocumentPreviewProps) {
  const [activeTab, setActiveTab] = useState('preview');

  const { data: viewUrl, isLoading: urlLoading } = useDocumentViewUrl(
    open && document ? document.id : undefined
  );

  const { data: versions = [], isLoading: versionsLoading } = useDocumentVersions(
    open && document && activeTab === 'versions' ? document.id : undefined
  );

  const handleDownload = async () => {
    if (!document) return;

    try {
      const result = await getDocumentDownloadUrl(document.id);
      if (result.url) {
        window.open(result.url, '_blank');
      } else {
        toast.error(result.error || 'Failed to generate download URL');
      }
    } catch (error) {
      toast.error('Failed to download document');
    }
  };

  const handleOpenInNewTab = () => {
    if (viewUrl) {
      window.open(viewUrl, '_blank');
    }
  };

  const formatFileSize = (bytes: number | null): string => {
    if (!bytes) return 'Unknown';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const isPdfPreviewable = document?.mime_type === 'application/pdf';

  if (!document) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3 min-w-0">
              <div className="p-2 rounded-lg bg-muted">
                <FileText className="h-6 w-6 text-muted-foreground" />
              </div>
              <div className="min-w-0">
                <DialogTitle className="truncate">{document.title}</DialogTitle>
                <div className="flex items-center gap-2 mt-1">
                  <FileTypeBadge mimeType={document.mime_type} />
                  <CategoryBadge category={document.category} />
                  {document.version > 1 && (
                    <span className="text-xs text-muted-foreground">
                      Version {document.version}
                    </span>
                  )}
                </div>
              </div>
            </div>
            <div className="flex gap-2 flex-shrink-0">
              <Button variant="outline" size="sm" onClick={handleOpenInNewTab} disabled={!viewUrl}>
                <ExternalLink className="h-4 w-4 mr-2" />
                Open
              </Button>
              <Button size="sm" onClick={handleDownload}>
                <Download className="h-4 w-4 mr-2" />
                Download
              </Button>
            </div>
          </div>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="preview">Preview</TabsTrigger>
            <TabsTrigger value="details">Details</TabsTrigger>
            <TabsTrigger value="versions">
              Versions {versions.length > 1 && `(${versions.length})`}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="preview" className="flex-1 min-h-0 mt-4">
            {urlLoading ? (
              <div className="flex items-center justify-center h-96">
                <Skeleton className="w-full h-full" />
              </div>
            ) : isPdfPreviewable && viewUrl ? (
              <iframe
                src={viewUrl}
                className="w-full h-[500px] border rounded-lg"
                title={document.title}
              />
            ) : (
              <div className="flex flex-col items-center justify-center h-96 bg-muted rounded-lg">
                <FileText className="h-16 w-16 text-muted-foreground mb-4" />
                <p className="text-muted-foreground mb-4">
                  Preview not available for this file type
                </p>
                <Button onClick={handleDownload}>
                  <Download className="h-4 w-4 mr-2" />
                  Download to View
                </Button>
              </div>
            )}
          </TabsContent>

          <TabsContent value="details" className="mt-4">
            <div className="space-y-6">
              {document.description && (
                <div>
                  <h4 className="text-sm font-medium text-muted-foreground mb-1">Description</h4>
                  <p className="text-sm">{document.description}</p>
                </div>
              )}

              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="text-sm font-medium">Uploaded</p>
                      <p className="text-sm text-muted-foreground">
                        {format(new Date(document.created_at), 'PPP p')}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <User className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="text-sm font-medium">Uploaded By</p>
                      <p className="text-sm text-muted-foreground">
                        {document.uploader?.full_name || 'Unknown'}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    <HardDrive className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="text-sm font-medium">File Size</p>
                      <p className="text-sm text-muted-foreground">
                        {formatFileSize(document.file_size_bytes)}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <FileText className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="text-sm font-medium">Original Filename</p>
                      <p className="text-sm text-muted-foreground truncate" title={document.file_name}>
                        {document.file_name}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="versions" className="mt-4">
            {versionsLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </div>
            ) : versions.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <History className="h-12 w-12 mb-4 opacity-50" />
                <p>No version history available</p>
              </div>
            ) : (
              <div className="space-y-3">
                {versions.map((version) => (
                  <VersionItem
                    key={version.id}
                    version={version}
                    isCurrent={version.id === document.id}
                  />
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

interface VersionItemProps {
  version: Document;
  isCurrent: boolean;
}

function VersionItem({ version, isCurrent }: VersionItemProps) {
  const handleDownload = async () => {
    try {
      const result = await getDocumentDownloadUrl(version.id);
      if (result.url) {
        window.open(result.url, '_blank');
      } else {
        toast.error(result.error || 'Failed to download');
      }
    } catch {
      toast.error('Failed to download version');
    }
  };

  const formatFileSize = (bytes: number | null): string => {
    if (!bytes) return 'Unknown';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div
      className={`flex items-center justify-between p-4 rounded-lg border ${
        isCurrent ? 'bg-primary/5 border-primary/20' : 'bg-muted/50'
      }`}
    >
      <div className="flex items-center gap-3">
        <div className="flex items-center justify-center w-8 h-8 rounded-full bg-background border text-sm font-medium">
          v{version.version}
        </div>
        <div>
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium">{version.file_name}</p>
            {isCurrent && (
              <span className="text-xs bg-primary text-primary-foreground px-2 py-0.5 rounded">
                Current
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            {formatDistanceToNow(new Date(version.created_at), { addSuffix: true })} •{' '}
            {formatFileSize(version.file_size_bytes)}
          </p>
        </div>
      </div>
      <Button variant="ghost" size="sm" onClick={handleDownload}>
        <Download className="h-4 w-4" />
      </Button>
    </div>
  );
}

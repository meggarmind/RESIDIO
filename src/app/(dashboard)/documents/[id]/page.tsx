'use client';

import { useState, use } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CategoryBadge, FileTypeBadge } from '@/components/documents/category-badge';
import { DocumentUploadForm } from '@/components/documents/document-upload-form';
import {
  useDocument,
  useDocumentVersions,
  useUpdateDocument,
  useDocumentCategories,
  useUploadDocumentVersion,
} from '@/hooks/use-documents';
import { getDocumentDownloadUrl, getDocumentViewUrl } from '@/actions/documents/download-document';
import { useAuth } from '@/lib/auth/auth-provider';
import { PERMISSIONS } from '@/lib/auth/action-roles';
import {
  ArrowLeft,
  Download,
  ExternalLink,
  Calendar,
  User,
  HardDrive,
  FileText,
  History,
  Pencil,
  Upload,
  Save,
  X,
} from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import { toast } from 'sonner';

const updateSchema = z.object({
  title: z.string().min(1, 'Title is required').max(255),
  description: z.string().max(1000).optional(),
  category_id: z.string().optional(),
});

type UpdateFormData = z.infer<typeof updateSchema>;

export default function DocumentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const searchParams = useSearchParams();
  const isEditing = searchParams.get('edit') === 'true';

  const [editMode, setEditMode] = useState(isEditing);
  const [uploadVersionOpen, setUploadVersionOpen] = useState(false);

  const { data: document, isLoading, refetch } = useDocument(id);
  const { data: versions = [], isLoading: versionsLoading } = useDocumentVersions(id);
  const { data: categories = [] } = useDocumentCategories();
  const updateMutation = useUpdateDocument();

  const { hasPermission } = useAuth();
  const canEdit = hasPermission(PERMISSIONS.DOCUMENTS_UPDATE);

  const {
    register,
    handleSubmit,
    setValue,
    reset,
    formState: { errors, isDirty },
  } = useForm<UpdateFormData>({
    resolver: zodResolver(updateSchema),
    defaultValues: {
      title: document?.title ?? '',
      description: document?.description ?? '',
      category_id: document?.category_id ?? undefined,
    },
  });

  // Update form when document loads
  useState(() => {
    if (document) {
      reset({
        title: document.title,
        description: document.description ?? '',
        category_id: document.category_id ?? undefined,
      });
    }
  });

  const handleDownload = async () => {
    if (!document) return;
    try {
      const result = await getDocumentDownloadUrl(document.id);
      if (result.url) {
        window.open(result.url, '_blank');
      } else {
        toast.error(result.error || 'Failed to generate download URL');
      }
    } catch {
      toast.error('Failed to download document');
    }
  };

  const handleOpenInNewTab = async () => {
    if (!document) return;
    try {
      const result = await getDocumentViewUrl(document.id);
      if (result.url) {
        window.open(result.url, '_blank');
      } else {
        toast.error(result.error || 'Failed to generate view URL');
      }
    } catch {
      toast.error('Failed to open document');
    }
  };

  const onSubmit = async (data: UpdateFormData) => {
    try {
      await updateMutation.mutateAsync({
        id,
        data: {
          title: data.title,
          description: data.description || undefined,
          category_id: data.category_id || undefined,
        },
      });
      toast.success('Document updated');
      setEditMode(false);
      refetch();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to update document');
    }
  };

  const formatFileSize = (bytes: number | null): string => {
    if (!bytes) return 'Unknown';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!document) {
    return (
      <div className="text-center py-12">
        <FileText className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
        <h2 className="text-xl font-semibold mb-2">Document Not Found</h2>
        <p className="text-muted-foreground mb-4">
          The document you&apos;re looking for doesn&apos;t exist or has been deleted.
        </p>
        <Button asChild>
          <Link href="/documents">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Documents
          </Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/documents">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-muted">
                <FileText className="h-6 w-6 text-muted-foreground" />
              </div>
              <div>
                <h1 className="text-2xl font-bold">{document.title}</h1>
                <div className="flex items-center gap-2 mt-1">
                  <FileTypeBadge mimeType={document.mime_type} />
                  <CategoryBadge category={document.category} />
                  {document.version > 1 && (
                    <span className="text-sm text-muted-foreground">
                      Version {document.version}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="flex gap-2">
          <Button variant="outline" onClick={handleOpenInNewTab}>
            <ExternalLink className="h-4 w-4 mr-2" />
            Open
          </Button>
          <Button onClick={handleDownload}>
            <Download className="h-4 w-4 mr-2" />
            Download
          </Button>
          {canEdit && !editMode && (
            <Button variant="outline" onClick={() => setEditMode(true)}>
              <Pencil className="h-4 w-4 mr-2" />
              Edit
            </Button>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6">
          {editMode ? (
            <Card>
              <CardHeader>
                <CardTitle>Edit Document</CardTitle>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="title">Title</Label>
                    <Input id="title" {...register('title')} />
                    {errors.title && (
                      <p className="text-sm text-destructive">{errors.title.message}</p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="description">Description</Label>
                    <Textarea id="description" {...register('description')} rows={4} />
                    {errors.description && (
                      <p className="text-sm text-destructive">{errors.description.message}</p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="category">Category</Label>
                    <Select
                      value={document.category_id ?? ''}
                      onValueChange={(value) => setValue('category_id', value, { shouldDirty: true })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select a category" />
                      </SelectTrigger>
                      <SelectContent>
                        {categories.map((cat) => (
                          <SelectItem key={cat.id} value={cat.id}>
                            {cat.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="flex justify-end gap-2 pt-4">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        setEditMode(false);
                        reset();
                      }}
                    >
                      <X className="h-4 w-4 mr-2" />
                      Cancel
                    </Button>
                    <Button type="submit" disabled={!isDirty || updateMutation.isPending}>
                      <Save className="h-4 w-4 mr-2" />
                      {updateMutation.isPending ? 'Saving...' : 'Save Changes'}
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader>
                <CardTitle>Document Details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {document.description ? (
                  <div>
                    <h4 className="text-sm font-medium text-muted-foreground mb-1">Description</h4>
                    <p>{document.description}</p>
                  </div>
                ) : (
                  <p className="text-muted-foreground italic">No description provided</p>
                )}
              </CardContent>
            </Card>
          )}

          {/* Version History */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <History className="h-5 w-5" />
                Version History
              </CardTitle>
              {canEdit && (
                <Button size="sm" onClick={() => setUploadVersionOpen(true)}>
                  <Upload className="h-4 w-4 mr-2" />
                  Upload New Version
                </Button>
              )}
            </CardHeader>
            <CardContent>
              {versionsLoading ? (
                <div className="space-y-3">
                  {[1, 2].map((i) => (
                    <Skeleton key={i} className="h-16 w-full" />
                  ))}
                </div>
              ) : versions.length === 0 ? (
                <p className="text-muted-foreground text-center py-8">
                  No version history available
                </p>
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
            </CardContent>
          </Card>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>File Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
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
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Upload Version Dialog */}
      <UploadVersionDialog
        open={uploadVersionOpen}
        onOpenChange={setUploadVersionOpen}
        parentDocumentId={document.id}
        onSuccess={() => {
          refetch();
        }}
      />
    </div>
  );
}

function VersionItem({
  version,
  isCurrent,
}: {
  version: { id: string; version: number; file_name: string; file_size_bytes: number | null; created_at: string };
  isCurrent: boolean;
}) {
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

function UploadVersionDialog({
  open,
  onOpenChange,
  parentDocumentId,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  parentDocumentId: string;
  onSuccess: () => void;
}) {
  const uploadMutation = useUploadDocumentVersion();

  // We'll reuse the DocumentUploadForm component's dropzone logic
  // but customize the submit handler
  return (
    <DocumentUploadForm
      open={open}
      onOpenChange={onOpenChange}
      onSuccess={onSuccess}
    />
  );
}

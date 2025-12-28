'use client';

import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { DocumentsTable } from '@/components/documents/documents-table';
import { useDocuments, useDocumentCategories } from '@/hooks/use-documents';
import { useAuth } from '@/lib/auth/auth-provider';
import { PERMISSIONS } from '@/lib/auth/action-roles';
import { FileText, FolderOpen, Upload, Archive } from 'lucide-react';

function StatCard({
  title,
  value,
  icon: Icon,
  isLoading,
}: {
  title: string;
  value: number;
  icon: React.ElementType;
  isLoading: boolean;
}) {
  return (
    <Card className="shadow-sm">
      <CardContent className="p-6">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">{title}</p>
            {isLoading ? (
              <Skeleton className="h-9 w-16" />
            ) : (
              <p className="text-3xl font-bold">{value}</p>
            )}
          </div>
          <Icon className="size-5 text-muted-foreground" />
        </div>
      </CardContent>
    </Card>
  );
}

export default function DocumentsPage() {
  const { data: documentsData, isLoading: docsLoading } = useDocuments({ limit: 1000 });
  const { data: archivedData, isLoading: archivedLoading } = useDocuments({ is_archived: true, limit: 1000 });
  const { data: categories, isLoading: catsLoading } = useDocumentCategories();

  // Check permissions
  const { hasPermission } = useAuth();
  const canUpload = hasPermission(PERMISSIONS.DOCUMENTS_UPLOAD);
  const canEdit = hasPermission(PERMISSIONS.DOCUMENTS_UPDATE);
  const canDelete = hasPermission(PERMISSIONS.DOCUMENTS_DELETE);

  const totalDocs = documentsData?.count ?? 0;
  const archivedDocs = archivedData?.count ?? 0;
  const totalCategories = categories?.length ?? 0;
  const isLoading = docsLoading || archivedLoading || catsLoading;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Documents</h1>
        <p className="text-muted-foreground">
          Manage estate documents, policies, and files.
        </p>
      </div>

      {/* Stats Cards */}
      <div className="mx-auto max-w-7xl">
        <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-4">
          <StatCard
            title="Total Documents"
            value={totalDocs}
            icon={FileText}
            isLoading={isLoading}
          />
          <StatCard
            title="Categories"
            value={totalCategories}
            icon={FolderOpen}
            isLoading={isLoading}
          />
          <StatCard
            title="This Month"
            value={
              documentsData?.data.filter(
                (d) => new Date(d.created_at) > new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
              ).length ?? 0
            }
            icon={Upload}
            isLoading={isLoading}
          />
          <StatCard
            title="Archived"
            value={archivedDocs}
            icon={Archive}
            isLoading={isLoading}
          />
        </div>
      </div>

      {/* Documents Table */}
      <Card>
        <CardContent className="pt-6">
          <DocumentsTable
            canUpload={canUpload}
            canEdit={canEdit}
            canDelete={canDelete}
          />
        </CardContent>
      </Card>
    </div>
  );
}

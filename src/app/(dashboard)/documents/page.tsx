'use client';

import { DocumentsTable } from '@/components/documents/documents-table';
import { useDocuments, useDocumentCategories } from '@/hooks/use-documents';
import { useAuth } from '@/lib/auth/auth-provider';
import { PERMISSIONS } from '@/lib/auth/action-roles';
import { FileText, FolderOpen, Upload, Archive } from 'lucide-react';
import {
  EnhancedStatCard,
  EnhancedTableCard,
  EnhancedPageHeader,
} from '@/components/dashboard/enhanced-stat-card';
import { ModernDocumentsEmptyState } from '@/components/dashboard/modern-empty-state';
import { useVisualTheme } from '@/contexts/visual-theme-context';
import { cn } from '@/lib/utils';

export default function DocumentsPage() {
  const { themeId } = useVisualTheme();
  const isModern = themeId === 'modern';

  // Reduced limits - these queries include count for stats, actual display uses pagination
  const { data: documentsData, isLoading: docsLoading } = useDocuments({ limit: 100 });
  const { data: archivedData, isLoading: archivedLoading } = useDocuments({ is_archived: true, limit: 100 });
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

  // Calculate this month's uploads
  const thisMonthCount = documentsData?.data.filter(
    (d) => new Date(d.created_at) > new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
  ).length ?? 0;

  return (
    <div className="space-y-6">
      <EnhancedPageHeader
        title="Documents"
        description="Manage estate documents, policies, and files"
        icon={FileText}
      />

      {/* Stats Cards */}
      <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-4">
        <EnhancedStatCard
          title="Total Documents"
          value={totalDocs}
          icon={FileText}
          isLoading={isLoading}
          description="Active documents"
          accentColor="info"
        />
        <EnhancedStatCard
          title="Categories"
          value={totalCategories}
          icon={FolderOpen}
          isLoading={isLoading}
          description="Document categories"
          accentColor="default"
        />
        <EnhancedStatCard
          title="This Month"
          value={thisMonthCount}
          icon={Upload}
          isLoading={isLoading}
          description="Recently uploaded"
          accentColor={thisMonthCount > 0 ? 'success' : 'default'}
        />
        <EnhancedStatCard
          title="Archived"
          value={archivedDocs}
          icon={Archive}
          isLoading={isLoading}
          description="Archived documents"
          accentColor={archivedDocs > 0 ? 'warning' : 'default'}
        />
      </div>

      {/* Documents Table */}
      <EnhancedTableCard>
        {totalDocs === 0 && !isLoading ? (
          <ModernDocumentsEmptyState />
        ) : (
          <DocumentsTable
            canUpload={canUpload}
            canEdit={canEdit}
            canDelete={canDelete}
          />
        )}
      </EnhancedTableCard>
    </div>
  );
}

'use client';

import { DocumentCategoriesSection } from '@/components/settings/documents/document-categories-section';
import { DocumentTagsFieldsSection } from '@/components/settings/documents/document-tags-fields-section';
import { SettingsMergedPage } from '@/components/settings/settings-merged-page';
import { PERMISSIONS } from '@/lib/auth/action-roles';
import { useAuth } from '@/lib/auth/auth-provider';

export default function DocumentsSettingsPage() {
  const { hasPermission, hasAnyPermission } = useAuth();

  // Each section loads its own data, so mount only the ones this admin may use.
  return (
    <SettingsMergedPage>
      {hasPermission(PERMISSIONS.DOCUMENTS_MANAGE_CATEGORIES) && <DocumentCategoriesSection />}
      {hasAnyPermission([PERMISSIONS.DOCUMENTS_MANAGE_TAGS, PERMISSIONS.DOCUMENTS_MANAGE_CUSTOM_FIELDS]) && (
        <DocumentTagsFieldsSection />
      )}
    </SettingsMergedPage>
  );
}

'use client';

import { AnnouncementCategoriesSection } from '@/components/settings/messages/announcement-categories-section';
import { AnnouncementTemplatesSection } from '@/components/settings/messages/announcement-templates-section';
import { SettingsMergedPage } from '@/components/settings/settings-merged-page';
import { PERMISSIONS } from '@/lib/auth/action-roles';
import { useAuth } from '@/lib/auth/auth-provider';

export default function AnnouncementsPage() {
  const { hasPermission } = useAuth();

  // Each section loads its own data, so mount only the ones this admin may use.
  return (
    <SettingsMergedPage>
      {hasPermission(PERMISSIONS.ANNOUNCEMENTS_MANAGE_TEMPLATES) && <AnnouncementTemplatesSection />}
      {hasPermission(PERMISSIONS.ANNOUNCEMENTS_MANAGE_CATEGORIES) && <AnnouncementCategoriesSection />}
    </SettingsMergedPage>
  );
}

'use client';

import { ContactCategoriesSection } from '@/components/settings/security/contact-categories-section';
import { SecurityLimitsSection } from '@/components/settings/security/security-limits-section';
import { SessionTimeoutSection } from '@/components/settings/security/session-timeout-section';
import { SettingsMergedPage } from '@/components/settings/settings-merged-page';
import { PERMISSIONS } from '@/lib/auth/action-roles';
import { useAuth } from '@/lib/auth/auth-provider';

export default function SecurityRulesPage() {
  const { hasPermission } = useAuth();

  // Each section loads its own data, so mount only the ones this admin may use.
  return (
    <SettingsMergedPage>
      {hasPermission(PERMISSIONS.SETTINGS_MANAGE_SECURITY) && <SecurityLimitsSection />}
      {hasPermission(PERMISSIONS.SECURITY_MANAGE_CATEGORIES) && <ContactCategoriesSection />}
      {hasPermission(PERMISSIONS.SYSTEM_MANAGE_MAINTENANCE) && <SessionTimeoutSection />}
    </SettingsMergedPage>
  );
}

'use client';

import { MaintenanceModeSection } from '@/components/settings/system/maintenance-mode-section';
import { RetentionSection } from '@/components/settings/system/retention-section';
import { SettingsMergedPage } from '@/components/settings/settings-merged-page';

export default function MaintenanceAndDataPage() {
  // Each section hides itself without its own permission (the page opens for either).
  return (
    <SettingsMergedPage>
      <MaintenanceModeSection />
      <RetentionSection />
    </SettingsMergedPage>
  );
}

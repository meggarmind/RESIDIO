'use client';

import { DebtStatusLabelsSection, DebtStatusRulesSection } from '@/components/settings/billing/debt-status-sections';
import { SettingsMergedPage } from '@/components/settings/settings-merged-page';

export default function DebtStatusSettingsPage() {
  return (
    <SettingsMergedPage>
      <DebtStatusLabelsSection />
      <DebtStatusRulesSection />
    </SettingsMergedPage>
  );
}

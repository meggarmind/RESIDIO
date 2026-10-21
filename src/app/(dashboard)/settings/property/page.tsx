'use client';

import { PropertySections } from '@/components/settings/property/property-sections';
import { SettingsMergedPage } from '@/components/settings/settings-merged-page';

export default function StreetsAndHousesPage() {
  return (
    <SettingsMergedPage>
      <PropertySections />
    </SettingsMergedPage>
  );
}

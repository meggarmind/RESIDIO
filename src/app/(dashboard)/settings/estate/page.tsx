'use client';

import { EstateAssistantSection, EstateDetailsSection, EstateSocialSection } from '@/components/settings/estate/estate-form-sections';
import { EstateLogoSection } from '@/components/settings/estate/estate-logo-section';
import { EstateThemeSection } from '@/components/settings/estate/estate-theme-section';
import { ResidentPortalSection } from '@/components/settings/estate/resident-portal-section';
import { useEstateForm } from '@/components/settings/estate/use-estate-form';
import { SettingsMergedPage } from '@/components/settings/settings-merged-page';

export default function EstateProfilePage() {
  const estate = useEstateForm();

  return (
    <SettingsMergedPage>
      <EstateDetailsSection estate={estate} />
      <EstateLogoSection />
      <EstateThemeSection />
      <EstateAssistantSection estate={estate} />
      <ResidentPortalSection />
      <EstateSocialSection estate={estate} />
    </SettingsMergedPage>
  );
}

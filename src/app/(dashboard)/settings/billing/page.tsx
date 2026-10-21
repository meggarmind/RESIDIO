'use client';

import { BillingGeneralSection } from '@/components/settings/billing/billing-general-section';
import { InvoiceGenerationSection } from '@/components/settings/billing/invoice-generation-section';
import { LateFeesSection } from '@/components/settings/billing/late-fees-section';
import { LeviesSection } from '@/components/settings/billing/levies-section';
import { SettingsMergedPage } from '@/components/settings/settings-merged-page';

export default function BillingRulesPage() {
  return (
    <SettingsMergedPage>
      <BillingGeneralSection />
      <InvoiceGenerationSection />
      <LateFeesSection />
      <LeviesSection />
    </SettingsMergedPage>
  );
}

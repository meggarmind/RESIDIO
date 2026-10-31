'use client';

import { Suspense } from 'react';
import { BarChart3 } from 'lucide-react';
import { EnhancedPageHeader } from '@/components/dashboard/enhanced-stat-card';
import { SettingsPageNav } from '@/components/settings/settings-page-nav';
import { SettingsSectionsProvider } from '@/components/settings/settings-sections-provider';
import { FinancialDashboard } from './financial-dashboard';

export default function AnalyticsPage() {
  // Jump tabs (#1273); Suspense is for the provider's `useSearchParams`, as in SettingsMergedPage.
  return (
    <Suspense fallback={null}>
      <SettingsSectionsProvider>
        <div className="space-y-6">
          <EnhancedPageHeader
            title="Collections dashboard"
            description="Revenue, collections, invoices, and estate portfolio health"
            icon={BarChart3}
          />
          <SettingsPageNav />
          <FinancialDashboard />
        </div>
      </SettingsSectionsProvider>
    </Suspense>
  );
}

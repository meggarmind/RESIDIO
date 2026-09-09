'use client';

import { BarChart3 } from 'lucide-react';
import { EnhancedPageHeader } from '@/components/dashboard/enhanced-stat-card';
import { FinancialDashboard } from './financial-dashboard';

export default function AnalyticsPage() {
  return (
    <div className="space-y-6">
      <EnhancedPageHeader
        title="Financial Overview"
        description="Revenue, collections, invoices, and estate portfolio health"
        icon={BarChart3}
      />
      <FinancialDashboard />
    </div>
  );
}

'use client';

import { useCallback } from 'react';
import dynamic from 'next/dynamic';
import { useSearchParams, useRouter } from 'next/navigation';
import { Skeleton } from '@/components/ui/skeleton';
import { EnhancedPageHeader } from '@/components/dashboard/enhanced-stat-card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { BarChart3, Wallet, Users, Home, Landmark, Repeat, Search } from 'lucide-react';
import { useAuth } from '@/lib/auth/auth-provider';
import { PERMISSIONS } from '@/lib/auth/action-roles';

const FinancialDashboard = dynamic(
  () => import('./financial-dashboard').then((m) => ({ default: m.FinancialDashboard })),
  { loading: () => <TabSkeleton />, ssr: false }
);

const ResidentsTab = dynamic(
  () => import('@/components/analytics/tabs/residents-tab').then((m) => ({ default: m.ResidentsTab })),
  { loading: () => <TabSkeleton />, ssr: false }
);

const HousesStreetsTab = dynamic(
  () => import('@/components/analytics/tabs/houses-streets-tab').then((m) => ({ default: m.HousesStreetsTab })),
  { loading: () => <TabSkeleton />, ssr: false }
);

const CollectionsIndebtednessTab = dynamic(
  () => import('@/components/analytics/tabs/collections-indebtedness-tab').then((m) => ({ default: m.CollectionsIndebtednessTab })),
  { loading: () => <TabSkeleton />, ssr: false }
);

const PaymentBehaviorTab = dynamic(
  () => import('@/components/analytics/tabs/payment-behavior-tab').then((m) => ({ default: m.PaymentBehaviorTab })),
  { loading: () => <TabSkeleton />, ssr: false }
);

const SearchTab = dynamic(
  () => import('@/components/analytics/tabs/search-tab').then((m) => ({ default: m.SearchTab })),
  { loading: () => <TabSkeleton />, ssr: false }
);

/**
 * Analytics Page Client Component
 *
 * Tabbed analytics: Financial (existing), Residents, Houses & Streets,
 * Collections & Indebtedness, Payment Behavior. Tab state is URL-synced
 * (same pattern as the resident detail page) so links/reloads land on the
 * right tab.
 */
export function AnalyticsPageClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tabParam = searchParams.get('tab');
  const { hasPermission } = useAuth();
  // search_logs is admin-behavioural log data (what admins typed into
  // search); gate the tab with the same permission getSearchAnalytics
  // enforces so the UI never advertises data the action will refuse.
  const canViewSearchAnalytics = hasPermission(PERMISSIONS.SETTINGS_VIEW_AUDIT_LOGS);

  const handleTabChange = useCallback((value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value === 'financial') {
      params.delete('tab');
    } else {
      params.set('tab', value);
    }
    const query = params.toString();
    router.replace(`/analytics${query ? `?${query}` : ''}`, { scroll: false });
    setTimeout(() => {
      const panel = document.querySelector(`[data-tab-panel="${value}"]`) as HTMLElement | null;
      panel?.focus({ preventScroll: true });
    }, 50);
  }, [searchParams, router]);

  return (
    <div className="space-y-4">
      <EnhancedPageHeader
        title="Analytics"
        description="Financial, resident, property, and collections insights"
        icon={BarChart3}
      />

      <Tabs defaultValue={tabParam ?? 'financial'} className="w-full" onValueChange={handleTabChange}>
        <TabsList className="h-9 p-1 sticky top-0 z-10 glass">
          <TabsTrigger value="financial" className="text-xs h-7">
            <Wallet className="h-3.5 w-3.5 mr-1" />
            Financial
          </TabsTrigger>
          <TabsTrigger value="residents" className="text-xs h-7">
            <Users className="h-3.5 w-3.5 mr-1" />
            Residents
          </TabsTrigger>
          <TabsTrigger value="houses" className="text-xs h-7">
            <Home className="h-3.5 w-3.5 mr-1" />
            Houses &amp; Streets
          </TabsTrigger>
          <TabsTrigger value="collections" className="text-xs h-7">
            <Landmark className="h-3.5 w-3.5 mr-1" />
            Collections &amp; Indebtedness
          </TabsTrigger>
          <TabsTrigger value="payment-behavior" className="text-xs h-7">
            <Repeat className="h-3.5 w-3.5 mr-1" />
            Payment Behavior
          </TabsTrigger>
          {canViewSearchAnalytics && (
            <TabsTrigger value="search" className="text-xs h-7">
              <Search className="h-3.5 w-3.5 mr-1" />
              Search
            </TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="financial" className="mt-6" role="tabpanel" tabIndex={0} data-tab-panel="financial">
          <FinancialDashboard />
        </TabsContent>

        <TabsContent value="residents" className="mt-6" role="tabpanel" tabIndex={0} data-tab-panel="residents">
          <ResidentsTab />
        </TabsContent>

        <TabsContent value="houses" className="mt-6" role="tabpanel" tabIndex={0} data-tab-panel="houses">
          <HousesStreetsTab />
        </TabsContent>

        <TabsContent value="collections" className="mt-6" role="tabpanel" tabIndex={0} data-tab-panel="collections">
          <CollectionsIndebtednessTab />
        </TabsContent>

        <TabsContent value="payment-behavior" className="mt-6" role="tabpanel" tabIndex={0} data-tab-panel="payment-behavior">
          <PaymentBehaviorTab />
        </TabsContent>

        {canViewSearchAnalytics && (
          <TabsContent value="search" className="mt-6" role="tabpanel" tabIndex={0} data-tab-panel="search">
            <SearchTab />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}

function TabSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)}
      </div>
      <Skeleton className="h-80 rounded-xl" />
      <div className="grid gap-6 lg:grid-cols-2">
        <Skeleton className="h-72 rounded-xl" />
        <Skeleton className="h-72 rounded-xl" />
      </div>
    </div>
  );
}

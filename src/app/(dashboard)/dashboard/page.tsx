'use client';

import { Suspense, useEffect } from 'react';
import { useAuth } from '@/lib/auth/auth-provider';
import { useAdminDashboardSnapshot, useEstateMapStatus } from '@/hooks/use-dashboard';
import { toast } from 'sonner';
import { DashboardSkeleton } from '@/components/dashboard/dashboard-skeleton';
import { useSmartSuggestions } from '@/hooks/use-smart-suggestions';
import { CommandStrip } from '@/components/dashboard/command-strip';
import { MoneyLane } from '@/components/dashboard/money-lane';
import { PeopleLane } from '@/components/dashboard/people-lane';
import { SecurityLane } from '@/components/dashboard/security-lane';
import { EstateMap } from '@/components/dashboard/estate-map';
import { CommandRecentActivity } from '@/components/dashboard/command-recent-activity';
import { useDashboardNavigationState } from '@/hooks/use-dashboard-navigation-state';
import { OfflineAdminBanner } from '@/components/dashboard/offline-admin-banner';

function NavigationStateHandler({ unauthorized }: { unauthorized: boolean }) {
    useEffect(() => {
        if (unauthorized) toast.error('You do not have permission to access that page');
    }, [unauthorized]);
    return null;
}

function DashboardContent() {
    const { profile, isLoading: authLoading } = useAuth();
    const navigationState = useDashboardNavigationState();
    const { data: snapshot, isLoading, isError, isStaleSnapshot, snapshotSavedAt } = useAdminDashboardSnapshot();
    const { data: estateMap, isLoading: estateMapLoading, error: estateMapError } = useEstateMapStatus();
    const { suggestions } = useSmartSuggestions();

    if (authLoading) {
        return <DashboardSkeleton label="Loading dashboard authentication" state="auth" />;
    }

    return (
        <div className="space-y-6" data-dashboard-state="ready">
            <OfflineAdminBanner isStale={isStaleSnapshot} savedAt={snapshotSavedAt} />
            <NavigationStateHandler unauthorized={navigationState.unauthorized} />

            {/* One 12-column grid and one gutter. Lanes span 4 columns each from lg. */}
            <div className="grid grid-cols-12 gap-6">
                <CommandStrip
                  name={profile?.full_name}
                  financialHealth={snapshot?.financialHealth ?? null}
                  actionMetrics={snapshot?.actionMetrics ?? null}
                  isLoading={isLoading}
                  isUnavailable={isError}
                />
                <MoneyLane
                  financialHealth={snapshot?.financialHealth ?? null}
                  actionMetrics={snapshot?.actionMetrics ?? null}
                  suggestions={suggestions}
                  asOf={snapshot?.lastUpdated ?? null}
                  isLoading={isLoading}
                  isUnavailable={isError}
                />
                <PeopleLane
                  actionMetrics={snapshot?.actionMetrics ?? null}
                  quickStats={snapshot?.quickStats ?? null}
                  estateMapCounts={estateMap?.counts ?? null}
                  asOf={snapshot?.lastUpdated ?? null}
                  isLoading={isLoading}
                  isUnavailable={isError}
                />
                <SecurityLane
                  actionMetrics={snapshot?.actionMetrics ?? null}
                  securityAlerts={snapshot?.securityAlerts ?? null}
                  quickStats={snapshot?.quickStats ?? null}
                  asOf={snapshot?.lastUpdated ?? null}
                  isLoading={isLoading}
                  isUnavailable={isError}
                />
                <EstateMap snapshot={estateMap ?? null} isLoading={estateMapLoading} error={estateMapError ? estateMapError.message : null} />
                <CommandRecentActivity
                  activities={snapshot?.recentActivity ?? null}
                  isLoading={isLoading}
                  isUnavailable={snapshot?.recentActivityUnavailable ?? false}
                />
            </div>

            {navigationState.debug && (
                <div className="mt-8 max-h-64 overflow-auto rounded-lg bg-muted p-4 font-mono text-xs" data-dashboard-debug="true">
                    <h4 className="mb-2 font-bold">Debug Info:</h4>
                    <pre>{JSON.stringify({ profile: { id: profile?.id, role_name: profile?.role_name, name: profile?.full_name }, auth: { loading: authLoading } }, null, 2)}</pre>
                </div>
            )}
        </div>
    );
}

export default function DashboardPage() {
    return (
        <Suspense fallback={<DashboardSkeleton label="Loading dashboard navigation" state="route" />}>
            <DashboardContent />
        </Suspense>
    );
}

'use client';

import { useSyncExternalStore } from 'react';
import { Separator } from '@/components/ui/separator';
import { CronHealthCard } from '@/components/dashboard/cron-health-card';

const subscribeToMount = () => () => {};

export default function HealthPage() {
  const mounted = useSyncExternalStore(subscribeToMount, () => true, () => false);

  if (!mounted) return null;

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium">System Health</h3>
        <p className="text-sm text-muted-foreground">
          Monitor cron jobs, background tasks, and overall system health.
        </p>
      </div>
      <Separator />

      <CronHealthCard />
    </div>
  );
}

'use client';

import { useState, useEffect } from 'react';
import { Separator } from '@/components/ui/separator';
import { CronHealthCard } from '@/components/dashboard/cron-health-card';

export default function HealthPage() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

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

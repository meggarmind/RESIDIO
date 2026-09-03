'use client';

import { SystemDashboard } from '@/components/system/system-dashboard';

/**
 * System landing page.
 *
 * Before this, "is anything wrong?" required checking three separate
 * surfaces (the pulsing header dot, the old /settings/system overview, and
 * whichever of the six relocated pages you happened to think to open) and
 * none of them actually answered the question. This page answers it: cron
 * health, notification queue depth, recent audit activity, accounts
 * awaiting approval, and a link into data tools, each showing enough at a
 * glance to tell a healthy state from a bad one without opening it.
 *
 * Card content, status mapping and permission filtering live in
 * `@/components/system/system-dashboard` and `@/components/system/system-status`
 * so they can be unit tested independently of this route. Replaces the
 * retired /settings/system overview (see the redirect stub there).
 */
export default function SystemPage() {
  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium">System</h3>
        <p className="text-sm text-muted-foreground">
          Live and historical system state — cron jobs, the notification queue, audit activity,
          account approvals, and administrative data tools.
        </p>
      </div>

      <SystemDashboard />
    </div>
  );
}

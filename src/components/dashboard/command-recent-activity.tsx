'use client';

import Link from 'next/link';
import { formatDistanceToNow, isValid } from 'date-fns';
import { Lock } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import type { RecentActivityItem } from '@/actions/dashboard/get-enhanced-dashboard-stats';

const SHOWN_TYPES: ReadonlySet<RecentActivityItem['type']> = new Set(['payment', 'resident', 'security']);
const MAX_ITEMS = 5;

/** Payment, resident and security-contact events only. System-setting and other changes are left out. */
export function filterEstateActivity(items: RecentActivityItem[]): RecentActivityItem[] {
  return items.filter((i) => SHOWN_TYPES.has(i.type)).slice(0, MAX_ITEMS);
}

interface CommandRecentActivityProps {
  activities: RecentActivityItem[] | null;
  isLoading?: boolean;
  /** True when the viewer's role cannot read audit logs (#197): a settled answer, not a loading one. */
  isUnavailable?: boolean;
}

export function CommandRecentActivity({ activities, isLoading = false, isUnavailable = false }: CommandRecentActivityProps) {
  // On the page background under a rule; only the lanes are bordered cards.
  const shell = 'col-span-12 border-t pt-5';

  if (isUnavailable) {
    return (
      <section aria-label="Recent activity" data-testid="recent-activity-unavailable" className={shell}>
        <h2 className="text-base font-semibold">Recent activity</h2>
        <p className="mt-2 flex items-start gap-2 text-sm text-muted-foreground">
          <Lock className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>Recent activity isn&apos;t available for your role. Viewing it needs the &ldquo;view audit logs&rdquo; permission.</span>
        </p>
      </section>
    );
  }

  const items = activities ? filterEstateActivity(activities) : null;

  return (
    <section aria-label="Recent activity" data-testid="command-recent-activity" className={shell}>
      <h2 className="text-base font-semibold">Recent activity</h2>
      {isLoading || !items ? (
        <div className="mt-3 space-y-2" aria-label="Loading recent activity">
          <Skeleton className="h-5 w-full" />
          <Skeleton className="h-5 w-3/4" />
        </div>
      ) : items.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">No recent payment, resident or security contact activity.</p>
      ) : (
        <ul className="mt-2 divide-y text-sm">
          {items.map((a) => {
            const at = new Date(a.timestamp);
            return (
              <li key={a.id} className="flex items-start justify-between gap-3 py-2">
                <span className="min-w-0 break-words">
                  <span className="font-medium">{a.action}</span>
                  <span className="text-muted-foreground">{`. ${a.description}`}</span>
                </span>
                {isValid(at) ? (
                  <time dateTime={a.timestamp} className="shrink-0 text-xs text-muted-foreground">
                    {formatDistanceToNow(at, { addSuffix: true })}
                  </time>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
      <div className="mt-2">
        <Link
          href="/system/audit-logs"
          className="inline-flex min-h-11 items-center text-xs font-medium text-muted-foreground hover:text-foreground hover:underline md:min-h-0"
        >
          View all<span className="sr-only"> activity</span>
        </Link>
      </div>
    </section>
  );
}

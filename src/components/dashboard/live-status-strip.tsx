'use client';

import { useRouter } from 'next/navigation';
import { formatDistance, isSameDay, isValid } from 'date-fns';
import { Activity, CheckCircle2, CreditCard, ShieldAlert, UserCheck, Zap } from 'lucide-react';
import { LiveStatusWidget } from '@/components/dashboard/live-status-widget';
import { ModernSkeleton } from '@/components/dashboard/modern-skeleton';
import type {
  DashboardActionMetrics,
  RecentActivityItem,
} from '@/actions/dashboard/get-enhanced-dashboard-stats';

export type DayPeriod = 'morning' | 'afternoon' | 'evening';

/** Same thresholds as modern-greeting.tsx. */
export function getDayPeriod(now: Date): DayPeriod {
  const hour = now.getHours();
  return hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening';
}

const HEADLINES: Record<DayPeriod, string> = {
  morning: 'Needs attention today',
  afternoon: 'Payments focus',
  evening: "Today's activity",
};

// Existing routes only. Pending verifications deliberately has no link: /residents has no verification filter.
const ROUTES = {
  payments: '/payments',
  securityContacts: '/security/contacts',
} as const;

const EMPHASIS = 'ring-2 ring-primary/40 shadow-sm';

interface LiveStatusStripProps {
  actionMetrics: DashboardActionMetrics | null;
  recentActivity: RecentActivityItem[] | null;
  recentActivityUnavailable?: boolean;
  isLoading?: boolean;
  isUnavailable?: boolean;
  /** Injectable clock so the time-of-day framing is testable. */
  now?: Date;
}

function plural(n: number, one: string, many: string) {
  return `${n} ${n === 1 ? one : many}`;
}

export function LiveStatusStrip({
  actionMetrics,
  recentActivity,
  recentActivityUnavailable = false,
  isLoading = false,
  isUnavailable = false,
  now = new Date(),
}: LiveStatusStripProps) {
  const router = useRouter();

  if (isLoading) {
    return (
      <div data-testid="live-status-loading" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2].map((i) => (
          <ModernSkeleton key={i} className="h-[88px] w-full" />
        ))}
      </div>
    );
  }

  if (isUnavailable) {
    return (
      <p data-testid="live-status-unavailable" className="text-sm text-muted-foreground">
        Live status unavailable
      </p>
    );
  }

  const period = getDayPeriod(now);
  const m = actionMetrics;
  // Permission-denied audit logs arrive as zero rows: never treat that as "nothing happened".
  const activity = recentActivityUnavailable ? null : recentActivity;

  const dated = (activity ?? [])
    .map((a) => ({ a, at: new Date(a.timestamp) }))
    .filter((x) => isValid(x.at));
  const latest = dated.length
    ? dated.reduce((best, x) => (x.at.getTime() > best.at.getTime() ? x : best))
    : null;
  const todayCount = activity ? dated.filter((x) => isSameDay(x.at, now)).length : null;

  const widgets: { key: string; node: React.ReactNode }[] = [];
  const push = (key: string, node: React.ReactNode, emphasised = false) => {
    const item = { key, node };
    if (emphasised) widgets.unshift(item);
    else widgets.push(item);
  };

  if (m) {
    const go = (href: string) => () => router.push(href);

    if (period === 'morning' && m.totalRequiringAttention > 0) {
      push(
        'summary',
        <LiveStatusWidget
          title="Needs attention today"
          status={`${plural(m.totalRequiringAttention, 'item', 'items')} (${m.pendingResidentVerifications} pending verification)`}
          variant="warning"
          icon={Zap}
          className={EMPHASIS}
        />,
        true
      );
    }

    if (m.pendingResidentVerifications > 0) {
      push(
        'verifications',
        <LiveStatusWidget
          title="Pending verifications"
          status={plural(m.pendingResidentVerifications, 'resident', 'residents') + ' awaiting review'}
          variant="warning"
          icon={UserCheck}
        />
      );
    }

    if (m.unverifiedPayments > 0 || period === 'afternoon') {
      const n = m.unverifiedPayments;
      push(
        'payments',
        <LiveStatusWidget
          title="Unverified payments"
          status={n > 0 ? plural(n, 'payment', 'payments') + ' to verify' : 'No payments awaiting verification'}
          variant={n > 0 ? 'warning' : 'success'}
          icon={CreditCard}
          className={period === 'afternoon' ? EMPHASIS : undefined}
          onClick={go(ROUTES.payments)}
        />,
        period === 'afternoon'
      );
    }

    if (m.expiringSecurityContacts > 0) {
      push(
        'security',
        <LiveStatusWidget
          title="Expiring security contacts"
          status={plural(m.expiringSecurityContacts, 'contact', 'contacts') + ' expiring soon'}
          variant="warning"
          icon={ShieldAlert}
          onClick={go(ROUTES.securityContacts)}
        />
      );
    }

    if (m.totalRequiringAttention === 0) {
      push(
        'clear',
        <LiveStatusWidget
          title="Needs attention"
          status="All clear"
          variant="success"
          icon={CheckCircle2}
          className={period === 'morning' ? EMPHASIS : undefined}
        />,
        period === 'morning'
      );
    }
  } else {
    // Failed/timed-out action metrics are not "nothing needs attention".
    push(
      'attention-unavailable',
      <LiveStatusWidget
        title="Needs attention"
        status="Attention status unavailable"
        variant="default"
        icon={ShieldAlert}
      />
    );
  }

  if (period === 'evening' && todayCount !== null) {
    push(
      'today',
      <LiveStatusWidget
        title="Today's activity"
        status={(todayCount >= 10 ? '10+' : String(todayCount)) + ' recent ' + (todayCount === 1 ? 'event' : 'events') + ' today'}
        icon={Activity}
        className={EMPHASIS}
      />,
      true
    );
  }

  if (latest) {
    push(
      'latest',
      <LiveStatusWidget
        title="Latest activity"
        status={`${latest.a.description} · ${formatDistance(latest.at, now, { addSuffix: true })}`}
        icon={Activity}
      />
    );
  }

  return (
    <section aria-label="Live status" data-testid="live-status-strip" data-period={period} className="space-y-2">
      <h2 className="text-sm font-semibold text-muted-foreground">{HEADLINES[period]}</h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {widgets.map((w) => (
          <div key={w.key}>{w.node}</div>
        ))}
      </div>
    </section>
  );
}

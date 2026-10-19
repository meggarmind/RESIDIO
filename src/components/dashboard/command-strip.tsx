'use client';

import Link from 'next/link';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { STATUS_COLORS } from '@/components/dashboard/status-colors';
import type { DashboardActionMetrics, FinancialHealthMetrics } from '@/actions/dashboard/get-enhanced-dashboard-stats';

export interface UrgentItem {
  kind: 'overdue_invoices' | 'payments_to_verify' | 'residents_awaiting_review' | 'expiring_contacts';
  count: number;
  label: string;
  href: string;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/**
 * The single most urgent item. Priority: overdue invoices, payments to verify,
 * residents awaiting review, expiring contacts.
 *
 * Returns the item, 'clear' when every source loaded and none needs action, or
 * null when a source is missing and nothing urgent was found (unknown is not clear).
 */
export function pickUrgentItem(
  financialHealth: FinancialHealthMetrics | null,
  actionMetrics: DashboardActionMetrics | null,
): UrgentItem | 'clear' | null {
  const overdue = financialHealth?.overdueCount ?? 0;
  if (overdue > 0) {
    return { kind: 'overdue_invoices', count: overdue, label: `${plural(overdue, 'invoice is', 'invoices are')} overdue`, href: '/billing' };
  }
  const m = actionMetrics;
  if (m && m.unverifiedPayments > 0) {
    return { kind: 'payments_to_verify', count: m.unverifiedPayments, label: `${plural(m.unverifiedPayments, 'payment', 'payments')} to verify`, href: '/approvals' };
  }
  if (m && m.pendingResidentVerifications > 0) {
    return {
      kind: 'residents_awaiting_review',
      count: m.pendingResidentVerifications,
      label: `${plural(m.pendingResidentVerifications, 'resident', 'residents')} awaiting review`,
      href: '/residents',
    };
  }
  if (m && m.expiringSecurityContacts > 0) {
    return {
      kind: 'expiring_contacts',
      count: m.expiringSecurityContacts,
      label: `${plural(m.expiringSecurityContacts, 'security contact', 'security contacts')} expiring soon`,
      href: '/security/contacts',
    };
  }
  return financialHealth && m ? 'clear' : null;
}

export function getGreeting(now: Date): string {
  const hour = now.getHours();
  return hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
}

interface CommandStripProps {
  name?: string | null;
  financialHealth: FinancialHealthMetrics | null;
  actionMetrics: DashboardActionMetrics | null;
  isLoading?: boolean;
  isUnavailable?: boolean;
  /** Injectable clock so the greeting is testable. */
  now?: Date;
}

export function CommandStrip({
  name,
  financialHealth,
  actionMetrics,
  isLoading = false,
  isUnavailable = false,
  now = new Date(),
}: CommandStripProps) {
  const first = name?.trim().split(/\s+/)[0];
  const greeting = first ? `${getGreeting(now)}, ${first}` : getGreeting(now);
  const urgent = isLoading || isUnavailable ? null : pickUrgentItem(financialHealth, actionMetrics);

  return (
    <section
      aria-label="Today"
      data-testid="command-strip"
      className="col-span-12 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-6"
    >
      <h1 className="text-2xl font-semibold tracking-tight">{greeting}</h1>
      <div data-testid="command-strip-urgent" className="text-sm">
        {isLoading ? (
          <Skeleton className="h-5 w-56" aria-label="Loading status" />
        ) : urgent === 'clear' ? (
          <p className="flex items-center gap-2 text-muted-foreground">
            <CheckCircle2 className={cn('h-4 w-4', STATUS_COLORS.ok.text)} aria-hidden="true" />
            All clear. Nothing needs you right now.
          </p>
        ) : urgent ? (
          <Link
            href={urgent.href}
            data-urgent-kind={urgent.kind}
            className="flex items-center gap-2 font-medium hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <AlertTriangle
              className={cn('h-4 w-4', STATUS_COLORS[urgent.kind === 'overdue_invoices' ? 'overdue' : 'attention'].text)}
              aria-hidden="true"
            />
            <span>Most urgent: {urgent.label}</span>
          </Link>
        ) : (
          <p className="text-muted-foreground">Attention status unavailable</p>
        )}
      </div>
    </section>
  );
}

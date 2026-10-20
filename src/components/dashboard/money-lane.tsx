'use client';

import { useAuth } from '@/lib/auth/auth-provider';
import { PERMISSIONS } from '@/lib/auth/action-roles';
import { CommandLane, type LaneState, type LaneTone } from '@/components/dashboard/command-lane';
import type { DashboardActionMetrics, FinancialHealthMetrics } from '@/actions/dashboard/get-enhanced-dashboard-stats';

export const formatNaira = (value: number) => `₦${new Intl.NumberFormat('en-NG').format(Math.round(value))}`;

interface MoneyLaneProps {
  financialHealth: FinancialHealthMetrics | null;
  actionMetrics: DashboardActionMetrics | null;
  asOf?: string | null;
  isLoading?: boolean;
  isUnavailable?: boolean;
}

export function MoneyLane({
  financialHealth,
  actionMetrics,
  asOf,
  isLoading = false,
  isUnavailable = false,
}: MoneyLaneProps) {
  const { hasPermission } = useAuth();
  const state: LaneState = isLoading ? 'loading' : isUnavailable || !financialHealth ? 'unavailable' : 'ready';
  const fh = financialHealth;
  const invoiced = fh ? fh.totalCollected + fh.totalOutstanding : 0;

  let tone: LaneTone = 'neutral';
  if (fh) {
    if (fh.overdueCount > 0) tone = 'overdue';
    else if ((actionMetrics?.unverifiedPayments ?? 0) > 0) tone = 'attention';
    else if (invoiced > 0) tone = 'ok';
  }

  return (
    <CommandLane
      testId="lane-money"
      title="Money"
      state={state}
      tone={tone}
      asOf={asOf}
      heroLabel="Collected on invoices, all time"
      heroValue={fh ? formatNaira(fh.totalCollected) : null}
      status={
        fh ? (
          <>
            <span className="block text-foreground">
              {invoiced > 0 ? `collected of ${formatNaira(invoiced)} invoiced, all time (${Math.round(fh.collectionRate)}%)` : 'No invoices raised yet'}
            </span>
            <span className="block text-foreground">Verified payments this month: {formatNaira(fh.monthlyRevenue)}</span>
            <span className="block">Collected is everything paid against invoices, all time. Verified is this month&apos;s payments that a person confirmed or that came in through a bank or email statement import.</span>
          </>
        ) : null
      }
      rows={[
        {
          key: 'verify',
          label: 'Payments to verify',
          value: actionMetrics ? String(actionMetrics.unverifiedPayments) : null,
        },
        {
          key: 'overdue',
          label: 'Overdue invoice balance',
          value: fh ? formatNaira(fh.overdueAmount) : null,
          hint: fh ? `${fh.overdueCount} overdue ${fh.overdueCount === 1 ? 'invoice' : 'invoices'}` : undefined,
        },
        { key: 'wallet', label: 'Resident wallet credits', value: fh ? formatNaira(fh.walletCredits) : null },
      ]}
      primary={{ label: 'Verify payments', href: '/approvals', allowed: hasPermission(PERMISSIONS.APPROVALS_VIEW) }}
      secondary={[
        { label: 'Record payment', href: '/payments/new', allowed: hasPermission(PERMISSIONS.PAYMENTS_CREATE) },
        { label: 'Generate invoices', href: '/billing/generate', allowed: hasPermission(PERMISSIONS.BILLING_CREATE_INVOICE) },
        { label: 'Import statement', href: '/payments/import', allowed: hasPermission(PERMISSIONS.IMPORTS_CREATE) },
      ]}
    />
  );
}

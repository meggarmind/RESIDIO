'use client';

import { useAuth } from '@/lib/auth/auth-provider';
import { PERMISSIONS } from '@/lib/auth/action-roles';
import { CommandLane, type LaneState, type LaneTone } from '@/components/dashboard/command-lane';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import type { DashboardActionMetrics, FinancialHealthMetrics } from '@/actions/dashboard/get-enhanced-dashboard-stats';

export const formatNaira = (value: number) => `₦${new Intl.NumberFormat('en-NG').format(Math.round(value))}`;

// get_dashboard_payment_metrics counts a payment as verified when is_verified or imported from a statement.
export const VERIFIED_EXPLANATION =
  'Payments made this month that a person confirmed or that came in through a bank or email statement import.';

interface MoneyLaneProps {
  financialHealth: FinancialHealthMetrics | null;
  actionMetrics: DashboardActionMetrics | null;
  isLoading?: boolean;
  isUnavailable?: boolean;
}

export function MoneyLane({
  financialHealth,
  actionMetrics,
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
      heroLabel="Outstanding on invoices"
      heroValue={fh ? formatNaira(fh.totalOutstanding) : null}
      status={
        fh ? (
          <span data-testid="lane-money-verified" className="block text-foreground">
            {invoiced === 0 ? 'No invoices raised yet. ' : null}
            <Tooltip>
              <TooltipTrigger className="cursor-help underline decoration-dotted underline-offset-2">Verified this month</TooltipTrigger>
              <TooltipContent className="max-w-64">{VERIFIED_EXPLANATION}</TooltipContent>
            </Tooltip>
            {`: ${formatNaira(fh.monthlyRevenue)}`}
          </span>
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
    />
  );
}

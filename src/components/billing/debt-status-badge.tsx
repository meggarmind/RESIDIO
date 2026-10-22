import { Badge } from '@/components/ui/badge';
import type { DebtStatus } from '@/lib/billing/debt-status';

const VARIANT: Record<DebtStatus, 'destructive' | 'warning' | 'success' | 'info'> = {
  arrears: 'destructive',
  outstanding: 'warning',
  paid_in_full: 'success',
  credit: 'info',
};

/** The shared debt status (#980) as one word: the editable label, never a naira rule. */
export function DebtStatusBadge({ status, label, className }: { status: DebtStatus; label: string; className?: string }) {
  return (
    <Badge variant={VARIANT[status]} className={className} data-debt-status={status}>
      {label}
    </Badge>
  );
}

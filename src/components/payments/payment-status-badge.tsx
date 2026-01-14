import { memo } from 'react';
import { Badge } from '@/components/ui/badge';

// Static variant map (defined outside component to avoid recreation)
const PAYMENT_STATUS_VARIANTS: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
    paid: 'default',
    pending: 'secondary',
    overdue: 'destructive',
    failed: 'destructive',
};

interface PaymentStatusBadgeProps {
    status: string;
}

// Memoized to prevent re-renders in payment tables
export const PaymentStatusBadge = memo(function PaymentStatusBadge({ status }: PaymentStatusBadgeProps) {
    const variant = PAYMENT_STATUS_VARIANTS[status] ?? 'outline';
    // Capitalize first letter
    const label = status.charAt(0).toUpperCase() + status.slice(1);

    return (
        <Badge variant={variant} className="capitalize">
            {label}
        </Badge>
    );
});

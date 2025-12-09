import { Badge } from '@/components/ui/badge';

interface PaymentStatusBadgeProps {
    status: string;
}

export function PaymentStatusBadge({ status }: PaymentStatusBadgeProps) {
    let variant: 'default' | 'secondary' | 'destructive' | 'outline' = 'default';

    switch (status) {
        case 'paid':
            variant = 'default'; // Using default (usually black/primary) for success for now, or could custom style
            break;
        case 'pending':
            variant = 'secondary';
            break;
        case 'overdue':
        case 'failed':
            variant = 'destructive';
            break;
        default:
            variant = 'outline';
    }

    // Capitalize first letter
    const label = status.charAt(0).toUpperCase() + status.slice(1);

    return (
        <Badge variant={variant} className="capitalize">
            {label}
        </Badge>
    );
}

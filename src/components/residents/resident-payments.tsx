'use client';

import { usePayments } from '@/hooks/use-payments';
import { PaymentTable } from '@/components/payments/payment-table';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';
import Link from 'next/link';

interface ResidentPaymentsProps {
    residentId: string;
}

export function ResidentPayments({ residentId }: ResidentPaymentsProps) {
    const { data, isLoading } = usePayments({
        resident_id: residentId,
        limit: 100,
        page: 1,
    });

    if (isLoading) {
        return <div className="py-8 text-center text-muted-foreground">Loading payments...</div>;
    }

    const payments = data?.data ?? [];

    return (
        <div className="space-y-4">
            <div className="flex justify-between items-center">
                <h3 className="text-lg font-medium">Payment History</h3>
                <Button size="sm" asChild>
                    <Link href={`/payments/new?residentId=${residentId}`}>
                        <Plus className="h-4 w-4 mr-2" />
                        Record Payment
                    </Link>
                </Button>
            </div>

            <PaymentTable data={payments} showResident={false} />
        </div>
    );
}

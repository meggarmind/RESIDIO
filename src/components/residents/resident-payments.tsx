'use client';

import { useState, useMemo, useCallback } from 'react';
import { usePayments } from '@/hooks/use-payments';
import { PaymentTable } from '@/components/payments/payment-table';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';
import Link from 'next/link';

type SortBy = 'payment_date' | 'amount' | 'status';
type SortOrder = 'asc' | 'desc';

interface ResidentPaymentsProps {
    residentId: string;
}

export function ResidentPayments({ residentId }: ResidentPaymentsProps) {
    const { data, isLoading } = usePayments({
        resident_id: residentId,
        limit: 100,
        page: 1,
    });

    const [sortBy, setSortBy] = useState<SortBy | undefined>(undefined);
    const [sortOrder, setSortOrder] = useState<SortOrder>('asc');

    const handleSort = useCallback((column: SortBy) => {
        if (sortBy === column) {
            setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
        } else {
            setSortBy(column);
            setSortOrder('asc');
        }
    }, [sortBy]);

    const sortedPayments = useMemo(() => {
        const payments = data?.data ?? [];
        if (!sortBy) return payments;

        const sorted = [...payments];
        const dir = sortOrder === 'asc' ? 1 : -1;
        sorted.sort((a, b) => {
            if (sortBy === 'amount') {
                return (Number(a.amount) - Number(b.amount)) * dir;
            }
            if (sortBy === 'status') {
                return a.status.localeCompare(b.status) * dir;
            }
            // payment_date
            return (new Date(a.payment_date).getTime() - new Date(b.payment_date).getTime()) * dir;
        });
        return sorted;
    }, [data, sortBy, sortOrder]);

    if (isLoading) {
        return <div className="py-8 text-center text-muted-foreground">Loading payments...</div>;
    }

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

            <PaymentTable
                data={sortedPayments}
                showResident={false}
                residentId={residentId}
                clickableRows
                sortBy={sortBy}
                sortOrder={sortOrder}
                onSort={handleSort}
            />
        </div>
    );
}

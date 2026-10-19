'use client';

import { useState, useCallback } from 'react';
import { usePayments } from '@/hooks/use-payments';
import { PaymentTable } from '@/components/payments/payment-table';
import { Button } from '@/components/ui/button';
import { SimplePagination } from '@/components/ui/simple-pagination';
import { useAuth } from '@/lib/auth/auth-provider';
import { PERMISSIONS } from '@/lib/auth/action-roles';
import { Plus } from 'lucide-react';
import Link from 'next/link';

type SortBy = 'payment_date' | 'amount' | 'status';
type SortOrder = 'asc' | 'desc';

const PAGE_SIZE = 20;

interface ResidentPaymentsProps {
    residentId: string;
}

export function ResidentPayments({ residentId }: ResidentPaymentsProps) {
    const [page, setPage] = useState(1);
    const [sortBy, setSortBy] = useState<SortBy | undefined>(undefined);
    const [sortOrder, setSortOrder] = useState<SortOrder>('asc');

    // Paged and sorted on the server, so a long history is never silently cut off (#783).
    const { data, isLoading } = usePayments({
        resident_id: residentId,
        limit: PAGE_SIZE,
        page,
        sort_by: sortBy,
        sort_order: sortBy ? sortOrder : undefined,
    });

    const { hasPermission } = useAuth();
    const canCreatePayment = hasPermission(PERMISSIONS.PAYMENTS_CREATE);

    const handleSort = useCallback((column: SortBy) => {
        if (sortBy === column) {
            setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
        } else {
            setSortBy(column);
            setSortOrder('asc');
        }
        setPage(1);
    }, [sortBy]);

    if (isLoading) {
        return <div className="py-8 text-center text-muted-foreground">Loading payments...</div>;
    }

    const totalPages = Math.ceil((data?.count ?? 0) / PAGE_SIZE);

    return (
        <div className="space-y-4">
            <div className="flex justify-between items-center">
                <h3 className="text-lg font-medium">Payment History</h3>
                {canCreatePayment && (
                    <Button size="sm" asChild className="min-h-11 md:min-h-0">
                        <Link href={`/payments/new?residentId=${residentId}`}>
                            <Plus className="h-4 w-4 mr-2" />
                            Record Payment
                        </Link>
                    </Button>
                )}
            </div>

            <PaymentTable
                data={data?.data ?? []}
                showResident={false}
                residentId={residentId}
                clickableRows
                sortBy={sortBy}
                sortOrder={sortOrder}
                onSort={handleSort}
            />
            <SimplePagination currentPage={page} totalPages={totalPages} onPageChange={setPage} />
        </div>
    );
}

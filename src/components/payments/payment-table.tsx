'use client';

import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { format } from 'date-fns';
import Link from 'next/link';
import { Trash2, Eye } from 'lucide-react';
import { PaymentStatusBadge } from './payment-status-badge';
import { useDeletePayment } from '@/hooks/use-payments';
import { formatCurrency } from '@/lib/utils';

interface PaymentTableProps {
    data: any[];
    showResident?: boolean;
}

export function PaymentTable({ data, showResident = true }: PaymentTableProps) {
    const deleteMutation = useDeletePayment();

    const handleDelete = async (id: string) => {
        if (confirm('Are you sure you want to delete this payment record? This action cannot be undone.')) {
            await deleteMutation.mutateAsync(id);
        }
    };

    if (!data || data.length === 0) {
        return (
            <div className="text-center py-10 border rounded-lg bg-slate-50">
                <p className="text-muted-foreground">No payments found.</p>
            </div>
        );
    }

    return (
        <div className="border rounded-md">
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead>Date</TableHead>
                        {showResident && <TableHead>Resident</TableHead>}
                        <TableHead>Amount</TableHead>
                        <TableHead>Method</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Ref</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {data.map((payment) => (
                        <TableRow key={payment.id}>
                            <TableCell>{format(new Date(payment.payment_date), 'MMM d, yyyy')}</TableCell>
                            {showResident && (
                                <TableCell>
                                    <div className="flex flex-col">
                                        <span className="font-medium">
                                            {payment.resident?.first_name} {payment.resident?.last_name}
                                        </span>
                                        <span className="text-xs text-muted-foreground">{payment.resident?.resident_code}</span>
                                    </div>
                                </TableCell>
                            )}
                            <TableCell className="font-medium">
                                {formatCurrency(Number(payment.amount))}
                            </TableCell>
                            <TableCell className="capitalize">
                                {payment.method ? payment.method.replace('_', ' ') : '-'}
                            </TableCell>
                            <TableCell>
                                <PaymentStatusBadge status={payment.status} />
                            </TableCell>
                            <TableCell className="text-xs font-mono">{payment.reference_number || '-'}</TableCell>
                            <TableCell className="text-right">
                                <div className="flex justify-end gap-2">
                                    <Button variant="ghost" size="icon" asChild>
                                        <Link href={`/payments/${payment.id}`}>
                                            <Eye className="h-4 w-4" />
                                        </Link>
                                    </Button>

                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="text-destructive hover:text-destructive"
                                        onClick={() => handleDelete(payment.id)}
                                    >
                                        <Trash2 className="h-4 w-4" />
                                    </Button>
                                </div>
                            </TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
        </div>
    );
}

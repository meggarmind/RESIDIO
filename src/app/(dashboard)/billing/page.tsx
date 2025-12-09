'use client';

import { useInvoices, useGenerateInvoices } from '@/hooks/use-billing';
import { Button } from '@/components/ui/button';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { formatCurrency } from '@/lib/utils';
import { Loader2, FileText, RefreshCw } from 'lucide-react';
import Link from 'next/link';

const statusColors: Record<string, string> = {
    unpaid: 'bg-yellow-100 text-yellow-800',
    paid: 'bg-green-100 text-green-800',
    partially_paid: 'bg-orange-100 text-orange-800',
    void: 'bg-gray-100 text-gray-800',
};

export default function BillingPage() {
    const { data, isLoading, refetch } = useInvoices();
    const generateMutation = useGenerateInvoices();

    const invoices = data?.data ?? [];

    const handleGenerateInvoices = async () => {
        await generateMutation.mutateAsync(undefined);
    };

    return (
        <div className="space-y-6 p-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight">Billing & Invoices</h1>
                    <p className="text-muted-foreground">
                        Manage monthly invoices and billing runs.
                    </p>
                </div>
                <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => refetch()}>
                        <RefreshCw className="mr-2 h-4 w-4" />
                        Refresh
                    </Button>
                    <Button
                        onClick={handleGenerateInvoices}
                        disabled={generateMutation.isPending}
                    >
                        {generateMutation.isPending ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                            <FileText className="mr-2 h-4 w-4" />
                        )}
                        Generate Invoices
                    </Button>
                </div>
            </div>

            <div className="rounded-md border">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Invoice #</TableHead>
                            <TableHead>Resident</TableHead>
                            <TableHead>House</TableHead>
                            <TableHead>Period</TableHead>
                            <TableHead>Due Date</TableHead>
                            <TableHead className="text-right">Amount</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead className="w-[50px]"></TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {isLoading ? (
                            <TableRow>
                                <TableCell colSpan={8} className="h-24 text-center">
                                    <Loader2 className="mx-auto h-6 w-6 animate-spin" />
                                </TableCell>
                            </TableRow>
                        ) : invoices.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={8} className="h-24 text-center">
                                    No invoices found. Click "Generate Monthly Invoices" to create them.
                                </TableCell>
                            </TableRow>
                        ) : (
                            invoices.map((invoice) => (
                                <TableRow key={invoice.id}>
                                    <TableCell className="font-mono text-sm">
                                        {invoice.invoice_number}
                                    </TableCell>
                                    <TableCell>
                                        {invoice.resident?.first_name} {invoice.resident?.last_name}
                                    </TableCell>
                                    <TableCell>
                                        {invoice.house?.house_number}, {invoice.house?.street?.name}
                                    </TableCell>
                                    <TableCell className="text-sm text-muted-foreground">
                                        {new Date(invoice.period_start).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })}
                                    </TableCell>
                                    <TableCell>
                                        {new Date(invoice.due_date).toLocaleDateString('en-GB')}
                                    </TableCell>
                                    <TableCell className="text-right font-medium">
                                        {formatCurrency(invoice.amount_due)}
                                    </TableCell>
                                    <TableCell>
                                        <Badge className={statusColors[invoice.status] || ''}>
                                            {invoice.status}
                                        </Badge>
                                    </TableCell>
                                    <TableCell>
                                        <Button variant="ghost" size="sm" asChild>
                                            <Link href={`/billing/${invoice.id}`}>View</Link>
                                        </Button>
                                    </TableCell>
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                </Table>
            </div>
        </div>
    );
}

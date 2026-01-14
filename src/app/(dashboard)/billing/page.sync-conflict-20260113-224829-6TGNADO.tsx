'use client';

import { useInvoices, useGenerateInvoices, useCheckOverdueInvoices, useOverdueStats, useLatestGenerationLog } from '@/hooks/use-billing';
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
import { Input } from '@/components/ui/input';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { formatCurrency } from '@/lib/utils';
import { Loader2, FileText, RefreshCw, ChevronLeft, ChevronRight, Search, AlertCircle, Clock, CheckCircle2 } from 'lucide-react';
import Link from 'next/link';
import { useState, useEffect } from 'react';
import { getResidents } from '@/actions/residents/get-residents';
import { INVOICE_TYPE_LABELS, type InvoiceType } from '@/types/database';

const statusColors: Record<string, string> = {
    unpaid: 'bg-yellow-100 text-yellow-800',
    paid: 'bg-green-100 text-green-800',
    partially_paid: 'bg-orange-100 text-orange-800',
    void: 'bg-gray-100 text-gray-800',
};

const invoiceTypeColors: Record<InvoiceType, string> = {
    SERVICE_CHARGE: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
    LEVY: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
    ADJUSTMENT: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
    OTHER: 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200',
};

export default function BillingPage() {
    const [page, setPage] = useState(1);
    const [limit, setLimit] = useState(20);
    const [status, setStatus] = useState<string>('all');
    const [invoiceType, setInvoiceType] = useState<string>('all');
    const [residentId, setResidentId] = useState<string>('all');
    const [search, setSearch] = useState('');
    const [residents, setResidents] = useState<Array<{ id: string; first_name: string; last_name: string }>>([]);

    const { data, isLoading, refetch } = useInvoices({
        page,
        limit,
        status: status === 'all' ? undefined : (status as any),
        invoiceType: invoiceType === 'all' ? undefined : (invoiceType as InvoiceType),
        residentId: residentId === 'all' ? undefined : residentId,
        search: search || undefined,
    });
    const generateMutation = useGenerateInvoices();
    const checkOverdueMutation = useCheckOverdueInvoices();
    const { data: overdueStats } = useOverdueStats();
    const { data: lastGeneration } = useLatestGenerationLog();

    const invoices = data?.data ?? [];
    const totalCount = data?.total ?? 0;
    const totalPages = Math.ceil(totalCount / limit);

    // Fetch residents for filter dropdown
    useEffect(() => {
        async function fetchResidents() {
            const result = await getResidents({ limit: 100 });
            if (result.data) {
                setResidents(result.data);
            }
        }
        fetchResidents();
    }, []);

    const handleGenerateInvoices = async () => {
        await generateMutation.mutateAsync(undefined);
    };

    const handleClearFilters = () => {
        setStatus('all');
        setInvoiceType('all');
        setResidentId('all');
        setSearch('');
        setPage(1);
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
                        variant="outline"
                        onClick={() => checkOverdueMutation.mutateAsync()}
                        disabled={checkOverdueMutation.isPending}
                    >
                        {checkOverdueMutation.isPending ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                            <AlertCircle className="mr-2 h-4 w-4" />
                        )}
                        Check Overdue
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

            {/* Last Generation Info */}
            {lastGeneration && (
                <div className="rounded-lg border bg-muted/50 p-4">
                    <div className="flex items-center gap-3">
                        <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400" />
                        <div className="flex-1">
                            <p className="font-medium">
                                Last generated: {new Date(lastGeneration.generated_at).toLocaleDateString('en-NG', {
                                    weekday: 'short',
                                    year: 'numeric',
                                    month: 'short',
                                    day: 'numeric',
                                    hour: '2-digit',
                                    minute: '2-digit',
                                })}
                            </p>
                            <p className="text-sm text-muted-foreground">
                                {lastGeneration.generated_count} generated, {lastGeneration.skipped_count} skipped
                                {lastGeneration.error_count > 0 && `, ${lastGeneration.error_count} errors`}
                                {' • '}
                                <span className="capitalize">{lastGeneration.trigger_type}</span>
                                {lastGeneration.actor?.full_name && ` by ${lastGeneration.actor.full_name}`}
                                {lastGeneration.duration_ms && ` • ${(lastGeneration.duration_ms / 1000).toFixed(1)}s`}
                            </p>
                        </div>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <Clock className="h-4 w-4" />
                            {lastGeneration.target_period && new Date(lastGeneration.target_period).toLocaleDateString('en-NG', {
                                month: 'short',
                                year: 'numeric',
                            })}
                        </div>
                    </div>
                </div>
            )}

            {/* Overdue Alert Banner */}
            {overdueStats && overdueStats.count > 0 && (
                <div className="rounded-lg border border-orange-200 bg-orange-50 p-4 dark:border-orange-900 dark:bg-orange-950">
                    <div className="flex items-center gap-3">
                        <AlertCircle className="h-5 w-5 text-orange-600 dark:text-orange-400" />
                        <div className="flex-1">
                            <p className="font-medium text-orange-800 dark:text-orange-200">
                                {overdueStats.count} overdue invoice{overdueStats.count !== 1 ? 's' : ''} totaling {formatCurrency(overdueStats.totalAmount)}
                            </p>
                            <p className="text-sm text-orange-600 dark:text-orange-400">
                                Click &quot;Check Overdue&quot; to view details and send reminders.
                            </p>
                        </div>
                        <Button
                            variant="outline"
                            size="sm"
                            className="border-orange-300 text-orange-700 hover:bg-orange-100 dark:border-orange-700 dark:text-orange-300 dark:hover:bg-orange-900"
                            onClick={() => setStatus('unpaid')}
                        >
                            View Unpaid
                        </Button>
                    </div>
                </div>
            )}

            {/* Filters */}
            <div className="flex flex-wrap gap-4 items-end">
                <div className="flex-1 min-w-[200px]">
                    <label className="text-sm font-medium mb-2 block">Search Invoice</label>
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                            placeholder="Invoice number..."
                            value={search}
                            onChange={(e) => {
                                setSearch(e.target.value);
                                setPage(1);
                            }}
                            className="pl-9"
                        />
                    </div>
                </div>

                <div className="w-[200px]">
                    <label className="text-sm font-medium mb-2 block">Resident</label>
                    <Select value={residentId} onValueChange={(value) => {
                        setResidentId(value);
                        setPage(1);
                    }}>
                        <SelectTrigger>
                            <SelectValue placeholder="All residents" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">All residents</SelectItem>
                            {residents.map((resident) => (
                                <SelectItem key={resident.id} value={resident.id}>
                                    {resident.first_name} {resident.last_name}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>

                <div className="w-[160px]">
                    <label className="text-sm font-medium mb-2 block">Status</label>
                    <Select value={status} onValueChange={(value) => {
                        setStatus(value);
                        setPage(1);
                    }}>
                        <SelectTrigger>
                            <SelectValue placeholder="All statuses" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">All statuses</SelectItem>
                            <SelectItem value="unpaid">Unpaid</SelectItem>
                            <SelectItem value="paid">Paid</SelectItem>
                            <SelectItem value="partially_paid">Partially Paid</SelectItem>
                            <SelectItem value="void">Void</SelectItem>
                        </SelectContent>
                    </Select>
                </div>

                <div className="w-[160px]">
                    <label className="text-sm font-medium mb-2 block">Type</label>
                    <Select value={invoiceType} onValueChange={(value) => {
                        setInvoiceType(value);
                        setPage(1);
                    }}>
                        <SelectTrigger>
                            <SelectValue placeholder="All types" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">All types</SelectItem>
                            <SelectItem value="SERVICE_CHARGE">Service Charge</SelectItem>
                            <SelectItem value="LEVY">Levy</SelectItem>
                            <SelectItem value="ADJUSTMENT">Adjustment</SelectItem>
                            <SelectItem value="OTHER">Other</SelectItem>
                        </SelectContent>
                    </Select>
                </div>

                <div className="w-[120px]">
                    <label className="text-sm font-medium mb-2 block">Per Page</label>
                    <Select value={limit.toString()} onValueChange={(value) => {
                        setLimit(Number(value));
                        setPage(1);
                    }}>
                        <SelectTrigger>
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="20">20</SelectItem>
                            <SelectItem value="50">50</SelectItem>
                            <SelectItem value="100">100</SelectItem>
                        </SelectContent>
                    </Select>
                </div>

                {(status !== 'all' || invoiceType !== 'all' || residentId !== 'all' || search) && (
                    <Button variant="outline" onClick={handleClearFilters}>
                        Clear Filters
                    </Button>
                )}
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
                            <TableHead>Type</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead className="w-[50px]"></TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {isLoading ? (
                            [...Array(5)].map((_, i) => (
                                <TableRow key={i}>
                                    <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                                    <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                                    <TableCell><Skeleton className="h-4 w-40" /></TableCell>
                                    <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                                    <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                                    <TableCell className="text-right"><Skeleton className="h-4 w-20 ml-auto" /></TableCell>
                                    <TableCell><Skeleton className="h-5 w-24 rounded-full" /></TableCell>
                                    <TableCell><Skeleton className="h-5 w-16 rounded-full" /></TableCell>
                                    <TableCell><Skeleton className="h-8 w-12" /></TableCell>
                                </TableRow>
                            ))
                        ) : invoices.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={9} className="h-24 text-center">
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
                                        <Badge className={invoice.invoice_type ? invoiceTypeColors[invoice.invoice_type as InvoiceType] : invoiceTypeColors.SERVICE_CHARGE}>
                                            {invoice.invoice_type ? INVOICE_TYPE_LABELS[invoice.invoice_type as InvoiceType] : 'Service Charge'}
                                        </Badge>
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

            {/* Pagination */}
            {totalPages > 1 && (
                <div className="flex items-center justify-between">
                    <div className="text-sm text-muted-foreground">
                        Showing {((page - 1) * limit) + 1} to {Math.min(page * limit, totalCount)} of {totalCount} invoices
                    </div>
                    <div className="flex items-center gap-2">
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setPage(p => Math.max(1, p - 1))}
                            disabled={page === 1}
                        >
                            <ChevronLeft className="h-4 w-4" />
                            Previous
                        </Button>
                        <div className="flex items-center gap-1">
                            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                                let pageNum: number;
                                if (totalPages <= 5) {
                                    pageNum = i + 1;
                                } else if (page <= 3) {
                                    pageNum = i + 1;
                                } else if (page >= totalPages - 2) {
                                    pageNum = totalPages - 4 + i;
                                } else {
                                    pageNum = page - 2 + i;
                                }
                                return (
                                    <Button
                                        key={pageNum}
                                        variant={page === pageNum ? 'default' : 'outline'}
                                        size="sm"
                                        onClick={() => setPage(pageNum)}
                                        className="w-9"
                                    >
                                        {pageNum}
                                    </Button>
                                );
                            })}
                        </div>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                            disabled={page === totalPages}
                        >
                            Next
                            <ChevronRight className="h-4 w-4" />
                        </Button>
                    </div>
                </div>
            )}
        </div>
    );
}

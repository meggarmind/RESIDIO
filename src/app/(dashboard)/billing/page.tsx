'use client';

import { useAdminInvoices, useCheckOverdueInvoices, useInvoiceSummary, useOverdueStats } from '@/hooks/use-billing';
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
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { RecordCard, RecordCardSkeleton } from '@/components/ui/record-card';
import { ALL_VALUE, ListFilterBar, type ListFilter } from '@/components/ui/list-filter-bar';
import { Calendar as CalendarComponent } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

import { formatCurrency } from '@/lib/utils';
import { endOfMonth, endOfYear, format, startOfMonth, startOfYear, subMonths } from 'date-fns';
import { Loader2, FileText, RefreshCw, ChevronLeft, ChevronRight, AlertCircle, Clock, CheckCircle2, Receipt, TrendingUp, CalendarRange } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState, useEffect, useMemo } from 'react';
import type { DateRange } from 'react-day-picker';
import { getBillingResidentFilterOptions } from '@/actions/billing/get-invoices';
import { INVOICE_TYPE_LABELS, type InvoiceType, type InvoiceStatus, type InvoiceWithDetails } from '@/types/database';
import {
    EnhancedStatCard,
    EnhancedTableCard,
    EnhancedPageHeader,
} from '@/components/dashboard/enhanced-stat-card';
import { cn } from '@/lib/utils';
import { Can } from '@/components/auth/can';
import { PERMISSIONS } from '@/lib/auth/action-roles';

const statusColors: Record<string, string> = {
    unpaid: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
    paid: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
    partially_paid: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300',
    void: 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-300',
};

const invoiceTypeColors: Record<InvoiceType, string> = {
    SERVICE_CHARGE: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
    LEVY: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300',
    ADJUSTMENT: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300',
    OTHER: 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-300',
};

// Type and status badges, shared by the table row and the phone card
function InvoiceTypeBadge({ invoice }: { invoice: InvoiceWithDetails }) {
    return (
        <Badge className={cn(invoice.invoice_type ? invoiceTypeColors[invoice.invoice_type as InvoiceType] : invoiceTypeColors.SERVICE_CHARGE)}>
            {invoice.invoice_type ? INVOICE_TYPE_LABELS[invoice.invoice_type as InvoiceType] : 'Service Charge'}
        </Badge>
    );
}

function InvoiceStatusBadge({ invoice }: { invoice: InvoiceWithDetails }) {
    return (
        <Badge className={cn(statusColors[invoice.status] || '')}>
            {invoice.status}
        </Badge>
    );
}

// Phone card, the stacked counterpart of an invoice table row (below md)
function InvoiceCard({ invoice, onNavigate }: { invoice: InvoiceWithDetails; onNavigate: (id: string) => void }) {
    const residentName = `${invoice.resident?.first_name ?? ''} ${invoice.resident?.last_name ?? ''}`.trim();
    const house = [invoice.house?.house_number, invoice.house?.street?.name].filter(Boolean).join(', ');

    return (
        <RecordCard
            data-testid="invoice-card"
            title={formatCurrency(invoice.amount_due)}
            badge={<InvoiceStatusBadge invoice={invoice} />}
            subtitle={[residentName, house].filter(Boolean).join(' · ')}
            label={`Open invoice ${invoice.invoice_number}`}
            onClick={() => onNavigate(invoice.id)}
        >
            <div className="space-y-1">
                <p>
                    {new Date(invoice.period_start).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })}
                    <span className="text-muted-foreground"> · Due </span>
                    {new Date(invoice.due_date).toLocaleDateString('en-GB')}
                </p>
                <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs text-muted-foreground">{invoice.invoice_number}</span>
                    <InvoiceTypeBadge invoice={invoice} />
                </div>
            </div>
        </RecordCard>
    );
}

type BillingResident = {
    id: string;
    first_name: string;
    last_name: string;
};

type DatePreset = 'all' | 'this_month' | 'last_month' | 'last_3_months' | 'this_year' | 'custom';

export function getPresetInvoiceDateRange(preset: DatePreset, now = new Date()) {
    switch (preset) {
        case 'this_month':
            return { periodFrom: format(startOfMonth(now), 'yyyy-MM-dd'), periodTo: format(endOfMonth(now), 'yyyy-MM-dd') };
        case 'last_month': {
            const lastMonth = subMonths(now, 1);
            return { periodFrom: format(startOfMonth(lastMonth), 'yyyy-MM-dd'), periodTo: format(endOfMonth(lastMonth), 'yyyy-MM-dd') };
        }
        case 'last_3_months':
            return { periodFrom: format(startOfMonth(subMonths(now, 2)), 'yyyy-MM-dd'), periodTo: format(endOfMonth(now), 'yyyy-MM-dd') };
        case 'this_year':
            return { periodFrom: format(startOfYear(now), 'yyyy-MM-dd'), periodTo: format(endOfYear(now), 'yyyy-MM-dd') };
        default:
            return {};
    }
}

export function getInitialBillingResidentId(residentId: string | null) {
    return residentId || 'all';
}

export function buildBillingResidentOptions(
    residents: BillingResident[],
    aliasesByResident: Map<string, string[]>
) {
    return [
        { value: 'all', label: 'All residents' },
        ...residents
            .toSorted((left, right) =>
                left.first_name.localeCompare(right.first_name, undefined, { sensitivity: 'base' }) ||
                left.last_name.localeCompare(right.last_name, undefined, { sensitivity: 'base' })
            )
            .map((resident) => {
                const aliases = aliasesByResident.get(resident.id) ?? [];
                const name = `${resident.first_name} ${resident.last_name}`;
                return {
                    value: resident.id,
                    label: aliases.length > 0 ? `${name} (${aliases.join(', ')})` : name,
                };
            }),
    ];
}

export default function BillingPage() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const [page, setPage] = useState(1);
    const [limit, setLimit] = useState(20);
    const [status, setStatus] = useState<string>('all');
    const [invoiceType, setInvoiceType] = useState<string>('all');
    const requestedResidentId = searchParams.get('resident_id');
    const [selectedResidentId, setSelectedResidentId] = useState<string | null>(null);
    const residentId = selectedResidentId ?? getInitialBillingResidentId(requestedResidentId);
    const [search, setSearch] = useState('');
    const [datePreset, setDatePreset] = useState<DatePreset>('all');
    const [customDateRange, setCustomDateRange] = useState<DateRange>();
    const [isCustomDatePickerOpen, setIsCustomDatePickerOpen] = useState(false);
    const [residents, setResidents] = useState<BillingResident[]>([]);
    const [residentAliases, setResidentAliases] = useState<Map<string, string[]>>(new Map());


    const dateRange = useMemo(() => {
        if (datePreset === 'custom') {
            return customDateRange?.from && customDateRange.to
                ? { periodFrom: format(customDateRange.from, 'yyyy-MM-dd'), periodTo: format(customDateRange.to, 'yyyy-MM-dd') }
                : {};
        }
        return getPresetInvoiceDateRange(datePreset);
    }, [customDateRange, datePreset]);

    const { data, isLoading, isError, refetch } = useAdminInvoices({
        page,
        limit,
        status: status === 'all' ? undefined : (status as InvoiceStatus),
        invoiceType: invoiceType === 'all' ? undefined : (invoiceType as InvoiceType),
        residentId: residentId === 'all' ? undefined : residentId,
        search: search || undefined,
        ...dateRange,
    });
    const checkOverdueMutation = useCheckOverdueInvoices();
    const { data: overdueStats } = useOverdueStats();

    const invoices = data?.data ?? [];
    // Shown in the table's empty row and in the phone card list
    const emptyMessage = 'No invoices found. Click "Generate Monthly Invoices" to create them.';
    const totalCount = data?.total ?? 0;
    const totalPages = Math.ceil(totalCount / limit);

    const isFiltered = status !== 'all' || invoiceType !== 'all' || residentId !== 'all' || Boolean(search) || datePreset !== 'all';

    // Estate-wide (filter-aware) aggregates for the stat cards below -- NOT derived from the
    // current page of `invoices`, which only ever holds up to `limit` rows.
    const { data: summary, isLoading: isSummaryLoading } = useInvoiceSummary({
        status: status === 'all' ? undefined : (status as InvoiceStatus),
        invoiceType: invoiceType === 'all' ? undefined : (invoiceType as InvoiceType),
        residentId: residentId === 'all' ? undefined : residentId,
        search: search || undefined,
        ...dateRange,
    });

    useEffect(() => {
        async function fetchResidentOptions() {
            const result = await getBillingResidentFilterOptions();
            if (!result.data) return;

            setResidents(result.data.map((resident) => ({
                id: resident.id,
                first_name: resident.first_name,
                last_name: resident.last_name,
            })));
            setResidentAliases(new Map(result.data.map((resident) => [resident.id, resident.aliases])));
        }

        void fetchResidentOptions();
    }, []);

    const residentOptions = useMemo(
        () => buildBillingResidentOptions(residents, residentAliases),
        [residentAliases, residents]
    );

    const handleClearFilters = () => {
        setStatus('all');
        setInvoiceType('all');
        setSelectedResidentId('all');
        setSearch('');
        setDatePreset('all');
        setCustomDateRange(undefined);
        setPage(1);
    };

    const customDateRangeLabel = customDateRange?.from && customDateRange.to
        ? `${format(customDateRange.from, 'dd MMM yy')} - ${format(customDateRange.to, 'dd MMM yy')}`
        : null;

    const filters: ListFilter[] = [
        { id: 'resident', label: 'Resident', value: residentId, options: residentOptions, onChange: setSelectedResidentId, searchable: true },
        {
            id: 'status', label: 'Status', value: status, onChange: setStatus, className: 'md:w-[110px]',
            options: [
                { value: ALL_VALUE, label: 'All Status' },
                { value: 'unpaid', label: 'Unpaid' },
                { value: 'overdue', label: 'Overdue' },
                { value: 'paid', label: 'Paid' },
                { value: 'partially_paid', label: 'Partial' },
                { value: 'void', label: 'Void' },
            ],
        },
        {
            id: 'type', label: 'Type', value: invoiceType, onChange: setInvoiceType, className: 'md:w-[110px]',
            options: [
                { value: ALL_VALUE, label: 'All Types' },
                { value: 'SERVICE_CHARGE', label: 'Service' },
                { value: 'LEVY', label: 'Levy' },
                { value: 'ADJUSTMENT', label: 'Adjust' },
                { value: 'OTHER', label: 'Other' },
            ],
        },
        {
            id: 'date', label: 'Date', value: datePreset, onChange: (value) => setDatePreset(value as DatePreset), className: 'md:w-[120px]',
            options: [
                { value: ALL_VALUE, label: 'All Dates' },
                { value: 'this_month', label: 'This Month' },
                { value: 'last_month', label: 'Last Month' },
                { value: 'last_3_months', label: 'Last 3 Months' },
                { value: 'this_year', label: 'This Year' },
                ...(datePreset === 'custom' ? [{ value: 'custom', label: customDateRangeLabel ?? 'Custom range' }] : []),
            ],
        },
    ];

    const handleCustomDateRangeSelect = (range: DateRange | undefined) => {
        setCustomDateRange(range);
        if (range?.from && range.to) {
            setDatePreset('custom');
            setPage(1);
            setIsCustomDatePickerOpen(false);
        }
    };

    return (
        <div className="space-y-6">
            <EnhancedPageHeader
                title="Billing & Invoices"
                description="Manage monthly invoices and billing runs"
                icon={Receipt}
                actions={
                    <div className="flex gap-2">
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => refetch()}
                        >
                            <RefreshCw className="mr-2 h-4 w-4" />
                            Refresh
                        </Button>
                        {/* Rewrites invoice statuses. checkOverdueInvoices has no server permission check of its own, so this follows the other billing write on the page. */}
                        <Can permission={PERMISSIONS.BILLING_CREATE_INVOICE}>
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
                        </Can>
                        <Can permission={PERMISSIONS.BILLING_CREATE_INVOICE}>
                            <Button
                                asChild
                            >
                                <Link href="/billing/generate">
                                    <FileText className="mr-2 h-4 w-4" />
                                    Generate Invoices
                                </Link>
                            </Button>
                        </Can>
                    </div>
                }
            />

            {/* Stats Cards */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
                <EnhancedStatCard
                    title="Total Invoices"
                    value={totalCount}
                    icon={FileText}
                    isLoading={isLoading}
                    description="All time invoices"
                    accentColor="info"
                    className="stagger-1"
                />
                <EnhancedStatCard
                    title="Paid"
                    value={summary?.paidCount ?? 0}
                    icon={CheckCircle2}
                    isLoading={isSummaryLoading}
                    description="Completed payments"
                    accentColor="success"
                    className="stagger-2"
                />
                <EnhancedStatCard
                    title="Unpaid"
                    value={summary?.unpaidCount ?? 0}
                    icon={Clock}
                    isLoading={isSummaryLoading}
                    description="Pending invoices"
                    accentColor={(summary?.unpaidCount ?? 0) > 0 ? 'warning' : 'default'}
                    className="stagger-3"
                />
                <EnhancedStatCard
                    title="Total Value"
                    value={formatCurrency(summary?.totalAmountDue ?? 0)}
                    icon={TrendingUp}
                    isLoading={isSummaryLoading}
                    description={isFiltered ? 'Filtered invoice value' : 'All time invoice value'}
                    accentColor="default"
                    className="stagger-4"
                />
                <EnhancedStatCard
                    title="Overdue"
                    value={overdueStats ? formatCurrency(overdueStats.totalAmount) : formatCurrency(0)}
                    icon={AlertCircle}
                    isLoading={!overdueStats}
                    description={overdueStats ? `${overdueStats.count} overdue invoice${overdueStats.count !== 1 ? 's' : ''}` : 'Loading...'}
                    accentColor="warning"
                    className="stagger-5 cursor-pointer"
                    onClick={() => {
                        setStatus('overdue');
                        setPage(1);
                    }}
                />
            </div>

            {/* Invoices Table */}
            <EnhancedTableCard
                title="Invoices"
                description="All billing records"
                actions={
                    <ListFilterBar
                        search={{ value: search, onChange: setSearch, placeholder: 'Invoice number...' }}
                        filters={filters}
                        onClearAll={handleClearFilters}
                        onAnyChange={() => setPage(1)}
                    >
                        <Popover open={isCustomDatePickerOpen} onOpenChange={setIsCustomDatePickerOpen}>
                            <PopoverTrigger asChild>
                                <Button
                                    variant={datePreset === 'custom' ? 'secondary' : 'outline'}
                                    size="sm"
                                    className={cn('h-9 gap-2 text-sm')}
                                >
                                    <CalendarRange className="h-4 w-4" />
                                    {customDateRangeLabel ?? 'Custom range'}
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0" align="end">
                                <CalendarComponent
                                    mode="range"
                                    selected={customDateRange}
                                    onSelect={handleCustomDateRangeSelect}
                                    defaultMonth={customDateRange?.from ?? new Date()}
                                    numberOfMonths={2}
                                />
                            </PopoverContent>
                        </Popover>
                    </ListFilterBar>
                }
            >
                {isError ? (
                    <div role="alert" className="rounded-xl border bg-card py-8 text-center shadow-soft" data-error-state="invoices">
                        <AlertCircle className="mx-auto mb-3 h-8 w-8 text-destructive" aria-hidden="true" />
                        <p className="font-medium">The invoice list could not be loaded</p>
                        <p className="mt-1 text-sm text-muted-foreground">Nothing was changed. Try again.</p>
                        <Button variant="outline" size="sm" className="mt-4" onClick={() => refetch()}>
                            <RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />
                            Try again
                        </Button>
                    </div>
                ) : (
                <>
                {/* Phone: stacked cards below md. Both lists stay in the DOM and CSS picks one. */}
                <div className="space-y-3 md:hidden" data-testid="invoice-card-list">
                    {isLoading ? (
                        [...Array(5)].map((_, i) => <RecordCardSkeleton key={i} />)
                    ) : invoices.length === 0 ? (
                        <div className="rounded-xl border bg-card py-8 text-center text-muted-foreground shadow-soft">
                            {emptyMessage}
                        </div>
                    ) : (
                        invoices.map((invoice) => (
                            <InvoiceCard key={invoice.id} invoice={invoice} onNavigate={(id) => router.push(`/billing/${id}`)} />
                        ))
                    )}
                </div>

                <div className={cn('hidden md:block rounded-xl border overflow-hidden shadow-soft animate-slide-up')}>
                    <Table variant="default">
                        <TableHeader>
                            <TableRow interactive={false}>
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
                                        <TableCell><Skeleton className={cn('h-4 w-24')} /></TableCell>
                                        <TableCell><Skeleton className={cn('h-4 w-32')} /></TableCell>
                                        <TableCell><Skeleton className={cn('h-4 w-40')} /></TableCell>
                                        <TableCell><Skeleton className={cn('h-4 w-20')} /></TableCell>
                                        <TableCell><Skeleton className={cn('h-4 w-24')} /></TableCell>
                                        <TableCell className="text-right"><Skeleton className={cn('h-4 w-20 ml-auto')} /></TableCell>
                                        <TableCell><Skeleton className={cn('h-5 w-24 rounded-full')} /></TableCell>
                                        <TableCell><Skeleton className={cn('h-5 w-16 rounded-full')} /></TableCell>
                                        <TableCell><Skeleton className={cn('h-8 w-12')} /></TableCell>
                                    </TableRow>
                                ))
                            ) : invoices.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={9} className="py-8 text-center text-muted-foreground">
                                        {emptyMessage}
                                    </TableCell>
                                </TableRow>
                            ) : (
                                invoices.map((invoice) => (
                                    <TableRow
                                        key={invoice.id}
                                    >
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
                                            <InvoiceTypeBadge invoice={invoice} />
                                        </TableCell>
                                        <TableCell>
                                            <InvoiceStatusBadge invoice={invoice} />
                                        </TableCell>
                                        <TableCell>
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                asChild
                                            >
                                                <Link href={`/billing/${invoice.id}`}>View</Link>
                                            </Button>
                                        </TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                </div>
                </>
                )}
            </EnhancedTableCard>

            {/* Pagination */}
            {totalCount > 0 && (
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <div className="flex items-center gap-2">
                            <span className={cn('text-sm text-muted-foreground whitespace-nowrap')}>
                                Rows per page
                            </span>
                            <Select value={limit.toString()} onValueChange={(value) => {
                                setLimit(Number(value));
                                setPage(1);
                            }}>
                                <SelectTrigger className={cn("h-8 w-[70px]")}>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="10">10</SelectItem>
                                    <SelectItem value="20">20</SelectItem>
                                    <SelectItem value="50">50</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className={cn('text-sm text-muted-foreground')}>
                            Showing {((page - 1) * limit) + 1} to {Math.min(page * limit, totalCount)} of {totalCount} invoices
                        </div>
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
                                        className={cn('w-9')}
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

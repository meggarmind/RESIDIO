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
import { Input } from '@/components/ui/input';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { Calendar as CalendarComponent } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

import { formatCurrency } from '@/lib/utils';
import { endOfMonth, endOfYear, format, startOfMonth, startOfYear, subMonths } from 'date-fns';
import { Loader2, FileText, RefreshCw, ChevronLeft, ChevronRight, Search, AlertCircle, Clock, CheckCircle2, Receipt, TrendingUp, CalendarRange } from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useState, useEffect, useMemo } from 'react';
import type { DateRange } from 'react-day-picker';
import { getBillingResidentFilterOptions } from '@/actions/billing/get-invoices';
import { INVOICE_TYPE_LABELS, type InvoiceType, type InvoiceStatus } from '@/types/database';
import {
    EnhancedStatCard,
    EnhancedTableCard,
    EnhancedPageHeader,
} from '@/components/dashboard/enhanced-stat-card';
import { useVisualTheme } from '@/contexts/visual-theme-context';
import { cn } from '@/lib/utils';

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

    const { themeId } = useVisualTheme();
    const isModern = themeId === 'modern';

    const dateRange = useMemo(() => {
        if (datePreset === 'custom') {
            return customDateRange?.from && customDateRange.to
                ? { periodFrom: format(customDateRange.from, 'yyyy-MM-dd'), periodTo: format(customDateRange.to, 'yyyy-MM-dd') }
                : {};
        }
        return getPresetInvoiceDateRange(datePreset);
    }, [customDateRange, datePreset]);

    const { data, isLoading, refetch } = useAdminInvoices({
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
                            className={cn(isModern && 'rounded-xl')}
                        >
                            <RefreshCw className="mr-2 h-4 w-4" />
                            Refresh
                        </Button>
                        <Button
                            variant="outline"
                            onClick={() => checkOverdueMutation.mutateAsync()}
                            disabled={checkOverdueMutation.isPending}
                            className={cn(isModern && 'rounded-xl')}
                        >
                            {checkOverdueMutation.isPending ? (
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            ) : (
                                <AlertCircle className="mr-2 h-4 w-4" />
                            )}
                            Check Overdue
                        </Button>
                        <Button
                            asChild
                            className={cn(
                                isModern && 'rounded-xl bg-[#0EA5E9] hover:bg-[#0284C7] text-white'
                            )}
                        >
                            <Link href="/billing/generate">
                                <FileText className="mr-2 h-4 w-4" />
                                Generate Invoices
                            </Link>
                        </Button>
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
                    onClick={() => setStatus('unpaid')}
                />
            </div>

            {/* Invoices Table */}
            <EnhancedTableCard
                title="Invoices"
                description="All billing records"
                actions={
                    <div className="flex flex-wrap items-center gap-2">
                        <div className="relative w-[180px]">
                            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                            <Input
                                placeholder="Invoice number..."
                                value={search}
                                onChange={(e) => {
                                    setSearch(e.target.value);
                                    setPage(1);
                                }}
                                className={cn(
                                    'pl-8 h-9 text-sm',
                                    isModern && 'rounded-xl border-gray-200 dark:border-[#334155]'
                                )}
                            />
                        </div>

                        <SearchableSelect
                            options={residentOptions}
                            value={residentId}
                            onValueChange={(value) => {
                                setSelectedResidentId(value);
                                setPage(1);
                            }}
                            placeholder="All residents"
                            searchPlaceholder="Search name or alias..."
                            emptyMessage="No residents found."
                            className={cn('h-9 w-full min-w-[280px] max-w-[360px] text-sm', isModern && 'rounded-xl')}
                        />

                        <Select value={status} onValueChange={(value) => {
                            setStatus(value);
                            setPage(1);
                        }}>
                            <SelectTrigger className={cn("w-[110px] h-9 text-sm", isModern && 'rounded-xl')}>
                                <SelectValue placeholder="Status" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All Status</SelectItem>
                                <SelectItem value="unpaid">Unpaid</SelectItem>
                                <SelectItem value="paid">Paid</SelectItem>
                                <SelectItem value="partially_paid">Partial</SelectItem>
                                <SelectItem value="void">Void</SelectItem>
                            </SelectContent>
                        </Select>

                        <Select value={invoiceType} onValueChange={(value) => {
                            setInvoiceType(value);
                            setPage(1);
                        }}>
                            <SelectTrigger className={cn("w-[110px] h-9 text-sm", isModern && 'rounded-xl')}>
                                <SelectValue placeholder="Type" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All Types</SelectItem>
                                <SelectItem value="SERVICE_CHARGE">Service</SelectItem>
                                <SelectItem value="LEVY">Levy</SelectItem>
                                <SelectItem value="ADJUSTMENT">Adjust</SelectItem>
                                <SelectItem value="OTHER">Other</SelectItem>
                            </SelectContent>
                        </Select>

                        <Select value={datePreset} onValueChange={(value: DatePreset) => {
                            setDatePreset(value);
                            setPage(1);
                        }}>
                            <SelectTrigger className={cn("w-[120px] h-9 text-sm", isModern && 'rounded-xl')}>
                                <SelectValue placeholder="Date" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All Dates</SelectItem>
                                <SelectItem value="this_month">This Month</SelectItem>
                                <SelectItem value="last_month">Last Month</SelectItem>
                                <SelectItem value="last_3_months">Last 3 Months</SelectItem>
                                <SelectItem value="this_year">This Year</SelectItem>
                            </SelectContent>
                        </Select>

                        <Popover open={isCustomDatePickerOpen} onOpenChange={setIsCustomDatePickerOpen}>
                            <PopoverTrigger asChild>
                                <Button
                                    variant={datePreset === 'custom' ? 'secondary' : 'outline'}
                                    size="sm"
                                    className={cn('h-9 gap-2 text-sm', isModern && 'rounded-xl')}
                                >
                                    <CalendarRange className="h-4 w-4" />
                                    {customDateRange?.from && customDateRange.to
                                        ? `${format(customDateRange.from, 'dd MMM yy')} - ${format(customDateRange.to, 'dd MMM yy')}`
                                        : 'Custom range'}
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

                        {isFiltered && (
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={handleClearFilters}
                                className={cn("h-9 px-2 text-muted-foreground hover:text-foreground", isModern && 'rounded-xl')}
                                title="Clear Filters"
                            >
                                <RefreshCw className="h-4 w-4" />
                            </Button>
                        )}
                    </div>
                }
            >
                <div className={cn(
                    'rounded-xl border overflow-hidden shadow-soft animate-slide-up',
                    isModern && 'border-gray-200 dark:border-[#334155]'
                )}>
                    <Table variant={isModern ? "modern" : "default"}>
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
                                        <TableCell><Skeleton className={cn('h-4 w-24', isModern && 'rounded-lg')} /></TableCell>
                                        <TableCell><Skeleton className={cn('h-4 w-32', isModern && 'rounded-lg')} /></TableCell>
                                        <TableCell><Skeleton className={cn('h-4 w-40', isModern && 'rounded-lg')} /></TableCell>
                                        <TableCell><Skeleton className={cn('h-4 w-20', isModern && 'rounded-lg')} /></TableCell>
                                        <TableCell><Skeleton className={cn('h-4 w-24', isModern && 'rounded-lg')} /></TableCell>
                                        <TableCell className="text-right"><Skeleton className={cn('h-4 w-20 ml-auto', isModern && 'rounded-lg')} /></TableCell>
                                        <TableCell><Skeleton className={cn('h-5 w-24 rounded-full', isModern && 'rounded-full')} /></TableCell>
                                        <TableCell><Skeleton className={cn('h-5 w-16 rounded-full', isModern && 'rounded-full')} /></TableCell>
                                        <TableCell><Skeleton className={cn('h-8 w-12', isModern && 'rounded-lg')} /></TableCell>
                                    </TableRow>
                                ))
                            ) : invoices.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={9} className="py-8 text-center text-muted-foreground">
                                        No invoices found. Click &quot;Generate Monthly Invoices&quot; to create them.
                                    </TableCell>
                                </TableRow>
                            ) : (
                                invoices.map((invoice) => (
                                    <TableRow
                                        key={invoice.id}
                                        className={cn(
                                            isModern && 'hover:bg-gray-50 dark:hover:bg-[#0F172A]'
                                        )}
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
                                            <Badge className={cn(
                                                invoice.invoice_type ? invoiceTypeColors[invoice.invoice_type as InvoiceType] : invoiceTypeColors.SERVICE_CHARGE,
                                                isModern && 'rounded-full'
                                            )}>
                                                {invoice.invoice_type ? INVOICE_TYPE_LABELS[invoice.invoice_type as InvoiceType] : 'Service Charge'}
                                            </Badge>
                                        </TableCell>
                                        <TableCell>
                                            <Badge className={cn(
                                                statusColors[invoice.status] || '',
                                                isModern && 'rounded-full'
                                            )}>
                                                {invoice.status}
                                            </Badge>
                                        </TableCell>
                                        <TableCell>
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                asChild
                                                className={cn(isModern && 'rounded-lg')}
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
            </EnhancedTableCard>

            {/* Pagination */}
            {totalCount > 0 && (
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <div className="flex items-center gap-2">
                            <span className={cn(
                                'text-sm text-muted-foreground whitespace-nowrap',
                                isModern && 'text-gray-500 dark:text-gray-400'
                            )}>
                                Rows per page
                            </span>
                            <Select value={limit.toString()} onValueChange={(value) => {
                                setLimit(Number(value));
                                setPage(1);
                            }}>
                                <SelectTrigger className={cn("h-8 w-[70px]", isModern && 'rounded-xl')}>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="10">10</SelectItem>
                                    <SelectItem value="20">20</SelectItem>
                                    <SelectItem value="50">50</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className={cn(
                            'text-sm text-muted-foreground',
                            isModern && 'text-gray-500 dark:text-gray-400'
                        )}>
                            Showing {((page - 1) * limit) + 1} to {Math.min(page * limit, totalCount)} of {totalCount} invoices
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setPage(p => Math.max(1, p - 1))}
                            disabled={page === 1}
                            className={cn(isModern && 'rounded-xl')}
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
                                        className={cn(
                                            'w-9',
                                            isModern && 'rounded-xl',
                                            page === pageNum && isModern && 'bg-[#0EA5E9] hover:bg-[#0284C7]'
                                        )}
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
                            className={cn(isModern && 'rounded-xl')}
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

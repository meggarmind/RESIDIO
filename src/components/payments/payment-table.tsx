'use client';

import { useState, memo, useCallback } from 'react';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { RecordCard } from '@/components/ui/record-card';
import { RecordSortControl } from '@/components/ui/record-sort-control';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { format } from 'date-fns';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Trash2, Eye, CheckCircle, Download, X, Receipt, Plus, ChevronDown, ChevronUp, ChevronsUpDown, Clock, AlertCircle, ShieldCheck } from 'lucide-react';
import { PaymentStatusBadge } from './payment-status-badge';
import { useDeletePayment, useBulkUpdatePayments, useBulkVerifyPayments } from '@/hooks/use-payments';
import { formatCurrency } from '@/lib/utils';
import type { PaymentRecord } from '@/types/database';
import { toast } from 'sonner';
import { Can } from '@/components/auth/can';
import { PERMISSIONS } from '@/lib/auth/action-roles';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

type PaymentRowWithResident = PaymentRecord & {
    reference_number: string | null;
    resident?: { first_name?: string; last_name?: string; resident_code?: string } | null;
};

interface PaymentTableProps {
    data: PaymentRowWithResident[];
    showResident?: boolean;
    residentId?: string;
    clickableRows?: boolean;
    sortBy?: 'payment_date' | 'amount' | 'status';
    sortOrder?: 'asc' | 'desc';
    onSort?: (column: 'payment_date' | 'amount' | 'status') => void;
}

// Sort options for the phone sort control (the table uses its column headers)
export const PAYMENT_SORT_OPTIONS = [
    { value: 'payment_date', label: 'Date' },
    { value: 'amount', label: 'Amount' },
    { value: 'status', label: 'Status' },
];

// View and Delete buttons, shared by the table row and the phone card
function PaymentActions({
    payment,
    clickableRows,
    onDelete,
}: {
    payment: PaymentRowWithResident;
    clickableRows?: boolean;
    onDelete: (id: string) => void;
}) {
    return (
        <>
            {!clickableRows && (
                <Button variant="ghost" size="icon" asChild aria-label="View payment">
                    <Link href={`/payments/${payment.id}`}>
                        <Eye className="h-4 w-4" />
                    </Link>
                </Button>
            )}
            <Can permission={PERMISSIONS.PAYMENTS_DELETE}>
                <Button
                    variant="ghost"
                    size="icon"
                    className="text-destructive hover:text-destructive"
                    onClick={(e) => {
                        e.stopPropagation();
                        onDelete(payment.id);
                    }}
                    aria-label="Delete payment"
                >
                    <Trash2 className="h-4 w-4" />
                </Button>
            </Can>
        </>
    );
}

// Memoized phone card, the stacked counterpart of PaymentRow (below md)
const PaymentCard = memo(function PaymentCard({
    payment,
    showResident,
    isSelected,
    onToggleSelection,
    onDelete,
    clickableRows,
    onNavigate,
}: {
    payment: PaymentRowWithResident;
    showResident: boolean;
    isSelected: boolean;
    onToggleSelection: (id: string) => void;
    onDelete: (id: string) => void;
    clickableRows?: boolean;
    onNavigate?: (id: string) => void;
}) {
    const residentName = `${payment.resident?.first_name ?? ''} ${payment.resident?.last_name ?? ''}`.trim();
    const method = payment.method ? payment.method.replace('_', ' ') : '-';

    const cardProps = {
        'data-testid': 'payment-card',
        title: formatCurrency(Number(payment.amount)),
        badge: <PaymentStatusBadge status={payment.status} />,
        subtitle: showResident
            ? [residentName, payment.resident?.resident_code].filter(Boolean).join(' · ')
            : undefined,
        leading: !clickableRows ? (
            <Checkbox
                checked={isSelected}
                onCheckedChange={() => onToggleSelection(payment.id)}
                aria-label={`Select payment ${payment.reference_number}`}
            />
        ) : undefined,
        actions: <PaymentActions payment={payment} clickableRows={clickableRows} onDelete={onDelete} />,
    };
    const cardBody = (
        <div className="space-y-0.5">
            <p>
                {format(new Date(payment.payment_date), 'MMM d, yyyy')}
                <span className="text-muted-foreground"> · </span>
                <span className="capitalize">{method}</span>
            </p>
            <p className="font-mono text-xs text-muted-foreground">Ref {payment.reference_number || '-'}</p>
        </div>
    );

    // A tap target needs both a label and a handler (RecordCard's props are a union),
    // so the two cases are rendered explicitly.
    return clickableRows ? (
        <RecordCard
            {...cardProps}
            label={`Open payment of ${formatCurrency(Number(payment.amount))}`}
            onClick={() => onNavigate?.(payment.id)}
        >
            {cardBody}
        </RecordCard>
    ) : (
        <RecordCard {...cardProps}>{cardBody}</RecordCard>
    );
});

// Memoized row component to prevent unnecessary re-renders

const PaymentRow = memo(function PaymentRow({
    payment,
    showResident,
    isSelected,
    onToggleSelection,
    onDelete,
    clickableRows,
    onNavigate,
}: {
    payment: PaymentRowWithResident;
    showResident: boolean;
    isSelected: boolean;
    onToggleSelection: (id: string) => void;
    onDelete: (id: string) => void;
    clickableRows?: boolean;
    onNavigate?: (id: string) => void;
}) {
    return (
        <TableRow
            className={clickableRows ? 'cursor-pointer hover:bg-muted/50 transition-colors' : undefined}
            onClick={clickableRows ? () => onNavigate?.(payment.id) : undefined}
        >
            {!clickableRows && (
                <TableCell>
                    <Checkbox
                        checked={isSelected}
                        onCheckedChange={() => onToggleSelection(payment.id)}
                        aria-label={`Select payment ${payment.reference_number}`}
                    />
                </TableCell>
            )}
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
                    <PaymentActions payment={payment} clickableRows={clickableRows} onDelete={onDelete} />
                </div>
            </TableCell>
        </TableRow>
    );
});

export function PaymentTable({ data, showResident = true, residentId, clickableRows = false, sortBy, sortOrder, onSort }: PaymentTableProps) {
    const router = useRouter();
    const deleteMutation = useDeletePayment();
    const bulkUpdateMutation = useBulkUpdatePayments();
    const bulkVerifyMutation = useBulkVerifyPayments();

    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    const [verifyDialogOpen, setVerifyDialogOpen] = useState(false);

    const handleNavigate = useCallback((id: string) => {
        router.push(`/payments/${id}`);
    }, [router]);

    // Memoized handlers to prevent unnecessary re-renders of PaymentRow
    const handleDelete = useCallback(async (id: string) => {
        if (confirm('Are you sure you want to delete this payment record? This action cannot be undone.')) {
            await deleteMutation.mutateAsync(id);
        }
    }, [deleteMutation]);

    // Toggle single selection - memoized for PaymentRow
    const toggleSelection = useCallback((id: string) => {
        setSelectedIds(prev => {
            const newSelected = new Set(prev);
            if (newSelected.has(id)) {
                newSelected.delete(id);
            } else {
                newSelected.add(id);
            }
            return newSelected;
        });
    }, []);

    // Toggle select all
    const toggleSelectAll = () => {
        if (selectedIds.size === data.length) {
            setSelectedIds(new Set());
        } else {
            setSelectedIds(new Set(data.map((p) => p.id)));
        }
    };

    // Bulk delete handler
    const handleBulkDelete = async () => {
        setIsDeleting(true);
        try {
            const deletePromises = Array.from(selectedIds).map((id) =>
                deleteMutation.mutateAsync(id)
            );
            await Promise.all(deletePromises);
            toast.success(`Successfully deleted ${selectedIds.size} payment(s)`);
            setSelectedIds(new Set());
            setDeleteDialogOpen(false);
        } catch (error) {
            toast.error('Failed to delete some payments');
        } finally {
            setIsDeleting(false);
        }
    };

    // Export CSV handler
    const handleExportCSV = () => {
        const selectedPayments = data.filter((p) => selectedIds.has(p.id));

        // CSV header
        const headers = ['Date', 'Resident', 'Amount', 'Method', 'Status', 'Reference'];

        // CSV rows
        const rows = selectedPayments.map((payment) => [
            format(new Date(payment.payment_date), 'yyyy-MM-dd'),
            `${payment.resident?.first_name || ''} ${payment.resident?.last_name || ''}`,
            payment.amount,
            payment.method || '',
            payment.status,
            payment.reference_number || '',
        ]);

        // Create CSV content
        const csvContent = [
            headers.join(','),
            ...rows.map((row) => row.map((cell) => `"${cell}"`).join(',')),
        ].join('\n');

        // Download
        const blob = new Blob([csvContent], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `payments-export-${format(new Date(), 'yyyy-MM-dd')}.csv`;
        a.click();
        window.URL.revokeObjectURL(url);

        toast.success(`Exported ${selectedIds.size} payment(s) to CSV`);
    };

    // Bulk status update handler
    const handleBulkStatusUpdate = async (status: 'pending' | 'paid' | 'overdue' | 'failed') => {
        try {
            await bulkUpdateMutation.mutateAsync({
                ids: Array.from(selectedIds),
                status,
            });
            setSelectedIds(new Set());
        } catch (error) {
            // Error handled by mutation
        }
    };

    // Bulk verify handler (#812)
    const handleBulkVerify = async () => {
        try {
            await bulkVerifyMutation.mutateAsync({ ids: Array.from(selectedIds) });
            setSelectedIds(new Set());
            setVerifyDialogOpen(false);
        } catch {
            // Error handled by mutation; keep the dialog open
        }
    };

    // Clear selection
    const clearSelection = () => {
        setSelectedIds(new Set());
    };

    // Enhanced empty state
    if (!data || data.length === 0) {
        return (
            <div className="border rounded-lg py-12">
                <div className="flex flex-col items-center justify-center gap-4 text-center">
                    <Receipt className="size-12 text-muted-foreground" />
                    <div className="space-y-2">
                        <h3 className="text-xl font-semibold">No payments found</h3>
                        <p className="text-sm text-muted-foreground max-w-md">
                            No payments match your current filters. Try adjusting your search criteria or add a new payment.
                        </p>
                    </div>
                    <div className="flex gap-3">
                        <Can permission={PERMISSIONS.PAYMENTS_CREATE}>
                            <Button onClick={() => router.push(residentId ? `/payments/new?residentId=${residentId}` : '/payments/new')}>
                                <Plus className="h-4 w-4 mr-2" />
                                Add Payment
                            </Button>
                        </Can>
                        <Button
                            variant="ghost"
                            onClick={() => router.push('/payments')}
                        >
                            Clear Filters
                        </Button>
                    </div>
                </div>
            </div>
        );
    }

    const allSelected = data.length > 0 && selectedIds.size === data.length;

    return (
        <>
            {/* Phone: stacked cards below md. Both lists stay in the DOM and CSS picks one. */}
            <div className="space-y-3 md:hidden" data-testid="payment-card-list">
                {onSort && (
                    <RecordSortControl
                        options={PAYMENT_SORT_OPTIONS}
                        sortBy={sortBy}
                        sortOrder={sortOrder}
                        onSort={(value) => onSort(value as 'payment_date' | 'amount' | 'status')}
                    />
                )}
                {data.map((payment) => (
                    <PaymentCard
                        key={payment.id}
                        payment={payment}
                        showResident={showResident}
                        isSelected={selectedIds.has(payment.id)}
                        onToggleSelection={toggleSelection}
                        onDelete={handleDelete}
                        clickableRows={clickableRows}
                        onNavigate={handleNavigate}
                    />
                ))}
            </div>

            <div className="hidden md:block border rounded-md">
                <Table>
                    <TableHeader>
                        <TableRow>
                            {!clickableRows && (
                                <TableHead className="w-[50px]">
                                    <Checkbox
                                        checked={allSelected}
                                        onCheckedChange={toggleSelectAll}
                                        aria-label="Select all"
                                    />
                                </TableHead>
                            )}
                            <TableHead>
                                {onSort ? (
                                    <button
                                        className="flex items-center gap-1 hover:text-foreground transition-colors font-medium"
                                        onClick={() => onSort('payment_date')}
                                    >
                                        Date
                                        {sortBy === 'payment_date' ? (
                                            sortOrder === 'asc' ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />
                                        ) : (
                                            <ChevronsUpDown className="h-3.5 w-3.5 text-muted-foreground/50" />
                                        )}
                                    </button>
                                ) : 'Date'}
                            </TableHead>
                            {showResident && <TableHead>Resident</TableHead>}
                            <TableHead>
                                {onSort ? (
                                    <button
                                        className="flex items-center gap-1 hover:text-foreground transition-colors font-medium"
                                        onClick={() => onSort('amount')}
                                    >
                                        Amount
                                        {sortBy === 'amount' ? (
                                            sortOrder === 'asc' ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />
                                        ) : (
                                            <ChevronsUpDown className="h-3.5 w-3.5 text-muted-foreground/50" />
                                        )}
                                    </button>
                                ) : 'Amount'}
                            </TableHead>
                            <TableHead>Method</TableHead>
                            <TableHead>
                                {onSort ? (
                                    <button
                                        className="flex items-center gap-1 hover:text-foreground transition-colors font-medium"
                                        onClick={() => onSort('status')}
                                    >
                                        Status
                                        {sortBy === 'status' ? (
                                            sortOrder === 'asc' ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />
                                        ) : (
                                            <ChevronsUpDown className="h-3.5 w-3.5 text-muted-foreground/50" />
                                        )}
                                    </button>
                                ) : 'Status'}
                            </TableHead>
                            <TableHead>Ref</TableHead>
                            <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {data.map((payment) => (
                            <PaymentRow
                                key={payment.id}
                                payment={payment}
                                showResident={showResident}
                                isSelected={selectedIds.has(payment.id)}
                                onToggleSelection={toggleSelection}
                                onDelete={handleDelete}
                                clickableRows={clickableRows}
                                onNavigate={handleNavigate}
                            />
                        ))}
                    </TableBody>
                </Table>
            </div>

            {/* Floating Action Bar */}
            {selectedIds.size > 0 && (
                <div className="fixed bottom-0 left-0 right-0 z-50 bg-primary p-4 shadow-lg">
                    <div className="container mx-auto flex items-center justify-between">
                        <div className="flex items-center gap-4">
                            <span className="text-sm text-primary-foreground font-medium">
                                {selectedIds.size} payment{selectedIds.size !== 1 ? 's' : ''} selected
                            </span>
                            <div className="hidden md:flex gap-2">
                                <Can permission={PERMISSIONS.PAYMENTS_BULK_UPDATE}>
                                <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                        <Button
                                            variant="default"
                                            size="sm"
                                            className="bg-primary-foreground text-primary hover:bg-primary-foreground/90"
                                            disabled={bulkUpdateMutation.isPending}
                                        >
                                            <CheckCircle className="h-4 w-4 mr-2" />
                                            Update Status
                                            <ChevronDown className="h-4 w-4 ml-2" />
                                        </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="start">
                                        <DropdownMenuLabel>Set Status To</DropdownMenuLabel>
                                        <DropdownMenuSeparator />
                                        <DropdownMenuItem onClick={() => handleBulkStatusUpdate('paid')}>
                                            <CheckCircle className="h-4 w-4 mr-2 text-green-600" />
                                            Paid
                                        </DropdownMenuItem>
                                        <DropdownMenuItem onClick={() => handleBulkStatusUpdate('pending')}>
                                            <Clock className="h-4 w-4 mr-2 text-yellow-600" />
                                            Pending
                                        </DropdownMenuItem>
                                        <DropdownMenuItem onClick={() => handleBulkStatusUpdate('overdue')}>
                                            <AlertCircle className="h-4 w-4 mr-2 text-orange-600" />
                                            Overdue
                                        </DropdownMenuItem>
                                        <DropdownMenuItem onClick={() => handleBulkStatusUpdate('failed')}>
                                            <X className="h-4 w-4 mr-2 text-red-600" />
                                            Failed
                                        </DropdownMenuItem>
                                    </DropdownMenuContent>
                                </DropdownMenu>
                                </Can>
                                <Can permission={PERMISSIONS.PAYMENTS_VERIFY}>
                                <Button
                                    variant="default"
                                    size="sm"
                                    className="bg-primary-foreground text-primary hover:bg-primary-foreground/90"
                                    onClick={() => setVerifyDialogOpen(true)}
                                    disabled={bulkVerifyMutation.isPending}
                                >
                                    <ShieldCheck className="h-4 w-4 mr-2" />
                                    Mark Verified
                                </Button>
                                </Can>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={handleExportCSV}
                                    className="bg-transparent text-primary-foreground border-primary-foreground hover:bg-primary-foreground/10"
                                >
                                    <Download className="h-4 w-4 mr-2" />
                                    Export CSV
                                </Button>
                                <Can permission={PERMISSIONS.PAYMENTS_DELETE}>
                                <Button
                                    variant="destructive"
                                    size="sm"
                                    onClick={() => setDeleteDialogOpen(true)}
                                >
                                    <Trash2 className="h-4 w-4 mr-2" />
                                    Delete Selected
                                </Button>
                                </Can>
                            </div>
                            {/* Mobile: Icon only buttons */}
                            <div className="flex md:hidden gap-2">
                                <Can permission={PERMISSIONS.PAYMENTS_BULK_UPDATE}>
                                <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                        <Button
                                            variant="default"
                                            size="icon"
                                            className="bg-primary-foreground text-primary"
                                            aria-label="Set status for selected payments"
                                            disabled={bulkUpdateMutation.isPending}
                                        >
                                            <CheckCircle className="h-4 w-4" />
                                        </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="start">
                                        <DropdownMenuLabel>Set Status To</DropdownMenuLabel>
                                        <DropdownMenuSeparator />
                                        <DropdownMenuItem onClick={() => handleBulkStatusUpdate('paid')}>
                                            <CheckCircle className="h-4 w-4 mr-2 text-green-600" />
                                            Paid
                                        </DropdownMenuItem>
                                        <DropdownMenuItem onClick={() => handleBulkStatusUpdate('pending')}>
                                            <Clock className="h-4 w-4 mr-2 text-yellow-600" />
                                            Pending
                                        </DropdownMenuItem>
                                        <DropdownMenuItem onClick={() => handleBulkStatusUpdate('overdue')}>
                                            <AlertCircle className="h-4 w-4 mr-2 text-orange-600" />
                                            Overdue
                                        </DropdownMenuItem>
                                        <DropdownMenuItem onClick={() => handleBulkStatusUpdate('failed')}>
                                            <X className="h-4 w-4 mr-2 text-red-600" />
                                            Failed
                                        </DropdownMenuItem>
                                    </DropdownMenuContent>
                                </DropdownMenu>
                                </Can>
                                <Can permission={PERMISSIONS.PAYMENTS_VERIFY}>
                                <Button
                                    variant="default"
                                    size="icon"
                                    className="bg-primary-foreground text-primary"
                                    aria-label="Mark selected payments verified"
                                    onClick={() => setVerifyDialogOpen(true)}
                                    disabled={bulkVerifyMutation.isPending}
                                >
                                    <ShieldCheck className="h-4 w-4" />
                                </Button>
                                </Can>
                                <Button
                                    variant="outline"
                                    size="icon"
                                    aria-label="Export selected payments to CSV"
                                    onClick={handleExportCSV}
                                    className="bg-transparent text-primary-foreground border-primary-foreground"
                                >
                                    <Download className="h-4 w-4" />
                                </Button>
                                <Can permission={PERMISSIONS.PAYMENTS_DELETE}>
                                <Button
                                    variant="destructive"
                                    size="icon"
                                    aria-label="Delete selected payments"
                                    onClick={() => setDeleteDialogOpen(true)}
                                >
                                    <Trash2 className="h-4 w-4" />
                                </Button>
                                </Can>
                            </div>
                        </div>
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={clearSelection}
                            aria-label="Clear selection"
                            className="text-primary-foreground hover:bg-primary-foreground/10"
                        >
                            <X className="h-4 w-4" />
                        </Button>
                    </div>
                </div>
            )}

            {/* Delete Confirmation Dialog */}
            <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Delete Payments</DialogTitle>
                        <DialogDescription>
                            Are you sure you want to delete {selectedIds.size} payment{selectedIds.size !== 1 ? 's' : ''}?
                            This action cannot be undone.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button
                            variant="outline"
                            onClick={() => setDeleteDialogOpen(false)}
                            disabled={isDeleting}
                        >
                            Cancel
                        </Button>
                        <Button
                            variant="destructive"
                            onClick={handleBulkDelete}
                            disabled={isDeleting}
                        >
                            {isDeleting ? 'Deleting...' : 'Delete'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Verify Confirmation Dialog (#812) */}
            <Dialog open={verifyDialogOpen} onOpenChange={setVerifyDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Mark Payments Verified</DialogTitle>
                        <DialogDescription>
                            Mark {selectedIds.size} payment{selectedIds.size !== 1 ? 's' : ''} as verified?
                            A verified payment&apos;s amount, resident, property and status are locked until
                            it is un-verified. Payments that are already verified are skipped.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button
                            variant="outline"
                            onClick={() => setVerifyDialogOpen(false)}
                            disabled={bulkVerifyMutation.isPending}
                        >
                            Cancel
                        </Button>
                        <Button
                            onClick={handleBulkVerify}
                            disabled={bulkVerifyMutation.isPending}
                        >
                            {bulkVerifyMutation.isPending ? 'Verifying...' : `Verify ${selectedIds.size}`}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}

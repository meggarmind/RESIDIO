'use client';

import { useState } from 'react';
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
import { Trash2, Eye, CheckCircle, Download, X, Receipt, Plus } from 'lucide-react';
import { PaymentStatusBadge } from './payment-status-badge';
import { useDeletePayment } from '@/hooks/use-payments';
import { formatCurrency } from '@/lib/utils';
import { toast } from 'sonner';

interface PaymentTableProps {
    data: any[];
    showResident?: boolean;
    residentId?: string;
}

export function PaymentTable({ data, showResident = true, residentId }: PaymentTableProps) {
    const router = useRouter();
    const deleteMutation = useDeletePayment();

    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);

    const handleDelete = async (id: string) => {
        if (confirm('Are you sure you want to delete this payment record? This action cannot be undone.')) {
            await deleteMutation.mutateAsync(id);
        }
    };

    // Toggle single selection
    const toggleSelection = (id: string) => {
        const newSelected = new Set(selectedIds);
        if (newSelected.has(id)) {
            newSelected.delete(id);
        } else {
            newSelected.add(id);
        }
        setSelectedIds(newSelected);
    };

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

    // Mark as verified handler (placeholder - would need backend support)
    const handleMarkVerified = () => {
        toast.info('Mark as verified feature - backend implementation needed');
        // This would typically call an API to update payment status
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
                        <Button onClick={() => router.push(residentId ? `/payments/new?residentId=${residentId}` : '/payments/new')}>
                            <Plus className="h-4 w-4 mr-2" />
                            Add Payment
                        </Button>
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
            <div className="border rounded-md">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead className="w-[50px]">
                                <Checkbox
                                    checked={allSelected}
                                    onCheckedChange={toggleSelectAll}
                                    aria-label="Select all"
                                />
                            </TableHead>
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
                                <TableCell>
                                    <Checkbox
                                        checked={selectedIds.has(payment.id)}
                                        onCheckedChange={() => toggleSelection(payment.id)}
                                        aria-label={`Select payment ${payment.reference_number}`}
                                    />
                                </TableCell>
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

            {/* Floating Action Bar */}
            {selectedIds.size > 0 && (
                <div className="fixed bottom-0 left-0 right-0 z-50 bg-primary p-4 shadow-lg">
                    <div className="container mx-auto flex items-center justify-between">
                        <div className="flex items-center gap-4">
                            <span className="text-sm text-primary-foreground font-medium">
                                {selectedIds.size} payment{selectedIds.size !== 1 ? 's' : ''} selected
                            </span>
                            <div className="hidden md:flex gap-2">
                                <Button
                                    variant="default"
                                    size="sm"
                                    onClick={handleMarkVerified}
                                    className="bg-primary-foreground text-primary hover:bg-primary-foreground/90"
                                >
                                    <CheckCircle className="h-4 w-4 mr-2" />
                                    Mark as Verified
                                </Button>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={handleExportCSV}
                                    className="bg-transparent text-primary-foreground border-primary-foreground hover:bg-primary-foreground/10"
                                >
                                    <Download className="h-4 w-4 mr-2" />
                                    Export CSV
                                </Button>
                                <Button
                                    variant="destructive"
                                    size="sm"
                                    onClick={() => setDeleteDialogOpen(true)}
                                >
                                    <Trash2 className="h-4 w-4 mr-2" />
                                    Delete Selected
                                </Button>
                            </div>
                            {/* Mobile: Icon only buttons */}
                            <div className="flex md:hidden gap-2">
                                <Button
                                    variant="default"
                                    size="icon"
                                    onClick={handleMarkVerified}
                                    className="bg-primary-foreground text-primary"
                                >
                                    <CheckCircle className="h-4 w-4" />
                                </Button>
                                <Button
                                    variant="outline"
                                    size="icon"
                                    onClick={handleExportCSV}
                                    className="bg-transparent text-primary-foreground border-primary-foreground"
                                >
                                    <Download className="h-4 w-4" />
                                </Button>
                                <Button
                                    variant="destructive"
                                    size="icon"
                                    onClick={() => setDeleteDialogOpen(true)}
                                >
                                    <Trash2 className="h-4 w-4" />
                                </Button>
                            </div>
                        </div>
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={clearSelection}
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
        </>
    );
}

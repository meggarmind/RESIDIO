'use client';

import { useState } from 'react';
import { useApprovalRequests, useApproveRequest, useRejectRequest } from '@/hooks/use-approvals';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { Check, X, Clock, CheckCircle, XCircle, ArrowRight, Eye, ImageIcon, ExternalLink, Loader2, FileText, ArrowLeft, Search } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import type { ApprovalStatus, ApprovalRequestWithDetails } from '@/types/database';
import { getPaymentProofUrl } from '@/actions/payments/submit-payment-proof';
import { toast } from 'sonner';
import { EnhancedPageHeader, EnhancedTableCard } from '@/components/dashboard/enhanced-stat-card';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

const ALL_VALUE = '_all';

const REQUEST_TYPE_LABELS: Record<string, string> = {
    billing_profile_effective_date: 'Billing Profile Effective Date',
    house_plots_change: 'House Plots Change',
    bank_account_create: 'Bank Account Creation',
    bank_account_update: 'Bank Account Update',
    bank_account_delete: 'Bank Account Deletion',
    // Developer/Owner actions
    developer_property_access: 'Developer Property Access',
    developer_resident_removal: 'Developer Resident Removal',
    owner_property_access: 'Owner Property Access',
    owner_resident_modification: 'Owner Resident Modification',
    owner_security_code_change: 'Owner Security Code Change',
    manual_payment_verification: 'Manual Payment Verification',
};

const STATUS_BADGES: Record<ApprovalStatus, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
    pending: { label: 'Pending', variant: 'secondary' },
    approved: { label: 'Approved', variant: 'default' },
    rejected: { label: 'Rejected', variant: 'destructive' },
};

export default function ApprovalsPage() {
    const [statusFilter, setStatusFilter] = useState<string>('pending');
    const [actionDialog, setActionDialog] = useState<{
        open: boolean;
        request: ApprovalRequestWithDetails | null;
        action: 'approve' | 'reject' | null;
    }>({ open: false, request: null, action: null });
    const [notes, setNotes] = useState('');
    const [proofUrl, setProofUrl] = useState<string | null>(null);
    const [isLoadingProof, setIsLoadingProof] = useState(false);

    const [params, setParams] = useState({
        page: 1,
        limit: 20,
    });
    const [pageSize, setPageSize] = useState(20);

    const { data, isLoading } = useApprovalRequests({
        status: statusFilter === ALL_VALUE ? 'all' : statusFilter as ApprovalStatus,
        page: params.page,
        limit: pageSize,
    });
    const approveMutation = useApproveRequest();
    const rejectMutation = useRejectRequest();

    const handleAction = async (request: ApprovalRequestWithDetails, action: 'approve' | 'reject') => {
        setActionDialog({ open: true, request, action });
        setNotes('');
        setProofUrl(null);

        if (request.request_type === 'manual_payment_verification') {
            const changes = request.requested_changes as any;
            // Get proof URL from the payment record if available
            // We need to fetch the payment record details to get proof_url
            // Actually, we can get it from the entity_id if we fetch it
            // For now, let's assume we need to fetch it since it's not in requested_changes
            setIsLoadingProof(true);
            try {
                // We'll need a helper to get proof_url from payment record id
                const { createClient } = await import('@/lib/supabase/client');
                const client = createClient();

                const { data: payment } = await client
                    .from('payment_records')
                    .select('proof_url')
                    .eq('id', request.entity_id)
                    .single();

                if (payment?.proof_url) {
                    const result = await getPaymentProofUrl(payment.proof_url);
                    if (result.url) setProofUrl(result.url);
                }
            } catch (error) {
                console.error('Error loading proof:', error);
            } finally {
                setIsLoadingProof(false);
            }
        }
    };

    const confirmAction = async () => {
        if (!actionDialog.request || !actionDialog.action) return;

        try {
            if (actionDialog.action === 'approve') {
                await approveMutation.mutateAsync({
                    requestId: actionDialog.request.id,
                    notes: notes || undefined,
                });
            } else {
                await rejectMutation.mutateAsync({
                    requestId: actionDialog.request.id,
                    notes: notes || undefined,
                });
            }
            setActionDialog({ open: false, request: null, action: null });
        } catch {
            // Error handled by hook
        }
    };

    const setPage = (page: number) => {
        setParams((prev) => ({ ...prev, page }));
    };

    const totalCount = data?.count || 0;
    const totalPages = Math.ceil(totalCount / pageSize);

    const renderChangeDetails = (request: ApprovalRequestWithDetails) => {
        const currentValues = (request.current_values as Record<string, unknown>) || {};
        const requestedChanges = (request.requested_changes as Record<string, unknown>) || {};

        return (
            <div className="text-sm space-y-1">
                {Object.keys(requestedChanges).map((key) => {
                    if (key === 'reason' || key === 'status') return null;
                    return (
                        <div key={key} className="flex items-center gap-2">
                            <span className="text-muted-foreground">{key.replace(/_/g, ' ')}:</span>
                            <span className="line-through text-muted-foreground">
                                {String(currentValues[key] ?? 'N/A')}
                            </span>
                            <ArrowRight className="h-3 w-3" />
                            <span className="font-medium">{String(requestedChanges[key])}</span>
                        </div>
                    );
                })}
                {request.request_type === 'manual_payment_verification' && (
                    <div className="flex items-center gap-2 text-amber-600 font-medium py-1">
                        <ImageIcon className="h-4 w-4" />
                        <span>Receipt attached to payment record</span>
                    </div>
                )}
            </div>
        );
    };

    if (isLoading) {
        return <div className="p-8 text-center text-muted-foreground">Loading approvals...</div>;
    }

    return (
        <div className="space-y-6">
            <EnhancedPageHeader
                title="Approval Queue"
                description="Review and approve or reject pending change requests."
            />

            <EnhancedTableCard title="Change Requests">
                <div className="space-y-4 p-4">
                    {/* Integrated Toolbar */}
                    <div className="flex flex-col gap-3">
                        <div className="flex flex-col sm:flex-row gap-2 justify-between">
                            <div className="flex flex-1 gap-2">
                                <div className="relative flex-1 max-w-md">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                    <Input
                                        placeholder="Filter by entity name..."
                                        className="pl-9"
                                        disabled
                                    />
                                </div>

                                <Select value={statusFilter} onValueChange={setStatusFilter}>
                                    <SelectTrigger className="w-[180px]">
                                        <SelectValue placeholder="Filter by status" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="pending">Pending</SelectItem>
                                        <SelectItem value="approved">Approved</SelectItem>
                                        <SelectItem value="rejected">Rejected</SelectItem>
                                        <SelectItem value={ALL_VALUE}>All Requests</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                    </div>

                    {data?.data && data.data.length > 0 ? (
                        <div className="rounded-xl border overflow-hidden shadow-soft animate-slide-up">
                            <Table variant="modern">
                                <TableHeader>
                                    <TableRow interactive={false}>
                                        <TableHead>Type</TableHead>
                                        <TableHead>Entity</TableHead>
                                        <TableHead>Requested Changes</TableHead>
                                        <TableHead>Requested By</TableHead>
                                        <TableHead>Date</TableHead>
                                        <TableHead>Status</TableHead>
                                        <TableHead className="text-right">Actions</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {data.data.map((request) => (
                                        <TableRow key={request.id} className="hover:bg-gray-50 dark:hover:bg-[#0F172A]">
                                            <TableCell>
                                                <span className="text-sm font-medium">
                                                    {REQUEST_TYPE_LABELS[request.request_type] || request.request_type}
                                                </span>
                                            </TableCell>
                                            <TableCell>
                                                <span className="font-semibold">{request.entity_name}</span>
                                            </TableCell>
                                            <TableCell>{renderChangeDetails(request)}</TableCell>
                                            <TableCell>
                                                <span className="text-sm">
                                                    {request.requester?.full_name || 'Unknown'}
                                                </span>
                                            </TableCell>
                                            <TableCell>
                                                <span className="text-sm text-muted-foreground whitespace-nowrap">
                                                    {formatDistanceToNow(new Date(request.created_at), { addSuffix: true })}
                                                </span>
                                            </TableCell>
                                            <TableCell>
                                                <Badge variant={STATUS_BADGES[request.status].variant} className="whitespace-nowrap">
                                                    {request.status === 'pending' && <Clock className="h-3 w-3 mr-1" />}
                                                    {request.status === 'approved' && <CheckCircle className="h-3 w-3 mr-1" />}
                                                    {request.status === 'rejected' && <XCircle className="h-3 w-3 mr-1" />}
                                                    {STATUS_BADGES[request.status].label}
                                                </Badge>
                                            </TableCell>
                                            <TableCell className="text-right">
                                                {request.status === 'pending' && (
                                                    <div className="flex gap-2 justify-end">
                                                        <Button
                                                            size="sm"
                                                            variant="default"
                                                            onClick={() => handleAction(request, 'approve')}
                                                            className="h-8 rounded-lg"
                                                        >
                                                            <Check className="h-4 w-4 mr-1" />
                                                            Approve
                                                        </Button>
                                                        <Button
                                                            size="sm"
                                                            variant="destructive"
                                                            onClick={() => handleAction(request, 'reject')}
                                                            className="h-8 rounded-lg"
                                                        >
                                                            <X className="h-4 w-4 mr-1" />
                                                            Reject
                                                        </Button>
                                                    </div>
                                                )}
                                                {request.status !== 'pending' && request.reviewer && (
                                                    <span className="text-xs text-muted-foreground italic">
                                                        by {request.reviewer.full_name}
                                                    </span>
                                                )}
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                    ) : (
                        <div className="text-center py-12 text-muted-foreground border rounded-xl border-dashed">
                            <CheckCircle className="h-12 w-12 mx-auto mb-4 opacity-50" />
                            <p className="text-lg font-medium">No requests found</p>
                            <p className="text-sm">Everything caught up! No {statusFilter !== ALL_VALUE ? statusFilter : ''} requests.</p>
                        </div>
                    )}

                    {/* Windowed Pagination Footer */}
                    <div className="mt-4 flex flex-col sm:flex-row gap-4 justify-between items-center px-2">
                        {/* Left Section - Settings */}
                        <div className="flex items-center gap-4">
                            <div className="flex items-center gap-2">
                                <span className="text-sm text-muted-foreground whitespace-nowrap">Rows per page</span>
                                <Select
                                    value={pageSize.toString()}
                                    onValueChange={(val) => {
                                        setPageSize(Number(val));
                                        setParams(prev => ({ ...prev, page: 1 }));
                                    }}
                                >
                                    <SelectTrigger className="h-8 w-[70px] rounded-xl">
                                        <SelectValue placeholder={pageSize.toString()} />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="10">10</SelectItem>
                                        <SelectItem value="20">20</SelectItem>
                                        <SelectItem value="50">50</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <p className="text-sm text-muted-foreground whitespace-nowrap">
                                Showing {((params.page || 1) - 1) * pageSize + 1} to {Math.min((params.page || 1) * pageSize, totalCount)} of {totalCount} requests
                            </p>
                        </div>

                        {/* Right Section - Navigation */}
                        {totalPages > 1 && (
                            <div className="flex items-center gap-1">
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setPage((params.page || 1) - 1)}
                                    disabled={(params.page || 1) === 1}
                                    className="h-8 w-9 p-0 rounded-lg"
                                >
                                    <ArrowLeft className="h-4 w-4" />
                                </Button>
                                <div className="flex items-center gap-1">
                                    {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                                        let pageNum: number;
                                        if (totalPages <= 5) {
                                            pageNum = i + 1;
                                        } else if ((params.page || 1) <= 3) {
                                            pageNum = i + 1;
                                        } else if ((params.page || 1) >= totalPages - 2) {
                                            pageNum = totalPages - 4 + i;
                                        } else {
                                            pageNum = (params.page || 1) - 2 + i;
                                        }
                                        return (
                                            <Button
                                                key={pageNum}
                                                variant={(params.page || 1) === pageNum ? 'default' : 'outline'}
                                                size="sm"
                                                onClick={() => setPage(pageNum)}
                                                className="h-8 w-9 p-0 rounded-lg"
                                            >
                                                {pageNum}
                                            </Button>
                                        );
                                    })}
                                </div>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setPage((params.page || 1) + 1)}
                                    disabled={(params.page || 1) >= totalPages}
                                    className="h-8 w-9 p-0 rounded-lg"
                                >
                                    <ArrowRight className="h-4 w-4" />
                                </Button>
                            </div>
                        )}
                    </div>
                </div>
            </EnhancedTableCard>

            {/* Confirm Action Dialog */}
            <Dialog
                open={actionDialog.open}
                onOpenChange={(open) => !open && setActionDialog({ open: false, request: null, action: null })}
            >
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>
                            {actionDialog.action === 'approve' ? 'Approve Request' : 'Reject Request'}
                        </DialogTitle>
                        <DialogDescription>
                            {actionDialog.action === 'approve'
                                ? 'This will apply the requested changes immediately.'
                                : 'The changes will not be applied.'}
                        </DialogDescription>
                    </DialogHeader>

                    {actionDialog.request && (
                        <div className="space-y-4">
                            <div className="bg-muted p-4 rounded-lg space-y-2">
                                <div className="text-sm">
                                    <span className="text-muted-foreground">Entity:</span>{' '}
                                    <span className="font-medium">{actionDialog.request.entity_name}</span>
                                </div>
                                <div className="text-sm">
                                    <span className="text-muted-foreground">Type:</span>{' '}
                                    <span className="font-medium">
                                        {REQUEST_TYPE_LABELS[actionDialog.request.request_type] || actionDialog.request.request_type}
                                    </span>
                                </div>
                                {actionDialog.request.reason && (
                                    <div className="text-sm">
                                        <span className="text-muted-foreground">Reason:</span>{' '}
                                        <span>{actionDialog.request.reason}</span>
                                    </div>
                                )}
                                <div className="pt-2">
                                    {renderChangeDetails(actionDialog.request)}
                                </div>

                                {actionDialog.request.request_type === 'manual_payment_verification' && (
                                    <div className="mt-4 border rounded-md overflow-hidden bg-white">
                                        <div className="bg-muted px-3 py-2 text-xs font-medium border-b flex items-center justify-between">
                                            <span>PAYMENT RECEIPT</span>
                                            {proofUrl && (
                                                <a href={proofUrl} target="_blank" rel="noreferrer" className="text-primary hover:underline flex items-center gap-1">
                                                    Open Original <ExternalLink className="h-3 w-3" />
                                                </a>
                                            )}
                                        </div>
                                        <div className="relative aspect-video flex items-center justify-center p-2">
                                            {isLoadingProof ? (
                                                <div className="flex flex-col items-center gap-2">
                                                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                                                    <span className="text-xs text-muted-foreground">Loading receipt...</span>
                                                </div>
                                            ) : proofUrl ? (
                                                proofUrl.endsWith('.pdf') ? (
                                                    <div className="flex flex-col items-center gap-2">
                                                        <FileText className="h-12 w-12 text-red-500" />
                                                        <span className="text-xs">PDF Document</span>
                                                        <Button variant="outline" size="sm" asChild>
                                                            <a href={proofUrl} target="_blank" rel="noreferrer">View PDF</a>
                                                        </Button>
                                                    </div>
                                                ) : (
                                                    <img
                                                        src={proofUrl}
                                                        alt="Payment Proof"
                                                        className="max-h-full max-w-full object-contain cursor-zoom-in"
                                                        onClick={() => window.open(proofUrl, '_blank')}
                                                    />
                                                )
                                            ) : (
                                                <div className="flex flex-col items-center gap-2 text-red-500">
                                                    <ImageIcon className="h-8 w-8 opacity-20" />
                                                    <span className="text-xs">Could not load receipt image.</span>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>

                            <div>
                                <label className="text-sm font-medium">Notes (Optional)</label>
                                <Textarea
                                    value={notes}
                                    onChange={(e) => setNotes(e.target.value)}
                                    placeholder="Add any notes for this decision..."
                                    className="mt-1"
                                />
                            </div>
                        </div>
                    )}

                    <DialogFooter>
                        <Button
                            variant="outline"
                            onClick={() => setActionDialog({ open: false, request: null, action: null })}
                        >
                            Cancel
                        </Button>
                        <Button
                            variant={actionDialog.action === 'approve' ? 'default' : 'destructive'}
                            onClick={confirmAction}
                            disabled={approveMutation.isPending || rejectMutation.isPending}
                        >
                            {approveMutation.isPending || rejectMutation.isPending
                                ? 'Processing...'
                                : actionDialog.action === 'approve'
                                    ? 'Confirm Approval'
                                    : 'Confirm Rejection'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}

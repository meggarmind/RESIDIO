'use client';

import { useState } from 'react';
import {
    useApprovalRequests,
    useApproveRequest,
    useRejectRequest,
    useReapplyApprovedRequest,
} from '@/hooks/use-approvals';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { RecordCard } from '@/components/ui/record-card';
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
import { Check, X, Clock, CheckCircle, XCircle, ArrowRight, Eye, Loader2, ArrowLeft, Search, AlertTriangle, RotateCw } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { APPROVAL_REQUEST_TYPE_LABELS } from '@/types/database';
import type { ApprovalStatus, ApprovalRequestWithDetails } from '@/types/database';
import { toast } from 'sonner';
import { EnhancedPageHeader, EnhancedTableCard } from '@/components/dashboard/enhanced-stat-card';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { Can } from '@/components/auth/can';
import { PERMISSIONS } from '@/lib/auth/action-roles';
import { isStuckApproval } from '@/lib/approvals/stuck';

const ALL_VALUE = '_all';

const STATUS_BADGES: Record<ApprovalStatus, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
    pending: { label: 'Pending', variant: 'secondary' },
    approved: { label: 'Approved', variant: 'default' },
    rejected: { label: 'Rejected', variant: 'destructive' },
};

// Own component so the mutation (and its pending state) exists only on rows that need it.
function ReapplyButton({ requestId }: { requestId: string }) {
    const reapplyMutation = useReapplyApprovedRequest();
    return (
        <Button
            size="sm"
            variant="outline"
            disabled={reapplyMutation.isPending}
            onClick={() => reapplyMutation.mutate({ requestId })}
            className="h-8 rounded-lg mb-1"
        >
            <RotateCw className="h-4 w-4 mr-1" />
            Re-apply
        </Button>
    );
}

// Status badge, shared by the table row and the phone card
function ApprovalStatusBadge({ request }: { request: ApprovalRequestWithDetails }) {
    return (
        <Badge variant={STATUS_BADGES[request.status].variant} className="whitespace-nowrap">
            {request.status === 'pending' && <Clock className="h-3 w-3 mr-1" />}
            {request.status === 'approved' && <CheckCircle className="h-3 w-3 mr-1" />}
            {request.status === 'rejected' && <XCircle className="h-3 w-3 mr-1" />}
            {STATUS_BADGES[request.status].label}
        </Badge>
    );
}

// Stuck badge; on the phone card it sits in the body so the badge slot does not squeeze the title
function StuckApprovalBadge({ className }: { className?: string }) {
    return (
        <Badge variant="destructive" className={cn('whitespace-nowrap', className)}>
            <AlertTriangle className="h-3 w-3 mr-1" />
            Approved, not applied
        </Badge>
    );
}

// Row actions, shared by the table row and the phone card
function ApprovalActions({
    request,
    onAction,
}: {
    request: ApprovalRequestWithDetails;
    onAction: (request: ApprovalRequestWithDetails, action: 'approve' | 'reject') => void;
}) {
    return (
        <>
            {request.status === 'pending' && (
                <Can permission={PERMISSIONS.APPROVALS_APPROVE_REJECT}>
                <div className="flex flex-wrap gap-2 justify-end">
                    <Button
                        size="sm"
                        variant="default"
                        onClick={() => onAction(request, 'approve')}
                        className="h-8 rounded-lg"
                    >
                        <Check className="h-4 w-4 mr-1" />
                        Approve
                    </Button>
                    <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => onAction(request, 'reject')}
                        className="h-8 rounded-lg"
                    >
                        <X className="h-4 w-4 mr-1" />
                        Reject
                    </Button>
                </div>
                </Can>
            )}
            {isStuckApproval(request) && (
                <Can permission={PERMISSIONS.APPROVALS_APPROVE_REJECT}>
                    <ReapplyButton requestId={request.id} />
                </Can>
            )}
            {request.status !== 'pending' && request.reviewer && (
                <span className="text-xs text-muted-foreground italic">
                    by {request.reviewer.full_name}
                </span>
            )}
        </>
    );
}

export default function ApprovalsPage() {
    const [statusFilter, setStatusFilter] = useState<string>('pending');
    const [actionDialog, setActionDialog] = useState<{
        open: boolean;
        request: ApprovalRequestWithDetails | null;
        action: 'approve' | 'reject' | null;
    }>({ open: false, request: null, action: null });
    const [notes, setNotes] = useState('');

    const [params, setParams] = useState({
        page: 1,
        limit: 20,
    });
    const [pageSize, setPageSize] = useState(20);

    const { data, isLoading, isError, error, refetch } = useApprovalRequests({
        status: statusFilter === ALL_VALUE ? 'all' : statusFilter as ApprovalStatus,
        page: params.page,
        limit: pageSize,
    });
    const approveMutation = useApproveRequest();
    const rejectMutation = useRejectRequest();

    const handleAction = async (request: ApprovalRequestWithDetails, action: 'approve' | 'reject') => {
        setActionDialog({ open: true, request, action });
        setNotes('');
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

    // `wrap` lets long values break onto a new line in the narrow phone card
    const renderChangeDetails = (request: ApprovalRequestWithDetails, wrap = false) => {
        const currentValues = (request.current_values as Record<string, unknown>) || {};
        const requestedChanges = (request.requested_changes as Record<string, unknown>) || {};

        return (
            <div className="text-sm space-y-1">
                {Object.keys(requestedChanges).map((key) => {
                    if (key === 'reason' || key === 'status') return null;
                    return (
                        <div key={key} className={cn('flex items-center gap-2', wrap && 'flex-wrap wrap-anywhere')}>
                            <span className="text-muted-foreground">{key.replace(/_/g, ' ')}:</span>
                            <span className="line-through text-muted-foreground">
                                {String(currentValues[key] ?? 'N/A')}
                            </span>
                            <ArrowRight className="h-3 w-3" />
                            <span className="font-medium">{String(requestedChanges[key])}</span>
                        </div>
                    );
                })}
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
                                        aria-label="Filter by entity name"
                                        className="pl-9"
                                        disabled
                                    />
                                </div>

                                <Select value={statusFilter} onValueChange={setStatusFilter}>
                                    <SelectTrigger className="w-[180px]" aria-label="Filter by status">
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

                    {isError ? (
                        <div role="alert" className="flex flex-col items-center gap-3 py-12 text-center border rounded-xl border-destructive/30 bg-destructive/5">
                            <p className="text-lg font-medium text-destructive">Could not load approval requests</p>
                            <p className="text-sm text-muted-foreground">
                                {error instanceof Error ? error.message : 'Something went wrong.'} The queue may not be empty.
                            </p>
                            <Button variant="outline" size="sm" onClick={() => void refetch()}>
                                Retry
                            </Button>
                        </div>
                    ) : data?.data && data.data.length > 0 ? (
                        <>
                        {/* Phone: stacked cards below md. Both lists stay in the DOM and CSS picks one. */}
                        <div className="space-y-3 md:hidden" data-testid="approval-card-list">
                            {data.data.map((request) => (
                                <RecordCard
                                    key={request.id}
                                    data-testid="approval-card"
                                    title={request.entity_name}
                                    badge={<ApprovalStatusBadge request={request} />}
                                    subtitle={[
                                        APPROVAL_REQUEST_TYPE_LABELS[request.request_type] || request.request_type,
                                        request.requester?.full_name || 'Unknown',
                                        formatDistanceToNow(new Date(request.created_at), { addSuffix: true }),
                                    ].join(' · ')}
                                    actions={<ApprovalActions request={request} onAction={handleAction} />}
                                >
                                    {isStuckApproval(request) && <StuckApprovalBadge className="mb-2" />}
                                    {renderChangeDetails(request, true)}
                                </RecordCard>
                            ))}
                        </div>

                        <div className="hidden md:block rounded-xl border overflow-hidden shadow-soft animate-slide-up">
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
                                                    {APPROVAL_REQUEST_TYPE_LABELS[request.request_type] || request.request_type}
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
                                                <ApprovalStatusBadge request={request} />
                                                {isStuckApproval(request) && <StuckApprovalBadge className="ml-2" />}
                                            </TableCell>
                                            <TableCell className="text-right">
                                                <ApprovalActions request={request} onAction={handleAction} />
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                        </>
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
                                    <SelectTrigger className="h-8 w-[70px] rounded-xl" aria-label="Rows per page">
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
                            <div className="bg-muted p-4 rounded-xl space-y-2">
                                <div className="text-sm">
                                    <span className="text-muted-foreground">Entity:</span>{' '}
                                    <span className="font-medium">{actionDialog.request.entity_name}</span>
                                </div>
                                <div className="text-sm">
                                    <span className="text-muted-foreground">Type:</span>{' '}
                                    <span className="font-medium">
                                        {APPROVAL_REQUEST_TYPE_LABELS[actionDialog.request.request_type] || actionDialog.request.request_type}
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
                            className="btn-hover-lift"
                        >
                            {approveMutation.isPending || rejectMutation.isPending ? (
                                <span className="flex items-center gap-2">
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                    Processing...
                                </span>
                            ) : actionDialog.action === 'approve'
                                    ? 'Confirm Approval'
                                    : 'Confirm Rejection'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}

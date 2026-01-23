'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
    getApprovalRequests,
    getPendingApprovalsCount,
    approveRequest,
    rejectRequest,
    canAutoApprove,
} from '@/actions/approvals';
import {
    checkRequiresApproval,
    createDeveloperOwnerApproval,
    approveAsOccupier,
    rejectAsOccupier,
    getMyPendingApprovals,
    type ApprovalContext,
} from '@/actions/approvals/developer-owner-approvals';
import type { ApprovalStatus, ApprovalRequestType } from '@/types/database';
import { toast } from 'sonner';
import { POLLING_INTERVALS } from '@/lib/config/polling';

interface UseApprovalRequestsParams {
    status?: ApprovalStatus | 'all';
    request_type?: ApprovalRequestType | 'all';
    page?: number;
    limit?: number;
}

export function useApprovalRequests(params: UseApprovalRequestsParams = {}) {
    return useQuery({
        queryKey: ['approval-requests', params],
        queryFn: async () => {
            const result = await getApprovalRequests(params);
            if (result.error) throw new Error(result.error);
            return { data: result.data, count: result.count };
        },
    });
}

export function usePendingApprovalsCount() {
    return useQuery({
        queryKey: ['pending-approvals-count'],
        queryFn: async () => {
            const result = await getPendingApprovalsCount();
            if (result.error) throw new Error(result.error);
            return result.count;
        },
        refetchInterval: POLLING_INTERVALS.STANDARD, // Refetch every minute
    });
}

export function useCanAutoApprove() {
    return useQuery({
        queryKey: ['can-auto-approve'],
        queryFn: async () => {
            return await canAutoApprove();
        },
        staleTime: 5 * 60 * 1000, // Cache for 5 minutes
    });
}

export function useApproveRequest() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({ requestId, notes }: { requestId: string; notes?: string }) => {
            const result = await approveRequest(requestId, notes);
            if (!result.success) throw new Error(result.error || 'Failed to approve request');
            return result;
        },
        onSuccess: () => {
            toast.success('Request approved successfully');
            queryClient.invalidateQueries({ queryKey: ['approval-requests'] });
            queryClient.invalidateQueries({ queryKey: ['pending-approvals-count'] });
            queryClient.invalidateQueries({ queryKey: ['billing-profiles'] });
            queryClient.invalidateQueries({ queryKey: ['houses'] });
            queryClient.invalidateQueries({ queryKey: ['bank-accounts'] });
        },
        onError: (error) => {
            toast.error(error.message || 'Failed to approve request');
        },
    });
}

export function useRejectRequest() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({ requestId, notes }: { requestId: string; notes?: string }) => {
            const result = await rejectRequest(requestId, notes);
            if (!result.success) throw new Error(result.error || 'Failed to reject request');
            return result;
        },
        onSuccess: () => {
            toast.success('Request rejected');
            queryClient.invalidateQueries({ queryKey: ['approval-requests'] });
            queryClient.invalidateQueries({ queryKey: ['pending-approvals-count'] });
        },
        onError: (error) => {
            toast.error(error.message || 'Failed to reject request');
        },
    });
}

// ============================================
// Developer/Owner Approval Hooks
// ============================================

/**
 * Check if an action requires approval from the occupier
 */
export function useCheckRequiresApproval(houseId: string | undefined, requesterResidentId: string | undefined) {
    return useQuery({
        queryKey: ['requires-approval', houseId, requesterResidentId],
        queryFn: async () => {
            if (!houseId || !requesterResidentId) return { requiresApproval: false };
            return await checkRequiresApproval(houseId, requesterResidentId);
        },
        enabled: !!houseId && !!requesterResidentId,
    });
}

/**
 * Create a developer/owner approval request
 */
export function useCreateDeveloperOwnerApproval() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (context: ApprovalContext) => {
            const result = await createDeveloperOwnerApproval(context);
            if (!result.success) throw new Error(result.error || 'Failed to create approval request');
            return result;
        },
        onSuccess: () => {
            toast.success('Approval request sent to occupier');
            queryClient.invalidateQueries({ queryKey: ['approval-requests'] });
            queryClient.invalidateQueries({ queryKey: ['pending-approvals-count'] });
            queryClient.invalidateQueries({ queryKey: ['my-pending-approvals'] });
        },
        onError: (error) => {
            toast.error(error.message || 'Failed to create approval request');
        },
    });
}

/**
 * Approve a request as the affected occupier
 */
export function useApproveAsOccupier() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({ requestId, notes }: { requestId: string; notes?: string }) => {
            const result = await approveAsOccupier(requestId, notes);
            if (!result.success) throw new Error(result.error || 'Failed to approve request');
            return result;
        },
        onSuccess: () => {
            toast.success('Request approved');
            queryClient.invalidateQueries({ queryKey: ['approval-requests'] });
            queryClient.invalidateQueries({ queryKey: ['pending-approvals-count'] });
            queryClient.invalidateQueries({ queryKey: ['my-pending-approvals'] });
        },
        onError: (error) => {
            toast.error(error.message || 'Failed to approve request');
        },
    });
}

/**
 * Reject a request as the affected occupier
 */
export function useRejectAsOccupier() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({ requestId, notes }: { requestId: string; notes?: string }) => {
            const result = await rejectAsOccupier(requestId, notes);
            if (!result.success) throw new Error(result.error || 'Failed to reject request');
            return result;
        },
        onSuccess: () => {
            toast.success('Request rejected');
            queryClient.invalidateQueries({ queryKey: ['approval-requests'] });
            queryClient.invalidateQueries({ queryKey: ['pending-approvals-count'] });
            queryClient.invalidateQueries({ queryKey: ['my-pending-approvals'] });
        },
        onError: (error) => {
            toast.error(error.message || 'Failed to reject request');
        },
    });
}

/**
 * Get pending approval requests for the current user (as affected party)
 */
export function useMyPendingApprovals() {
    return useQuery({
        queryKey: ['my-pending-approvals'],
        queryFn: async () => {
            const result = await getMyPendingApprovals();
            if (!result.success) throw new Error(result.error || 'Failed to fetch pending approvals');
            return result.data || [];
        },
        refetchInterval: POLLING_INTERVALS.STANDARD, // Refresh every minute
    });
}

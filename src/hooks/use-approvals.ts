'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
    getApprovalRequests,
    getPendingApprovalsCount,
    approveRequest,
    rejectRequest,
    canAutoApprove,
} from '@/actions/approvals';
import type { ApprovalStatus, ApprovalRequestType } from '@/types/database';
import { toast } from 'sonner';

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
        refetchInterval: 60000, // Refetch every minute
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

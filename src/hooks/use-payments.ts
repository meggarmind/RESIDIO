import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getPayments } from '@/actions/payments/get-payments';
import { getPayment } from '@/actions/payments/get-payment';
import { createPayment } from '@/actions/payments/create-payment';
import { updatePayment } from '@/actions/payments/update-payment';
import { retagPaymentCategory } from '@/actions/payments/retag-payment';
import { unverifyPayment, bulkVerifyPayments } from '@/actions/finance/manual-verification';
import { deletePayment } from '@/actions/payments/delete-payment';
import { getPaymentStats } from '@/actions/payments/get-payment-stats';
import { bulkUpdatePayments } from '@/actions/payments/bulk-update-payments';
import { getResidentPropertiesForPayment } from '@/actions/payments/get-resident-properties-for-payment';
import type { PaymentSearchParams, PaymentFormData } from '@/lib/validators/payment';
import { toast } from 'sonner';

// Type for bulk update input (defined inline since it's from 'use server' file)
type BulkUpdatePaymentsInput = {
    ids: string[];
    status: 'pending' | 'paid' | 'overdue' | 'failed';
};

export function usePayments(params: PaymentSearchParams) {
    return useQuery({
        queryKey: ['payments', params],
        queryFn: () => getPayments(params),
    });
}

export function usePayment(id: string) {
    return useQuery({
        queryKey: ['payment', id],
        queryFn: async () => {
            const result = await getPayment(id);
            if (result.error) throw new Error(result.error);
            return result.data;
        },
        enabled: !!id,
    });
}

export function usePaymentStats() {
    return useQuery({
        queryKey: ['payment-stats'],
        queryFn: () => getPaymentStats(),
    });
}

export function useCreatePayment() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (data: PaymentFormData) => {
            const result = await createPayment(data);
            if (result.error) throw new Error(result.error);
            return result;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['payments'] });
            queryClient.invalidateQueries({ queryKey: ['payment-stats'] });
        },
    });
}

export function useUpdatePayment() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({ id, data }: { id: string; data: Partial<PaymentFormData> }) => {
            const result = await updatePayment(id, data);
            if (result.error) throw new Error(result.error);
            return result;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['payments'] });
            queryClient.invalidateQueries({ queryKey: ['payment-stats'] });
            toast.success('Payment updated successfully');
        },
        onError: (error) => {
            toast.error(error.message);
        },
    });
}

export function useUnverifyPayment() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({ id, reason }: { id: string; reason?: string }) => {
            const result = await unverifyPayment(id, reason);
            if (!result.success) throw new Error(result.error || 'Failed to un-verify payment');
            return result;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['payments'] });
            queryClient.invalidateQueries({ queryKey: ['payment'] });
            queryClient.invalidateQueries({ queryKey: ['payment-stats'] });
            toast.success('Payment un-verified');
        },
        onError: (error) => {
            toast.error(error.message);
        },
    });
}

export function useRetagPayment() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({ id, chargeCategory }: { id: string; chargeCategory: string }) => {
            const result = await retagPaymentCategory(id, chargeCategory);
            if (!result.success) throw new Error(result.error || 'Failed to change the payment category');
            return result;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['payments'] });
            queryClient.invalidateQueries({ queryKey: ['payment'] });
            queryClient.invalidateQueries({ queryKey: ['resident-wallet'] });
            queryClient.invalidateQueries({ queryKey: ['wallet'] });
            queryClient.invalidateQueries({ queryKey: ['wallet-transactions'] });
            queryClient.invalidateQueries({ queryKey: ['yearly-wallet-transactions'] });
            toast.success('Payment category changed');
        },
        onError: (error) => {
            toast.error(error.message);
        },
    });
}

export function useDeletePayment() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (id: string) => {
            const result = await deletePayment(id);
            if (result.error) throw new Error(result.error);
            return result;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['payments'] });
            queryClient.invalidateQueries({ queryKey: ['payment-stats'] });
            toast.success('Payment deleted successfully');
        },
        onError: (error) => {
            toast.error(error.message);
        },
    });
}

export function useBulkUpdatePayments() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (input: BulkUpdatePaymentsInput) => {
            const result = await bulkUpdatePayments(input);
            if (result.error) throw new Error(result.error);
            return result;
        },
        onSuccess: (result) => {
            queryClient.invalidateQueries({ queryKey: ['payments'] });
            queryClient.invalidateQueries({ queryKey: ['payment-stats'] });
            toast.success(result.message);
        },
        onError: (error) => {
            toast.error(error.message);
        },
    });
}

export function useBulkVerifyPayments() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({ ids, notes }: { ids: string[]; notes?: string }) => {
            const result = await bulkVerifyPayments(ids, notes);
            if (!result.success) throw new Error(result.error || 'Failed to verify payments');
            return result;
        },
        onSuccess: (result) => {
            queryClient.invalidateQueries({ queryKey: ['payments'] });
            queryClient.invalidateQueries({ queryKey: ['payment'] });
            queryClient.invalidateQueries({ queryKey: ['payment-stats'] });
            toast.success(result.message);
        },
        onError: (error) => {
            toast.error(error.message);
        },
    });
}

// Hook to get resident's properties with outstanding amounts for payment allocation
export function useResidentPropertiesForPayment(residentId: string | undefined) {
    return useQuery({
        queryKey: ['resident-properties-for-payment', residentId],
        queryFn: async () => {
            if (!residentId) throw new Error('Resident ID is required');
            const result = await getResidentPropertiesForPayment(residentId);
            if (result.error) throw new Error(result.error);
            return result;
        },
        enabled: !!residentId,
    });
}

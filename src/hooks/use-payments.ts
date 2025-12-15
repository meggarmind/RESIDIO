import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getPayments } from '@/actions/payments/get-payments';
import { getPayment } from '@/actions/payments/get-payment';
import { createPayment } from '@/actions/payments/create-payment';
import { createSplitPayment } from '@/actions/payments/create-split-payment';
import { updatePayment } from '@/actions/payments/update-payment';
import { deletePayment } from '@/actions/payments/delete-payment';
import { getPaymentStats } from '@/actions/payments/get-payment-stats';
import { bulkUpdatePayments, type BulkUpdatePaymentsInput } from '@/actions/payments/bulk-update-payments';
import type { PaymentSearchParams, PaymentFormData, SplitPaymentFormData } from '@/lib/validators/payment';
import { toast } from 'sonner';

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

export function useCreateSplitPayment() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (data: SplitPaymentFormData) => {
            const result = await createSplitPayment(data);
            if (result.error) throw new Error(result.error);
            return result;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['payments'] });
            queryClient.invalidateQueries({ queryKey: ['payment-stats'] });
            queryClient.invalidateQueries({ queryKey: ['residents'] });
            queryClient.invalidateQueries({ queryKey: ['invoices'] });
            toast.success('Split payment created successfully');
        },
        onError: (error) => {
            toast.error(error.message);
        },
    });
}

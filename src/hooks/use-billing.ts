import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createBillingProfile, getBillingProfiles, deleteBillingProfile, BillingProfileData } from '@/actions/billing/profiles';
import { getInvoices, GetInvoicesParams, getResidentIndebtedness } from '@/actions/billing/get-invoices';
import { generateMonthlyInvoices } from '@/actions/billing/generate-invoices';
import { toast } from 'sonner';

export function useBillingProfiles() {
    return useQuery({
        queryKey: ['billing-profiles'],
        queryFn: async () => {
            const result = await getBillingProfiles();
            if (result.error) throw new Error(result.error);
            return result.data;
        }
    });
}

export function useCreateBillingProfile() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (data: BillingProfileData) => {
            const result = await createBillingProfile(data);
            if (result.error) throw new Error(result.error);
            return result.data;
        },
        onSuccess: () => {
            toast.success('Billing profile created successfully');
            queryClient.invalidateQueries({ queryKey: ['billing-profiles'] });
        },
        onError: (error) => {
            toast.error(error.message || 'Failed to create profile');
        }
    });
}

export function useDeleteBillingProfile() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (id: string) => {
            const result = await deleteBillingProfile(id);
            if (result.error) throw new Error(result.error);
            return result;
        },
        onSuccess: () => {
            toast.success('Billing profile deleted');
            queryClient.invalidateQueries({ queryKey: ['billing-profiles'] });
        },
        onError: (error) => {
            toast.error(error.message || 'Failed to delete profile');
        }
    });
}

// Invoice Hooks
export function useInvoices(params: GetInvoicesParams = {}) {
    return useQuery({
        queryKey: ['invoices', params],
        queryFn: async () => {
            const result = await getInvoices(params);
            if (result.error) throw new Error(result.error);
            return { data: result.data, total: result.total };
        }
    });
}

export function useGenerateInvoices() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (targetDate?: Date) => {
            const result = await generateMonthlyInvoices(targetDate);
            if (!result.success && result.errors.length > 0) {
                throw new Error(result.errors.join(', '));
            }
            return result;
        },
        onSuccess: (result) => {
            toast.success(`Generated ${result.generated} invoices. Skipped ${result.skipped}.`);
            if (result.skipReasons && result.skipReasons.length > 0) {
                console.log('[Billing] Skip reasons:', result.skipReasons);
                // Show first few skip reasons to user
                const reasons = result.skipReasons.slice(0, 3).map(r => `${r.house}: ${r.reason}`).join('\n');
                toast.info(`Skip reasons:\n${reasons}${result.skipReasons.length > 3 ? `\n...and ${result.skipReasons.length - 3} more` : ''}`);
            }
            if (result.errors.length > 0) {
                console.error('[Billing] Errors:', result.errors);
                toast.error(`Errors: ${result.errors.slice(0, 2).join('; ')}${result.errors.length > 2 ? '...' : ''}`);
            }
            queryClient.invalidateQueries({ queryKey: ['invoices'] });
        },
        onError: (error) => {
            toast.error(error.message || 'Failed to generate invoices');
        }
    });
}

// Resident Indebtedness Hook
export function useResidentIndebtedness(residentId: string | undefined) {
    return useQuery({
        queryKey: ['resident-indebtedness', residentId],
        queryFn: async () => {
            if (!residentId) throw new Error('Resident ID is required');
            const result = await getResidentIndebtedness(residentId);
            if (result.error) throw new Error(result.error);
            return result.data;
        },
        enabled: !!residentId,
    });
}

// Wallet Hooks
import { getOrCreateWallet, getWalletTransactions, allocateWalletToInvoices } from '@/actions/billing/wallet';

export function useResidentWallet(residentId: string | undefined) {
    return useQuery({
        queryKey: ['resident-wallet', residentId],
        queryFn: async () => {
            if (!residentId) throw new Error('Resident ID is required');
            const result = await getOrCreateWallet(residentId);
            if (result.error) throw new Error(result.error);
            return result.data;
        },
        enabled: !!residentId,
    });
}

export function useWalletTransactions(residentId: string | undefined) {
    return useQuery({
        queryKey: ['wallet-transactions', residentId],
        queryFn: async () => {
            if (!residentId) throw new Error('Resident ID is required');
            const result = await getWalletTransactions(residentId);
            if (result.error) throw new Error(result.error);
            return result.data;
        },
        enabled: !!residentId,
    });
}

export function useAllocateWallet() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (residentId: string) => {
            const result = await allocateWalletToInvoices(residentId);
            if (!result.success) throw new Error(result.error || 'Allocation failed');
            return result;
        },
        onSuccess: (result, residentId) => {
            toast.success(`Allocated ₦${result.totalAllocated.toLocaleString()} to ${result.invoicesPaid} invoices`);
            queryClient.invalidateQueries({ queryKey: ['resident-wallet', residentId] });
            queryClient.invalidateQueries({ queryKey: ['wallet-transactions', residentId] });
            queryClient.invalidateQueries({ queryKey: ['invoices'] });
            queryClient.invalidateQueries({ queryKey: ['resident-indebtedness', residentId] });
        },
        onError: (error) => {
            toast.error(error.message || 'Failed to allocate wallet');
        }
    });
}

// Overdue Invoices Hooks
import { checkOverdueInvoices, getOverdueStats } from '@/actions/billing/check-overdue-invoices';

export function useOverdueStats() {
    return useQuery({
        queryKey: ['overdue-stats'],
        queryFn: async () => {
            const result = await getOverdueStats();
            if (result.error) throw new Error(result.error);
            return result.data;
        },
    });
}

export function useCheckOverdueInvoices() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async () => {
            const result = await checkOverdueInvoices();
            if (result.error) throw new Error(result.error);
            if (!result.data) throw new Error('No data returned');
            return result.data;
        },
        onSuccess: (data) => {
            if (data.totalOverdue === 0) {
                toast.success('No overdue invoices found');
            } else {
                toast.warning(`Found ${data.totalOverdue} overdue invoice(s) totaling ₦${data.totalAmount.toLocaleString()}`);
            }
            queryClient.invalidateQueries({ queryKey: ['overdue-stats'] });
            queryClient.invalidateQueries({ queryKey: ['invoices'] });
        },
        onError: (error) => {
            toast.error(error.message || 'Failed to check overdue invoices');
        }
    });
}


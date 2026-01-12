import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
    createBillingProfile,
    getBillingProfiles,
    getBillingProfile,
    deleteBillingProfile,
    updateBillingProfile,
    checkEffectiveDateImpact,
    getDevelopmentLevyProfiles,
    duplicateBillingProfile,
    BillingProfileData,
} from '@/actions/billing/profiles';
import { getInvoices, getResidentIndebtedness, getHousePaymentStatus, getResidentCrossPropertyPaymentSummary } from '@/actions/billing/get-invoices';
import { generateMonthlyInvoices } from '@/actions/billing/generate-invoices';
import { toast } from 'sonner';
import type { InvoiceStatus, InvoiceType } from '@/types/database';

// Type for invoice filter params (defined inline since it's from 'use server' file)
type GetInvoicesParams = {
    status?: InvoiceStatus;
    invoiceType?: InvoiceType;
    residentId?: string;
    houseId?: string;
    search?: string;
    page?: number;
    limit?: number;
};

export function useBillingProfiles() {
    return useQuery({
        queryKey: ['billing-profiles'],
        queryFn: async () => {
            const result = await getBillingProfiles();
            if (result.error) throw new Error(result.error);
            return result.data;
        },
        staleTime: 5 * 60 * 1000, // 5 minutes - billing profiles change infrequently
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

export function useDuplicateBillingProfile() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (id: string) => {
            const result = await duplicateBillingProfile(id);
            if (result.error) throw new Error(result.error);
            return result;
        },
        onSuccess: () => {
            toast.success('Billing profile duplicated successfully');
            queryClient.invalidateQueries({ queryKey: ['billing-profiles'] });
        },
        onError: (error) => {
            toast.error(error.message || 'Failed to duplicate profile');
        }
    });
}

export function useBillingProfile(id: string | undefined) {
    return useQuery({
        queryKey: ['billing-profile', id],
        queryFn: async () => {
            if (!id) throw new Error('Profile ID is required');
            const result = await getBillingProfile(id);
            if (result.error) throw new Error(result.error);
            return result.data;
        },
        enabled: !!id,
    });
}

export function useUpdateBillingProfile() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({ id, data }: { id: string; data: Partial<BillingProfileData> & { effective_date?: string } }) => {
            const result = await updateBillingProfile(id, data);
            if (!result.success) throw new Error(result.error || 'Failed to update profile');
            return result;
        },
        onSuccess: (result) => {
            if (result.approval_required) {
                toast.info('Changes submitted for approval');
            } else {
                toast.success('Billing profile updated successfully');
            }
            queryClient.invalidateQueries({ queryKey: ['billing-profiles'] });
            queryClient.invalidateQueries({ queryKey: ['billing-profile'] });
        },
        onError: (error) => {
            toast.error(error.message || 'Failed to update profile');
        }
    });
}

export function useCheckEffectiveDateImpact(profileId: string | undefined, newEffectiveDate: string | undefined) {
    return useQuery({
        queryKey: ['effective-date-impact', profileId, newEffectiveDate],
        queryFn: async () => {
            if (!profileId || !newEffectiveDate) throw new Error('Profile ID and date are required');
            const result = await checkEffectiveDateImpact(profileId, newEffectiveDate);
            if (result.error) throw new Error(result.error);
            return {
                affected_count: result.affected_count,
                earliest_invoice_date: result.earliest_invoice_date,
            };
        },
        enabled: !!profileId && !!newEffectiveDate,
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
            const result = await generateMonthlyInvoices(targetDate, 'manual');
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
            queryClient.invalidateQueries({ queryKey: ['latest-generation-log'] });
            queryClient.invalidateQueries({ queryKey: ['generation-history'] });
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

// House Payment Status Hook - aggregate payment status for a house across all residents
export function useHousePaymentStatus(houseId: string | undefined) {
    return useQuery({
        queryKey: ['house-payment-status', houseId],
        queryFn: async () => {
            if (!houseId) throw new Error('House ID is required');
            const result = await getHousePaymentStatus(houseId);
            if (result.error) throw new Error(result.error);
            return result.data;
        },
        enabled: !!houseId,
    });
}

// Resident Cross-Property Payment Summary Hook - payment status across all properties for a resident
export function useResidentCrossPropertyPaymentSummary(residentId: string | undefined) {
    return useQuery({
        queryKey: ['resident-cross-property-payment', residentId],
        queryFn: async () => {
            if (!residentId) throw new Error('Resident ID is required');
            const result = await getResidentCrossPropertyPaymentSummary(residentId);
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

// Development Levy Hooks
export function useDevelopmentLevyProfiles() {
    return useQuery({
        queryKey: ['development-levy-profiles'],
        queryFn: async () => {
            const result = await getDevelopmentLevyProfiles();
            if (result.error) throw new Error(result.error);
            return result.data;
        },
        staleTime: 5 * 60 * 1000, // 5 minutes - levy profiles change infrequently
    });
}

// Overdue Invoices Hooks
import { checkOverdueInvoices, getOverdueStats } from '@/actions/billing/check-overdue-invoices';
import { applyLateFees } from '@/actions/billing/apply-late-fees';

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

export function useApplyLateFees() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async () => {
            const result = await applyLateFees();
            if (!result.success) throw new Error(result.errors.join('; ') || 'Failed to apply late fees');
            return result;
        },
        onSuccess: (result) => {
            if (result.applied === 0) {
                toast.info('No eligible invoices found for late fees');
            } else {
                toast.success(`Applied late fees to ${result.applied} invoice(s). Total: ₦${result.totalLateFees.toLocaleString()}`);
            }
            if (result.errors.length > 0) {
                toast.warning(`${result.errors.length} error(s) occurred`);
            }
            queryClient.invalidateQueries({ queryKey: ['invoices'] });
            queryClient.invalidateQueries({ queryKey: ['overdue-stats'] });
        },
        onError: (error) => {
            toast.error(error.message || 'Failed to apply late fees');
        }
    });
}

// Invoice Generation Log Hooks
import {
    getLatestGenerationLog,
    getGenerationHistory,
    getGenerationStats,
    getInvoiceGenerationDay,
    updateInvoiceGenerationDay,
    getAutoGenerateEnabled,
    updateAutoGenerateEnabled,
} from '@/actions/billing/get-generation-log';

export function useLatestGenerationLog() {
    return useQuery({
        queryKey: ['latest-generation-log'],
        queryFn: async () => {
            const result = await getLatestGenerationLog();
            if (result.error) throw new Error(result.error);
            return result.data;
        },
        refetchInterval: 60000, // Refresh every minute
    });
}

export function useGenerationHistory(page: number = 1, limit: number = 10) {
    return useQuery({
        queryKey: ['generation-history', page, limit],
        queryFn: async () => {
            const result = await getGenerationHistory({ page, limit });
            if (result.error) throw new Error(result.error);
            return { data: result.data, total: result.total };
        },
    });
}

export function useGenerationStats(days: number = 30) {
    return useQuery({
        queryKey: ['generation-stats', days],
        queryFn: async () => {
            const result = await getGenerationStats(days);
            if (result.error) throw new Error(result.error);
            return result.data;
        },
    });
}

export function useInvoiceGenerationDay() {
    return useQuery({
        queryKey: ['invoice-generation-day'],
        queryFn: async () => {
            const result = await getInvoiceGenerationDay();
            if (result.error) throw new Error(result.error);
            return result.data;
        },
    });
}

export function useUpdateInvoiceGenerationDay() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (day: number) => {
            const result = await updateInvoiceGenerationDay(day);
            if (!result.success) throw new Error(result.error || 'Failed to update');
            return result;
        },
        onSuccess: () => {
            toast.success('Invoice generation day updated');
            queryClient.invalidateQueries({ queryKey: ['invoice-generation-day'] });
        },
        onError: (error) => {
            toast.error(error.message || 'Failed to update generation day');
        },
    });
}

export function useAutoGenerateEnabled() {
    return useQuery({
        queryKey: ['auto-generate-invoices'],
        queryFn: async () => {
            const result = await getAutoGenerateEnabled();
            if (result.error) throw new Error(result.error);
            return result.data;
        },
    });
}

export function useUpdateAutoGenerateEnabled() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (enabled: boolean) => {
            const result = await updateAutoGenerateEnabled(enabled);
            if (!result.success) throw new Error(result.error || 'Failed to update');
            return result;
        },
        onSuccess: (_, enabled) => {
            toast.success(enabled ? 'Auto-generation enabled' : 'Auto-generation disabled');
            queryClient.invalidateQueries({ queryKey: ['auto-generate-invoices'] });
        },
        onError: (error) => {
            toast.error(error.message || 'Failed to update auto-generation setting');
        },
    });
}


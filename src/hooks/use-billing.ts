import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createBillingProfile, getBillingProfiles, deleteBillingProfile, BillingProfileData } from '@/actions/billing/profiles';
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

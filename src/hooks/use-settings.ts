import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getSettings, getBillingSettings, getCurrentDevelopmentLevyProfileId } from '@/actions/settings/get-settings';
import { updateSetting, updateSettings, setCurrentDevelopmentLevyProfileId } from '@/actions/settings/update-setting';
import { uploadEstateLogo, removeEstateLogo } from '@/actions/settings/upload-estate-logo';
import { generateRetroactiveLevies } from '@/actions/billing/generate-levies';
import { toast } from 'sonner';

export function useSettings(category?: string) {
    return useQuery({
        queryKey: ['settings', category],
        queryFn: async () => {
            const result = await getSettings(category);
            if (result.error) throw new Error(result.error);
            return result.data;
        }
    });
}

export function useBillingSettings() {
    return useQuery({
        queryKey: ['settings', 'billing'],
        queryFn: async () => {
            const result = await getBillingSettings();
            if (result.error) throw new Error(result.error);
            return result.data;
        }
    });
}

export function useGeneralSettings() {
    return useQuery({
        queryKey: ['settings', 'general'],
        queryFn: async () => {
            const result = await getSettings('general');
            if (result.error) throw new Error(result.error);
            return result.data;
        }
    });
}

export function useSystemSettings() {
    return useQuery({
        queryKey: ['settings', 'system'],
        queryFn: async () => {
            const result = await getSettings('system');
            if (result.error) throw new Error(result.error);
            return result.data;
        }
    });
}

export function useUpdateSetting() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({ key, value }: { key: string; value: any }) => {
            const result = await updateSetting(key, value);
            if (result.error) throw new Error(result.error);
            return result.data;
        },
        onSuccess: () => {
            toast.success('Setting updated successfully');
            queryClient.invalidateQueries({ queryKey: ['settings'] });
        },
        onError: (error) => {
            toast.error(error.message || 'Failed to update setting');
        }
    });
}

export function useUpdateSettings() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (settings: Record<string, any>) => {
            const result = await updateSettings(settings);
            if (!result.success) throw new Error(result.error || 'Failed to update settings');
            return result;
        },
        onSuccess: () => {
            toast.success('Settings saved successfully');
            queryClient.invalidateQueries({ queryKey: ['settings'] });
        },
        onError: (error) => {
            toast.error(error.message || 'Failed to update settings');
        }
    });
}

export function useGenerateRetroactiveLevies() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async () => {
            const result = await generateRetroactiveLevies();
            if (!result.success) throw new Error(result.errors.join('; ') || 'Failed to generate levies');
            return result;
        },
        onSuccess: (result) => {
            if (result.generated === 0) {
                toast.info('No new levies to generate - all houses are up to date');
            } else {
                toast.success(`Generated ${result.generated} levies for existing houses`);
            }
            queryClient.invalidateQueries({ queryKey: ['invoices'] });
        },
        onError: (error) => {
            toast.error(error.message || 'Failed to generate retroactive levies');
        }
    });
}

// Development Levy Profile Hooks
export function useCurrentDevelopmentLevyProfileId() {
    return useQuery({
        queryKey: ['current-development-levy-profile-id'],
        queryFn: async () => {
            return await getCurrentDevelopmentLevyProfileId();
        }
    });
}

export function useSetCurrentDevelopmentLevyProfileId() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (profileId: string | null) => {
            const result = await setCurrentDevelopmentLevyProfileId(profileId);
            if (result.error) throw new Error(result.error);
            return result;
        },
        onSuccess: () => {
            toast.success('Current Development Levy profile updated');
            queryClient.invalidateQueries({ queryKey: ['current-development-levy-profile-id'] });
            queryClient.invalidateQueries({ queryKey: ['settings'] });
        },
        onError: (error) => {
            toast.error(error.message || 'Failed to update Development Levy profile');
        }
    });
}

// Estate Logo Hooks
export function useUploadEstateLogo() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (formData: FormData) => {
            const result = await uploadEstateLogo(formData);
            if (result.error) throw new Error(result.error);
            return result.data;
        },
        onSuccess: () => {
            toast.success('Logo uploaded successfully');
            queryClient.invalidateQueries({ queryKey: ['settings'] });
        },
        onError: (error) => {
            toast.error(error.message || 'Failed to upload logo');
        }
    });
}

export function useRemoveEstateLogo() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async () => {
            const result = await removeEstateLogo();
            if (!result.success) throw new Error(result.error || 'Failed to remove logo');
            return result;
        },
        onSuccess: () => {
            toast.success('Logo removed successfully');
            queryClient.invalidateQueries({ queryKey: ['settings'] });
        },
        onError: (error) => {
            toast.error(error.message || 'Failed to remove logo');
        }
    });
}

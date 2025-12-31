import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getSettings, getBillingSettings, getCurrentDevelopmentLevyProfileId } from '@/actions/settings/get-settings';
import { updateSetting, updateSettings, setCurrentDevelopmentLevyProfileId } from '@/actions/settings/update-setting';
import { uploadEstateLogo, removeEstateLogo } from '@/actions/settings/upload-estate-logo';
import { generateRetroactiveLevies } from '@/actions/billing/generate-levies';
import {
    getEffectiveSetting,
    setHierarchicalSetting,
    removeSettingOverride,
    getSettingOverrides,
    getEstateSettingsByCategory,
    getHouseSettingOverrides,
    getResidentSettingOverrides,
    type HierarchicalSettingKey,
    type SettingLevel,
    type SettingCategory,
} from '@/actions/settings/hierarchical-settings';
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

// ============================================
// Hierarchical Settings Hooks
// Three-level cascade: estate -> house -> resident
// ============================================

/**
 * Get effective setting value with cascade resolution
 *
 * @param key - Setting key to look up
 * @param houseId - Optional house ID for house/resident level resolution
 * @param residentId - Optional resident ID for resident level resolution
 */
export function useEffectiveSetting<T = unknown>(
    key: HierarchicalSettingKey,
    houseId?: string,
    residentId?: string
) {
    return useQuery({
        queryKey: ['hierarchical-setting', key, houseId, residentId],
        queryFn: async () => {
            const result = await getEffectiveSetting(key, houseId, residentId);
            if (!result.success) throw new Error(result.error || 'Failed to get setting');
            return result.value as T;
        }
    });
}

/**
 * Set a hierarchical setting value
 */
export function useSetHierarchicalSetting() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({
            key,
            value,
            level,
            houseId,
            residentId,
            description,
        }: {
            key: HierarchicalSettingKey;
            value: unknown;
            level: SettingLevel;
            houseId?: string;
            residentId?: string;
            description?: string;
        }) => {
            const result = await setHierarchicalSetting(key, value, level, houseId, residentId, description);
            if (!result.success) throw new Error(result.error || 'Failed to set setting');
            return result.data;
        },
        onSuccess: () => {
            toast.success('Setting updated successfully');
            queryClient.invalidateQueries({ queryKey: ['hierarchical-setting'] });
            queryClient.invalidateQueries({ queryKey: ['hierarchical-settings'] });
        },
        onError: (error) => {
            toast.error(error.message || 'Failed to update setting');
        }
    });
}

/**
 * Remove a setting override at house or resident level
 */
export function useRemoveSettingOverride() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({
            key,
            level,
            houseId,
            residentId,
        }: {
            key: HierarchicalSettingKey;
            level: 'house' | 'resident';
            houseId?: string;
            residentId?: string;
        }) => {
            const result = await removeSettingOverride(key, level, houseId, residentId);
            if (!result.success) throw new Error(result.error || 'Failed to remove override');
            return result;
        },
        onSuccess: () => {
            toast.success('Override removed - now using default');
            queryClient.invalidateQueries({ queryKey: ['hierarchical-setting'] });
            queryClient.invalidateQueries({ queryKey: ['hierarchical-settings'] });
        },
        onError: (error) => {
            toast.error(error.message || 'Failed to remove override');
        }
    });
}

/**
 * Get all overrides for a setting across all levels
 */
export function useSettingOverrides(key: HierarchicalSettingKey) {
    return useQuery({
        queryKey: ['hierarchical-settings', 'overrides', key],
        queryFn: async () => {
            const result = await getSettingOverrides(key);
            if (!result.success) throw new Error(result.error || 'Failed to get overrides');
            return result.data;
        }
    });
}

/**
 * Get all estate-level settings for a category
 */
export function useEstateSettings(category: SettingCategory) {
    return useQuery({
        queryKey: ['hierarchical-settings', 'estate', category],
        queryFn: async () => {
            const result = await getEstateSettingsByCategory(category);
            if (!result.success) throw new Error(result.error || 'Failed to get settings');
            return result.data;
        }
    });
}

/**
 * Get all setting overrides for a specific house
 */
export function useHouseSettings(houseId: string | undefined) {
    return useQuery({
        queryKey: ['hierarchical-settings', 'house', houseId],
        queryFn: async () => {
            if (!houseId) return [];
            const result = await getHouseSettingOverrides(houseId);
            if (!result.success) throw new Error(result.error || 'Failed to get house settings');
            return result.data;
        },
        enabled: !!houseId,
    });
}

/**
 * Get all setting overrides for a specific resident
 */
export function useResidentSettings(residentId: string | undefined) {
    return useQuery({
        queryKey: ['hierarchical-settings', 'resident', residentId],
        queryFn: async () => {
            if (!residentId) return [];
            const result = await getResidentSettingOverrides(residentId);
            if (!result.success) throw new Error(result.error || 'Failed to get resident settings');
            return result.data;
        },
        enabled: !!residentId,
    });
}

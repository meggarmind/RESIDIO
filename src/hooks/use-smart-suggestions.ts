'use client';

import { useQuery } from '@tanstack/react-query';
import { getSmartSuggestions, SmartSuggestion } from '@/actions/dashboard/get-smart-suggestions';
import { POLLING_INTERVALS } from '@/lib/config/polling';

export type { SmartSuggestion };

/**
 * useSmartSuggestions Hook
 *
 * Runs a small set of rule-based checks against existing estate aggregate data
 * and surfaces the resulting actionable suggestions.
 */
export function useSmartSuggestions() {
    const query = useQuery({
        queryKey: ['smart-suggestions'],
        queryFn: async () => {
            const result = await getSmartSuggestions();
            if (result.error) throw new Error(result.error);
            return result.data;
        },
        staleTime: POLLING_INTERVALS.SLOW,
        refetchInterval: POLLING_INTERVALS.SLOW,
    });

    const dismissSuggestion = (id: string) => {
        // Dismissal is session-local only for now - see SmartSuggestions component.
        console.log('Dismissed suggestion:', id);
    };

    return {
        suggestions: query.data ?? [],
        isLoading: query.isLoading,
        dismissSuggestion,
    };
}

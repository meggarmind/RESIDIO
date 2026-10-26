import { useQuery } from '@tanstack/react-query';
import { getCollections } from '@/actions/collections/collections';

/** Collections that take new payments (#1195), for the intake pickers. Loaded only when enabled. */
export function useOpenCollections(enabled: boolean) {
    return useQuery({
        queryKey: ['collections', 'open'],
        queryFn: async () => ((await getCollections()).data ?? []).filter((collection) => collection.is_active),
        enabled,
    });
}

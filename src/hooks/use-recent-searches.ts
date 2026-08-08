import { useState } from 'react';

export interface RecentSearch {
    id: string;
    type: string;
    title: string;
    subtitle?: string;
    href: string;
    timestamp: number;
}

const MAX_RECENT_SEARCHES = 5;
const STORAGE_KEY = 'residio-recent-searches';

function loadStoredSearches(): RecentSearch[] {
    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) return JSON.parse(stored);
    } catch { /* ignore */ }
    return [];
}

export function useRecentSearches() {
    const [searches, setSearches] = useState<RecentSearch[]>(loadStoredSearches);

    const addSearch = (search: Omit<RecentSearch, 'id' | 'timestamp'>) => {
        setSearches((prev) => {
            const newSearch = {
                ...search,
                id: crypto.randomUUID(),
                timestamp: Date.now()
            };
            const filtered = prev.filter((s) => s.href !== search.href);
            const updated = [newSearch, ...filtered].slice(0, MAX_RECENT_SEARCHES);
            localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
            return updated;
        });
    };

    const removeSearch = (id: string) => {
        setSearches((prev) => {
            const updated = prev.filter((s) => s.id !== id);
            localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
            return updated;
        });
    };

    const clearSearches = () => {
        setSearches([]);
        localStorage.removeItem(STORAGE_KEY);
    };

    return { searches, addSearch, removeSearch, clearSearches, isMounted: true };
}

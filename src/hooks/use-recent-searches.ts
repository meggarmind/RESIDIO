import { useState, useEffect } from 'react';

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

export function useRecentSearches() {
    const [searches, setSearches] = useState<RecentSearch[]>([]);
    const [isMounted, setIsMounted] = useState(false);

    useEffect(() => {
        setIsMounted(true);
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
            try {
                setSearches(JSON.parse(stored));
            } catch (e) {
                console.error('Failed to parse recent searches', e);
            }
        }
    }, []);

    const addSearch = (search: Omit<RecentSearch, 'id' | 'timestamp'>) => {
        setSearches((prev) => {
            // Create new search item
            const newSearch = {
                ...search,
                id: crypto.randomUUID(),
                timestamp: Date.now()
            };

            // Remove duplicates (same href)
            const filtered = prev.filter((s) => s.href !== search.href);

            // Add new to top, limit to MAX
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

    return {
        searches,
        addSearch,
        removeSearch,
        clearSearches,
        isMounted
    };
}

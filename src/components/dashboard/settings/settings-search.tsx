'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowUpRight, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { useAuth } from '@/lib/auth/auth-provider';
import { useSettingsNavigation } from '@/hooks/use-settings-navigation';
import { matchVisibleSettingsEntries, type SettingsSearchEntry } from '@/lib/search/settings-search-entries';

/** Setting-level search for the Settings nav (#791, #933): shared by the sidebar and the mobile sheet. */
export function useSettingsSearch() {
    const [query, setQuery] = React.useState('');
    const { groups } = useSettingsNavigation();
    const { isLoading, hasAnyPermission } = useAuth();

    const results = React.useMemo(
        () =>
            matchVisibleSettingsEntries(
                groups,
                query,
                // Same optimistic stance as the nav while permissions load.
                (permissions) => isLoading || permissions.length === 0 || hasAnyPermission(permissions)
            ),
        [groups, query, isLoading, hasAnyPermission]
    );

    return { query, setQuery, results, active: query.trim().length > 0 };
}

type SettingsSearch = ReturnType<typeof useSettingsSearch>;

export function SettingsSearchField({
    search,
    onNavigate,
    className,
}: {
    search: SettingsSearch;
    /** Called after Enter opens the first result, so a sheet can close. */
    onNavigate?: () => void;
    className?: string;
}) {
    const router = useRouter();
    const { query, setQuery, results, active } = search;

    return (
        <div className={cn('relative', className)} role="search">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                    if (event.key === 'Escape') setQuery('');
                    if (event.key === 'Enter' && results[0]) {
                        router.push(results[0].href);
                        setQuery('');
                        onNavigate?.();
                    }
                }}
                placeholder="Search settings"
                aria-label="Search settings"
                className="min-h-11 pl-9 lg:min-h-9"
            />
            {/* Announces the count, so a screen-reader user knows whether the list changed. */}
            <p className="sr-only" role="status" aria-live="polite">
                {active ? (results.length === 0 ? 'No settings match' : `${results.length} ${results.length === 1 ? 'result' : 'results'}`) : ''}
            </p>
        </div>
    );
}

export function SettingsSearchResults({
    search,
    onNavigate,
}: {
    search: SettingsSearch;
    onNavigate?: () => void;
}) {
    const { results, setQuery } = search;

    if (results.length === 0) {
        return <p className="px-2 py-3 text-sm text-muted-foreground">No settings match. Try a different word.</p>;
    }

    return (
        <ul className="space-y-1">
            {results.map((entry: SettingsSearchEntry) => (
                <li key={entry.id}>
                    <Link
                        href={entry.href}
                        onClick={() => {
                            setQuery('');
                            onNavigate?.();
                        }}
                        className="block min-h-11 rounded-md px-2 py-1.5 text-sm hover:bg-muted/50"
                    >
                        <span className="flex items-center gap-1 font-medium">
                            {entry.title}
                            {entry.opensSystem && (
                                <>
                                    <ArrowUpRight className="h-3 w-3 text-muted-foreground" aria-hidden="true" />
                                    <span className="sr-only">(opens System)</span>
                                </>
                            )}
                        </span>
                        {entry.subtitle && <span className="block text-xs text-muted-foreground">{entry.subtitle}</span>}
                    </Link>
                </li>
            ))}
        </ul>
    );
}

/** The "Opens System" mark on a nav link to a live-state page. */
export function OpensSystemMark() {
    return (
        <>
            <ArrowUpRight className="ml-1 h-3 w-3 shrink-0 text-muted-foreground" aria-hidden="true" />
            <span className="sr-only">(opens System)</span>
        </>
    );
}

'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Input } from '@/components/ui/input';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Search, X } from 'lucide-react';
import { useState, useEffect } from 'react';
// import { useDebounce } from '@/hooks/use-debounce'; 

export function PaymentFilters() {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();

    // Get initial values from URL
    const initialQuery = searchParams.get('query') || '';
    const initialStatus = searchParams.get('status') || 'all';

    const [search, setSearch] = useState(initialQuery);
    // Simple debounce logic if hook doesn't exist
    const [debouncedSearch, setDebouncedSearch] = useState(search);

    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedSearch(search);
        }, 500);
        return () => clearTimeout(timer);
    }, [search]);


    useEffect(() => {
        const params = new URLSearchParams(searchParams);
        if (debouncedSearch) {
            params.set('query', debouncedSearch);
        } else {
            params.delete('query');
        }
        // Reset page to 1 on filter change
        params.set('page', '1');

        router.push(`${pathname}?${params.toString()}`);
    }, [debouncedSearch, pathname, router]);

    const handleStatusChange = (value: string) => {
        const params = new URLSearchParams(searchParams);
        if (value && value !== 'all') {
            params.set('status', value);
        } else {
            params.delete('status');
        }
        params.set('page', '1');
        router.push(`${pathname}?${params.toString()}`);
    };

    const clearFilters = () => {
        setSearch('');
        router.push(pathname);
    };

    return (
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center py-4">
            <div className="relative flex-1">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                    placeholder="Search reference..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="pl-8"
                />
            </div>
            <Select value={initialStatus} onValueChange={handleStatusChange}>
                <SelectTrigger className="w-[180px]">
                    <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value="all">All Statuses</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="paid">Paid</SelectItem>
                    <SelectItem value="overdue">Overdue</SelectItem>
                    <SelectItem value="failed">Failed</SelectItem>
                </SelectContent>
            </Select>
            {(initialQuery || initialStatus !== 'all') && (
                <Button variant="ghost" onClick={clearFilters} className="px-3">
                    <X className="mr-2 h-4 w-4" />
                    Clear
                </Button>
            )}
        </div>
    );
}

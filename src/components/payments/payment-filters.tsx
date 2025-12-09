'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Search, X } from 'lucide-react';
import { useState, useEffect } from 'react';
import { useResidents } from '@/hooks/use-residents';

export function PaymentFilters() {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();

    // Fetch residents for resident filter
    const { data: residentsData } = useResidents({ limit: 10000 });
    const residents = residentsData?.data || [];

    // Get initial values from URL
    const initialQuery = searchParams.get('query') || '';
    const initialStatus = searchParams.get('status') || 'all';
    const initialMethod = searchParams.get('method') || 'all';
    const initialResident = searchParams.get('resident_id') || 'all';
    const initialDateFrom = searchParams.get('date_from') || '';
    const initialDateTo = searchParams.get('date_to') || '';

    const [search, setSearch] = useState(initialQuery);
    const [dateFrom, setDateFrom] = useState(initialDateFrom);
    const [dateTo, setDateTo] = useState(initialDateTo);

    // Simple debounce logic
    const [debouncedSearch, setDebouncedSearch] = useState(search);

    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedSearch(search);
        }, 500);
        return () => clearTimeout(timer);
    }, [search]);

    // Update URL when search changes
    useEffect(() => {
        const params = new URLSearchParams(searchParams);
        if (debouncedSearch) {
            params.set('query', debouncedSearch);
        } else {
            params.delete('query');
        }
        params.set('page', '1');
        router.push(`${pathname}?${params.toString()}`);
    }, [debouncedSearch, pathname, router, searchParams]);

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

    const handleMethodChange = (value: string) => {
        const params = new URLSearchParams(searchParams);
        if (value && value !== 'all') {
            params.set('method', value);
        } else {
            params.delete('method');
        }
        params.set('page', '1');
        router.push(`${pathname}?${params.toString()}`);
    };

    const handleResidentChange = (value: string) => {
        const params = new URLSearchParams(searchParams);
        if (value && value !== 'all') {
            params.set('resident_id', value);
        } else {
            params.delete('resident_id');
        }
        params.set('page', '1');
        router.push(`${pathname}?${params.toString()}`);
    };

    const handleDateFromChange = (value: string) => {
        setDateFrom(value);
        const params = new URLSearchParams(searchParams);
        if (value) {
            params.set('date_from', value);
        } else {
            params.delete('date_from');
        }
        params.set('page', '1');
        router.push(`${pathname}?${params.toString()}`);
    };

    const handleDateToChange = (value: string) => {
        setDateTo(value);
        const params = new URLSearchParams(searchParams);
        if (value) {
            params.set('date_to', value);
        } else {
            params.delete('date_to');
        }
        params.set('page', '1');
        router.push(`${pathname}?${params.toString()}`);
    };

    const clearFilters = () => {
        setSearch('');
        setDateFrom('');
        setDateTo('');
        router.push(pathname);
    };

    // Calculate active filter count
    const activeFilterCount = [
        initialQuery,
        initialStatus !== 'all' ? initialStatus : null,
        initialMethod !== 'all' ? initialMethod : null,
        initialResident !== 'all' ? initialResident : null,
        initialDateFrom,
        initialDateTo,
    ].filter(Boolean).length;

    return (
        <div className="space-y-4 py-4">
            {/* Filters Grid */}
            <div className="grid gap-4 grid-cols-1 md:grid-cols-3">
                {/* Search Reference */}
                <div className="space-y-2">
                    <Label htmlFor="search-ref">Search Reference</Label>
                    <div className="relative">
                        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                        <Input
                            id="search-ref"
                            placeholder="Search reference..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className="pl-8"
                        />
                    </div>
                </div>

                {/* Status Filter */}
                <div className="space-y-2">
                    <Label htmlFor="status-filter">Status</Label>
                    <Select value={initialStatus} onValueChange={handleStatusChange}>
                        <SelectTrigger id="status-filter">
                            <SelectValue placeholder="All Statuses" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">All Statuses</SelectItem>
                            <SelectItem value="pending">Pending</SelectItem>
                            <SelectItem value="paid">Paid</SelectItem>
                            <SelectItem value="overdue">Overdue</SelectItem>
                            <SelectItem value="failed">Failed</SelectItem>
                        </SelectContent>
                    </Select>
                </div>

                {/* Payment Method Filter */}
                <div className="space-y-2">
                    <Label htmlFor="method-filter">Payment Method</Label>
                    <Select value={initialMethod} onValueChange={handleMethodChange}>
                        <SelectTrigger id="method-filter">
                            <SelectValue placeholder="All Methods" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">All Methods</SelectItem>
                            <SelectItem value="cash">Cash</SelectItem>
                            <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                            <SelectItem value="mobile_money">Mobile Money</SelectItem>
                            <SelectItem value="check">Check</SelectItem>
                            <SelectItem value="other">Other</SelectItem>
                        </SelectContent>
                    </Select>
                </div>

                {/* Date From */}
                <div className="space-y-2">
                    <Label htmlFor="date-from">Date From</Label>
                    <Input
                        id="date-from"
                        type="date"
                        value={dateFrom}
                        onChange={(e) => handleDateFromChange(e.target.value)}
                        placeholder="Select start date"
                    />
                </div>

                {/* Date To */}
                <div className="space-y-2">
                    <Label htmlFor="date-to">Date To</Label>
                    <Input
                        id="date-to"
                        type="date"
                        value={dateTo}
                        onChange={(e) => handleDateToChange(e.target.value)}
                        placeholder="Select end date"
                    />
                </div>

                {/* Resident Filter */}
                <div className="space-y-2">
                    <Label htmlFor="resident-filter">Resident</Label>
                    <Select value={initialResident} onValueChange={handleResidentChange}>
                        <SelectTrigger id="resident-filter">
                            <SelectValue placeholder="All Residents" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">All Residents</SelectItem>
                            {residents.map((resident) => (
                                <SelectItem key={resident.id} value={resident.id}>
                                    {resident.first_name} {resident.last_name} ({resident.resident_code})
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
            </div>

            {/* Clear Filters Button + Active Badge */}
            {activeFilterCount > 0 && (
                <div className="flex items-center gap-3">
                    <Button variant="ghost" onClick={clearFilters} className="px-3">
                        <X className="mr-2 h-4 w-4" />
                        Clear Filters
                    </Button>
                    <Badge variant="secondary">
                        {activeFilterCount} {activeFilterCount === 1 ? 'filter' : 'filters'} active
                    </Badge>
                </div>
            )}
        </div>
    );
}
